# Border zoom plan

**Status (2026-09-29):** built, uncommitted — steps 2–7 done, and the probe
half of step 1. Left: the real-browser pass (Safari along the zoom ladder,
Firefox, one iOS Simulator zoom, Chrome forced-colors emulation), then steps
8–9. Delete this doc when the work ships, as with the earlier plans.

**What was built, and the calls made on the open questions:**

- `vfStrokeDecls({ edges, width, padding, shadows, ink })`, `vfStrokeInset(base)`
  and `vfStrokeShadow(width)` in `src/styles/recipes/stroke.ts`, exported
  from the root with `vfHardShadow` (the shadow as a value, for the list).
  Forced colors is one private switch, `--_vf-stroke-pad` (1, or 0 under
  forced colors), set by each stroked element and inherited — not one
  property per edge, which collided where a stroked box is placed inside
  another (the grow box in the frame). Children placed against a stroked
  box use `vfStrokeInset`. `vfRule`'s classes compose through per-edge
  shadow properties.
- Chromium at display density 1, 1.5, 2, 2.5 and 3 is pixel-identical to
  the border build on every stroked site (windows in every state, dialogs,
  select open, menu open, fields, checkbox pressed, rename box, containers),
  except the dotted separators, which are now an exact 1-on/1-off.
- vf-container keeps its contract: the slot is the box inside the rule
  (anchor, fills, flow-root), and the pattern's `background-origin` is the
  content box. vf-fieldset's 14/12/10 padding moved to its slot, so placed
  children still anchor at the rule's inner edge. vf-window's header and
  status strip clip on their slot, so overflowing content can't cover the
  rule. vf-select's panel clips on a new `.clip` element.
- Consumer padding on a recipe class: documented (SPEC §4, TOOLKIT) — the
  recipe owns padding on its stroked edges; an inset goes on a child.
- `--vf-separator-style`: `solid` and `dotted` only. Dotted is a gradient
  chosen by a container style query on the token: Chromium and WebKit
  support it; **Firefox is unverified** (Playwright's Firefox would not
  launch here) — without support, dotted falls back to solid there.
- vf-checkbox is now 12×12, the reference sprite's size (Adam's call). The
  13×13 box centered the 12px ✕ half a system px off in every engine since
  the glyph trace (3ed88fb); Safari's thin zoomed border happened to hide it,
  so the corrected frame exposed it. The ✕ now fills the 10×10 interior
  corner to corner; the box centers on row 4 without vfToggle's half-pixel
  step (the radio keeps its 13px well and the step), and both wells still end
  on row 15, so their focus rules share a row.
- Headless: 10 scripts changed (the 8 expected plus `verify-baseline` and
  `verify-menu-keys`), then `verify-toggle` and `verify-focus` for the 12px
  checkbox. Emulation paints a box edge on a half CSS px one
  device px off, which a border hid by flooring to whole CSS px, so the
  pixel checks that crossed stroked edges moved to display density
  (`real: true`) and tightened: verify-scrollbars' rail runs are exact
  (tol 0), verify-baseline's regular pill is exact at every host phase.

## The problem

Zoom Safari one step either way and every kit border draws thinner than
the art around it. On a 2× display at 115% the window frame, title-bar
rule and close-box stroke are 2 device px while every other system px is
3. At 85% they are 1 device px where 2 are due. Layout uses the thin width
too, so everything inside a bordered box moves: at 115% the title stripes,
body and icon of Adam's About window sat 1 device px closer to the frame's
outer edge (icon at 56 device px in, 57 at 100%). Nothing goes gray; the
interior is just off the lattice.

Chrome is correct at every zoom (checked by Adam on the probe). Firefox has
not been checked.

## What Safari does

Measured in Safari 27 with `border-zoom-probe.html` and two screenshots,
checked run by run:

- A `border` or `outline` width is floored to whole device px of the
  **unzoomed** CSS length at the hardware density (2), then multiplied by
  the page zoom and floored again to device px. `getComputedStyle` reports
  the first floor: `1px` at both 115% and 85%.
- The same border with `--vf-scale` a millionth high renders identically,
  so this is not float rounding.
- Padding and an inset `box-shadow` of the same `calc()` length render
  exactly: 3 device px at 115%, 2 at 85%, no gray.
- Safari 27 reports the zoom in `devicePixelRatio` (2.3 at 115%, 1.7 at
  85%). `src/zoom.ts` handled it (path 1 latched; `truePixelRatio()` was
  right). The floor ignores that density.

Device px for a 1-system-px border on a 2× display, n = device px per
system px:

| Zoom | 50% | 75% | 85% | 100% | 115% | 125% | 150% | 175% | 200% | 250% | 300% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n (wanted) | 1 | 2 | 2 | 3 | 3 | 3 | 4 | 5 | 5 | 7 | 8 |
| Safari draws | 1 | 1 | **1** | 3 | **2** | 2 | 3 | 3 | 4 | 5 | 6 |

Bold cells are measured; the rest follow from the rule above. Only 50% and
100% come out right. The 2-system-px band (`vfModalFrame`) measured 5 at
115% and 3 at 85%, where 6 and 4 are due.

KNOWN-BUGS #3's last paragraph (WebKit emulation at dpr 1.7 computing the
border as `0.588235px`) is the same family; Safari at 85% has now been
checked by hand.

## What can't fix it

- **A different `border-width`.** Layout takes the floored value, so the
  declared width would have to floor to exactly n device px. At 200% and
  300% no width does, and elsewhere it would mean coding against WebKit's
  internals and detecting the engine. Rejected.
- **Nudging `--vf-scale`.** Measured: no effect.
- **Undoing the zoom with CSS `zoom` on the kit's hosts.** Headless WebKit
  floors the same way under CSS `zoom`, and the product of two zooms is
  not exactly 1 in floating point. Rejected.
- **`outline`, `column-rule`.** Also line widths; the probe's outline row
  floors identically.

## The fix: strokes that aren't line widths

Every 1-bit stroke stops being a CSS border. The space it took moves to
padding on the stroked edges. The black is painted with an inset
`box-shadow` whose offset or spread is the stroke width. Neither length is
floored, so both land on n device px at every zoom, in every engine. This
is the probe's "shadow+pad" row.

Four things change with the space moving from border to padding, and each
site has to be checked for them:

1. **Placed children and pseudo-elements.** An absolutely positioned
   descendant measures from the padding edge, which is now the outer edge
   on stroked sides. Its insets grow by the stroke, and its percentage sizes
   shrink by it.
2. **Clipping.** `overflow: hidden` clips at the padding edge, so content
   can now paint over the stroke band. The kit's scrollers already put the
   frame on a wrapper that doesn't scroll (below). The exception is
   vf-select's panel, which is itself the clip for rows moved by transform,
   so its clip moves to an inner element.
3. **Shadows.** The stroke joins the box's other shadows (the hard drop
   shadow, the widget's white ring, the checkbox press) in one
   `box-shadow` list. Its color goes through a private property so state
   rules (an inactive window's widgets, the pressed utility widget) flip the
   color without restating the list.
4. **Forced colors.** Forced colors never paints `box-shadow`. Under
   `forced-colors: active` each stroke goes back to the border it is today,
   and its padding back to the element's own. The engines with forced colors
   (Chromium and Firefox on Windows) floor borders on the zoomed grid, and
   Safari has no forced colors, so the geometry there is exactly today's.
   The stroke width sits in one private property per edge, used by the
   padding and by any inset that compensates for it (item 1), and the
   forced-colors block zeroes it. `verify:forced-colors` should pass
   unchanged.

### The recipe

One helper in `src/styles/recipes/stroke.ts` writes all of it, so no site
hand-rolls the pairing. Roughly:

```ts
// A stroke of `width` system px on `edges`, beside `padding` system px of the
// element's own. Emits the per-edge width properties, the summed padding,
// the inset shadow (with `shadows` appended), the ink property, and the
// forced-colors block that swaps back to a border.
vfStrokeDecls({ edges: 'all', width: 1, padding: '3 6', shadows: vfHardShadow })
```

The exact API is settled in step 1. Recommendation: export it from the
root beside `vfRule`. Consumers author their own boxes in
`calc(var(--vf-scale) * Npx)` and a border is the obvious thing to reach
for. Without the helper they get the same bug.

## What moves at each site

About 40 border declarations in 16 files. "Today" is what depends on the
border now.

| Site | Edges | Today | Change |
| --- | --- | --- | --- |
| `vfChromeFrame` `.vf-frame` (vf-window) | all | hard shadow on the same box; `.grow` at `right: 0; bottom: 0`; `.edge-scroll` pulled 1 px under the frame | stroke joins the shadow list; grow box insets become the stroke |
| `vfPanel` `.vf-panel` (vf-menu, vf-select panels) | all | hard shadow; vf-select's `.panel` sets `padding: 0` and is the `overflow: hidden` clip for rows moved by transform; `positionPanel` reads `borderTopWidth` (`vf-select.ts:677`) | shadow list; vf-select's clip moves to an inner element and its `padding: 0` goes; read the stroke as `sys(1)` |
| `vfModalFrame` outer and inner (vf-dialog) | all; inner 2 px, top 1 under a bar | body is the placement anchor; the dialog's rail sits flush against the inner band | inner band's `border-top-width` rule becomes a stroke width |
| `vfTitleBar` `.vf-title-bar` | bottom | 18 px height includes the rule; `overflow: hidden`; `.vf-stripes`/`.vf-dots` inset from the bottom | bottom insets grow by the stroke |
| `vfWindowWidgets` `.box` (close, zoom) | all | white ring shadow; `.zoom::after` at `top/left: 0`; inactive `border-color: transparent`; utility pressed `border-color: white`; forced colors already sets `forced-color-adjust: none` | ring and stroke in one list; state rules flip the ink property; `::after` moves in by the stroke |
| vf-window `.grow` and its two pseudos | top, left; pseudos all | pseudos placed at `right/bottom: 1` and `top/left: 2` against the padding box | pseudo insets adjust; pseudos take the recipe too |
| `vfRule` `.vf-rule-*` (vf-container `rule`, window header and status, menu bar floor) | one class per edge | the contract (SPEC §4, `rule.ts`): content, percentage fills and placed children begin inside the rule | vf-container needs an inner element as the anchor, or the contract changes; see open questions |
| `vfScrollRail`: rail edge, arrow cells, thumb, corner | one side; thumb all | arrow sprite sits at the cell's padding origin | `place-items: start` already uses the content box; check |
| vf-scroll-area `.box` | all | grid of viewport and rails, which don't overflow the frame | direct |
| vf-list `.box` | all | `--vf-list-max-height` doc: "the host adds the 2px frame" | direct; doc stays true |
| `vfField` `.vf-field` (vf-text-field, vf-number-field) | all | on the native `<input>`; the host sets its own padding | the helper sums the input's padding |
| vf-text-area `.vf-field-well` | all | focus rule offset `-3px` and `±1px` sides (the "bordered carrier" case) | offsets become the borderless ones |
| vf-checkbox `.box` | all | press = inset shadow; forced colors press = `border-width: 2px`; focus rule `-3px`, `±1px` | press is a 2-px stroke; forced-colors rule stays |
| vf-select `.control` (closed pill) | all | hard shadow on the same box (`--_shadow-depth`); focus rule offsets | shadow list; offsets |
| vf-swatch `button` | all | 1 px padding (the white ring); optional hard shadow; focus rule offsets | helper sums the padding; offsets |
| vf-fieldset `.fieldset` | all | padding 14/12/10; `.legend` at `top: -11`, `left: 8`; placed children | legend `top: -10`, `left: 9`; placed children as for vf-container |
| vf-icon `.rename-box` | all | 1 px padding (the well); `.rename` in flow | helper sums the padding |
| vf-progress-bar `.track`, `.fill` | all; fill right | `overflow: hidden`; fill `height: 100%` | direct |
| vf-separator `.rule` | top or left | public `--vf-separator-style` (any border style; vf-menu sets `dotted`) and `--vf-separator-color` | solid becomes a background; dotted needs a 2-system-px repeat or mask; see open questions |
| vf-menu `.label` (open) | top and bottom, transparent | not a stroke: a spacer that keeps the highlight off the bar's top row and rule, via `background-clip: padding-box` | padding plus a highlight layer sized to skip those rows (the block already has `forced-color-adjust: none`) |

Not affected: `vf-grid` (rules are masks), `cross-center.ts` (reads border
plus padding, so either form works), the focus underline and dotted ring.

## Steps

1. **Settle the recipe on the probe.** Add to `border-zoom-probe.html`: a
   single-edge rule, the 2-px band, a placed child and a `fill-height`
   child inside a ruled box, the forced-colors revert (Chrome's DevTools
   forced-colors emulation, and Firefox), and a dotted-rule candidate.
   Widen the probe's tolerance to layout-unit truncation (its 85%
   "shadow" row read 1.938 for 2: two lengths truncated by 1/64 layout px
   each, which paint snapped away). Check Safari at 75, 85, 115, 125, 150
   and 200%, Firefox at a few zoom levels, and one Safari page zoom in the
   iOS Simulator. Fix the helper's API.
2. **The helper**, `src/styles/recipes/stroke.ts`, and its export.
3. **Window chrome** (what Adam saw): `vfChromeFrame`, `vfTitleBar`,
   `vfWindowWidgets`, the grow box, `vfRule` on the header and status
   strip, then `vfModalFrame` for vf-dialog. Check a window with every
   part (header, status, scrollbars, grow box, close and zoom, utility
   variant, inactive) in Safari along the zoom ladder, and in Chrome.
4. **Scrollers:** `vfScrollRail`, vf-scroll-area, vf-list, vf-text-area.
5. **Controls and the rest:** `vfField`, checkbox, select (pill, panel and
   `positionPanel`), swatch, progress bar, icon rename box, fieldset,
   `vfPanel` for menus, vf-menu's label, vf-separator, vf-container `rule`.
6. **Headless tests.** The change should be pixel-identical in Chromium at
   every density, so the suite is the regression guard and should pass
   untouched, except the eight scripts that read border widths:
   `verify-archetypes`, `verify-chrome`, `verify-control-heights`,
   `verify-position`, `verify-rule`, `verify-scrollbars`,
   `verify-select-overflow`, `verify-window`. They move to the stroke's
   geometry (padding, or where the content box starts). No new engines and
   no pixel-comparison machinery.
7. **Docs.** SPEC §4 and §5 (`vfRule`'s "a border, so…", `vfModalFrame`,
   `vfPanel`/`vfChromeFrame`, the vf-select pill, the focus-rule offsets),
   THREE-X-DISPLAYS § Borders, SIZING (a line telling consumers to stroke
   with the helper, not `border`; the Safari 27 `devicePixelRatio` note),
   TOOLKIT, DEVELOPING (the probe), KNOWN-BUGS #3's last paragraph,
   `rule.ts` and the `zoom.ts` comments that say Safari pins dpr. Rerun
   `npm run analyze` and commit the manifest with each `src/` change.
8. **Release.** The public recipes change their box model (padding where
   there was a border) and `--vf-separator-style` may narrow, so it is
   breaking: 0.14.0. Publishing is Adam's.
9. **WebKit bug.** Adam files it; a draft is below.

## Open questions

- **Export the helper?** Recommended, for the reason above.
- **vf-container `rule` and placed children.** Keep the contract with an
  inner anchor element inside `.box`, or let placed children and fills
  measure from the outer edge and document it. Recommended: keep the
  contract; it is SPEC'd and `verify:rule` asserts it.
- **Consumer padding on a recipe class.** A consumer's own `padding` on a
  `.vf-panel` or `.vf-field` element now overrides the stroke's space.
  Recommended: document that the recipe owns padding on its stroked edges
  and that an inset goes on a child. The helper covers custom components.
- **`--vf-separator-style`.** Recommended: support `solid` and `dotted`
  only, the two the kit draws.
- **Firefox.** Unchecked. Expected to behave like Chrome.

## Decided

- Real browsers are the ground truth; headless tests adapt afterwards.
- Not float rounding: measured.
- No engine detection and no per-zoom width tables.
- Forced colors keeps today's borders.

## Tools

**`border-zoom-probe.html`** (untracked; `npm run dev`, then
`/border-zoom-probe.html`). Load at 100% (Safari's zoom is measured from
load), then ⌘+ / ⌘−. The readout gives `devicePixelRatio`, the tracked
zoom, `truePixelRatio()`, `--vf-scale` and n. The table measures each probe
box: the computed width × `truePixelRatio()`, and where layout put the
content box, in device px, marked red when either misses n. **Copy
readout** copies it as text. Below it, the five boxes and a `vf-window`
are there to screenshot.

**Screenshots** are checked from Node with a PNG decoder like `decodePng`
in `scripts/harness.mjs`: classify black, white and gray, then count runs
along rows and columns. macOS puts a narrow no-break space (U+202F) before
AM/PM in screenshot names.

## WebKit bug draft

**Title:** Border widths are snapped to device pixels before page zoom is
applied

**Summary:** With page zoom other than 100%, a border width is floored to
whole device pixels of its unzoomed length, then multiplied by the zoom and
floored again. A border sized to be exactly 3 device pixels at 115% renders
2. Padding of the same length renders 3. Chrome and Firefox render 3.

**Steps:** on a 2× display, open the page below, zoom to 115% (⌘+ once).

```html
<div style="display:flex;gap:8px">
  <div style="width:40px;height:40px;box-sizing:border-box;
              border:1.3043478260869565px solid black"></div>
  <div style="width:40px;height:40px;box-sizing:border-box;
              box-shadow:inset 0 0 0 1.3043478260869565px black"></div>
</div>
<script>
  const b = document.querySelector('div > div')
  document.body.append(getComputedStyle(b).borderLeftWidth)
</script>
```

**Expected:** at 115% on a 2× display, 1.3043478 CSS px is 3 device px
(1.3043478 × 2 × 1.15). Both boxes draw a 3-device-px frame.

**Actual:** the border draws 2 device px and `getComputedStyle` reports
`1px`; the shadow draws 3. At 85% the border is 1 device px where 2 are
due. Seen in Safari 27.0.

Confirm the snippet reproduces before filing: it is the probe's first row
reduced, not a separately run file.
