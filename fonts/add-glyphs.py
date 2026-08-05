#!/usr/bin/env python3
"""Extend the System 7 bitmap faces with glyphs they ship without.

Chicago (the genuine chrome strike, produced by `import-bdf.py --em 16`) lacks
only `×` — MacRoman never carried it. Geneva (the genuine body strike) ships
deliberately untouched for now: its two gaps — `×`, and `⌘`, which only the
Chicago strike ever drew — fall back per glyph to the system font, and the
known backfill is a Geneva entry in this script (the ⌘ would trace Chicago's
own ink, per fonts/README's trace-don't-invent rule). This script draws the
missing glyphs as pixels, injects them into each WOFF2, and re-embeds the
base64 into the `src/styles/*-font.ts` modules that register the faces at
runtime.

Run it (needs fonttools + brotli — see fonts/README.md):

    python3 fonts/add-glyphs.py

Reads the pristine  fonts/<Family>.woff2,  writes  fonts/<Family>.ext.woff2,
and rewrites FONT_WOFF2_BASE64 in the matching TS module. Idempotent: it always
rebuilds every custom glyph from the untouched source, so re-running can never
compound. To add a glyph, add one row to a font's `specs` list and re-run.

--- The pixel grid -----------------------------------------------------------
Both faces are 1024 units/em and designed on a 64-unit pixel (so they land on
the CSS pixel grid at 16px: 1024 / 16 = 64). Everything below is expressed in
whole pixels and multiplied by PX. Reference metrics for drawing into Geneva,
measured from the strike: 7px caps, 5px x-height, 1x1 px period dot with a
1px bearing, quotes in the 5-8px band; its ink sits flush left with the 1px
gap carried in the advance (its '+' is 5x5 at y 1, 6px advance). Chicago's
one spec borrows its whole geometry from that strike's own '+' (5x5 ink, 1px
bearing each side, 7px advance).

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

# The multiplication sign, an X on the math axis (aligned with the strike's
# own '+'): a 5x5 saltire.
X_MULT = [
    "#...#",
    ".#.#.",
    "..#..",
    ".#.#.",
    "#...#",
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
    "Chicago": {  # the real strike needs only ×; geometry borrowed from its '+'
        "module": "chicago-font.ts",
        "specs": [
            ("multiply", 0x00D7, X_MULT, 64, 128, 448),
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
