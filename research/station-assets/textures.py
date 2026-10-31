"""Turns Gemini's planet and starfield pictures into the station's textures.

Gemini's equirectangular maps don't quite join where they wrap, so the outer
columns on each side are cross-faded with the other side's, leaving no seam
on the turning planet. The starfield's own stars blur when stretched round
the sky, so a median filter takes them out and leaves its nebula; the scene
draws sharp stars in front. Writes public/textures/station/<name>.jpg.

    python3 research/station-assets/textures.py <dir of Gemini downloads>

Expects planet-day.jpeg, planet-night.jpeg and starfield.jpeg in that dir.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

BLEND = 24  # columns on each side of the wrap
OUT = Path(__file__).resolve().parents[2] / "public" / "textures" / "station"


def join_wrap(pixels: np.ndarray) -> np.ndarray:
    left = pixels[:, :BLEND].copy()
    right = pixels[:, -BLEND:].copy()
    for i in range(BLEND):
        w = 0.5 * (1 - i / BLEND)  # half and half at the seam, untouched BLEND columns in
        mirror = BLEND - 1 - i
        pixels[:, i] = left[:, i] * (1 - w) + right[:, mirror] * w
        pixels[:, -1 - i] = right[:, mirror] * (1 - w) + left[:, i] * w
    return pixels


def main(source: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ["planet-day", "planet-night", "starfield"]:
        image = Image.open(source / f"{name}.jpeg").convert("RGB")
        if name == "starfield":
            image = image.filter(ImageFilter.MedianFilter(9)).filter(ImageFilter.GaussianBlur(2))
        pixels = np.asarray(image, dtype=float)
        joined = join_wrap(pixels)
        Image.fromarray(np.clip(joined, 0, 255).astype("uint8")).save(OUT / f"{name}.jpg", quality=82)
        print(f"{name}: {joined.shape[1]} x {joined.shape[0]}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
