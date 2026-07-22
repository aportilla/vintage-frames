#!/usr/bin/env python3
"""Extract exact pixel data from the 1x button reference sheet.

Decodes `Classic Macintosh UI Kit Reference/Buttons Exact 1x pixel
Refrence.png` with a minimal pure-stdlib PNG reader (no PIL dependency) and
dumps, for each button in the 3x3 grid:

- bounding boxes of the outer frame (and inner button for the default row)
- per-row left-edge traces: first frame pixel offset + run length
- ASCII art of the corner regions
- the distinct colors per state (border / face / label)

The traces feed the stepped clip-path polygons in src/pixel-frame.ts.
"""

import struct
import sys
import zlib

PATH = (
    "Classic Macintosh UI Kit Reference/Buttons Exact 1x pixel Refrence.png"
)


def read_png(path):
    """Return (width, height, pixels) where pixels[y][x] = (r, g, b, a)."""
    with open(path, "rb") as f:
        data = f.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos = 8
    width = height = None
    bit_depth = color_type = None
    palette = []
    trns = b""
    idat = b""
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        ctype = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, bit_depth, color_type, comp, filt, interlace = (
                struct.unpack(">IIBBBBB", chunk)
            )
            assert interlace == 0, "interlaced PNG not supported"
        elif ctype == b"PLTE":
            palette = [tuple(chunk[i : i + 3]) for i in range(0, len(chunk), 3)]
        elif ctype == b"tRNS":
            trns = chunk
        elif ctype == b"IDAT":
            idat += chunk
        elif ctype == b"IEND":
            break
    raw = zlib.decompress(idat)

    # channels per pixel for each color type
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color_type]
    bpp = max(1, channels * bit_depth // 8)  # bytes per pixel for filtering
    stride = (width * channels * bit_depth + 7) // 8

    # un-filter scanlines
    lines = []
    prev = bytearray(stride)
    p = 0
    for _y in range(height):
        ftype = raw[p]
        p += 1
        line = bytearray(raw[p : p + stride])
        p += stride
        if ftype == 1:  # Sub
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ftype == 2:  # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:  # Average
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:  # Paeth
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        lines.append(bytes(line))
        prev = line

    def sample(line, x):
        """Return channel tuple for pixel x of an unfiltered scanline."""
        if bit_depth == 8:
            o = x * channels
            return tuple(line[o : o + channels])
        if bit_depth == 16:
            o = x * channels * 2
            return tuple(line[o + 2 * c] for c in range(channels))
        # sub-byte depths (1/2/4): only legal for gray or palette
        per_byte = 8 // bit_depth
        byte = line[x // per_byte]
        shift = 8 - bit_depth * (x % per_byte + 1)
        val = (byte >> shift) & ((1 << bit_depth) - 1)
        return (val,)

    pixels = []
    for y in range(height):
        row = []
        line = lines[y]
        for x in range(width):
            v = sample(line, x)
            if color_type == 0:  # grayscale
                g = v[0] * 255 // ((1 << bit_depth) - 1)
                row.append((g, g, g, 255))
            elif color_type == 2:  # RGB
                row.append((v[0], v[1], v[2], 255))
            elif color_type == 3:  # palette
                r, g, b = palette[v[0]]
                a = trns[v[0]] if v[0] < len(trns) else 255
                row.append((r, g, b, a))
            elif color_type == 4:  # gray+alpha
                g = v[0]
                row.append((g, g, g, v[1]))
            else:  # RGBA
                row.append((v[0], v[1], v[2], v[3]))
        pixels.append(row)
    return width, height, pixels


def classify(px):
    """Map a pixel to a single char: # black, . white, g gray, ' ' transparent, ? other."""
    r, g, b, a = px
    if a < 128:
        return " "
    if r < 64 and g < 64 and b < 64:
        return "#"
    if r > 224 and g > 224 and b > 224:
        return "."
    if abs(r - g) < 24 and abs(g - b) < 24:
        return "g"
    return "?"


def main():
    width, height, pixels = read_png(PATH)
    print(f"dimensions: {width} x {height}")

    # color census
    census = {}
    for row in pixels:
        for px in row:
            census[px] = census.get(px, 0) + 1
    print("colors (rgba: count):")
    for color, count in sorted(census.items(), key=lambda kv: -kv[1]):
        print(f"  {color}: {count}")

    # grid of classified chars
    grid = [[classify(px) for px in row] for row in pixels]

    # A pixel is "ink" if it belongs to a button frame/face/label (# or g).
    def is_ink(x, y):
        return grid[y][x] in "#g"

    # Find connected components of ink to isolate the 9 buttons. The outer
    # container frame is a thin rounded rect that we filter out by shape
    # (huge bbox). 4-connectivity flood fill.
    seen = [[False] * width for _ in range(height)]
    comps = []
    for y in range(height):
        for x in range(width):
            if seen[y][x] or not is_ink(x, y):
                continue
            stack = [(x, y)]
            seen[y][x] = True
            x0 = x1 = x
            y0 = y1 = y
            count = 0
            while stack:
                cx, cy = stack.pop()
                count += 1
                x0 = min(x0, cx)
                x1 = max(x1, cx)
                y0 = min(y0, cy)
                y1 = max(y1, cy)
                for nx, ny in (
                    (cx - 1, cy),
                    (cx + 1, cy),
                    (cx, cy - 1),
                    (cx, cy + 1),
                ):
                    if 0 <= nx < width and 0 <= ny < height:
                        if not seen[ny][nx] and is_ink(nx, ny):
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            comps.append((x0, y0, x1, y1, count))

    comps.sort(key=lambda c: (c[1], c[0]))
    print("\ncomponents (x0,y0,x1,y1 inclusive, ink-count):")
    for c in comps:
        w = c[2] - c[0] + 1
        h = c[3] - c[1] + 1
        print(f"  bbox=({c[0]},{c[1]})..({c[2]},{c[3]})  {w}x{h}  ink={c[4]}")

    def dump(x0, y0, w, h, title):
        print(f"\n{title}  (origin {x0},{y0}, {w}x{h})")
        for y in range(y0, min(y0 + h, height)):
            print("  " + "".join(grid[y][x0 : x0 + w]))

    def trace(x0, y0, x1, y1, title):
        """Per-row: offset of first ink pixel from x0, run length of the
        border ink, then the char that follows (face)."""
        print(f"\nleft-edge trace: {title}")
        for y in range(y0, y1 + 1):
            xx = x0
            while xx <= x1 and grid[y][xx] not in "#g":
                xx += 1
            if xx > x1:
                print(f"  y={y - y0}: (no ink)")
                continue
            start = xx - x0
            ink_char = grid[y][xx]
            run = 0
            while xx <= x1 and grid[y][xx] == ink_char:
                run += 1
                xx += 1
            after = grid[y][xx] if xx <= x1 else "$"
            print(
                f"  y={y - y0}: offset={start} ink={ink_char!r} run={run} then={after!r}"
            )

    def mirror_check(x0, y0, x1, y1, title):
        """Check left/right and top/bottom symmetry of the ink mask."""
        lr = tb = True
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                a = grid[y][x] in "#g"
                if a != (grid[y][x1 - (x - x0)] in "#g"):
                    lr = False
                if a != (grid[y1 - (y - y0)][x] in "#g"):
                    tb = False
        print(f"symmetry {title}: left/right={lr} top/bottom={tb}")

    # Heuristic: buttons are the 9 largest non-container components. Dump
    # everything; the human (or next script pass) reads the report.
    print("\n=== per-component detail (skipping tiny specks) ===")
    for c in comps:
        x0, y0, x1, y1, count = c
        w = x0 and (x1 - x0 + 1) or (x1 - x0 + 1)
        h = y1 - y0 + 1
        w = x1 - x0 + 1
        if w < 8 or h < 8:
            continue  # label fragments etc.
        title = f"component ({x0},{y0})..({x1},{y1}) {w}x{h}"
        dump(x0, y0, min(16, w), min(h, 26), f"[TL] {title}")
        trace(x0, y0, x1, y1, title)
        mirror_check(x0, y0, x1, y1, title)


if __name__ == "__main__":
    main()
