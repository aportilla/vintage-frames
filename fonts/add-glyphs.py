#!/usr/bin/env python3
"""Extend the System 7 bitmap faces with glyphs they ship without.

ChiKareGo (Chicago-style chrome face) and FindersKeepers (body face) are
Basic-Latin only, so `⌘`, `…` and curly quotes used in the UI fell back to the
system font — a smooth glyph beside the pixel labels. This script draws those
glyphs as pixels, injects them into each WOFF2, and re-embeds the base64 into
the `src/styles/*-font.ts` modules that register the faces at runtime.

Run it (needs fonttools + brotli — see fonts/README.md):

    python3 fonts/add-glyphs.py

Reads the pristine  fonts/<Family>.woff2,  writes  fonts/<Family>.ext.woff2,
and rewrites FONT_WOFF2_BASE64 in the matching TS module. Idempotent: it always
rebuilds every custom glyph from the untouched source, so re-running can never
compound. To add a glyph, add one row to a font's `specs` list and re-run.

--- The pixel grid -----------------------------------------------------------
Both faces are 1024 units/em and designed on a 64-unit pixel (so they land on
the CSS pixel grid at 16px: 1024 / 16 = 64). Everything below is expressed in
whole pixels and multiplied by PX. Reference metrics decoded from the sources:

              cap height   x-height   period dot   quotes sit at
  ChiKareGo      9px          7px       2x2 px       6-9px band
  FindersKeepers 7px          5px       1x1 px       5-7px band

Glyphs are bitmaps (top row first, '#' = ink). `bmp()` rasterises each to
TrueType contours as one clockwise rectangle per maximal horizontal run of ink
(empty cells are simply left undrawn, so a ring is ink around an unfilled
centre — no reverse-winding needed). y0 is the font-unit y of the bitmap's
BOTTOM edge; x0 its LEFT edge; advance the glyph's advance width.
"""
import base64
import os
import re

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
STYLES = os.path.join(HERE, "..", "src", "styles")
PX = 64  # font units per design pixel

# U+2318 the "looped square" / cloverleaf command key: four ROUNDED corner loops
# (notched outer corners, so each reads as a petal/circle — this is the detail
# that distinguishes the real Mac glyph from a plain grid) joined by a central
# square, with the edges between loops left open (concave). Sized per face: an
# 11px cloverleaf for the 9px-cap chrome face, a 9px one for the 7px-cap body
# face. Both sit 1px below the baseline so they centre on the cap band.
CMD_CHROME = [  # 11x11, 4x4 loops with 2x2 holes
    ".##.....##.",
    "#..#...#..#",
    "#..#...#..#",
    ".#########.",
    "...#...#...",
    "...#...#...",
    "...#...#...",
    ".#########.",
    "#..#...#..#",
    "#..#...#..#",
    ".##.....##.",
]
CMD_BODY = [  # 9x9, smaller diamond loops for the body face
    ".#.....#.",
    "#.#...#.#",
    ".#######.",
    "..#...#..",
    "..#...#..",
    "..#...#..",
    ".#######.",
    "#.#...#.#",
    ".#.....#.",
]


def bmp(bitmap, x0, y0, advance):
    """Rasterise a bitmap to (Glyph, advance) — one CW rect per horizontal run."""
    pen = TTGlyphPen(None)
    nrows = len(bitmap)
    for r, row in enumerate(bitmap):
        c = 0
        while c < len(row):
            if row[c] == "#":
                start = c
                while c < len(row) and row[c] == "#":
                    c += 1
                xl, xr = x0 + start * PX, x0 + c * PX
                yb = y0 + (nrows - 1 - r) * PX
                yt = yb + PX
                pen.moveTo((xl, yt))
                pen.lineTo((xr, yt))
                pen.lineTo((xr, yb))
                pen.lineTo((xl, yb))
                pen.closePath()
            else:
                c += 1
    return pen.glyph(), advance


# name, codepoint, bitmap, x0, y0(bottom edge), advance — all in font units.
FONTS = {
    "ChiKareGo": {  # 9px cap, 2px dots, quotes in the 6-9px band
        "module": "chikarego-font.ts",
        "specs": [
            ("uni2318", 0x2318, CMD_CHROME, 64, -64, 832),
            ("ellipsis", 0x2026, ["##.##.##", "##.##.##"], 0, 0, 576),
            ("quoteright", 0x2019, ["##", "##", "#."], 0, 384, 192),
            ("quoteleft", 0x2018, ["##", "##", ".#"], 0, 384, 192),
            ("quotedblright", 0x201D, ["##.##", "##.##", "#..#."], 0, 384, 384),
            ("quotedblleft", 0x201C, ["##.##", "##.##", ".#..#"], 0, 384, 384),
        ],
    },
    "FindersKeepers": {  # 7px cap, 1px dots, quotes in the 5-7px band
        "module": "finders-keepers-font.ts",
        "specs": [
            ("uni2318", 0x2318, CMD_BODY, 64, -64, 704),
            ("ellipsis", 0x2026, ["#.#.#"], 0, 0, 384),
            ("quoteright", 0x2019, ["##", "#."], 0, 320, 192),
            ("quoteleft", 0x2018, ["##", ".#"], 0, 320, 192),
            ("quotedblright", 0x201D, ["##.##", "#..#."], 0, 320, 384),
            ("quotedblleft", 0x201C, ["##.##", ".#..#"], 0, 320, 384),
        ],
    },
}


def build(family, cfg):
    src = os.path.join(HERE, f"{family}.woff2")
    ext = os.path.join(HERE, f"{family}.ext.woff2")
    font = TTFont(src, recalcBBoxes=True)
    glyf, hmtx = font["glyf"], font["hmtx"]
    order = font.getGlyphOrder()

    for name, uni, bitmap, x0, y0, adv in cfg["specs"]:
        glyph, advance = bmp(bitmap, x0, y0, adv)
        if name not in order:
            order.append(name)
        glyf[name] = glyph
        glyph.recalcBounds(glyf)
        hmtx[name] = (advance, glyph.xMin)
        for table in font["cmap"].tables:
            if table.isUnicode():
                table.cmap[uni] = name

    font.setGlyphOrder(order)
    font["maxp"].numGlyphs = len(order)
    max_pts = max_cnt = 0
    for gn in order:
        g = glyf[gn]
        if g.numberOfContours > 0:
            coords, _, _ = g.getCoordinates(glyf)
            max_pts = max(max_pts, len(coords))
            max_cnt = max(max_cnt, g.numberOfContours)
    font["maxp"].maxPoints = max(font["maxp"].maxPoints, max_pts)
    font["maxp"].maxContours = max(font["maxp"].maxContours, max_cnt)

    font.flavor = "woff2"
    font.save(ext)

    data = open(ext, "rb").read()
    # sanity-check the round-trip before touching the TS module
    check = TTFont(ext).getBestCmap()
    missing = [hex(u) for _, u, *_ in cfg["specs"] if u not in check]
    assert not missing, f"{family}: glyphs missing after save: {missing}"

    b64 = base64.b64encode(data).decode()
    ts = os.path.join(STYLES, cfg["module"])
    text = open(ts).read()
    text = re.sub(
        r"const FONT_WOFF2_BASE64 =\s*\n?\s*'[^']*'",
        f"const FONT_WOFF2_BASE64 =\n  '{b64}'",
        text,
        count=1,
    )
    text = re.sub(r"\(\d+ bytes\)", f"({len(data)} bytes)", text, count=1)
    open(ts, "w").write(text)
    print(f"{family}: +{len(cfg['specs'])} glyphs -> {len(data)} bytes, re-embedded {cfg['module']}")


if __name__ == "__main__":
    for family, cfg in FONTS.items():
        build(family, cfg)
    print("done — rebuild the library (npm run build) to bundle the updated fonts")
