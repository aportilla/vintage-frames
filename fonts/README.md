# Fonts — bitmap faces & how to modify them

Vintage Frames ships two System 7 bitmap webfonts, embedded as base64 and
registered on `document.fonts` at runtime (see
[`../src/styles/register-embedded-font.ts`](../src/styles/register-embedded-font.ts)
for *why* it's JS and not `@font-face` — font faces can't cross a shadow-root
boundary).

| Face | Ships as | Artwork | Role | Used by |
| --- | --- | --- | --- | --- |
| **Chicago** | `VF Display` | re-drawn strike in Chicago 12pt's style | *chrome* | menus, titles, buttons, controls (`vfDisplay`) |
| **Geneva** | `VF Body` | re-drawn strike in Geneva 9pt's style | *body* copy | fields, list rows, prose (`vfBase` default) |

Both faces are the kit's own artwork, authored glyph by glyph in the
plaintext manifests below. They reproduce the *appearance* of the classic
faces — designs created by Susan Kare for Apple's original Macintosh, and
credited as such — but they are not Apple's font files, and no Apple binary
goes into the build. **The shipped faces carry the kit's name, not the
classic face's** — see [Naming](#naming--what-ships-vs-what-it-came-from)
below. This file's left-hand column names the classic design each face
re-draws; `VF Display` / `VF Body` is what the binary, the CSS stack and
`--vf-font-family*` all say.

```
VF-Display.glyphs.txt    VF-Body.glyphs.txt  ← THE SOURCE OF TRUTH: every glyph
                            as a plaintext pixel field + metrics, plus the
                            font-wide metadata table
manifest-to-font.py      ← builds each face from its manifest, from scratch,
                            and re-embeds the TS base64
glyph-manifest.py        ← the reverse direction (woff2 → manifest), for
                            bootstrap/resync only — it overwrites hand edits
VF-Display.woff2         VF-Body.woff2  ← generated: the built faces the kit
                            embeds, named for what they register — the
                            classic faces' names appear nowhere in them
```

That is the whole of it. **No Apple artwork lives in this directory** — every
byte here is either the kit's own authored manifests or something built from
them.

It was not always so. Until 2026-08-11 `fonts/` also held `imported/`, a
collection of ~80 genuine Apple strikes converted from suitcases, plus the two
converters that produced them (`dfont-to-bdf.py`, `import-bdf.py`) and the
generator for the Character Set window that browsed them
(`charset-manifest.py`). All of it moved to the
[system7web](https://github.com/aportilla/system7web) repo along with the faux
desktop, where that window lives now; see its `docs/FONTS.md`. What is left
behind is the kit's own work end to end, which is what makes the artwork
question in [docs/PUBLISHING.md](../docs/PUBLISHING.md) answerable in one
sentence.

The built **`VF-Display.woff2`** / **`VF-Body.woff2`** (and the base64 in
`src/styles/*-font.ts`) are generated — never hand-edit them. Edit the glyph
manifests (`VF-Display.glyphs.txt` / `VF-Body.glyphs.txt`) and run
`manifest-to-font.py`, then `npm run build`.

## Naming — what ships vs. what it came from

The two embedded faces register as **`VF Display`** and **`VF Body`**, matching
the `--vf-font-family-display` / `--vf-font-family` tokens that select them.
Neither ships under the name of the classic face it re-draws.

The names are the kit's because the artwork is: the faces are built from the
kit's own manifests, so `VF Display` / `VF Body` describes exactly what a
consumer gets. The classic names would also be a *claim* where the kit only
has a *credit* to give. A family name is stamped into the font binary, appears
in every consumer's `font-family` stack, and a font-management tool reports it
as the face's identity — and Chicago and Geneva are Apple's names for Susan
Kare's designs. The kit's faces share those designs' appearance, not their
files, so the credit stays a credit ("in the style of Chicago 12pt") rather
than becoming an identity.

Two consequences worth knowing:

- **The builder stamps the name into the binary**: `manifest-to-font.py`
  derives every name record (IDs 1–6, both platform sets) from the manifest's
  `family` field and asserts on re-read that no record says otherwise.
  Declaring it only in the TS module would leave the woff2 self-identifying
  as `Chicago 15` — which is what it did before 2026-08-08, when the constant
  said `'Chicago'` and nothing checked the file.
- **The fallback entries still name Chicago, Charcoal and Geneva**, after the
  shipped family, and that is correct rather than an oversight. Those select
  faces the *reader* may have installed — a real Mac has them — so the stack
  degrades toward the same shapes on a machine that owns them. Naming a font
  you hope to find is not the same act as naming a font you hand out.

**Nothing here can collide with an Apple name any more.** The kit registers
`VF Display` / `VF Body` and nothing else; the strike collection that
registered Apple names moved out on 2026-08-11, and the converted
`Chicago.woff2` / `Geneva.woff2` are *design references* living outside the
repository as of the same day (`../vintage-frames-design-reference`, beside
the working tree) — never consulted by the build, never registered at
runtime, never shipped, never tracked.

Two files went to that reference directory rather than travelling with the
collection, and the distinction is worth recording. **`Chicago-12-em16.woff2`
and `Geneva-9-em16-a12.woff2` were never native strikes** — they are the
kit-grid re-emmings (`--em 16`, upm 1024 against the native 960 and 768), and
`import-bdf.py` wrote them alongside the real ones only because that was where
it wrote everything. Each carried the *same* family name as the native strike
beside it (`Chicago 12`, `Geneva 9`), distinguishable by filename alone. A set
presented as the original strikes wants them gone, so when the collection was
broken out they went to `../vintage-frames-design-reference` with the rest of
the reference set instead.

## Design lineage

The two embedded faces re-draw classic Macintosh designs: **Chicago 12pt**,
the system font, and **Geneva 9pt**, the small text face — both created by
**Susan Kare** for Apple's original Macintosh. The way these faces look is
her work and Apple's, and the credit for it belongs to them. The *files* are
the kit's own: every glyph is authored as a plaintext pixel field in the
manifests, and `manifest-to-font.py` builds each binary from its manifest
alone — no Apple font file is consulted by the build or tracked in the
repository.

Appearance fidelity is deliberate, and it was established against the real
thing. Conversions of the original strikes — Chicago 12pt from a FontForge
BDF export of the NFNT strike (ascent 12, descent 3, 15px line), Geneva 9pt
extracted by `dfont-to-bdf.py` from the macfonts collection's
`Geneva_12.dfont` suitcase (ascent 10, descent 2; native pitch exactly its
12px rect — leading 0, unlike Chicago's 1), each re-emmed onto the kit's
16px 12/4 box by `import-bdf.py` — live outside the repository in
`../vintage-frames-design-reference` and served as the reference the
re-drawn faces are held to: same metrics, same advances, same ink placement,
so text set in the kit's faces occupies the same pixels a real Mac would
set. The references are never consulted by the build, never registered at
runtime, never shipped, never tracked.

Two footnotes from establishing that reference:

- **The 0xDA–0xDC quirk.** At the byte slots MacRoman later assigned to
  `⁄ € ‹`, the OS 1-6-era Chicago source (the macfonts collection's
  `Chicago_15.sfd`) draws the ✓, ◆ and apple menu symbols over again, and
  `› ﬁ ﬂ` are absent — it predates that extension of the charset. (Whether
  a System 7-era Chicago strike drew those six differently is unverified —
  the collection's OS 9 `Chicago` suitcase lost its resource fork and is
  empty.) The kit's face draws all six itself (2026-08-09): `⁄` on the
  face's own `/`, `‹ ›` from its `« »`, `€` on its `C`, plus the absent
  `› ﬁ ﬂ` — with the ✓ ◆  drawings kept at their own codepoints
  (U+2713 / U+25C6 / U+F8FF), and the build asserting every manifest
  codepoint reached the cmap. The imported collection, now in the system7web
  repo, keeps the quirk: it presents the source strikes as they are.
- **The raised Geneva.** The BDF collection's own `Geneva/12.bdf` turned
  out to be exported from **`Geneva_12_raised.dfont`**, a variant drawn one
  size larger (8px caps to the true strike's 7, `I` advance 4 to its 3) —
  it briefly seeded the body face on 2026-08-04 and read visibly wrong
  against a real Finder before the suitcases surfaced the un-raised strike.

Before the faces took on the classic designs' exact metrics and appearance
(2026-08-04), the kit shipped third-party lookalikes — **ChiKareGo**
(tighter advances, ~48 redrawn glyphs) and **FindersKeepers** (matched the
9pt metrics with its own ink). Both retired faces survive in git history.

**Both shipped faces carry the kit's backfill** (2026-08-09, completist pass
2026-08-10): the glyphs modern web copy and chrome reach for that old
MacRoman never held —
`× ⌘ ✓ € − · ′ ″ ‚ „ ‡ ‹ › ⁄ ‰ ﬁ ﬂ ½ ¼ ¾ ¹ ² ³ ← ↑ → ↓ ✕ ✗ ★ ☆`, the whole
keyboard (`⇧ ⌥ ⌃ ⎋ ⌫ ⏎ ⇥ ⇤ ↩`), the geometric symbol set
(`▸ ▾ ▴ ◂ ▶ ◀ ● ○ ■ □ ◦`, each face's symbols drawn on the 7×7 cell
Chicago's own `◆` establishes, the small triangles that diamond cut in half),
the invisibles a careful writer types (non-breaking and soft hyphens traced
from each strike's own hyphen; figure, thin and hair spaces as stated
advances with no ink), and the fifteen uppercase accents the era predates
(`Á Â È Ê Ë Ì Í Î Ï Ò Ó Ô Ù Ú Û`) — each drawn in its own strike's idiom
(Geneva flush-left and 1px-stroked; Chicago on its 1px bearings with 2px
stems where its letters have them, the modifier keys sized to its own 9×9
`⌘`). Every spec states its provenance — *traced* (a donor glyph's ink
verbatim: Geneva's ⌘ ✓ ◆  are Chicago's, riding above Geneva's cap band
because tracing keeps the donor's size),
*composed* (the strike's own capitals under its own accents, at the placement
its native É/Ñ establish), *derived* (strike ink rearranged: the comma
becomes `‚`, one `«` chevron becomes `‹`), or *drawn* (nothing to trace
anywhere — the `€` postdates every strike, and no strike drew text arrows).
Drawings shared by both faces were authored once, in the retired
`add-glyphs.py`'s module constants; since its removal (2026-08-11) each
manifest carries its own copy of a shared drawing, so keeping the two ⌘s in
step is now the editor's job. The per-glyph provenance labels survive in
the proof page's data file and in git history. See the proof page below.

## Why we modify the fonts

The UI types punctuation the classic charset lacks, and a missing glyph falls
back *per glyph* to the system font — a smooth glyph beside the pixel labels
(the em dash in "US$25 — see the Read Me" was the giveaway). Both faces carry
full MacRoman — `…`, curly quotes, the dashes, `•`, the accented
lowercase — but old MacRoman is not the modern web, so both faces carry the
backfill (the list above), and the display face's 0xDA–0xDC era quirk is
drawn correctly in the shipped build (see Design lineage). The one deliberate fallback
left is the Icelandic set (`Ý ý Ð ð Þ þ`) — no strike source, no real
presence in copy. (`⎋ ⌫ ⏎` were on that list until the 2026-08-10 completist
pass; the body face's `☆` now ships a proposal drawing, flagged on the proof
page, in place of the sketch it was waiting on.)

One glyph the backfill deliberately does *not* paper over: a `<ul>`'s default
`disc` marker never uses it — browsers paint disc/circle/square markers as
their own anti-aliased geometry without consulting the font. Copy that wants
1-bit list bullets states a string marker
(`list-style-type: '•\00a0\00a0'`), which renders as text in the face; the
showcase's installer window does exactly that.

(The `✓`, `▼` and scroll arrows the *components* draw are handled differently
— as inline SVG sprites in [`../src/glyphs.ts`](../src/glyphs.ts) and
`base.ts`. Prefer a font glyph when the character appears in freeform/slotted
text like a shortcut string; prefer a sprite when the component controls the
exact markup.)

### The proof page

`glyph-proof.html` on the dev server is the review surface for every added
glyph: the embedded face's own rasterization at 12× (crisp by construction —
gray edges mean drift from the authored bitmap) over a realistic
used-in-context line at native size, both in the glyph's face — grouped by
face first (display, then body), then by provenance, each face's *drawn*
group first because it is the one that wants design feedback. Its data file
(`demo/glyph-proof-manifest.ts`, tracked) was generated by `add-glyphs.py`
and froze at that script's removal (2026-08-11, the 2026-08-10 completist
state) — it is the backfill's per-glyph provenance record now, not a mirror
of the manifests: a glyph edited in `VF-*.glyphs.txt` will not update here.
The page is dev-only — deliberately not in the published pages build.

## Line pitch — measured, never derived

**A rect is not a pitch.** A face's line height is its font rect; the pitch
QuickDraw actually advanced lines by may add leading — and may not. Both of
the kit's faces were measured against the real thing rather than derived:

| Face | re-draws | rect | native pitch | leading | Established by |
| --- | --- | --- | --- | --- | --- |
| `VF Display` | Chicago 12 | 15 | **16** | 1 | native screenshot, 2026-08-05 (7 blank rows over 9px caps) |
| `VF Body` | Geneva 9 | 12 | **12** | 0 | native screenshot, 2026-08-05 (5 blank rows over 7px caps, both line pairs) |

Those two numbers are the only pitches this repo claims, and measurement is
the only way they were ever going to be right — a suitcase's FontRec/FamRec
metrics are synthesized boilerplate, not Apple's, and reading a pitch out of
them yields answers like "13" for Geneva 9. To establish a pitch for any other
strike you theme in, do it the way these two were:

1. On native System 7 (or a faithful emulator), set two wrapped lines in the
   strike, **descender-free words** so the lowest ink of line one is its
   baseline (e.g. "Three Nations" / "Hello World").
2. Screenshot at 1:1 and count the blank pixel rows between line one's
   baseline and line two's cap tops.
3. **pitch = blank rows + cap height** (cap heights: measure the strike, or
   see the reference table below for Geneva's 7px; Chicago's is 9).

Pitch reaches the components as explicit CSS — line boxes are never implicit —
through the theming tokens (SPEC §3). The shipped faces' measured pitches are
the defaults of `--vf-line-height-display` (16px) and `--vf-line-height`
(12px), which is what `vf-paragraph`, `vf-label` and `vf-text-area` wrap on.
Theming a different strike in means stating its three numbers together —
family, size, and measured pitch:

```css
:root {
  --vf-font-family: 'Geneva 12';
  --vf-font-size: 15px;    /* the strike's rect — its 1-px-per-px size */
  --vf-line-height: ???px; /* its measured native pitch — Geneva 12's is
                              unestablished: measure it first (steps above) */
}
```

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
`-webkit-font-smoothing: none`: on-grid and crisp. The em is the *rendering
grid*, not the line pitch — the kit states pitch separately, in explicit
whole-px line boxes fed by the tokens above ("Line pitch"), which is how
Geneva 9 sets 12px lines out of a 16px em. The manifests state everything
in whole design px; `manifest-to-font.py` multiplies by `PX` (=64) when it
compiles. Reference metrics for drawing into Geneva, measured from the
strike:

| | cap height | x-height | period dot | quotes sit at |
| --- | --- | --- | --- | --- |
| Geneva | 7px | 5px | 1×1 px, 1px bearing | 5–8px band |

Geneva ink sits flush left with its 1px gap carried in the advance (its `+`
is 5×5 at y 1, 6px advance — the geometry its `×` reuses). Chicago's `×`
likewise borrows its whole geometry from that strike's own `+`: 5×5 ink,
1px bearing each side, 7px advance. Chicago glyphs generally
carry a 1px bearing on both sides of their ink — the spacing the menu bar
and shortcut-column constants are traced against.

Baseline is `y = 0`; `y` grows upward. To match an existing face, keep new
glyphs on whole-pixel (64-unit) boundaries and within its bands.

## How a glyph is drawn

Glyphs are **bitmaps** — in the manifests, a field of `#` (ink) and `.`
(blank) rows, top row first, under a CSV row of the glyph's metrics. The
display face's `×`, as it appears in `VF-Display.glyphs.txt`:

```
== U+00D7 × ==
codepoint,char,glyph,advance,x0,y0,width,height
U+00D7,×,multiply,7,1,2,5,5

#...#
.#.#.
..#..
.#.#.
#...#
```

Empty cells are simply not drawn, so a loop is ink around an unfilled centre
— no reverse-winding contour needed. `x0`/`y0` place the field's left/bottom
edge in design px relative to the pen origin (baseline `y = 0`, `y` up);
`advance` is the pen advance. `manifest-to-font.py`'s `bmp()` rasterises each
field to TrueType contours — one clockwise rectangle per maximal horizontal
run of ink.

## Add or change a glyph

The faces are edited **as text**: each manifest holds every glyph in the
format above plus the `== font ==` metadata table, and each file's header
documents its own format in full.

1. Edit `VF-Display.glyphs.txt` / `VF-Body.glyphs.txt` — reink a field, or
   add a whole entry (heading, CSV row, pixel field; a new entry appends at
   the end of the glyph order — bump `glyphs` and `characters` together).
   If the character exists in a real strike — the imported collection in the
   system7web repo is the place to look — trace that shape rather than
   inventing one.
2. Build:
   ```sh
   /tmp/fontenv/bin/python3 fonts/manifest-to-font.py
   ```
   rebuilds `fonts/VF-*.woff2` from scratch and rewrites `FONT_WOFF2_BASE64`
   + the byte-count comment in `src/styles/*-font.ts`, reporting per face
   whether anything changed; a malformed manifest is refused before anything
   is written. **Byte-reproducible**: the build is a pure function of the
   manifest — the conversion-era timestamps ride in the `== font ==` table
   rather than being re-stamped — so an unchanged manifest re-ships
   identical bytes, and a diff in the embedded base64 always means a real
   change.
3. `npm run build` to bundle the updated base64.

## Verify

The builder asserts every manifest codepoint is in the `cmap` after saving,
and refuses a malformed manifest outright — a field whose rows disagree with
their CSV `width`/`height`, a duplicate codepoint or glyph name, metadata
that contradicts itself. For the *shapes*, the manifests are their own
preview — the pixel fields read directly — and to see a glyph through the
rendering engine, set it large in the embedded font and eyeball
(`-webkit-font-smoothing: none` to see true pixels):

```html
<style>
  @font-face { font-family: CH; src: url(VF-Display.woff2) format('woff2'); }
  .t { font-family: CH; font-size: 160px; -webkit-font-smoothing: none; }
</style>
<div class="t">&#x2318; Open&#x2026; Don&#x2019;t &#x201C;ok&#x201D; 3&#xD7;5</div>
```

A quick screenshot loop (headless Chrome) is the fastest way to iterate on a new
glyph's pixels — build, render at ~64–160px, adjust the bitmap, repeat.
