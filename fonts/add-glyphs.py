#!/usr/bin/env python3
"""Build the two shipped bitmap faces: stamp the kit's family name, add glyphs.

Two things happen here, and the first applies to both faces. Every built face
is renamed to the name the kit registers it under — `VF Display`, `VF Body`,
matching the --vf-font-family-display / --vf-font-family tokens that select
them — because what ships is the kit's artifact and should not carry Apple's
face name in its binary or in a consumer's font-family stack. See FONTS.

The second is glyph backfill. Chicago gains the one character it lacked (`×`).
Geneva carries the kit's body-copy backfill: the characters modern web copy
reaches for that old MacRoman never held. Every spec row states its source,
best kind first:

    traced   — another glyph's ink, verbatim (the donor is named)
    composed — a strike capital under the strike's own accent, at the
               placement the native É / Ñ / Å establish (accent ink in rows
               y8-9 over a y7 gap; a dieresis is one row at y8)
    derived  — strike ink rearranged (the donors are named)
    drawn    — nothing to trace anywhere; an original 1-bit drawing, awaiting
               review on the proof page

Review the results on the proofing page: glyph-proof.html on the dev server
renders every backfilled glyph oversized, in context, and beside its bitmap —
it reads demo/glyph-proof-manifest.ts, which this script regenerates on every
run (generated, like the charset manifest — never hand-edit).

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
gap carried in the advance (its '+' is 5x5 at y 1, 6px advance — the box its
`×` reuses). Chicago's `×` likewise borrows its whole geometry from that
strike's own '+' (5x5 ink, 1px bearing each side, 7px advance).

Glyphs are bitmaps (top row first, '#' = ink). `bmp()` rasterises each to
TrueType contours as one clockwise rectangle per maximal horizontal run of ink
(empty cells are simply left undrawn, so a ring is ink around an unfilled
centre — no reverse-winding needed). y0 is the font-unit y of the bitmap's
BOTTOM edge; x0 its LEFT edge; advance the glyph's advance width.
"""
import base64
import json
import os
import re

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
STYLES = os.path.join(HERE, "..", "src", "styles")
DEMO = os.path.join(HERE, "..", "demo")
PX = 64  # font units per design pixel

# The multiplication sign, an X on the math axis (aligned with the strike's
# own '+'): a 5x5 saltire. Shared by both faces, each in its own '+' box.
X_MULT = [
    "#...#",
    ".#.#.",
    "..#..",
    ".#.#.",
    "#...#",
]

# The command key, traced verbatim from the Chicago strike's own ⌘ — the one
# strike that ever drew it (fonts/README's trace-don't-invent rule). 9x9 on
# the baseline; it rides above Geneva's 7px cap band, which is what tracing
# means — redrawing it smaller would be inventing.
CMD_KEY = [
    ".##...##.",
    "#..#.#..#",
    "#..#.#..#",
    ".#######.",
    "...#.#...",
    ".#######.",
    "#..#.#..#",
    "#..#.#..#",
    ".##...##.",
]

# The checkmark, traced verbatim from the Chicago strike's own ✓ (like ⌘,
# Chicago is the only strike that drew one).
CHECKMARK_INK = [
    "........#",
    ".......##",
    "......##.",
    ".....##..",
    "#...##...",
    "##.##....",
    ".###.....",
    "..#......",
]

# Geneva's capitals, dumped from the strike — the bases the composed accented
# caps sit on. Do not edit these: they must stay bit-identical to the strike's
# own A/E/O/U (the I is a bare 1px stem, inlined below).
GENEVA_A = ["..#..", "..#..", ".#.#.", ".#.#.", "#####", "#...#", "#...#"]
GENEVA_E = ["####", "#...", "#...", "###.", "#...", "#...", "####"]
GENEVA_O = [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."]
GENEVA_U = ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."]


def cap(accent, base):
    """Compose an accented capital: accent rows, one blank row, the base cap —
    the exact vertical grammar of the strike's own É/Ñ/Å (ink tops out at y9,
    or y8 for a one-row dieresis)."""
    width = max(len(r) for r in accent + base)
    return [r.ljust(width, ".") for r in accent] + ["." * width] + [
        r.ljust(width, ".") for r in base
    ]


# name, codepoint, bitmap, x0, y0(bottom edge), advance — all in font units —
# and the source note the proof page displays.
#
# Geneva spacing convention throughout: ink flush left (x0 0) with the 1px gap
# carried in the advance; the exceptions keep a donor's own bearings (comma,
# period, ’, », A and I carry 1px bearings in the strike).
GENEVA_SPECS = [
    ("multiply", 0x00D7, X_MULT, 0, 64, 384,
     "drawn — the saltire in the strike's own + box, on the math axis"),
    ("command", 0x2318, CMD_KEY, 0, 0, 640,
     "traced — Chicago's ⌘, verbatim, on Geneva's flush-left spacing"),
    ("checkmark", 0x2713, CHECKMARK_INK, 0, 0, 640,
     "traced — Chicago's ✓, verbatim, on Geneva's flush-left spacing"),

    # -- currency & math ------------------------------------------------------
    ("euro", 0x20AC, [
        ".###.",
        "#....",
        "#####",
        "#....",
        "#####",
        "#....",
        ".###.",
    ], 0, 0, 384,
     "drawn — the strike's own C, curve left open (its corner stubs dropped), crossed by two full-width bars (the € postdates every source strike)"),
    ("minus", 0x2212, ["#####"], 0, 192, 384,
     "derived — the crossbar of the strike's own +, alone on the math axis"),
    ("periodcentered", 0x00B7, ["#"], 64, 192, 192,
     "derived — the strike's period dot raised to the math axis, its bearing kept"),
    ("onesuperior", 0x00B9, [".#", "##", ".#", ".#", ".#"], 0, 128, 192,
     "drawn — a 2x5 digit at superscript height (top at cap height)"),
    ("twosuperior", 0x00B2, ["##.", "..#", ".#.", "#..", "###"], 0, 128, 256,
     "drawn — a 3x5 digit at superscript height"),
    ("threesuperior", 0x00B3, ["##.", "..#", ".#.", "..#", "##."], 0, 128, 256,
     "drawn — a 3x5 digit at superscript height"),
    ("onehalf", 0x00BD, [
        ".#.......",
        "##...#...",
        ".#...#...",
        ".#..#....",
        "....#.##.",
        "...#....#",
        "...#...#.",
        "......###",
    ], 0, 0, 640,
     "drawn — mini 1 over mini 2 across a fraction slash, full cap band"),
    ("onequarter", 0x00BC, [
        ".#.......",
        "##...#...",
        ".#...#...",
        ".#..#....",
        "....#.#.#",
        "...#..#.#",
        "...#..###",
        "........#",
    ], 0, 0, 640,
     "drawn — mini 1 over mini 4 across a fraction slash"),
    ("threequarters", 0x00BE, [
        "##.......",
        "..#..#...",
        ".#...#...",
        "..#.#....",
        "##..#.#.#",
        "...#..#.#",
        "...#..###",
        "........#",
    ], 0, 0, 640,
     "drawn — the superscript ³ drawing over mini 4, matching ¼'s slash and denominator"),

    # -- typographic ----------------------------------------------------------
    ("prime", 0x2032, [".#", ".#", "#."], 64, 256, 256,
     "derived — the strike's ’ ink, dropped to sit on the x-height band"),
    ("doubleprime", 0x2033, [".#..#", ".#..#", "#..#."], 64, 256, 448,
     "derived — two of the strike's ’ ink, one gap apart"),
    ("quotesinglbase", 0x201A, [".#", ".#", "#."], 64, -128, 256,
     "traced — the strike's comma, verbatim (a low-9 quote is a comma)"),
    ("quotedblbase", 0x201E, [".#..#", ".#..#", "#..#."], 64, -128, 448,
     "derived — the strike's comma, doubled one gap apart"),
    ("daggerdbl", 0x2021, [".#.", "###", ".#.", ".#.", "###", ".#."], 0, 128, 256,
     "derived — the strike's † with its own crossbar repeated below"),
    ("guilsinglleft", 0x2039, ["..#", ".#.", "#..", ".#.", "..#"], 0, 0, 320,
     "derived — one chevron of the strike's «"),
    ("guilsinglright", 0x203A, ["#..", ".#.", "..#", ".#.", "#.."], 64, 0, 320,
     "derived — one chevron of the strike's », its bearing kept"),
    ("fraction", 0x2044, [
        "...#",
        "...#",
        "..#.",
        "..#.",
        ".#..",
        ".#..",
        "#...",
        "#...",
    ], 64, 0, 384,
     "traced — the strike's /, verbatim (one drawing serves both slashes at 9pt)"),
    ("perthousand", 0x2030, [
        ".#######...",
        "#..#..#....",
        "#..#.#.....",
        ".##..##.##.",
        "...##..#..#",
        "..#.#..#..#",
        ".#...##.##.",
    ], 0, 0, 768,
     "derived — the strike's % with its lower loop doubled into a shared-wall 00 (Adam's ink, 2026-08-09)"),
    ("fi", 0xFB01, [
        "..##.#",
        ".#....",
        "###.##",
        ".#...#",
        ".#...#",
        ".#...#",
        ".#...#",
    ], 0, 0, 448,
     "derived — the strike's f and i, joined at f's own advance"),
    ("fl", 0xFB02, [
        "..####",
        ".#...#",
        "###..#",
        ".#...#",
        ".#...#",
        ".#...#",
        ".#...#",
    ], 0, 0, 448,
     "derived — the strike's f and l, joined at f's own advance"),

    # -- accented capitals ----------------------------------------------------
    # The strike's own caps under the strike's own accents (shapes from its
    # lowercase à á â ä; placement from its native É/Ñ/Å). Ã Õ Ñ Ö Ü É are
    # native — only these fifteen were missing.
    ("Aacute", 0x00C1, cap(["...#.", "..#.."], GENEVA_A), 64, 0, 448,
     "composed — the strike's A under its own acute"),
    ("Acircumflex", 0x00C2, cap(["..#..", ".#.#."], GENEVA_A), 64, 0, 448,
     "composed — the strike's A under its own circumflex"),
    ("Egrave", 0x00C8, cap([".#..", "..#."], GENEVA_E), 0, 0, 320,
     "composed — the strike's E under its own grave (its É, mirrored)"),
    ("Ecircumflex", 0x00CA, cap([".#..", "#.#."], GENEVA_E), 0, 0, 320,
     "composed — the strike's E under its own circumflex (placed as its ê)"),
    ("Edieresis", 0x00CB, cap(["#..#"], GENEVA_E), 0, 0, 320,
     "composed — the strike's E under its own dieresis (dots over the stems, as its ë)"),
    ("Igrave", 0x00CC, cap(["#.", ".#"], [".#"] * 7), 0, 0, 192,
     "composed — the strike's I under its own grave (accent left of the stem, as its ì)"),
    ("Iacute", 0x00CD, cap([".#", "#."], [".#"] * 7), 0, 0, 192,
     "composed — the strike's I under its own acute (as its í)"),
    ("Icircumflex", 0x00CE, cap([".#.", "#.#"], [".#."] * 7), 0, 0, 256,
     "composed — the strike's I under its own circumflex (as its î; a wider letter, like î vs í)"),
    ("Idieresis", 0x00CF, cap(["#.#"], [".#."] * 7), 0, 0, 256,
     "composed — the strike's I under its own dieresis (as its ï)"),
    ("Ograve", 0x00D2, cap([".#...", "..#.."], GENEVA_O), 0, 0, 384,
     "composed — the strike's O under its own grave"),
    ("Oacute", 0x00D3, cap(["...#.", "..#.."], GENEVA_O), 0, 0, 384,
     "composed — the strike's O under its own acute"),
    ("Ocircumflex", 0x00D4, cap(["..#..", ".#.#."], GENEVA_O), 0, 0, 384,
     "composed — the strike's O under its own circumflex"),
    ("Ugrave", 0x00D9, cap([".#...", "..#.."], GENEVA_U), 0, 0, 384,
     "composed — the strike's U under its own grave"),
    ("Uacute", 0x00DA, cap(["...#.", "..#.."], GENEVA_U), 0, 0, 384,
     "composed — the strike's U under its own acute"),
    ("Ucircumflex", 0x00DB, cap(["..#..", ".#.#."], GENEVA_U), 0, 0, 384,
     "composed — the strike's U under its own circumflex"),

    # -- arrows & marks -------------------------------------------------------
    # No strike anywhere carries text arrows (every imported Symbol strike was
    # checked), so these are drawings: 1px chevron heads on the math axis,
    # matching the face's stroke weight.
    ("arrowleft", 0x2190, [
        "..#....",
        ".#.....",
        "#######",
        ".#.....",
        "..#....",
    ], 0, 64, 512, "drawn — chevron-headed arrow on the math axis"),
    ("arrowright", 0x2192, [
        "....#..",
        ".....#.",
        "#######",
        ".....#.",
        "....#..",
    ], 0, 64, 512, "drawn — chevron-headed arrow on the math axis"),
    ("arrowup", 0x2191, [
        "..#..",
        ".#.#.",
        "#.#.#",
        "..#..",
        "..#..",
        "..#..",
        "..#..",
    ], 0, 0, 384, "drawn — chevron-headed arrow, cap height"),
    ("arrowdown", 0x2193, [
        "..#..",
        "..#..",
        "..#..",
        "..#..",
        "#.#.#",
        ".#.#.",
        "..#..",
    ], 0, 0, 384, "drawn — chevron-headed arrow, cap height"),
    ("multiplicationx", 0x2715, [
        "#.....#",
        ".#...#.",
        "..#.#..",
        "...#...",
        "..#.#..",
        ".#...#.",
        "#.....#",
    ], 0, 0, 512, "drawn — the ballot X: the × saltire at full cap size"),
    ("blackstar", 0x2605, [
        "...#...",
        "..###..",
        "#######",
        ".#####.",
        "..###..",
        ".##.##.",
        ".#...#.",
    ], 0, 0, 512, "drawn — a five-point star filled solid, cap size (Adam's ink, 2026-08-09)"),

    # -- Mac modifier keys ----------------------------------------------------
    # ⌘ is traced above; no strike ever drew the other three (they entered the
    # UI after the bitmap era), so they are drawings at ⌘-compatible weight.
    ("shift", 0x21E7, [
        "....#....",
        "...#.#...",
        "..#...#..",
        ".#.....#.",
        "##.....##",
        "..#...#..",
        "..#...#..",
        "..#...#..",
        "..#####..",
    ], 0, 0, 640, "drawn — the shift key outline (Adam's ink, 2026-08-09)"),
    ("option", 0x2325, [
        "##..###",
        "..#....",
        "...#...",
        "....#..",
        ".....##",
    ], 0, 64, 512, "drawn — the option key switch"),
    ("control", 0x2303, [
        "..#..",
        ".#.#.",
        "#...#",
    ], 0, 192, 384, "drawn — the control chevron, in the cap's upper band"),
]

CHICAGO_SPECS = [
    ("multiply", 0x00D7, X_MULT, 64, 128, 448,
     "drawn — the saltire in the strike's own + box, on the math axis"),
]

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
        "specs": CHICAGO_SPECS,
    },
    "Geneva": {  # the body-copy backfill lives here — see GENEVA_SPECS
        "module": "body-font.ts",
        "shipped": "VF Body",
        "specs": GENEVA_SPECS,
    },
}


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

    for name, uni, bitmap, x0, y0, adv, _source in cfg["specs"]:
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


def write_manifest():
    """Regenerate demo/glyph-proof-manifest.ts — the proof page's data file."""
    entries = []
    for family, cfg in FONTS.items():
        for name, uni, bitmap, x0, y0, adv, source in cfg["specs"]:
            entries.append({
                "face": cfg["shipped"],
                "char": chr(uni),
                "name": name,
                "codepoint": uni,
                "rows": bitmap,
                "x0": x0 // PX,
                "y0": y0 // PX,
                "advance": adv // PX,
                "source": source,
            })
    body = json.dumps(entries, ensure_ascii=False, indent=2)
    path = os.path.join(DEMO, "glyph-proof-manifest.ts")
    with open(path, "w") as f:
        f.write(
            "// GENERATED by fonts/add-glyphs.py — do not edit. Every glyph the\n"
            "// kit adds to the shipped faces, with its bitmap (top row first,\n"
            "// '#' = ink), placement in design px (y0 = bottom edge, baseline 0)\n"
            "// and provenance. Rendered by glyph-proof.html.\n"
            "export interface BackfillGlyph {\n"
            "  face: string\n"
            "  char: string\n"
            "  name: string\n"
            "  codepoint: number\n"
            "  rows: string[]\n"
            "  x0: number\n"
            "  y0: number\n"
            "  advance: number\n"
            "  source: string\n"
            "}\n\n"
            f"export const BACKFILL_GLYPHS: BackfillGlyph[] = {body}\n"
        )
    print(f"manifest -> demo/glyph-proof-manifest.ts ({len(entries)} glyphs)")


if __name__ == "__main__":
    for family, cfg in FONTS.items():
        build(family, cfg)
    write_manifest()
    print("done — rebuild the library (npm run build) to bundle the updated fonts")
