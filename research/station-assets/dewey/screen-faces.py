"""Dewey's screen faces: cuts the two Tripo sheets (thinking, chatting; 3 x 3 frames each) into one atlas of their
glowing dots, white on transparent, for src/assistant/ui/DeweyFaces3D.tsx to play on his screen.

    python3 screen-faces.py <thinking sheet> <chatting sheet> <out.png>

Each frame: its amber screen found by colour, a square crop of 80% of the screen's width about its centre, the dots
taken by their blue channel (the warm-white dots run 160 and up, the amber glass under 60), and an oval cut that
drops the glass's glare and the bezel at the corners (and, on the chatting sheet, a streak of glare at top right). 18 frames of 128 px, six to a row: thinking 1 to 9, then
chatting 1 to 9.
"""
import sys
import numpy as np
from PIL import Image

SIZE = 128
CROP = 0.40  # half the crop, as a share of the screen's width
LO, HI = 95, 160  # blue channel: glass below LO, dot at HI and above
OVAL = 0.47  # the oval cut's radius, as a share of the frame; feathered over 0.03


def frames(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    amber = (r > 110) & (r - b > 70) & (g > 45)
    step = im.width / 3
    for row in range(3):
        for col in range(3):
            x0, y0 = int(col * step), int(row * step)
            ys, xs = np.nonzero(amber[y0 : int(y0 + step), x0 : int(x0 + step)])
            cx, cy = x0 + (xs.min() + xs.max()) / 2, y0 + (ys.min() + ys.max()) / 2
            h = (xs.max() - xs.min()) * CROP
            crop = im.crop((round(cx - h), round(cy - h), round(cx + h), round(cy + h)))
            yield crop.resize((SIZE, SIZE), Image.LANCZOS)


def dots(frame, glare=False):
    blue = np.asarray(frame).astype(float)[..., 2]
    alpha = np.clip((blue - LO) / (HI - LO), 0, 1)
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    if glare:
        # The chatting sheet's glass has a streak of glare at top right, above where its eyes start.
        alpha[(y < SIZE * 0.25) & (x > SIZE * 0.6)] = 0
        alpha[(y < SIZE * 0.3) & (x > SIZE * 0.72)] = 0
    d = np.hypot((x + 0.5) / SIZE - 0.5, (y + 0.5) / SIZE - 0.5)
    alpha *= np.clip((OVAL - d) / 0.03, 0, 1)
    rgba = np.zeros((SIZE, SIZE, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (alpha * 255).round().astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def main(thinking, chatting, out):
    all_frames = [dots(f) for f in frames(thinking)] + [dots(f, glare=True) for f in frames(chatting)]
    atlas = Image.new("RGBA", (SIZE * 6, SIZE * 3), (255, 255, 255, 0))
    for i, f in enumerate(all_frames):
        atlas.paste(f, ((i % 6) * SIZE, (i // 6) * SIZE))
    atlas.save(out, optimize=True)


if __name__ == "__main__":
    main(*sys.argv[1:4])
