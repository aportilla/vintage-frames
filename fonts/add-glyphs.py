#!/usr/bin/env python3
"""Build the two shipped bitmap faces: stamp the kit's family name, add glyphs.

Two things happen here, and the first applies to both faces. Every built face
is renamed to the name the kit registers it under — `VF Display`, `VF Body`,
matching the --vf-font-family-display / --vf-font-family tokens that select
them — because what ships is the kit's artifact and should not carry Apple's
face name in its binary or in a consumer's font-family stack. See FONTS.

The second is glyph backfill, and only Chicago needs it: the genuine chrome
strike (produced by `import-bdf.py --em 16`) lacks only `×`, which MacRoman
never carried. Geneva ships with its glyph set deliberately untouched: its two
gaps — `×`, and `⌘`, which only the Chicago strike ever drew — fall back per
glyph to the system font, and the known backfill is a `specs` row here (the ⌘
would trace Chicago's own ink, per fonts/README's trace-don't-invent rule).
So Geneva is built with an empty `specs` list: not a no-op, because the
rename is the rest of the build.

Run it (needs fonttools + brotli — see fonts/README.md):

    python3 fonts/add-glyphs.py

Reads the pristine  fonts/<Family>.woff2,  writes  fonts/<Family>.ext.woff2,
and rewrites FONT_WOFF2_BASE64 in the matching TS module. Idempotent: it always
rebuilds from the untouched source, so re-running can never compound. To add a
glyph, add one row to a font's `specs` list and re-run.

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
#
# "shipped" is the family name the built face carries and the kit registers.
# It is deliberately NOT the source strike's name: what ships is the kit's own
# artifact, and naming it after Apple's face would put a trademark in the
# binary and in every consumer's font-family stack. The provenance is not
# hidden by this — it is documented at length in fonts/README.md, which is
# where a description belongs. (The *fallback* entries in the recipes' family
# stacks still name Chicago, Charcoal and Geneva: those refer to faces the
# reader may have installed, which is a different claim entirely.)
FONTS = {
    "Chicago": {  # the real strike needs only ×; geometry borrowed from its '+'
        "module": "display-font.ts",
        "shipped": "VF Display",
        "specs": [
            ("multiply", 0x00D7, X_MULT, 64, 128, 448),
        ],
    },
    "Geneva": {  # ships un-extended — built only to carry the shipped name
        "module": "body-font.ts",
        "shipped": "VF Body",
        "specs": [],
    },
}


def set_family(font, family):
    """Restate every name record that identifies the face, in place.

    Each record is rewritten under its own platform/encoding/language, so a
    face that carries both the Mac and Windows sets stays consistent across
    them — a stale record in either is what font-management tools surface.
    """
    ps = family.replace(" ", "-")
    values = {1: family, 3: f"vintage-frames: {family}", 4: family, 6: ps, 16: family}
    name = font["name"]
    for rec in list(name.names):
        if rec.nameID in values:
            name.setName(values[rec.nameID], rec.nameID, rec.platformID, rec.platEncID, rec.langID)


def build(family, cfg):
    src = os.path.join(HERE, f"{family}.woff2")
    ext = os.path.join(HERE, f"{family}.ext.woff2")
    # recalcTimestamp=False keeps the source strike's head.modified instead of
    # stamping "now". Without it every run rewrote the base64 in a TS module
    # with no change anyone could see in a diff: the timestamp shifts, brotli
    # compresses different bytes, and the file lands a few bytes bigger or
    # smaller (3436–3456 across consecutive runs of the same input). The build
    # is a pure function of the strike, so its output should be one too.
    font = TTFont(src, recalcBBoxes=True, recalcTimestamp=False)
    set_family(font, cfg["shipped"])
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
    saved = TTFont(ext)
    check = saved.getBestCmap()
    missing = [hex(u) for _, u, *_ in cfg["specs"] if u not in check]
    assert not missing, f"{family}: glyphs missing after save: {missing}"
    # The shipped name is the point of the build for an un-extended face, so it
    # is asserted rather than assumed — and asserted on what was written, not
    # on the in-memory object that wrote it.
    stale = sorted(
        {r.toUnicode() for r in saved["name"].names if r.nameID in (1, 4, 16)} - {cfg["shipped"]}
    )
    assert not stale, f"{family}: name records still say {stale}"

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
    print(
        f"{family} -> {cfg['shipped']}: +{len(cfg['specs'])} glyphs, "
        f"{len(data)} bytes, re-embedded {cfg['module']}"
    )


if __name__ == "__main__":
    for family, cfg in FONTS.items():
        build(family, cfg)
    print("done — rebuild the library (npm run build) to bundle the updated fonts")
