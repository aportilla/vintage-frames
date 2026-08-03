#!/usr/bin/env python3
"""Cut the demo's icons out of the reference sheet.

The showcase's "Desk Accessories" list slots a 16x16 System 7 small icon into
each row (`vf-img` in `vf-list-item`'s `icon` slot). The icons live on
`Icons & symbols.png` as small color variants inside the purple-annotated
clusters; this script crops each one *as raster* — the kit vectorizes glyphs,
never pictures — and writes it to `demo/icons/<name>.png`:

- each crop is the icon's ink bounding box, re-centered on a fresh 16x16
  transparent canvas with whole-pixel offsets (a System 7 small icon resource
  is a 16x16 cell; the sheet's own cell registration isn't recoverable, so
  centering bakes a consistent registration into the asset — and a uniform
  16x16 canvas is what keeps every row's text starting at the same whole x);
- background is made transparent by flood-filling white from the crop edge, so
  icon-interior white (a clock face, calculator keys) stays opaque while the
  surround vanishes — it must, or a selected row's inverted black bar would
  show a white box around the icon.

LARGE_ICONS is the other size on the same sheet: the 32x32 alert icon, the
demo's own asset for the alerts it composes over `vf-dialog` (the kit ships no
raster art — an alert icon is the consumer's picture, slotted via `vf-img`,
and the demo pages are that consumer here). It takes neither of those two
treatments. It already fills its 32x32 cell, so there is nothing to
re-center — the ink bbox *is* the icon, which is the registration a large icon
resource carries — and it comes out as ink on transparency all through,
interior white included: nothing inverts behind an alert icon, and letting the
dialog's own surface show inside the triangle is what keeps a retheme from
leaving a white patch there.

Coordinates are the ink bboxes as measured on the sheet (563x996, 1x art);
re-run after editing them: `npm run extract:icons`.
"""

import importlib.util
import struct
import zlib

spec = importlib.util.spec_from_file_location(
    "extract", "scripts/extract-button-pixels.py"
)
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)

SHEET = "Classic Macintosh UI Kit Reference/Icons & symbols.png"
OUT_DIR = "demo/icons"
CELL = 16

# name -> ink bbox (x0, y0, x1, y1), inclusive, in sheet pixels.
ICONS = {
    "alarm-clock": (79, 266, 89, 281),
    "chooser": (165, 266, 179, 280),
    "battery": (346, 267, 350, 281),
    "calculator": (431, 266, 441, 281),
    "control-panels": (253, 494, 268, 506),
    "key-caps": (325, 605, 340, 620),
    "note-pad": (430, 715, 443, 730),
    "puzzle": (77, 831, 92, 846),
    "scrapbook": (165, 831, 179, 842),
}

LARGE_CELL = 32

# name -> ink bbox, as above. Cropped whole, all white to transparent.
LARGE_ICONS = {
    "alert": (135, 190, 166, 221),
}


def png_bytes(width, height, rows):
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("4B", *px) for px in row) for row in rows
    )

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def write_png(path, width, height, rows):
    with open(path, "wb") as f:
        f.write(png_bytes(width, height, rows))


def is_bg_white(p):
    r, g, b, a = p
    return a < 128 or (r >= 250 and g >= 250 and b >= 250)


def cut(pixels, box, edge_only=True):
    """The bbox crop with white flooded to transparent.

    `edge_only` floods from the crop edge, so interior white stays opaque;
    clear it to take every white pixel out (see the module docstring).
    """
    x0, y0, x1, y1 = box
    w, h = x1 - x0 + 1, y1 - y0 + 1
    crop = [[pixels[y0 + y][x0 + x] for x in range(w)] for y in range(h)]

    bg = [[False] * w for _ in range(h)]
    stack = [
        (x, y)
        for y in range(h)
        for x in range(w)
        if (not edge_only or x in (0, w - 1) or y in (0, h - 1))
        and is_bg_white(crop[y][x])
    ]
    for x, y in stack:
        bg[y][x] = True
    while edge_only and stack:
        cx, cy = stack.pop()
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] and is_bg_white(crop[ny][nx]):
                bg[ny][nx] = True
                stack.append((nx, ny))

    for y in range(h):
        for x in range(w):
            if bg[y][x]:
                crop[y][x] = (0, 0, 0, 0)
            else:
                r, g, b, _ = crop[y][x]
                crop[y][x] = (r, g, b, 255)
    return w, h, crop


def main():
    import os

    os.makedirs(OUT_DIR, exist_ok=True)
    _, _, pixels = extract.read_png(SHEET)
    for name, box in ICONS.items():
        w, h, crop = cut(pixels, box)
        if w > CELL or h > CELL:
            raise SystemExit(f"{name}: ink {w}x{h} exceeds the {CELL}px cell")
        dx, dy = (CELL - w) // 2, (CELL - h) // 2
        canvas = [[(0, 0, 0, 0)] * CELL for _ in range(CELL)]
        for y in range(h):
            for x in range(w):
                canvas[dy + y][dx + x] = crop[y][x]
        path = f"{OUT_DIR}/{name}.png"
        write_png(path, CELL, CELL, canvas)
        opaque = sum(1 for row in canvas for p in row if p[3] == 255)
        print(f"{path}: ink {w}x{h} at +{dx}+{dy}, {opaque} opaque px")

    for name, box in LARGE_ICONS.items():
        w, h, crop = cut(pixels, box, edge_only=False)
        if (w, h) != (LARGE_CELL, LARGE_CELL):
            raise SystemExit(f"{name}: ink {w}x{h} is not the {LARGE_CELL}px cell")
        path = f"{OUT_DIR}/{name}.png"
        write_png(path, w, h, crop)
        opaque = sum(1 for row in crop for p in row if p[3] == 255)
        print(f"{path}: ink {w}x{h} whole cell, {opaque} opaque px")


if __name__ == "__main__":
    main()
