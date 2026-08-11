#!/usr/bin/env python3
"""Import a classic Mac BDF strike as a pixel-grid woff2 webfont.

    /tmp/fontenv/bin/python3 fonts/import-bdf.py ~/Documents/BDF/Geneva/12.bdf ...

Writes  fonts/imported/<Family>-<size>.woff2  for each input, where <Family>
is the BDF's containing directory ("Geneva/12.bdf" -> family "Geneva 12") —
each strike is its own font family, because CSS has no way to select a bitmap
strike by size, so the size lives in the name.

--- The pixel grid -----------------------------------------------------------
Same convention as the shipped faces (see manifest-to-font.py): 64 font units per
design pixel. Here the em is the strike's own line height — PIXEL_SIZE, which
for these exports equals FONT_ASCENT + FONT_DESCENT — so upm = 64 * PIXEL_SIZE
and the face renders 1 design px = 1 CSS px at `font-size: PIXEL_SIZEpx`.
hhea and OS/2 typo metrics are written as ascent*64 / -descent*64 directly,
so the baseline sits on the design grid without needing the
ascent-override/descent-override registration hacks the shipped faces carry
(their converter left hhea off the grid; this converter *is* the metrics).
lineGap carries the strike's QuickDraw leading — stated with `--leading N`,
from a native measurement or period documentation, NEVER read from the
suitcase metadata (which is synthesized — see dfont-to-bdf.py's docstring) —
so a woff2 built with it states its native line pitch on its face: pitch in
design px = (upm + lineGap) / 64. Absent, lineGap is 0 and the font claims
only its rect. A re-emmed box (--em / --ascent) already spends its padding
rows inside the em, so the gap records only what padding hasn't covered —
never negative.

--- Encoding -----------------------------------------------------------------
ENCODING values are MacRoman bytes, mapped through Python's mac_roman codec.
Values above 255 are already Unicode (FontForge re-encoded Chicago's classic
0x11-0x14 symbol slots that way) and pass through. Control slots (< 0x20, and
0x7F) are dropped when blank — they're 1x1 placeholder bitmaps in these
exports — but an *inked* glyph in the classic symbol slots is mapped to its
Unicode point (0x11-0x14 -> cmd, check, diamond, apple).

--- Verification -------------------------------------------------------------
After saving, the woff2 is reopened and every glyph is round-tripped: its
compiled contours (axis-aligned pixel-run rectangles) are decomposed back
into grid cells and bit-compared against the source BDF bitmap, and every
advance and cmap entry is checked. The build fails loudly on any mismatch,
so a font that saves is pixel-identical to its BDF.
"""
import os
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

PX = 64  # font units per design pixel
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "imported")

# Classic Mac symbol slots, honored only when the slot actually carries ink.
SYMBOL_SLOTS = {0x11: 0x2318, 0x12: 0x2713, 0x13: 0x25C6, 0x14: 0xF8FF}


def parse_bdf(path):
    """-> (props: dict, glyphs: list of (name, encoding, advance_px, bbx, rows))

    bbx is (w, h, xoff, yoff) in pixels; rows are '#'/'.' strings, top first.
    """
    props, glyphs = {}, []
    cur = None
    in_bitmap = False
    for line in open(path, encoding="latin-1"):
        line = line.rstrip("\n")
        if in_bitmap:
            if line == "ENDCHAR":
                in_bitmap = False
                glyphs.append(cur)
                cur = None
            else:
                w = cur[3][0]
                bits = bin(int(line, 16))[2:].zfill(len(line) * 4)[:w]
                cur[4].append(bits.replace("0", ".").replace("1", "#"))
            continue
        key, _, rest = line.partition(" ")
        if key == "STARTCHAR":
            cur = [rest, None, 0, None, []]
        elif key == "ENCODING":
            cur[1] = int(rest)
        elif key == "DWIDTH":
            cur[2] = int(rest.split()[0])
        elif key == "BBX":
            w, h, xo, yo = (int(v) for v in rest.split())
            cur[3] = (w, h, xo, yo)
        elif key == "BITMAP":
            in_bitmap = True
        elif key in ("FAMILY_NAME", "COPYRIGHT"):
            props[key] = rest.strip('"')
        elif key in ("PIXEL_SIZE", "FONT_ASCENT", "FONT_DESCENT"):
            props[key] = int(rest)
    return props, [tuple(g) for g in glyphs]


def map_encoding(enc, has_ink):
    """BDF ENCODING -> Unicode codepoint, or None to drop the glyph."""
    if enc > 255:
        return enc  # already Unicode (FontForge's re-encoded symbol slots)
    if enc in SYMBOL_SLOTS and has_ink:
        return SYMBOL_SLOTS[enc]
    if enc < 0x20 or enc == 0x7F:
        return None  # blank placeholder / control slot
    return ord(bytes([enc]).decode("mac_roman"))


def ink_cells(bbx, rows):
    """Bitmap -> set of (x, y) pixel cells, y up, relative to the origin."""
    w, h, xo, yo = bbx
    return {
        (xo + c, yo + (h - 1 - r))
        for r, row in enumerate(rows)
        for c, ch in enumerate(row)
        if ch == "#"
    }


def draw(bbx, rows):
    """Rasterise to TrueType contours — one CW rect per horizontal run of ink
    (manifest-to-font.py's bmp(), with the offsets coming from the BBX)."""
    w, h, xo, yo = bbx
    pen = TTGlyphPen(None)
    for r, row in enumerate(rows):
        c = 0
        while c < len(row):
            if row[c] == "#":
                start = c
                while c < len(row) and row[c] == "#":
                    c += 1
                xl, xr = (xo + start) * PX, (xo + c) * PX
                yb = (yo + (h - 1 - r)) * PX
                pen.moveTo((xl, yb + PX))
                pen.lineTo((xr, yb + PX))
                pen.lineTo((xr, yb))
                pen.lineTo((xl, yb))
                pen.closePath()
            else:
                c += 1
    return pen.glyph()


def build(bdf_path, em=None, ascent=None, family=None, leading=0):
    """em: optionally re-em the strike onto a larger line box (whole px, >= its
    native size); the extra pixels pad the DESCENT, so the ascent — where the
    baseline sits — is untouched and the ink lands identically. This is how the
    kit chrome face is derived: Chicago 15 (12/3) on the kit's 16px em is 12/4,
    the exact box the 75%/25% registration overrides describe.

    ascent: optionally re-split the (possibly re-emmed) box at a stated
    baseline, padding the ASCENT too — for a strike whose own ascent is short
    of the target grid (e.g. Geneva 12's 10/2 with --em 16 --ascent 12 lands
    on the same 12/4 box). Padding only, never clipping: the strike's own
    ascent/descent must still fit."""
    props, raw = parse_bdf(bdf_path)
    size = props["PIXEL_SIZE"]
    asc, desc = props["FONT_ASCENT"], props["FONT_DESCENT"]
    if asc + desc != size:
        sys.exit(f"{bdf_path}: ascent {asc} + descent {desc} != PIXEL_SIZE {size}")
    if em is not None:
        if em < size:
            sys.exit(f"{bdf_path}: --em {em} smaller than the strike's {size}px")
        desc += em - size
        size = em
    if ascent is not None:
        if not asc <= ascent <= size - props["FONT_DESCENT"]:
            sys.exit(
                f"{bdf_path}: --ascent {ascent} outside {asc}..{size - props['FONT_DESCENT']} "
                f"(pads only — the strike's {props['FONT_ASCENT']}/{props['FONT_DESCENT']} must fit the em)"
            )
        asc, desc = ascent, size - ascent
    # The derived "<dir> <size>" name carries the LINE height; --family states
    # the name outright, for a strike whose file-name size isn't its point
    # size (Geneva 9pt and 10pt both live on a 12px rect).
    if family is None:
        family = f"{os.path.basename(os.path.dirname(os.path.abspath(bdf_path)))} {props['PIXEL_SIZE']}"
    upm = size * PX

    # Select and order the glyphs: .notdef first, then by codepoint. Names come
    # from the BDF (already AGL-style), deduped defensively.
    kept, seen = {}, set()
    for name, enc, adv_px, bbx, rows in raw:
        uni = map_encoding(enc, any("#" in r for r in rows))
        if uni is None or uni in kept:
            continue
        if name in seen:
            name = f"uni{uni:04X}"
        seen.add(name)
        kept[uni] = (name, adv_px, bbx, rows)

    glyph_order = [".notdef"] + [kept[u][0] for u in sorted(kept)]
    cmap = {u: kept[u][0] for u in sorted(kept)}
    glyphs, metrics = {".notdef": TTGlyphPen(None).glyph()}, {".notdef": (0, 0)}
    for u in sorted(kept):
        name, adv_px, bbx, rows = kept[u]
        glyphs[name] = draw(bbx, rows)
        metrics[name] = (adv_px * PX, min((x for x, _ in ink_cells(bbx, rows)), default=0) * PX)

    # Native pitch = the strike's own ascent + descent + the stated QuickDraw
    # leading (see the module docstring — measured, never from suitcase
    # metadata); the gap is whatever of it the (possibly re-emmed) box
    # doesn't already cover.
    line_gap = max(0, props["FONT_ASCENT"] + props["FONT_DESCENT"] + leading - size) * PX

    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=asc * PX, descent=-desc * PX, lineGap=line_gap)
    # Win metrics must cover the glyph extremes (renderers clip to them);
    # typo metrics ARE the design grid, and USE_TYPO_METRICS pins layout to it.
    tops = [g.yMax for g in glyphs.values() if g.numberOfContours > 0]
    bottoms = [g.yMin for g in glyphs.values() if g.numberOfContours > 0]
    fb.setupOS2(
        version=4,  # fsSelection's USE_TYPO_METRICS bit is defined from v4
        sTypoAscender=asc * PX,
        sTypoDescender=-desc * PX,
        sTypoLineGap=line_gap,
        usWinAscent=max([asc * PX] + tops),
        usWinDescent=max([desc * PX] + [-b for b in bottoms]),
        fsSelection=0x40 | 0x80,  # REGULAR | USE_TYPO_METRICS
        achVendID="NONE",
    )
    fb.setupNameTable(
        {
            "familyName": family,
            "styleName": "Regular",
            "uniqueFontIdentifier": f"vintage-frames bdf import: {family}",
            "fullName": family,
            "psName": family.replace(" ", "-"),
            "version": "Version 1.000",
        }
    )
    fb.setupPost()
    fb.font.flavor = "woff2"
    os.makedirs(OUT, exist_ok=True)
    stem = (
        family.replace(" ", "-")
        + (f"-em{size}" if em is not None else "")
        + (f"-a{asc}" if ascent is not None else "")
    )
    out = os.path.join(OUT, f"{stem}.woff2")
    fb.save(out)

    verify(out, upm, line_gap, kept)
    print(
        f"{family}: {len(kept)} glyphs, em {size}px ({asc}/{desc}), "
        f"line {size + line_gap // PX}px, "
        f"{os.path.getsize(out)} bytes -> {os.path.relpath(out)}"
    )


def verify(path, upm, line_gap, kept):
    """Round-trip: decompose the compiled contours back into pixel cells and
    bit-compare every glyph against its BDF bitmap."""
    font = TTFont(path)
    assert font["head"].unitsPerEm == upm
    assert font["hhea"].lineGap == line_gap, "hhea lineGap lost in save"
    assert font["OS/2"].sTypoLineGap == line_gap, "OS/2 sTypoLineGap lost in save"
    glyf, hmtx, cmap = font["glyf"], font["hmtx"], font.getBestCmap()
    for u in kept:
        name, adv_px, bbx, rows = kept[u]
        assert cmap.get(u) == name, f"cmap miss for U+{u:04X}"
        assert hmtx[name][0] == adv_px * PX, f"advance mismatch on {name}"
        g = glyf[name]
        cells = set()
        if g.numberOfContours > 0:
            coords, ends, _ = g.getCoordinates(glyf)
            prev = 0
            for end in ends:
                pts = coords[prev : end + 1]
                prev = end + 1
                assert len(pts) == 4, f"{name}: non-rect contour"
                xs, ys = sorted({p[0] for p in pts}), sorted({p[1] for p in pts})
                assert all(v % PX == 0 for v in xs + ys), f"{name}: off-grid contour"
                for x in range(xs[0] // PX, xs[1] // PX):
                    for y in range(ys[0] // PX, ys[1] // PX):
                        cells.add((x, y))
        assert cells == ink_cells(bbx, rows), f"{name}: pixel mismatch"


if __name__ == "__main__":
    args = sys.argv[1:]
    em = ascent = family = None
    leading = 0
    if "--em" in args:
        i = args.index("--em")
        em = int(args[i + 1])
        del args[i : i + 2]
    if "--ascent" in args:
        i = args.index("--ascent")
        ascent = int(args[i + 1])
        del args[i : i + 2]
    if "--family" in args:
        i = args.index("--family")
        family = args[i + 1]
        del args[i : i + 2]
    if "--leading" in args:
        i = args.index("--leading")
        leading = int(args[i + 1])
        del args[i : i + 2]
    if not args:
        sys.exit(
            f"usage: {sys.argv[0]} [--em N] [--ascent N] [--family NAME] [--leading N] <strike.bdf> ..."
        )
    for p in args:
        build(p, em, ascent, family, leading)
