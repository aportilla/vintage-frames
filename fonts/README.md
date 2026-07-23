# Fonts — bitmap faces & how to modify them

Vintage Frames ships two System 7 bitmap webfonts, embedded as base64 and
registered on `document.fonts` at runtime (see
[`../src/styles/register-embedded-font.ts`](../src/styles/register-embedded-font.ts)
for *why* it's JS and not `@font-face` — font faces can't cross a shadow-root
boundary).

| Face | Role | Used by |
| --- | --- | --- |
| **ChiKareGo** | Chicago-style *chrome* | menus, titles, buttons, controls (`vfDisplay`) |
| **FindersKeepers** | *body* copy | fields, list rows, prose (`vfBase` default) |

```
ChiKareGo.woff2          FindersKeepers.woff2      ← pristine upstream sources
ChiKareGo.ext.woff2      FindersKeepers.ext.woff2  ← generated: sources + our glyphs
add-glyphs.py            ← rebuilds the .ext fonts and re-embeds them into TS
```

The **`.ext.woff2`** files (and the base64 in `src/styles/*-font.ts`) are
generated — never hand-edit them. Edit `add-glyphs.py` and re-run.

## Why we modify the fonts

Both upstream faces cover Basic Latin (FindersKeepers also ships much of
Latin-1), but the UI and body copy use punctuation they lack — `⌘` (U+2318) in
menu shortcuts, `…` (U+2026) in "Open…", curly quotes `‘ ’ “ ”`, the em/en
dashes `— –` (U+2014/U+2013), the bullet `•` (U+2022) and `×` (U+00D7). Without
them the browser silently falls back *per glyph* to the system font, so a smooth
glyph renders beside the pixel label — the em dash in "US$25 — see the Read Me"
was the giveaway. `add-glyphs.py` draws those glyphs as pixels and injects them
into each face so everything renders in one consistent bitmap style. (The `✓`, `▼` and scroll arrows are handled differently — as inline SVG
sprites in [`../src/glyphs.ts`](../src/glyphs.ts) and `base.ts`. Prefer a font
glyph when the character appears in freeform/slotted text like a shortcut
string; prefer a sprite when the component controls the exact markup.)

## Toolchain

Pure Python via [fontTools](https://github.com/fonttools/fonttools). WOFF2
needs Brotli. One-time throwaway venv:

```sh
python3 -m venv /tmp/fontenv
/tmp/fontenv/bin/pip install fonttools brotli
```

## The pixel grid (the one thing to internalize)

Both faces are **1024 units/em, designed on a 64-unit pixel** — so a design
pixel maps to one CSS pixel at `font-size: 16px` (1024 ÷ 16 = 64). That's why
the components render chrome/body at 16px with `-webkit-font-smoothing: none`:
on-grid and crisp. Everything in the script is written in whole pixels × `PX`
(=64). Reference metrics, decoded from the sources:

| | cap height | x-height | period dot | quotes sit at |
| --- | --- | --- | --- | --- |
| ChiKareGo | 9px | 7px | 2×2 px | 6–9px band |
| FindersKeepers | 7px | 5px | 1×1 px | 5–7px band |

Baseline is `y = 0`; `y` grows upward. To match the existing face, keep new
glyphs on whole-pixel (64-unit) boundaries and within these bands.

## How a glyph is drawn

Glyphs are **bitmaps** — a list of row strings, top row first, `#` = ink:

```python
CMD_CHROME = [     # ⌘: four ROUNDED corner loops (notched outer corners,
    ".##.....##.",  #    so each reads as a petal) joined by a central
    "#..#...#..#",  #    square, edges between loops left open (concave).
    "#..#...#..#",  #    Empty cells are simply not drawn, so a loop is ink
    ".#########.",  #    around an unfilled centre — no reverse-winding
    "...#...#...",  #    contour needed. The rounded corners are the detail
    "...#...#...",  #    that distinguishes the real Mac glyph from a grid;
    "...#...#...",  #    a plain 3×3 square ring reads wrong.
    ".#########.",
    "#..#...#..#",
    "#..#...#..#",
    ".##.....##.",
]
```

`bmp(bitmap, x0, y0, advance)` rasterises it to TrueType contours — one
clockwise rectangle per maximal horizontal run of ink. `x0`/`y0` are the
font-unit coordinates of the bitmap's **left / bottom** edge; `advance` is the
glyph's advance width. Quotes derive their `y0` from the bands above; the
ellipsis is just the period repeated three times.

## Add or change a glyph

1. Add one row to the relevant font's `specs` in `add-glyphs.py`:
   `(glyphName, codepoint, bitmap, x0, y0, advance)`. Do it for **both** faces
   so chrome and body stay consistent.
2. Rebuild + re-embed:
   ```sh
   /tmp/fontenv/bin/python3 fonts/add-glyphs.py
   ```
   It rebuilds each `.ext.woff2` from the pristine source (idempotent — always
   from scratch, so re-running never compounds) and rewrites `FONT_WOFF2_BASE64`
   + the byte-count comment in `src/styles/*-font.ts`.
3. `npm run build` to bundle the updated base64.

## Verify

The script asserts every new codepoint is in the `cmap` after saving. For the
*shapes*, render them large against the embedded font and eyeball
(`-webkit-font-smoothing: none` to see true pixels):

```html
<style>
  @font-face { font-family: CK; src: url(ChiKareGo.ext.woff2) format('woff2'); }
  .t { font-family: CK; font-size: 160px; -webkit-font-smoothing: none; }
</style>
<div class="t">&#x2318; Open&#x2026; Don&#x2019;t &#x201C;ok&#x201D;</div>
```

A quick screenshot loop (headless Chrome) is the fastest way to iterate on a new
glyph's pixels — build, render at ~64–160px, adjust the bitmap, repeat.
