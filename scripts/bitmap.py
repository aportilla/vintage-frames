#!/usr/bin/env python3
"""Read and measure 1-bit art in a PNG, using nothing but the standard library.

This is the generic core of the retired `extract-*.py` tools. Those scripts
derived the kit's traced constants — the button corner profiles, the menu
metrics, the window chrome — from a local reference sheet, and once the
constants were committed they had done their job; the sheet is not part of the
repo and the scripts that read it are gone. What survives is the part that was
never about that particular artwork: a dependency-free PNG decoder and a small
set of measurements for reducing a bitmap to numbers you can compare.

Kept for authoring tasks. When a new piece of 1-bit chrome needs designing,
this is how you ask "what does our render actually measure?" without adding
Pillow to a repo whose only other dependency is Lit:

    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).parent))
    import bitmap

    w, h, pixels = bitmap.read_png("shots/menus.png")
    box = bitmap.find_panel(pixels, (0, 0, w - 1, h - 1))
    bitmap.report_box(pixels, box)

`scripts/measure-menu-render.py` and `scripts/verify-button-screenshot.py` are
the two live callers, both measuring screenshots of our own output.

Pixels are `(r, g, b, a)` tuples, `pixels[y][x]`, always 8-bit per channel
whatever the file's own depth.
"""

import struct
import zlib


def read_png(path):
    """Return (width, height, pixels) where pixels[y][x] = (r, g, b, a).

    Handles every non-interlaced PNG colour type — grayscale, RGB, palette
    (with tRNS), gray+alpha, RGBA — at bit depths 1, 2, 4, 8 and 16, which is
    the whole range a screenshot or an exported sprite sheet can arrive in.
    """
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


# ── classifying a pixel ────────────────────────────────────────────────────
# Loose thresholds on purpose: a screenshot of 1-bit art should be pure black
# and white, and anything in between is the antialiasing smear the kit exists
# to avoid — so these say "ink" and "paper" generously, and a caller wanting
# to *catch* the smear tests for neither.


def is_black(px):
    r, g, b, a = px
    return a >= 128 and r < 96 and g < 96 and b < 96


def is_white(px):
    r, g, b, a = px
    return a >= 128 and r > 224 and g > 224 and b > 224


def is_opaque(px):
    return px[3] >= 128


# ── reducing a bitmap to numbers ───────────────────────────────────────────

GAP_MIN = 3  # x-gap (px) that separates one ink run from the next
MIN_RUN = 40  # a horizontal black run this long is a border, not text


def find_panel(pixels, region, min_run=MIN_RUN):
    """Return (x0, y0, x1, y1) of a bordered box inside `region`.

    The top border is the first row carrying a long black run; that run's own
    extent gives the left/right edges. Classic chrome casts a hard 1px shadow
    offset down-right, so the top border row is the one edge the shadow can
    never contaminate -- hence measuring from it.

    `min_run` guards against latching onto some other wide black shape above
    the box -- a vf-menu's inverted bar label sits directly over its panel and
    is itself wider than the default threshold.
    """
    rx0, ry0, rx1, ry1 = region
    for y in range(ry0, ry1 + 1):
        x = rx0
        while x <= rx1:
            if not is_black(pixels[y][x]):
                x += 1
                continue
            start = x
            while x <= rx1 and is_black(pixels[y][x]):
                x += 1
            if x - start >= min_run:
                x0, x1 = start, x - 1
                # Walk down for the last row that is black across that span.
                y1 = y
                for yy in range(y + 1, ry1 + 1):
                    if all(is_black(pixels[yy][xx]) for xx in range(x0, x1 + 1)):
                        y1 = yy
                return x0, y, x1, y1
    raise SystemExit(f"no bordered box found in region {region}")


def ink_runs(pixels, y, x0, x1):
    """Ink runs in [x0, x1] on row y, merged across gaps < GAP_MIN."""
    runs = []
    x = x0
    while x <= x1:
        if not is_black(pixels[y][x]):
            x += 1
            continue
        start = x
        gap = 0
        end = x
        while x <= x1:
            if is_black(pixels[y][x]):
                end = x
                gap = 0
            else:
                gap += 1
                if gap >= GAP_MIN:
                    break
            x += 1
        runs.append((start, end))
    return runs


def text_bands(pixels, box):
    """Group interior rows carrying ink into bands (one per text row)."""
    x0, y0, x1, y1 = box
    ix0, ix1 = x0 + 1, x1 - 1
    bands = []
    cur = None
    for y in range(y0 + 1, y1):
        has_ink = any(is_black(pixels[y][x]) for x in range(ix0, ix1 + 1))
        if has_ink and cur is None:
            cur = [y, y]
        elif has_ink:
            cur[1] = y
        elif cur is not None:
            bands.append(tuple(cur))
            cur = None
    if cur is not None:
        bands.append(tuple(cur))
    return bands


def band_runs(pixels, box, band):
    """Merged ink runs across every row of a band, as (start, end) in x."""
    x0, _, x1, _ = box
    ix0, ix1 = x0 + 1, x1 - 1
    merged = []
    for y in range(band[0], band[1] + 1):
        merged.extend(ink_runs(pixels, y, ix0, ix1))
    if not merged:
        return []
    merged.sort()
    out = [list(merged[0])]
    for s, e in merged[1:]:
        if s - out[-1][1] < GAP_MIN:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return [tuple(r) for r in out]


def report_box(pixels, box):
    """Print each text row's ink runs, relative to the box's left border.

    One reduction shared by every caller, so two measurements are only ever
    compared when they were taken the same way.
    """
    x0, y0, x1, y1 = box
    print("  rows (x offsets are relative to the box's LEFT BORDER at x0):")

    bands = text_bands(pixels, box)
    starts = []
    for band in bands:
        runs = band_runs(pixels, box, band)
        if not runs:
            continue
        starts.append(band[0])
        rel = [(s - x0, e - x0, e - s + 1) for s, e in runs]
        desc = "  ".join(f"[{s}..{e} w={w}]" for s, e, w in rel)
        print(
            f"    y {band[0] - y0:>3}..{band[1] - y0:<3} "
            f"(h={band[1] - band[0] + 1:>2})  first-ink={rel[0][0]:>3}  {desc}"
        )

    pitches = [b - a for a, b in zip(starts, starts[1:])]
    if pitches:
        print(f"  row pitch (band starts): {pitches}")
