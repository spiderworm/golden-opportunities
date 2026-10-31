"""Turns the bosses' full-body concepts into the Decide scene's cutouts.

Each concept is a robot on a flat background (light grey, or chroma green
for the Ministry). The background is found as the color connected to the
picture's edges (plus enclosed pockets of
the same color, such as the gaps between legs), made transparent with a soft
edge whose grey is taken back out of the color, and the robot is cropped and
scaled onto one shared scale: every file is HEIGHT px tall with the feet on
the bottom edge, and a shorter boss has empty space above it, so the scene
can draw every file at the same height and keep the bosses' relative sizes.
The drone hovers, so it has empty space under it too.

    python3 research/station-assets/boss-figures.py <dir of concepts> public/bosses/full

Expects Tripo's overall.png, profit.png, culture-green.png, happiness.png
and readers.png (research/station-assets/boss-figures/ keeps downscaled
copies, with culture.jpg, the grey concept the Ministry's 3D model came
from). It reproduces public/bosses/full/ byte for byte from them.
Provenance: public/bosses/provenance.json ("figures").
"""

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

HEIGHT = 512
SIDE = 6  # px of space either side of the robot
# Each boss's height as a share of the file, tallest first; the drone's body
# floats with its bottom at `hover` of the file's height above the floor.
SIZES = {
    "overall": {"height": 1.0},
    # Its marble head is the background's grey in places, so it's cut from a
    # copy of its concept redrawn on chroma green.
    "culture": {"height": 0.9, "source": "culture-green.png"},
    "readers": {"height": 0.86},
    "profit": {"height": 0.74},
    "happiness": {"height": 0.34, "hover": 0.36},
}
EDGE = 14  # color distance still counted as background, from the edges in
POCKET = 6  # stricter, for enclosed pockets that only look like background
SOFT = 5  # below this distance a background pixel is fully transparent


def flood(allowed: np.ndarray, seeds: list[tuple[int, int]]) -> np.ndarray:
    """The pixels of `allowed` connected to the seeds."""
    h, w = allowed.shape
    reached = np.zeros((h, w), dtype=bool)
    queue = deque(s for s in seeds if allowed[s])
    for y, x in queue:
        reached[y, x] = True
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and allowed[ny, nx] and not reached[ny, nx]:
                reached[ny, nx] = True
                queue.append((ny, nx))
    return reached


def cutout(path: Path) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=float)
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    green = bg[1] > bg[0] + 60 and bg[1] > bg[2] + 60
    if green:
        # Chroma green varies in brightness but not in how green it is, so
        # measure how much less green than the background each pixel is,
        # scaled to read like a color distance.
        key = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
        bg_key = np.median(border[:, 1] - np.maximum(border[:, 0], border[:, 2]))
        distance = np.clip(bg_key - key, 0, None) / 3
    else:
        distance = np.linalg.norm(rgb - bg, axis=2)

    # Background reached from the edges.
    edges = [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]
    outside = flood(distance < EDGE, edges)
    # Enclosed pockets of the same flat grey, big enough to be a gap (between
    # arms and body, say) rather than grey shading on a light surface.
    pocket = (distance < POCKET) & ~outside
    for y, x in zip(*np.nonzero(pocket)):
        if not pocket[y, x]:
            continue
        region = flood(pocket, [(y, x)])
        pocket &= ~region
        if region.sum() > 1500:
            outside |= region

    # Soft edge: background pixels fade in with their distance from the grey,
    # and the robot's own pixels next to the background keep a little blend.
    alpha = np.where(outside, np.clip((distance - SOFT) / (EDGE - SOFT), 0, 1) * 0.6, 1.0)
    blurred = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    alpha = np.asarray(blurred, dtype=float) / 255 * (alpha > 0)
    a = np.maximum(alpha, 1e-3)[..., None]
    color = np.clip((rgb - (1 - a) * bg) / a, 0, 255)
    if green:
        # On chroma green, take any green the robot picked up from it back out.
        color[..., 1] = np.minimum(color[..., 1], np.maximum(color[..., 0], color[..., 2]))
    rgba = np.dstack([color, alpha * 255]).astype(np.uint8)

    ys, xs = np.nonzero(alpha > 0.5)
    return Image.fromarray(rgba, "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def figure(robot: Image.Image, height: float, hover: float = 0.0) -> Image.Image:
    tall = round(HEIGHT * height)
    wide = round(robot.width * tall / robot.height)
    robot = robot.resize((wide, tall), Image.LANCZOS)
    canvas = Image.new("RGBA", (wide + 2 * SIDE, HEIGHT), (0, 0, 0, 0))
    canvas.alpha_composite(robot, (SIDE, HEIGHT - round(HEIGHT * hover) - tall))
    return canvas


def main(source: Path, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    for boss, size in SIZES.items():
        robot = cutout(source / size.get("source", f"{boss}.png"))
        image = figure(robot, size["height"], size.get("hover", 0.0))
        target = out / f"{boss}.webp"
        image.save(target, "WEBP", quality=88, method=6)
        print(f"{target}: {image.width} x {image.height}, {target.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
