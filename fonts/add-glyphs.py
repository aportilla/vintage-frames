#!/usr/bin/env python3
"""Build the two shipped bitmap faces: stamp the kit's family name, add glyphs.

Two things happen here, and the first applies to both faces. Every built face
is renamed to the name the kit registers it under — `VF Display`, `VF Body`,
matching the --vf-font-family-display / --vf-font-family tokens that select
them — because what ships is the kit's artifact and should not carry Apple's
face name in its binary or in a consumer's font-family stack. See FONTS.

The second is glyph backfill: both faces carry the kit's backfill of what
modern web copy reaches for that old MacRoman never held, each drawn in its
own strike's idiom (Geneva flush-left with the 1px gap in the advance;
Chicago with its 1px bearings and heavier stems). Chicago's build also
CORRECTS its source's pre-extension slot ink: the strike predates the
MacRoman extension, so the bytes later assigned to `⁄ € ‹` carry the ✓ ◆
drawings over again — those three glyphs get proper ink here, losing nothing,
because the real ✓ ◆  are independently mapped at U+2713 / U+25C6 / U+F8FF.
Every spec row states its source, best kind first:

    traced   — another glyph's ink, verbatim (the donor is named)
    composed — a strike capital under the strike's own accent, at the
               placement the native É / Ñ establish
    derived  — strike ink rearranged (the donors are named)
    drawn    — nothing to trace anywhere; an original 1-bit drawing, awaiting
               review on the proof page

Drawings shared by both faces (the modifier and keyboard keys, superscripts,
fractions, the saltire, the geometric symbol set) live in module constants so
the two can never drift apart.

Review the results on the proofing page: glyph-proof.html on the dev server
renders every backfilled glyph at 12x with a realistic native-size line in
its own face, the display face's additions before the body face's — it reads
demo/glyph-proof-manifest.ts, which this script regenerates on every run
(generated, like the charset manifest — never hand-edit).

Run it (needs fonttools + brotli — see fonts/README.md):

    python3 fonts/add-glyphs.py

Reads the pristine  fonts/<Family>.woff2,  writes  fonts/<Family>.ext.woff2,
and rewrites FONT_WOFF2_BASE64 in the matching TS module. Idempotent: it always
rebuilds from the untouched source, so re-running can never compound. To add a
glyph, add one row to a font's `specs` list and re-run.

--- The pixel grid -----------------------------------------------------------
Both faces are 1024 units/em and designed on a 64-unit pixel (so they land on
the CSS pixel grid at 16px: 1024 / 16 = 64). Everything below is expressed in
whole pixels and multiplied by PX. Reference metrics, measured from the
strikes:

  Geneva — 7px caps, 5px x-height, 1x1 period dot with a 1px bearing, quotes
  in the 5-8px band; ink flush left, the 1px gap carried in the advance (its
  '+' is 5x5 at y 1, 6px advance — the box its `×` reuses). Accents: rows
  y8-9 over a y7 gap (dieresis one row at y8), per its native É/Ñ/Å.

  Chicago — 9px caps, 7px x-height, 2px stems, 2x2 period dot; 1px bearing
  both sides of the ink (its '+' is 5x5 at y 2, 7px advance). Accents: rows
  y10-11 over a y9 gap (dieresis one row at y10), per its native É/Ñ/Ö.

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

# --- Drawings shared by both faces -------------------------------------------

# The multiplication sign, an X on the math axis (aligned with the strike's
# own '+'): a 5x5 saltire. Each face sets it in its own '+' box.
X_MULT = [
    "#...#",
    ".#.#.",
    "..#..",
    ".#.#.",
    "#...#",
]

# The command key, traced verbatim from the Chicago strike's own ⌘ — the one
# strike that ever drew it (fonts/README's trace-don't-invent rule). 9x9 on
# the baseline; in Geneva it rides above the 7px cap band, which is what
# tracing means — redrawing it smaller would be inventing.
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

# The shift key (Adam's ink, 2026-08-09): a 9x9 outline arrow — the same box
# as the traced ⌘, so shortcut strings read as a matched set in both faces.
SHIFT_KEY = [
    "....#....",
    "...#.#...",
    "..#...#..",
    ".#.....#.",
    "##.....##",
    "..#...#..",
    "..#...#..",
    "..#...#..",
    "..#####..",
]

# The option key switch and the control chevron — 1px strokes, matching the
# ⌘'s own ring weight in both faces.
OPTION_KEY = [
    "##..###",
    "..#....",
    "...#...",
    "....#..",
    ".....##",
]
CONTROL_KEY = [
    "..#..",
    ".#.#.",
    "#...#",
]

# The rest of the keyboard: esc, delete-back, return, both tabs and the hook
# arrow — the keys a modern shortcut string still fell back mid-string for.
# All 1px strokes at the ⌘'s ring weight, centered against its 9x9 box.
ESC_KEY = [  # Adam's ink, 2026-08-10: the arrow's shaft IS the ring's arc
    "###.....",
    "##..##..",
    "#.#...#.",
    "...#...#",
    ".#.....#",
    ".#.....#",
    "..#...#.",
    "...###..",
]
DELETE_KEY = [  # the left-pointing eraser pentagon around a 3x3 saltire
    "...########",
    "..#.......#",
    ".#...#.#..#",
    "#.....#...#",
    ".#...#.#..#",
    "..#.......#",
    "...########",
]
RETURN_KEY = [  # ⏎ — down the right side, left along the baseline row
    "........#",
    "........#",
    "..#.....#",
    ".#......#",
    "#########",
    ".#.......",
    "..#......",
]
TAB_RIGHT_KEY = [  # ⇥ — the arrows' chevron head, stopped by the bar
    "........#",
    "....#...#",
    ".....#..#",
    "#######.#",
    ".....#..#",
    "....#...#",
    "........#",
]
TAB_LEFT_KEY = [r[::-1] for r in TAB_RIGHT_KEY]  # ⇤ — its mirror
HOOK_ARROW = [  # ↩ — the ⏎ with its tail curled instead of squared
    ".....###.",
    "........#",
    "..#.....#",
    ".#......#",
    "#########",
    ".#.......",
    "..#......",
]

# The strike symbol cell. Chicago's own ◆ (classic slot 0x13 ink — do not
# edit: it must stay bit-identical to the strike) is a 7x7 diamond at y1 with
# a 9px advance, and that cell is the box every new geometric symbol draws
# in. The four small text triangles are the ◆ cut in half, so they can never
# drift from the strike's own wedge.
CHICAGO_DIAMOND = [
    "...#...",
    "..###..",
    ".#####.",
    "#######",
    ".#####.",
    "..###..",
    "...#...",
]
TRI_SMALL_RIGHT = [r[3:] for r in CHICAGO_DIAMOND]  # ▸ — the ◆'s right half
TRI_SMALL_LEFT = [r[:4] for r in CHICAGO_DIAMOND]   # ◂ — its left half
TRI_SMALL_UP = CHICAGO_DIAMOND[:4]                  # ▴ — its top half
TRI_SMALL_DOWN = CHICAGO_DIAMOND[3:]                # ▾ — its bottom half
TRIANGLE_RIGHT = [  # ▶ — the wedge grown to the 9px cap band
    "#....",
    "##...",
    "###..",
    "####.",
    "#####",
    "####.",
    "###..",
    "##...",
    "#....",
]
TRIANGLE_LEFT = [r[::-1] for r in TRIANGLE_RIGHT]  # ◀ — its mirror
BLACK_CIRCLE = [  # ● — the • disc grown to the ◆'s 7x7 cell
    "..###..",
    ".#####.",
    "#######",
    "#######",
    "#######",
    ".#####.",
    "..###..",
]
WHITE_CIRCLE = [  # ○ — the ● as a 1px ring
    "..###..",
    ".#...#.",
    "#.....#",
    "#.....#",
    "#.....#",
    ".#...#.",
    "..###..",
]
BLACK_SQUARE = ["#######"] * 7  # ■ — the cell filled solid
WHITE_SQUARE = (  # □ — the ■ as a 1px ring
    ["#######"] + ["#.....#"] * 5 + ["#######"]
)
# ◦ — both strikes draw the identical 5x5 • disc, so one ring serves both.
WHITE_BULLET = [
    ".###.",
    "#...#",
    "#...#",
    "#...#",
    ".###.",
]

# The full-size ballot X in each face — one drawing serves ✕ (U+2715) and
# ✗ (U+2717): at strike sizes the upright and the slanted X are the same ink.
GENEVA_BALLOT_X = [
    "#.....#",
    ".#...#.",
    "..#.#..",
    "...#...",
    "..#.#..",
    ".#...#.",
    "#.....#",
]
CHICAGO_BALLOT_X = [
    "##....##",
    ".##..##.",
    "..####..",
    "...##...",
    "..####..",
    ".##..##.",
    "##....##",
]

# Chicago's  menu apple (classic slot 0x14 ink — do not edit), the trace
# donor for the body face's , like its ⌘ and ✓ before it.
CHICAGO_APPLE = [
    ".....##..",
    "....##...",
    "....#....",
    ".###.###.",
    "#########",
    "#######..",
    "#######..",
    "#########",
    "#########",
    ".#######.",
    "..##.##..",
]

# Superscript digits, 5 rows with the top at each face's cap height. The 3
# articulates all three strokes (Adam's call on ¾, 2026-08-09).
SUP_1 = [".#", "##", ".#", ".#", ".#"]
SUP_2 = ["##.", "..#", ".#.", "#..", "###"]
SUP_3 = ["##.", "..#", ".#.", "..#", "##."]

# Fractions: mini numerator over a fraction slash over a mini denominator,
# spanning the full cap band. ¾'s numerator is the superscript-³ drawing.
ONE_HALF = [
    ".#.......",
    "##...#...",
    ".#...#...",
    ".#..#....",
    "....#.##.",
    "...#....#",
    "...#...#.",
    "......###",
]
ONE_QUARTER = [
    ".#.......",
    "##...#...",
    ".#...#...",
    ".#..#....",
    "....#.#.#",
    "...#..#.#",
    "...#..###",
    "........#",
]
THREE_QUARTERS = [
    "##.......",
    "..#..#...",
    ".#...#...",
    "..#.#....",
    "##..#.#.#",
    "...#..#.#",
    "...#..###",
    "........#",
]

# --- Geneva ------------------------------------------------------------------

# Geneva's capitals, dumped from the strike — the bases the composed accented
# caps sit on. Do not edit these: they must stay bit-identical to the strike's
# own A/E/O/U (the I is a bare 1px stem, inlined below).
GENEVA_A = ["..#..", "..#..", ".#.#.", ".#.#.", "#####", "#...#", "#...#"]
GENEVA_E = ["####", "#...", "#...", "###.", "#...", "#...", "####"]
GENEVA_O = [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."]
GENEVA_U = ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."]

# Chicago's capitals, likewise dumped from the strike (its I is a 2px stem).
CHICAGO_A = [".####.", "##..##", "##..##", "##..##", "######", "##..##", "##..##", "##..##", "##..##"]
CHICAGO_E = ["#####", "##...", "##...", "##...", "####.", "##...", "##...", "##...", "#####"]
CHICAGO_O = [".####.", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", ".####."]
CHICAGO_U = ["##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", ".####."]


def cap(accent, base):
    """Compose an accented capital: accent rows, one blank row, the base cap —
    the exact vertical grammar of each strike's own É/Ñ (ink tops out one gap
    row above the cap; a dieresis is a single accent row)."""
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
    ("onesuperior", 0x00B9, SUP_1, 0, 128, 192,
     "drawn — a 2x5 digit at superscript height (top at cap height)"),
    ("twosuperior", 0x00B2, SUP_2, 0, 128, 256,
     "drawn — a 3x5 digit at superscript height"),
    ("threesuperior", 0x00B3, SUP_3, 0, 128, 256,
     "drawn — a 3x5 digit at superscript height"),
    ("onehalf", 0x00BD, ONE_HALF, 0, 0, 640,
     "drawn — mini 1 over mini 2 across a fraction slash, full cap band"),
    ("onequarter", 0x00BC, ONE_QUARTER, 0, 0, 640,
     "drawn — mini 1 over mini 4 across a fraction slash"),
    ("threequarters", 0x00BE, THREE_QUARTERS, 0, 0, 640,
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
    ("multiplicationx", 0x2715, GENEVA_BALLOT_X, 0, 0, 512,
     "drawn — the ballot X: the × saltire at full cap size"),
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
    ("shift", 0x21E7, SHIFT_KEY, 0, 0, 640,
     "drawn — the shift key outline (Adam's ink, 2026-08-09)"),
    ("option", 0x2325, OPTION_KEY, 0, 64, 512, "drawn — the option key switch"),
    ("control", 0x2303, CONTROL_KEY, 0, 192, 384,
     "drawn — the control chevron, in the cap's upper band"),
    ("escape", 0x238B, ESC_KEY, 0, 0, 576,
     "drawn — the escape key: the arrow's shaft doubling as the ring's top-left arc (Adam's ink, 2026-08-10)"),
    ("deleteleft", 0x232B, DELETE_KEY, 0, 64, 768,
     "drawn — the delete-back eraser pentagon around a 3x3 saltire"),
    ("returnsymbol", 0x23CE, RETURN_KEY, 0, 64, 640,
     "drawn — the return symbol, its head the text arrows' own chevron"),
    ("tabright", 0x21E5, TAB_RIGHT_KEY, 0, 64, 640,
     "drawn — tab: the text arrow stopped by a bar"),
    ("tableft", 0x21E4, TAB_LEFT_KEY, 0, 64, 640,
     "drawn — back-tab, the ⇥'s mirror"),
    ("hookarrowleft", 0x21A9, HOOK_ARROW, 0, 64, 640,
     "drawn — the ⏎ with its tail curled instead of squared"),

    # -- geometric symbols ----------------------------------------------------
    # The classic symbol slots Geneva's strike never inked, traced from
    # Chicago like the ⌘ and ✓ before them, then the modern set drawn on the
    # face's own 7px cell (the ★'s box).
    ("diamond", 0x25C6, CHICAGO_DIAMOND, 0, 64, 512,
     "traced — Chicago's ◆ (the classic symbol slot's ink), on Geneva's flush-left spacing"),
    ("apple", 0xF8FF, CHICAGO_APPLE, 0, 0, 640,
     "traced — Chicago's  menu apple, verbatim, like the ⌘ and ✓ before it"),
    ("blackcircle", 0x25CF, BLACK_CIRCLE, 0, 0, 512,
     "drawn — the strike's • disc grown to the 7px symbol cell"),
    ("whitecircle", 0x25CB, WHITE_CIRCLE, 0, 0, 512,
     "drawn — the ● as a 1px ring, the face's stroke"),
    ("blacksquare", 0x25A0, BLACK_SQUARE, 0, 0, 512,
     "drawn — the 7px symbol cell filled solid"),
    ("whitesquare", 0x25A1, WHITE_SQUARE, 0, 0, 512,
     "drawn — the ■ as a 1px ring"),
    ("whitebullet", 0x25E6, WHITE_BULLET, 0, 64, 384,
     "derived — the strike's own • hollowed to a ring, in its exact box and advance"),
    ("ballotx", 0x2717, GENEVA_BALLOT_X, 0, 0, 512,
     "traced — the face's own ✕ (at strike sizes one X serves both codepoints)"),
    ("smalltriangleright", 0x25B8, TRI_SMALL_RIGHT, 0, 64, 320,
     "derived — the right half of the traced ◆ (the submenu wedge)"),
    ("smalltriangleleft", 0x25C2, TRI_SMALL_LEFT, 0, 64, 320,
     "derived — the left half of the traced ◆"),
    ("smalltriangleup", 0x25B4, TRI_SMALL_UP, 0, 64, 512,
     "derived — the top half of the traced ◆"),
    ("smalltriangledown", 0x25BE, TRI_SMALL_DOWN, 0, 64, 512,
     "derived — the bottom half of the traced ◆"),
    ("triangleright", 0x25B6, TRIANGLE_RIGHT, 0, 0, 384,
     "drawn — the ▸ wedge grown to the ⌘'s 9px band"),
    ("triangleleft", 0x25C0, TRIANGLE_LEFT, 0, 0, 384,
     "drawn — the ▶'s mirror"),
    ("whitestar", 0x2606, [
        "...#...",
        "..#.#..",
        "##...##",
        ".#...#.",
        "..#.#..",
        ".##.##.",
        ".#...#.",
    ], 0, 0, 512,
     "drawn — the ★'s outline by the display ☆'s construction — PROPOSAL: this is the 7x7 that awaited a sketch; veto freely"),

    # -- invisibles & word-joiners --------------------------------------------
    # No ink is still a glyph: without these a careful writer's non-breaking
    # hyphen or thin space falls back per glyph and takes the neighbor font's
    # metrics with it.
    ("nonbreakinghyphen", 0x2011, ["####"], 0, 192, 320,
     "traced — the strike's hyphen, verbatim (the hyphen that refuses the break)"),
    ("softhyphen", 0x00AD, ["####"], 0, 192, 320,
     "traced — the strike's hyphen, verbatim (visible only where a line breaks)"),
    ("figurespace", 0x2007, ["......"], 0, 0, 384,
     "derived — no ink: the strike's own 6px digit advance, so numerals stay columnar"),
    ("thinspace", 0x2009, [".."], 0, 0, 128,
     "derived — no ink: 2px, one step under the strike's 3px word space"),
    ("hairspace", 0x200A, ["."], 0, 0, 64,
     "derived — no ink: the 1px minimum the pixel grid can state"),
]

# Chicago spacing convention throughout: 1px bearing each side of the ink
# (x0 64, advance = ink + 2), matching the strike's own letters; the I family
# keeps the strike's deeper 2px bearings.
#
# The first three rows REPLACE wrong ink, not add: the source strike predates
# the MacRoman extension, so its 0xDA-0xDC slots carry the ✓ ◆  drawings
# again under the names `fraction`, `currency` and `guilsinglleft`. Reinking
# those glyphs corrects U+2044 / U+20AC / U+2039 while the real ✓ ◆  stay
# reachable at U+2713 / U+25C6 / U+F8FF — nothing is lost.
CHICAGO_SPECS = [
    ("multiply", 0x00D7, X_MULT, 64, 128, 448,
     "drawn — the saltire in the strike's own + box, on the math axis"),

    # -- corrections: the pre-extension slot ink ------------------------------
    ("fraction", 0x2044, [
        "....#",
        "....#",
        "...#.",
        "...#.",
        "..#..",
        "..#..",
        ".#...",
        ".#...",
        "#....",
        "#....",
    ], 64, 0, 448,
     "traced — the strike's /, verbatim (replaces the slot's ✓ ink; ✓ stays at U+2713)"),
    ("currency", 0x20AC, [
        ".####.",
        "##....",
        "##....",
        "######",
        "##....",
        "######",
        "##....",
        "##....",
        ".####.",
    ], 64, 0, 512,
     "drawn — the strike's own C, curve left open, crossed by two full-width bars (replaces the slot's ◆ ink; ◆ stays at U+25C6)"),
    ("guilsinglleft", 0x2039, ["...#", "..#.", ".#..", "#...", ".#..", "..#.", "...#"], 64, 0, 384,
     "derived — one chevron of the strike's « (replaces the slot's  ink;  stays at U+F8FF)"),
    ("guilsinglright", 0x203A, ["#...", ".#..", "..#.", "...#", "..#.", ".#..", "#..."], 64, 0, 384,
     "derived — one chevron of the strike's » (the slot was empty)"),

    # -- currency & math ------------------------------------------------------
    ("minus", 0x2212, ["#####"], 64, 256, 448,
     "traced — the strike's hyphen, verbatim (already the width of its + crossbar)"),
    ("periodcentered", 0x00B7, ["##", "##"], 64, 256, 256,
     "derived — the strike's 2x2 period dot raised to the math axis"),
    ("onesuperior", 0x00B9, SUP_1, 64, 256, 256,
     "drawn — a 2x5 digit at superscript height (top at cap height)"),
    ("twosuperior", 0x00B2, SUP_2, 64, 256, 320,
     "drawn — a 3x5 digit at superscript height"),
    ("threesuperior", 0x00B3, SUP_3, 64, 256, 320,
     "drawn — a 3x5 digit at superscript height"),
    ("onehalf", 0x00BD, ONE_HALF, 64, 0, 704,
     "drawn — the body face's ½, on Chicago's bearings (1px minis match its 1px /)"),
    ("onequarter", 0x00BC, ONE_QUARTER, 64, 0, 704,
     "drawn — the body face's ¼, on Chicago's bearings"),
    ("threequarters", 0x00BE, THREE_QUARTERS, 64, 0, 704,
     "drawn — the body face's ¾, on Chicago's bearings"),

    # -- typographic ----------------------------------------------------------
    ("prime", 0x2032, ["##", "##", ".#", "#."], 64, 256, 256,
     "derived — the strike's ’ ink, dropped to sit on the x-height band"),
    ("doubleprime", 0x2033, ["##.##", "##.##", ".#..#", "#..#."], 64, 256, 448,
     "derived — two of the strike's ’ ink, one gap apart"),
    ("quotesinglbase", 0x201A, ["##", "##", ".#", "#."], 64, -128, 256,
     "traced — the strike's comma, verbatim (a low-9 quote is a comma)"),
    ("quotedblbase", 0x201E, ["##.##", "##.##", ".#..#", "#..#."], 64, -128, 448,
     "derived — the strike's comma, doubled one gap apart"),
    ("daggerdbl", 0x2021, [".#.", "###", ".#.", ".#.", "###", ".#."], 64, 192, 320,
     "derived — the strike's † with its own crossbar repeated below"),
    ("perthousand", 0x2030, [
        ".##.###.....",
        "#..#..#.....",
        "#..#.#......",
        ".##..#......",
        "....#.......",
        "....#.......",
        "...#..##.##.",
        "...#.#..#..#",
        "..#..#..#..#",
        "..#...##.##.",
    ], 64, 0, 896,
     "derived — the strike's % with its lower loop doubled into a shared-wall 00 (Adam's motif)"),
    ("fi", 0xFB01, [
        "..###.##",
        ".##.....",
        "####..##",
        ".##...##",
        ".##...##",
        ".##...##",
        ".##...##",
        ".##...##",
        ".##...##",
    ], 64, 0, 640,
     "derived — the strike's f and i, joined at f's own advance"),
    ("fl", 0xFB02, [
        "..###.##",
        ".##...##",
        "####..##",
        ".##...##",
        ".##...##",
        ".##...##",
        ".##...##",
        ".##...##",
        ".##...##",
    ], 64, 0, 640,
     "derived — the strike's f and l, joined at f's own advance"),

    # -- accented capitals ----------------------------------------------------
    # The strike's own caps under the strike's own accents (shapes from its
    # lowercase à á â ä; placement from its native É/Ñ/Ö: accent rows y10-11
    # over a y9 gap). Ã Õ Ñ Ö Ü É are native — the same fifteen were missing.
    ("Aacute", 0x00C1, cap(["...#..", "..#..."], CHICAGO_A), 64, 0, 512,
     "composed — the strike's A under its own acute"),
    ("Acircumflex", 0x00C2, cap(["..##..", ".#..#."], CHICAGO_A), 64, 0, 512,
     "composed — the strike's A under its own circumflex"),
    ("Egrave", 0x00C8, cap([".#...", "..#.."], CHICAGO_E), 64, 0, 448,
     "composed — the strike's E under its own grave (its É, mirrored)"),
    ("Ecircumflex", 0x00CA, cap([".##..", "#..#."], CHICAGO_E), 64, 0, 448,
     "composed — the strike's E under its own circumflex"),
    ("Edieresis", 0x00CB, cap([".#..#"], CHICAGO_E), 64, 0, 448,
     "composed — the strike's E under its own dieresis"),
    ("Igrave", 0x00CC, cap(["#.", ".#"], ["##"] * 9), 128, 0, 384,
     "composed — the strike's I under its own grave (as its ì)"),
    ("Iacute", 0x00CD, cap([".#", "#."], ["##"] * 9), 128, 0, 384,
     "composed — the strike's I under its own acute (as its í)"),
    ("Icircumflex", 0x00CE, cap([".##.", "#..#"], [".##."] * 9), 64, 0, 384,
     "composed — the strike's I under its own circumflex (as its î)"),
    ("Idieresis", 0x00CF, cap(["#..#"], [".##."] * 9), 64, 0, 384,
     "composed — the strike's I under its own dieresis (as its ï)"),
    ("Ograve", 0x00D2, cap(["..#...", "...#.."], CHICAGO_O), 64, 0, 512,
     "composed — the strike's O under its own grave"),
    ("Oacute", 0x00D3, cap(["...#..", "..#..."], CHICAGO_O), 64, 0, 512,
     "composed — the strike's O under its own acute"),
    ("Ocircumflex", 0x00D4, cap(["..##..", ".#..#."], CHICAGO_O), 64, 0, 512,
     "composed — the strike's O under its own circumflex"),
    ("Ugrave", 0x00D9, cap(["..#...", "...#.."], CHICAGO_U), 64, 0, 512,
     "composed — the strike's U under its own grave"),
    ("Uacute", 0x00DA, cap(["...#..", "..#..."], CHICAGO_U), 64, 0, 512,
     "composed — the strike's U under its own acute"),
    ("Ucircumflex", 0x00DB, cap(["..##..", ".#..#."], CHICAGO_U), 64, 0, 512,
     "composed — the strike's U under its own circumflex"),

    # -- arrows & marks -------------------------------------------------------
    # Drawn at Chicago's weight: 2px shafts and stems (its letter stems are
    # 2px), solid 2px-tipped heads.
    ("arrowleft", 0x2190, [
        "..#......",
        ".##......",
        "#########",
        "#########",
        ".##......",
        "..#......",
    ], 64, 128, 704, "drawn — 2px-shaft arrow on the math axis"),
    ("arrowright", 0x2192, [
        "......#..",
        "......##.",
        "#########",
        "#########",
        "......##.",
        "......#..",
    ], 64, 128, 704, "drawn — 2px-shaft arrow on the math axis"),
    ("arrowup", 0x2191, [
        "...##...",
        "..####..",
        ".######.",
        "...##...",
        "...##...",
        "...##...",
        "...##...",
        "...##...",
        "...##...",
    ], 64, 0, 640, "drawn — 2px-stem arrow, cap height"),
    ("arrowdown", 0x2193, [
        "...##...",
        "...##...",
        "...##...",
        "...##...",
        "...##...",
        "...##...",
        ".######.",
        "..####..",
        "...##...",
    ], 64, 0, 640, "drawn — 2px-stem arrow, cap height"),
    ("multiplicationx", 0x2715, CHICAGO_BALLOT_X, 64, 64, 640,
     "drawn — the ballot X at the strike's 2px stroke"),
    ("blackstar", 0x2605, [
        "....#....",
        "...###...",
        "...###...",
        "#########",
        ".#######.",
        "..#####..",
        "..#####..",
        ".###.###.",
        ".#.....#.",
    ], 64, 0, 704, "drawn — the five-point star at the 9px cap band (Adam's ink, 2026-08-09)"),
    ("whitestar", 0x2606, [
        "....#....",
        "...#.#...",
        "...#.#...",
        "###...###",
        ".#.....#.",
        "..#...#..",
        "..#.#.#..",
        ".###.###.",
        ".#.....#.",
    ], 64, 0, 704,
     "drawn — the same star as an outline ring, hollow interior (Adam's ink, 2026-08-09)"),

    # -- Mac modifier keys ----------------------------------------------------
    # The load-bearing group: vf-menu-item shortcut strings render in this
    # face, and until now ⇧ ⌥ ⌃ fell back to the system font beside the ⌘.
    # All three are 1px strokes — the weight of the strike's own ⌘ rings.
    ("shift", 0x21E7, SHIFT_KEY, 64, 0, 704,
     "drawn — the shift key outline (Adam's ink), the same 9x9 box as the strike's ⌘"),
    ("option", 0x2325, OPTION_KEY, 64, 128, 576, "drawn — the option key switch"),
    ("control", 0x2303, CONTROL_KEY, 64, 320, 448,
     "drawn — the control chevron, in the cap's upper band"),
    ("escape", 0x238B, ESC_KEY, 64, 0, 640,
     "drawn — the escape key: the arrow's shaft doubling as the ring's top-left arc (Adam's ink, 2026-08-10)"),
    ("deleteleft", 0x232B, DELETE_KEY, 64, 64, 832,
     "drawn — the delete-back eraser pentagon around a 3x3 saltire"),
    ("returnsymbol", 0x23CE, RETURN_KEY, 64, 64, 704,
     "drawn — the return symbol, its head the text arrows' own chevron"),
    ("tabright", 0x21E5, TAB_RIGHT_KEY, 64, 64, 704,
     "drawn — tab: the text arrow stopped by a bar"),
    ("tableft", 0x21E4, TAB_LEFT_KEY, 64, 64, 704,
     "drawn — back-tab, the ⇥'s mirror"),
    ("hookarrowleft", 0x21A9, HOOK_ARROW, 64, 64, 704,
     "drawn — the ⏎ with its tail curled instead of squared"),

    # -- geometric symbols ----------------------------------------------------
    # All on the strike ◆'s own cell: 7x7 at y1, 9px advance — the one symbol
    # the strike drew is the box the rest of the set draws in.
    ("blackcircle", 0x25CF, BLACK_CIRCLE, 64, 64, 576,
     "drawn — the strike's • disc grown to its ◆'s 7x7 cell and advance"),
    ("whitecircle", 0x25CB, WHITE_CIRCLE, 64, 64, 576,
     "drawn — the ● as a 1px ring, the ⌘'s stroke"),
    ("blacksquare", 0x25A0, BLACK_SQUARE, 64, 64, 576,
     "drawn — the ◆'s 7x7 cell filled solid"),
    ("whitesquare", 0x25A1, WHITE_SQUARE, 64, 64, 576,
     "drawn — the ■ as a 1px ring"),
    ("whitebullet", 0x25E6, WHITE_BULLET, 64, 128, 448,
     "derived — the strike's own • hollowed to a ring, in its exact box and advance"),
    ("ballotx", 0x2717, CHICAGO_BALLOT_X, 64, 64, 640,
     "traced — the face's own ✕ (at strike sizes one X serves both codepoints)"),
    ("smalltriangleright", 0x25B8, TRI_SMALL_RIGHT, 64, 64, 384,
     "derived — the right half of the strike's own ◆ (the submenu wedge)"),
    ("smalltriangleleft", 0x25C2, TRI_SMALL_LEFT, 64, 64, 384,
     "derived — the left half of the strike's own ◆"),
    ("smalltriangleup", 0x25B4, TRI_SMALL_UP, 64, 128, 576,
     "derived — the top half of the strike's own ◆"),
    ("smalltriangledown", 0x25BE, TRI_SMALL_DOWN, 64, 128, 576,
     "derived — the bottom half of the strike's own ◆"),
    ("triangleright", 0x25B6, TRIANGLE_RIGHT, 64, 0, 448,
     "drawn — the ▸ wedge grown to the 9px cap band"),
    ("triangleleft", 0x25C0, TRIANGLE_LEFT, 64, 0, 448,
     "drawn — the ▶'s mirror"),

    # -- invisibles & word-joiners --------------------------------------------
    ("nonbreakinghyphen", 0x2011, ["#####"], 64, 256, 448,
     "traced — the strike's hyphen, verbatim (the hyphen that refuses the break)"),
    ("softhyphen", 0x00AD, ["#####"], 64, 256, 448,
     "traced — the strike's hyphen, verbatim (visible only where a line breaks)"),
    ("figurespace", 0x2007, ["........"], 0, 0, 512,
     "derived — no ink: the strike's own 8px digit advance, so numerals stay columnar"),
    ("thinspace", 0x2009, [".."], 0, 0, 128,
     "derived — no ink: 2px, two under the strike's 4px word space"),
    ("hairspace", 0x200A, ["."], 0, 0, 64,
     "derived — no ink: the 1px minimum the pixel grid can state"),
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
    "Chicago": {  # chrome backfill + the pre-extension slot corrections
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
        if glyph.numberOfContours:
            glyph.recalcBounds(glyf)
            lsb = glyph.xMin
        else:
            lsb = 0  # the spaces: an advance with no ink
        hmtx[name] = (advance, lsb)
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
    # The corrected slots must not have cost the classic symbols their homes:
    # the ✓ ◆  drawings stay reachable at their true codepoints.
    if family == "Chicago":
        for keep in (0x2713, 0x25C6, 0xF8FF, 0x2318):
            assert keep in check, f"Chicago: U+{keep:04X} lost its mapping"
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
