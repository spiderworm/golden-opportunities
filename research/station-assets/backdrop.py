"""Turns Tripo's concept of the bosses' room into Decide's backdrop.

Crops the 16:9 concept to 2:1 about its middle, darkens it and tints it a
little toward the theme's navy (so it sits behind the bubbles as a dreary,
dim room), and saves a 2400 x 1200 webp, lightly sharpened after its
upscale from Tripo's 1376 px, and a 1200 x 600 one.

    python3 research/station-assets/backdrop.py <room.png> public/bosses

research/station-assets/backdrop/room.jpg keeps a downscaled copy of the
concept (corridor.jpg is the other one Tripo made, not used). Provenance:
public/bosses/provenance.json ("backdrop").
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

BRIGHTNESS = 0.62
TINT = np.array([0.86, 0.9, 1.0])  # less red and green: toward navy


def grade(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image, dtype=float) / 255 * BRIGHTNESS * TINT
    return Image.fromarray((np.clip(pixels, 0, 1) * 255).astype("uint8"))


def main(source: Path, out: Path):
    concept = Image.open(source).convert("RGB")
    w, h = concept.size
    top = (h - w // 2) // 2
    room = concept.crop((0, top, w, top + w // 2))
    grade(room.resize((2400, 1200), Image.LANCZOS)).filter(ImageFilter.UnsharpMask(1.2, 40, 2)).save(out / "backdrop.webp", quality=82, method=6)
    grade(room.resize((1200, 600), Image.LANCZOS)).save(out / "backdrop-1200.webp", quality=82, method=6)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
