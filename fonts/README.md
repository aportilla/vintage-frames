# Fonts — bitmap faces & how to modify them

Vintage Frames ships two System 7 bitmap webfonts, embedded as base64 and
registered on `document.fonts` at runtime (see
[`../src/styles/register-embedded-font.ts`](../src/styles/register-embedded-font.ts)
for *why* it's JS and not `@font-face` — font faces can't cross a shadow-root
boundary).

| Face | What it is | Role | Used by |
| --- | --- | --- | --- |
| **Chicago** | the genuine Chicago 12pt strike | *chrome* | menus, titles, buttons, controls (`vfDisplay`) |
| **FindersKeepers** | a Geneva-style lookalike | *body* copy | fields, list rows, prose (`vfBase` default) |

```
Chicago.woff2            FindersKeepers.woff2      ← pristine sources (see provenance)
Chicago.ext.woff2        FindersKeepers.ext.woff2  ← generated: sources + our glyphs
add-glyphs.py            ← rebuilds the .ext fonts and re-embeds them into TS
import-bdf.py            ← converts a classic Mac BDF strike to a pixel-grid woff2
imported/                ← import-bdf.py's output, one woff2 per strike (untracked)
```

The **`.ext.woff2`** files (and the base64 in `src/styles/*-font.ts`) are
generated — never hand-edit them. Edit `add-glyphs.py` and re-run.

## Provenance

**Chicago.woff2** is the original Apple bitmap, not a redrawing: it is
produced by `import-bdf.py --em 16` from a FontForge BDF export of the real
NFNT strike (Chicago 12pt: ascent 12, descent 3, 15px line), re-emmed onto
the kit's 16px box by padding the descent to 4 — the baseline stays at
ascent 12, exactly the 12/4 box the registration overrides describe. Every
glyph's ink and advance is bit-verified against the BDF at build time, so
text set in it occupies the same pixels a real Mac would set. It replaced
**ChiKareGo**, a Chicago lookalike with tighter advances and ~48 redrawn
glyphs, on 2026-08-04; the retired face survives in git history. Being
Apple's artwork, its distribution posture is a deliberate decision — see
PUBLISHING.md.

**FindersKeepers** remains a lookalike: the genuine Geneva 9pt strike draws
one pixel taller (8px caps to FindersKeepers' 7), so swapping it would change
letterforms, not just spacing — a separate decision from Chicago's.

## Why we modify the fonts

The UI types punctuation the sources lack, and a missing glyph falls back
*per glyph* to the system font — a smooth glyph beside the pixel labels (the
em dash in "US$25 — see the Read Me" was the giveaway).

- **Chicago** carries full MacRoman natively — `⌘`, `…`, curly quotes, the
  dashes, `•`, the accented Latin — so it needs only **`×`** (U+00D7), which
  MacRoman never included.
- **FindersKeepers** needs the classic ten: `⌘ … ‘ ’ “ ” — – • ×`.

(The `✓`, `▼` and scroll arrows are handled differently — as inline SVG
sprites in [`../src/glyphs.ts`](../src/glyphs.ts) and `base.ts`. Prefer a font
glyph when the character appears in freeform/slotted text like a shortcut
string; prefer a sprite when the component controls the exact markup.)

## import-bdf.py — BDF strike → webfont

```sh
/tmp/fontenv/bin/python3 fonts/import-bdf.py [--em N] <strike.bdf> ...
```

Writes `fonts/imported/<Family>-<size>.woff2` per input. The conventions:
**64 font units per design pixel** (upm = 64 × the strike's line height), so
the face renders 1 design px = 1 CSS px at `font-size: <lineheight>px`;
hhea/OS/2 metrics written as `ascent / descent / 0` on that grid — correct in
the tables, no registration overrides required; MacRoman `ENCODING`s mapped
through Unicode (inked classic symbol slots 0x11–0x14 → `⌘ ✓ ◆ `); each
strike its own family (`"Geneva 12"`), since CSS can't pick a bitmap strike
by size. `--em N` re-ems a strike onto a larger line box by padding the
descent (how Chicago.woff2 is made). The script self-verifies: it decompiles
every compiled glyph back to pixel cells and bit-compares against the BDF —
a font that saves is pixel-identical to its source.

## Toolchain

Pure Python via [fontTools](https://github.com/fonttools/fonttools). WOFF2
needs Brotli. One-time throwaway venv:

```sh
python3 -m venv /tmp/fontenv
/tmp/fontenv/bin/pip install fonttools brotli
```

## The pixel grid (the one thing to internalize)

Both shipped faces are **1024 units/em, designed on a 64-unit pixel** — so a
design pixel maps to one CSS pixel at `font-size: 16px` (1024 ÷ 16 = 64).
That's why the components render chrome/body at 16px with
`-webkit-font-smoothing: none`: on-grid and crisp. Everything in
`add-glyphs.py` is written in whole pixels × `PX` (=64). Reference metrics
for drawing into FindersKeepers, decoded from the source:

| | cap height | x-height | period dot | quotes sit at |
| --- | --- | --- | --- | --- |
| FindersKeepers | 7px | 5px | 1×1 px | 5–7px band |

Chicago's one spec (`×`) borrows its whole geometry from the strike's own
`+`: 5×5 ink, 1px bearing each side, 7px advance. Chicago glyphs generally
carry a 1px bearing on both sides of their ink — the spacing the menu bar
and shortcut-column constants are traced against.

Baseline is `y = 0`; `y` grows upward. To match an existing face, keep new
glyphs on whole-pixel (64-unit) boundaries and within its bands.

## How a glyph is drawn

Glyphs are **bitmaps** — a list of row strings, top row first, `#` = ink:

```python
CMD_BODY = [      # ⌘ for the body face: four corner loops joined by a
    ".#.....#.",  #    central square, edges between loops left open
    "#.#...#.#",  #    (concave). Empty cells are simply not drawn, so a
    ".#######.",  #    loop is ink around an unfilled centre — no
    "..#...#..",  #    reverse-winding contour needed.
    "..#...#..",
    "..#...#..",
    ".#######.",
    "#.#...#.#",
    ".#.....#.",
]
```

`bmp(bitmap, x0, y0, advance)` rasterises it to TrueType contours — one
clockwise rectangle per maximal horizontal run of ink. `x0`/`y0` are the
font-unit coordinates of the bitmap's **left / bottom** edge; `advance` is the
glyph's advance width. Quotes derive their `y0` from the bands above; the
ellipsis is just the period repeated three times.

## Add or change a glyph

1. Add one row to the relevant font's `specs` in `add-glyphs.py`:
   `(glyphName, codepoint, bitmap, x0, y0, advance)`. If the character exists
   in a real strike under `import-bdf.py`'s sources, trace that shape rather
   than inventing one.
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
  @font-face { font-family: CH; src: url(Chicago.ext.woff2) format('woff2'); }
  .t { font-family: CH; font-size: 160px; -webkit-font-smoothing: none; }
</style>
<div class="t">&#x2318; Open&#x2026; Don&#x2019;t &#x201C;ok&#x201D; 3&#xD7;5</div>
```

A quick screenshot loop (headless Chrome) is the fastest way to iterate on a new
glyph's pixels — build, render at ~64–160px, adjust the bitmap, repeat.
