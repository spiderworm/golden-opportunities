"""Turns the bosses' generated pictures into BossBubble's portraits.

Each picture is a robot on a flat navy background. The background is found
as the color connected to the picture's edges, the picture is cropped to a
square around the robot (so it fills the frame and stays clear of the
rounded corners BossBubble crops to), the background is set to the theme's
--color-panel-raised (#1d2440) with a soft edge, and it's saved as a
256 x 256 webp.

    python3 research/station-assets/bosses.py <dir of downloads> public/bosses

Expects Tripo's 1024 x 1024 overall.png, profit.png, readers.png,
happiness.png and culture.png (research/station-assets/bosses/ keeps
downscaled copies for reference). Provenance: public/bosses/provenance.json.
"""

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

PANEL = np.array([0x1D, 0x24, 0x40], dtype=float)
SIZE = 256
TOLERANCE = 30  # color distance still counted as background
FIGURE = 60  # color distance that surely isn't background, for finding the robot's extent
MARGIN = 0.07  # space round the robot, as a share of the square
BUST = 0.8  # a tall robot is framed from the top of its head down to this share of its height
# The Commerce Office's six faint copies spread it wide; frame the front unit and let them run off the sides.
BY_HEIGHT = {"profit"}


def background_mask(pixels: np.ndarray) -> np.ndarray:
    h, w, _ = pixels.shape
    border = np.concatenate([pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]])
    bg = np.median(border, axis=0)
    close = np.linalg.norm(pixels - bg, axis=2) < TOLERANCE
    mask = np.zeros((h, w), dtype=bool)
    queue = deque((y, x) for y in range(h) for x in (0, w - 1) if close[y, x])
    queue.extend((y, x) for x in range(w) for y in (0, h - 1) if close[y, x])
    for y, x in queue:
        mask[y, x] = True
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not mask[ny, nx]:
                mask[ny, nx] = True
                queue.append((ny, nx))
    return mask


def portrait(path: Path, by_height: bool = False) -> Image.Image:
    image = Image.open(path).convert("RGB")
    pixels = np.asarray(image, dtype=float)
    mask = background_mask(pixels)
    border = np.concatenate([pixels[0], pixels[-1], pixels[:, 0], pixels[:, -1]])
    solid = np.linalg.norm(pixels - np.median(border, axis=0), axis=2) > FIGURE
    ys, xs = np.nonzero(solid & ~mask)
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    # Bust-length: as wide as the robot, and at most BUST of its height, from the top of its head.
    span = max(right - left, min(bottom - top, (bottom - top) * BUST if bottom - top > right - left else bottom - top))
    if by_height:
        span = bottom - top
    side = int(span / (1 - 2 * MARGIN))
    cx = (left + right) // 2
    cy = top - int(side * MARGIN) + side // 2 if bottom - top > right - left else (top + bottom) // 2
    # Recolor the background, feathered so the robot's edge stays soft.
    alpha = np.asarray(Image.fromarray((~mask * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(1.5)), dtype=float)[..., None] / 255
    recolored = pixels * alpha + PANEL * (1 - alpha)
    canvas = np.empty((side, side, 3))
    canvas[:] = PANEL
    y0, x0 = cy - side // 2, cx - side // 2
    sy0, sx0 = max(0, y0), max(0, x0)
    sy1, sx1 = min(pixels.shape[0], y0 + side), min(pixels.shape[1], x0 + side)
    canvas[sy0 - y0 : sy1 - y0, sx0 - x0 : sx1 - x0] = recolored[sy0:sy1, sx0:sx1]
    return Image.fromarray(np.clip(canvas, 0, 255).astype("uint8")).resize((SIZE, SIZE), Image.LANCZOS)


def main(source: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for boss in ["overall", "profit", "readers", "happiness", "culture"]:
        portrait(source / f"{boss}.png", by_height=boss in BY_HEIGHT).save(out / f"{boss}.webp", quality=88, method=6)
        print(f"{boss}: {(out / f'{boss}.webp').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
