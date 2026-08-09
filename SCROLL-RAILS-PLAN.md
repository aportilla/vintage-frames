# Kit-drawn scroll rails: retiring `::-webkit-scrollbar`

**Status: EXECUTED 2026-08-09** — all six phases landed (`src/scroll-rail.ts`,
`vfScrollRail`, the five adopters, the deletions, docs and demo reversions;
`npm test` 34/34, `verify:scrollbars` new). §6.4's manual Safari/Firefox pass
is the remaining open item. Two deviations from the text, both forced by
measurement: the dialog's rail is an out-of-flow overlay with a padding
channel, not a grid column (a rail column's fixed arrow tracks fed its own
minimum height back into the overflow measurement and flip-flopped forever),
and the three scrollers carry a `mod()` border-floor compensation so content
keeps its exact system-px inset despite engines flooring the fractional
border-width.
Replace the themed native scrollbars with scroll rails the kit draws itself:
ordinary DOM in each component's shadow root, synced to the scroller's native
scroll position. The native bar is hidden, never the native scrolling — wheel,
trackpad momentum, keyboard, touch and assistive-tech scrolling all stay the
platform's.

Companion docs: `TILE-GRID-PLAN.md` (the exact-tile machinery the trough will
adopt), `ZOOM-TILE-DRIFT.md` (why no finite tile span survives Safari zoom).

---

## 1. Why

### 1.1 The engine owns themed-scrollbar geometry, and quantizes it

Measured 2026-08-09 (headed WebKit + Chromium, dpr 2, scale 1.5, run-length
analysis of painted rows):

- WebKit holds a styled scrollbar to whole-CSS-px rects **twice**: the
  enclosed int rect in the scroller's local coordinates, then a floored
  absolute paint offset. Three regimes for the 16-system-px bar (48 device px):
  | scroller box (CSS px) | painted bar | visible defect |
  | --- | --- | --- |
  | edges and width whole | 48dp | none |
  | edges at x.5, width whole | 47dp | bar shifts 1dp; the frame overlay swallows its outer column; channel 41dp |
  | width fractional | 46dp | bar shrinks a full CSS px; channel 40dp |
- Chromium paints all three identically and correctly.

At scale 1.5 a box edge lands on a half CSS px at every **odd** system-px
offset, and the kit's own chrome deals odd offsets constantly (window body
inset 1+12=13, fieldset content inset 13, dialog body 1+16=17). Fixing this on
the native path means either re-metering kit insets to even totals, a
consumer-facing parity rule ("keep every scroller's box on the placement
lattice"), warn-once machinery, or all three — discipline paid forever, for
geometry the kit doesn't control. A DOM rail is kit art: subpixel layout
device-snaps at paint like every other element, and the whole class of defect
becomes unrepresentable.

### 1.2 Four standing caveats close for free

1. **Trough tile under Safari zoom.** The trough is the one surface that could
   not convert to the exact tile grid — "a `::-webkit-scrollbar`
   pseudo-element can host no children" (README, SPEC §4). A DOM trough
   renders through `tileRaster` like the desktop dither: 1-bit at every scale,
   zoom-minted ones included.
2. **Firefox.** The `@supports not selector(::-webkit-scrollbar)` fallback
   (flat `scrollbar-color`, no dither, no boxed thumb, no arrows) retires;
   every engine renders the same rail.
3. **Forced colors.** The documented residual (SPEC §1: arrow sprites keep
   literal black ink because mask-image is ignored on scrollbar pseudos, so
   dark themes get empty boxes) dies — DOM arrows use `glyphSvg`, which
   re-inks through the token remap like every other glyph.
4. **Headless verifiability.** Headless Chromium doesn't paint
   `::-webkit-scrollbar` skins, so the rail is the one surface `npm test`
   cannot see (scrollbars.ts:8). DOM rails are pixel-assertable at three
   densities like everything else.

### 1.3 Contortions that unwind

- The **borderless-scroller + `.vf-scroll-frame` overlay** structure exists
  only so WebKit's scrollbar rect anchors on whole CSS px
  (vf-scroll-area.ts:103, scrollbars.ts:27). Components can carry a real
  border again.
- The **`scrollbar-gutter: stable` dance** and its documented asymmetry (no
  gutter property for the horizontal axis; overlay-scrollbar platforms reserve
  nothing — vf-scroll-area.ts:115) retire: the component reserves its own rail
  as a DOM column.
- **`refreshWebKitScrollbars()`** (scroll-state.ts:239 — the tear-down/relayout
  poke because Safari only re-resolves scrollbar styles on scrollbar
  re-creation) is deleted, along with the "must survive any future migration"
  warnings attached to it.
- The `FUTURE: @container scroll-state()` notes simplify — gating plain DOM on
  a container query has none of the scrollbar-pseudo re-resolution problem.

### 1.4 Authenticity the native path can never reach

- **System 7's thumb is a fixed-size box**, not proportional (proportional
  thumbs are a later Mac OS thing). An engine-computed thumb cannot do this.
- **Trough clicks page**; **arrows step a line and auto-repeat on hold**. Both
  become first-class, tunable behaviors instead of whatever the platform does.

---

## 2. Design decisions

Settle these before writing code. Recommendations marked ☞.

1. **Hide the bar, keep the scrolling.** The scroller keeps real
   `overflow` scrolling. Bar suppression: `scrollbar-width: none` (Chromium
   121+, Firefox, Safari 18.2+) **plus** `::-webkit-scrollbar { display: none }`
   for older WebKit. Both lines ship; the second is the last scrollbar pseudo
   left in the kit. Non-negotiable — reimplementing scroll physics is how
   custom scrollbars projects die.
2. **Thumb sizing.** ☞ Fixed 16×16 system px (authentic System 7), not
   proportional. Degenerate track (shorter than arrows + thumb): drop the
   thumb, then the trough, as the classic Control Manager did — a decision
   table in the recipe, asserted by the verify script.
3. **Thumb drag.** ☞ Live scrolling (modern expectation; System 7's
   dotted-outline drag-then-jump could be a later opt-in). Thumb position
   always snaps to whole system px, so the art is crisp mid-drag.
4. **Trough press.** ☞ Page by one viewport minus one 16px line of overlap, in
   the direction of the press; auto-repeat after `PRESS_HOLD_MS` while held,
   stopping when the thumb reaches the pointer (classic behavior).
5. **Arrow press.** ☞ One line (16 system px) per click; auto-repeat on hold.
   Components may tune the line unit later (vf-list: its row height); ship one
   constant first.
6. **Wheel/keyboard.** Untouched — native scrolling on the viewport, which
   keeps its tab-stop/role/name contract exactly as today.
7. **Sync direction.** `scroll` event on the scroller → write thumb offset.
   Accept the ≤1-frame thumb lag behind compositor wheel scrolling; every
   scripted scrollbar has it, and at 1-bit there is no smooth motion to betray
   it. No rAF loop, no polling.
8. **A11y.** ☞ The whole rail subtree is `aria-hidden="true"`,
   non-focusable, pointer-only — System 7 scrollbars were never keyboard
   targets, keyboard users scroll the focused viewport natively, and screen
   readers scroll content their own way. (Alternative — `role="scrollbar"` +
   `aria-controls`/`aria-valuenow` — adds an announced interactive stop of
   dubious value; revisit only if AT testing shows a gap.) The viewport's
   focus ring, `tabindex` gating and role/name logic are unchanged.
9. **No 31st element.** ☞ The rail is a **render helper + controller**, not a
   `<vf-scroll-rail>` custom element: no registry entry, no cem/manifest
   surface, no upgrade ordering, and "30 elements" stays true. (An internal
   element would simplify per-component markup slightly; not worth the
   packaging ripple.)
10. **Tokens.** `--vf-scrollbar-thumb` keeps its meaning. `--vf-scrollbar-track`
    loses its "Firefox fallback only" caveat and becomes what its name says:
    the trough's base color under the dither. Document both in SPEC §3.
11. **Trough fill.** ☞ Adopt the exact tile in the same pass (a
    `tileRaster`-drawn trough, redrawn on rail resize — same pattern as
    vf-desktop). Fallback if it fights the schedule: keep the
    `tileImage`/`vfTileSize` span fill in phase 1 and convert in a follow-up;
    the DOM structure supports either without markup changes.

---

## 3. Architecture

### 3.1 New module: `src/scroll-rail.ts`

Two exports plus types, mirroring the kit's controller idioms:

- **`ScrollRailController`** (ReactiveController). Constructor:
  `(host, { getScroll, axes })` where `getScroll()` returns the scrolling
  element (a div or a `<textarea>`). Owns:
  - scroll → thumb sync (`scroll` listener on the scroller; writes
    `--vf-rail-thumb-x/-y` custom properties or direct style on the thumb —
    pick custom properties so the controller never needs element refs into
    the host's template);
  - geometry: thumb travel = track length − thumb length; offset =
    `round(scrollFraction × travel)` snapped to whole system px;
  - interactions: thumb drag (pointer capture, axis-locked — a simplified
    `DragTarget` in track space; do **not** reuse `snapSys`'s k-lattice, the
    rail needs plain whole-system-px snapping), trough paging with hold
    repeat, arrow stepping with hold repeat (`PRESS_HOLD_MS` from
    `src/motion.ts`);
  - writes scroll position exclusively through `scroller.scrollTop/Left`, so
    native scrolling, `ScrollStateController` and consumers observing scroll
    events see one source of truth.
- **`renderScrollRail(axis: 'vertical' | 'horizontal')`** — a Lit template
  helper producing the rail subtree the recipe styles:

  ```
  .vf-rail.vf-rail--vertical[aria-hidden=true]
    .vf-rail-button.vf-rail-button--decrement   (glyphSvg arrow)
    .vf-rail-track
      .vf-rail-trough                            (dither / tileRaster canvas)
      .vf-rail-thumb
    .vf-rail-button.vf-rail-button--increment
  ```

  plus a `.vf-rail-corner` helper for the both-axes cell.

### 3.2 New recipe: `src/styles/recipes/scroll-rail.ts` → `vfScrollRail`

Ports the current skin's numbers **exactly** (source: scrollbars.ts, so
nothing drifts visually):

| element | geometry (system px) |
| --- | --- |
| rail cell | 16 wide (vertical) / 16 tall (horizontal), component edge to edge |
| interior divider | 1px black on the content side of the rail (`border-left` / `border-top`) |
| channel | 14 between the divider and the component frame |
| arrow buttons | 16×16 boxed cells, one per end, 1px borders, edges shared with the frame so nothing doubles to 2px |
| arrow glyphs | the four outline + four pressed-fill sprites, 16-unit cell, centered |
| thumb | white box, 1px border across the channel, reads as inset 1px from each channel rail over its extent |
| trough | 25% dot dither: 4×2 motif, dots at (0,0) and (2,1), on `--vf-scrollbar-track` |

States, keyed off the same attributes `ScrollStateController` already writes
(now styling real elements — no scrollbar-pseudo re-resolution caveat):

- `data-overflow-{x,y}="false"` → idle rail: white channel, divider stays,
  no dither, no thumb, no arrows;
- `data-window-inactive` → both axes blanked to the idle rail regardless of
  overflow;
- forced colors → tokens remap via `vfBase` as everywhere else; arrows re-ink
  through `glyphSvg` (delete the SPEC §1 residual);
- cursor: every rail element takes `cursor: var(--vf-cursor, default)` so a
  text well's I-beam never bleeds over the rail (ports scrollbars.ts:70).

Also in the recipe: the two-line native-bar suppression
(`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) on
`.vf-scroll`.

### 3.3 Glyphs: `src/glyphs.ts`

Add `SCROLL_ARROW_UP/DOWN/LEFT/RIGHT` and `SCROLL_ARROW_*_FILL` (pressed) as
`Glyph` path data, ported verbatim from the eight url()-encoded sprites in
scrollbars.ts:179–201. Same 16-unit cell as `STEPPER`. The url() strings are
then deleted with the recipe.

### 3.4 `src/scroll-state.ts`

Keeps: overflow measurement, `LEADING_SPILL_SYS`, the data attributes, the
window-activity observer, `onOverflowChange`. Deletes:
`refreshWebKitScrollbars()` and both call sites; the "must survive migration"
paragraphs in its doc comment and the recipe's. The FUTURE container-query
note gets simpler, not harder.

---

## 4. Per-component adoption

Shared shape for the three scroll components: the scroller becomes a normal
bordered box again (the `.vf-scroll-frame` overlay and its "borderless — see
the Safari reason" comments delete), the rail(s) render as siblings of the
viewport inside the snapped wrapper, and layout reserves the rail column
explicitly (`grid-template-columns: 1fr calc(var(--vf-scale,1) * 16px)` or
padding — per component below).

### 4.1 `src/components/vf-scroll-area.ts` (first adopter)

- `.viewport` drops `scrollbar-gutter: stable` and both long gutter comments;
  `overflow-y: scroll` can relax to `auto` per axis (reservation is now the
  rail element, not the native gutter). Keep `.vf-scroll` for the suppression
  rules and the state attributes.
- Shadow tree: `.box` wraps `[viewport | vertical rail]` / `[horizontal rail]`
  rows, `.vf-rail-corner` when `axis="both"`, frame as a real border on `.box`.
- Wire `ScrollRailController`. Keep `ScrollStateController` exactly as is.
- Parts: `viewport` unchanged. ☞ Do not expose rail internals as parts in
  phase 1 (System 7 has one scrollbar look); revisit on demand.
- Delete the Safari-anchor comments (103–107) — the reason no longer exists.

### 4.2 `src/components/vf-list.ts`

Same restructure. The listbox element keeps role/aria-activedescendant
machinery untouched; only its box loses the overlay-frame contortion and
gains the rail column. Type-ahead, selection blink, `--vf-list-max-height`
behavior unchanged.

### 4.3 `src/components/vf-text-area.ts`

The `<textarea>` remains the scrolling element (`.vf-scroll` on it, native
bar suppressed — `scrollbar-width: none` works on textareas). The rail is a
shadow sibling in the field's grid, synced through `textarea.scrollTop`. The
existing on-input `measure()` call keeps the rail's active state honest; the
`scroll` listener keeps the thumb honest. The field frame returns to a real
border (vfField already draws it on vf-text-field — reconverge).

### 4.4 `src/components/vf-window.ts`

The edge-rail composition (`.edge-scroll` pulling the built-in vf-scroll-area
one system px under the frame) survives unchanged — it inherits the new rail
via vf-scroll-area. Verify the grow box still lands in the corner cell above
the rails (z-index 1). Retire the "scrollbar anchors ride the window's
whole-pixel box" halves of the comments at 274–282; drag/grow keep `snapSys`
for art-crispness and placement semantics, not for scrollbar rescue.

### 4.5 `src/components/vf-dialog.ts`

`.content` adopts the rail; keep today's on-demand appearance (rail only once
`data-overflow-y="true"` — a fitting dialog shows no rail at all, which is the
current documented behavior). The `overflow-y: hidden → scroll` flip and the
measurement-agreement comment (150–165) simplify: with no native gutter the
flip stops changing geometry, only interactivity.

### 4.6 Not touched

`vf-select`'s popup (already a custom scripted scroll — the in-kit precedent),
`vf-menu` (System 7 menus never scrolled), `vf-desktop`, all form controls.

---

## 5. Public surface & docs

| file | change |
| --- | --- |
| `src/index.ts` | export `ScrollRailController` (+ `renderScrollRail` if consumers should compose it); **remove `vfScrollbars`** — it exports today (index.ts:162), so this is a breaking export change; decide: delete outright (pre-1.0) ☞, or keep one release as a deprecated no-op shell. `{@link}` in `@deprecated` crashes cem analyze — plain text if kept. |
| `src/styles/base.ts` | swap `vfScrollbars` → `vfScrollRail` in the aggregate. |
| `SPEC.md` | §1: delete the forced-colors arrow residual. §3: re-document both scrollbar tokens (drop "Firefox fallback only"). §4: delete the trough exemption from the tile-grid section. §5: rewrite the scrollbar passages of vf-scroll-area / vf-list / vf-text-area / vf-window (edge rails) / vf-dialog — the "always-a-rail" contract text stays, the `::-webkit-scrollbar` mechanics go. Behavior additions: fixed thumb, trough paging, arrow repeat. |
| `README.md` | components table blurbs; "The tile grid" trough paragraph; utilities table row for `vfScrollbars` → `vfScrollRail`/controller. |
| `custom-elements.json`, `editor/*` | `npm run analyze` after `@cssprop` edits; `verify:manifest` holds it to source. |
| `MAKING-OF.md` | add to the "chapters yet to be written" list (optional). |

---

## 6. Test plan — script changes

### 6.1 New: `scripts/verify-scrollbars.mjs` (+ `"verify:scrollbars"` in package.json; `npm test` discovers it with the rest)

Headless, finally. Structure checks at dpr 1 / 2 / 3, via the harness
run-length idiom (`decodePng`, row runs, zero-gray assertions):

1. Rail anatomy on an overflowing vf-scroll-area: divider 1sys, channel
   14sys, arrow cells 16sys with glyph ink, thumb box with its borders, dot
   lattice at the 4×2 motif — zero intermediate-gray pixels.
2. **The regression test for the whole 2026-08-09 class:** the same component
   at `margin-left: 0.5px` and at an odd-system-px offset inside a
   `vf-window` — identical run patterns to the aligned copy. This is the
   assertion that was impossible against native bars.
3. Idle state (`data-overflow-y="false"`): white channel, divider only.
   Inactive window: both axes blanked. (Ports the currently-unverifiable
   halves of the always-a-rail contract.)
4. Fixed-thumb rule: thumb is 16sys regardless of content length; degenerate
   heights drop thumb, then trough, per the decision table.
5. Interactions (Playwright, same script or a sibling): thumb drag changes
   `scrollTop` and stays snapped; trough press pages and repeats; arrow press
   steps 16sys and repeats; wheel over the viewport still scrolls natively;
   `hidden` native bar (`scrollWidth` unchanged, no native gutter).
6. AX: the rail subtree is absent from the accessibility tree (harness `ax()`
   walker); the viewport's role/name/tab-stop contract matches today's
   verify-window-a11y expectations.
7. Forced colors: arrows re-ink (extends or merges into
   verify-forced-colors.mjs — see below).

### 6.2 Existing scripts to update

| script | why it changes |
| --- | --- |
| `verify-forced-colors.mjs` | contains scrollbar-track/arrow expectations written against the pseudo-element behavior (it was touched for the tile conversion too); the arrow-residual tolerance becomes a positive re-inking assertion. |
| `verify-window-a11y.mjs` / `verify-names.mjs` | new shadow elements must not add AX nodes; assert the rail is aria-hidden inside windows/dialogs/lists. |
| `verify-contract.mjs` | consumer-contract sweep touches `.vf-scroll`; update selectors/expectations for the new shadow structure. |
| `verify-archetypes.mjs` | document-window archetype pixels include the edge rails and grow-box corner; re-trace expected runs (they'll now assert real ink headless instead of skipping unpainted skins). |
| `verify-focus.mjs` | viewport ring unchanged, but the ring-inset assertions may reference the old wrapper structure. |
| `verify-control-heights.mjs` | vf-text-area's box composition changes (border returns to the field); heights must not move — this script proves it. |
| `verify-grid.mjs` / `verify-snap.mjs` | the snapped wrapper keeps `.vf-snap`; confirm the new rail children ride the same offset (no new snap targets needed — assert none report SIZE/ORIGIN faults). |
| `verify-tile.mjs` | if the trough adopts `tileRaster` (decision 11): add the trough as a fifth converted surface at the eight densities. |
| `verify-manifest.mjs` | runs green only after `npm run analyze` regenerates docs for the changed `@cssprop`s. |
| `verify-select-overflow.mjs`, `verify-list-typeahead.mjs`, `verify-list-focus.mjs`, `verify-key-models.mjs` | expected NO changes — run them as canaries; they assert behavior that must survive the restructure. |

### 6.3 Demo/showcase reversions (last)

The compensating pads exist only to cancel the native-path parity problem —
remove them once the rails are DOM:

- `index.html` Controls window: drop `pad="0 0 0 1"` on the right column (the
  row-of-stacks split itself **stays** — `1fr` tracks were fractional-CSS
  boxes, wrong under grid rule 3 regardless of scrollbars).
- `index.html` installer: `pad="0 1"` → no pad.
- `demo/demo.ts` `centerWindow`: **keep** the `snapSys` snap (placement
  lattice is still the drag contract; it's just no longer load-bearing for
  rails). Trim its comment's scrollbar rationale.
- Memory/docs that teach the parity rule get updated to historical status.

### 6.4 Manual pass (not automatable)

Real Safari (stable + one back): wheel, thumb drag, trough paging, arrow
repeat, text-area typing-to-overflow, inactive-window blanking, ⌘± zoom walk
(the trough should now survive it). Firefox: same sweep — it gains the full
skin for the first time. One trackpad-momentum feel check per engine.

---

## 7. Phases

1. **Rail module** — `scroll-rail.ts`, recipe, glyphs; adopt in
   `vf-scroll-area`; `verify:scrollbars` green at 3 densities incl. the
   off-lattice regression case.
2. **Remaining scrollers** — `vf-list`, `vf-text-area`; update the affected
   verify scripts as each lands.
3. **Compositions** — `vf-window` edge rails, `vf-dialog` content;
   archetypes/window-a11y green.
4. **Deletions** — `vfScrollbars` recipe + export, `refreshWebKitScrollbars`,
   gutter hacks, overlay-frame remnants; full suite green.
5. **Docs** — SPEC/README/manifest/editor data; MAKING-OF note.
6. **Demo reversions** (§6.3) + full `npm test` + the manual Safari/Firefox
   pass.

Each phase leaves `main` shippable; phases 1–3 can hold the old recipe and
the new rail side by side per component if a checkpoint needs it.

---

## 8. Risks & open questions

- **Thumb lag** (≤1 frame behind compositor scrolling) — accepted by design
  decision 7; re-evaluate only if the 1-bit aesthetic somehow makes it read.
- **Old-WebKit suppression**: `scrollbar-width` predates Safari 18.2; the
  `::-webkit-scrollbar { display: none }` fallback covers older engines, but
  test one legacy Safari for double-bar or lost-gutter artifacts.
- **`<textarea>` selection/scroll quirks**: programmatic `scrollTop` writes
  during thumb drag while the field has a live selection — verify no
  selection jump (script check in §6.1.5).
- **Grow-box hit target vs horizontal-rail increment arrow** in
  `scrollbars="both"` windows: the corner geometry is unchanged, but pointer
  targets are now the kit's own elements — re-verify the classic 15px corner
  doesn't shadow the arrow.
- **Bundle cost**: new controller + glyphs against the deleted recipe/url()
  sprites — expect roughly net-neutral; re-run the README bundle table
  (`sideEffects` fixture) before updating it.
- **Export break** (`vfScrollbars`): pre-1.0 delete vs deprecated shell —
  decide at phase 4.
- **Open**: expose rail `part`s for consumer theming? (☞ not in phase 1.)
  Scroll-on-release authentic mode as a future attribute? (☞ note in SPEC as
  non-goal for now.)

---

## 9. Explicit non-goals

- No reimplementation of scrolling physics, momentum, overscroll or snap.
- No changes to `ScrollStateController`'s measurement semantics or the
  always-a-rail / inactive-window policies — same signals, new paint.
- No new custom element; the registry stays at 30.
- No `vf-select`/`vf-menu` changes.
- The placement lattice (`snapSys`, `systemPxQuantum`) keeps its role in
  gestures and art crispness; this plan only removes its scrollbar-rescue
  duty.
