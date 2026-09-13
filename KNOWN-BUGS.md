# Known bugs

Open defects with the evidence already gathered, so picking one up doesn't mean re-deriving it. Close an entry by deleting it.

---

## 1. A utility window can cover a `vf-select` popup opened in a document window

**Status:** open — needs the top layer **Where:** `src/components/vf-select.ts` (`.panel`), `src/cursor.ts`

The popup panel is `position: fixed; z-index: 10000` inside the select's shadow root. A `vf-window` is a stacking context (inline `z-index` + `position`), so that 10000 resolves *inside the window* and the whole popup paints at the window's z in the desktop's screen context — a document window's `1..n`, under every palette in the `1_000_000` utility band. No z-index inside the window can reach past it; only the top layer can.

Captured 2026-08-27 (Playwright, `--vf-scale: 3`): a desktop with the front document window (`z 1`, `active`) holding a five-option `vf-select`, and a palette (`z 1000002`) at 0–300 × 120–320. Opened via the shadow `.control` click, the panel measured 39–318 × 126–372; `document.elementFromPoint` at the overlap's centre (169.5, 223) returned the palette. The same probe on a `vf-menu-bar` / free-standing `vf-menu` slotted into the desktop is what the MENU TIER group of `verify:archetypes` now asserts the other way — those sit on the desktop's menu tier; a popup inside a window cannot.

Fix sketch: make the panel a `popover="manual"` (the cursor overlay's mechanism — top layer, no z-index war), `showPopover()` on open / `hidePopover()` on close, with the UA popover styles reset (`inset: auto`, margin, border, padding, overflow — the `.panel` rule already restates most). The coupling to settle first: the cursor overlay is itself a manual popover and re-promotes only on a `VfModalDialog` opening (src/cursor.ts), so a select popover shown later would cover the cursor unless the overlay also re-promotes on it — a generalized "re-promote on any kit top-layer entry" is the shape. A Menu-Manager popup drew over floating windows, so the target behavior is the same as the menu bar's.

---

## 2. The desktop's grid coverage left with the desktop

**Status:** open — coverage gap, in the other repo **Where:** `system7web`

`verify:grid` and `verify:snap` used to walk the faux desktop at `/`, which was the kit's most demanding grid target: a full-viewport raster, absolutely positioned icons, nine windows. That page moved to `system7web` on 2026-08-11 and nothing audits it now. `docs/SIZING.md` documents `VF_GRID_PAGES` / `VF_SNAP_PAGES` / `VF_ORIGIN`, which is enough to point these scripts at that repo's dev server without copying them.

---

## 3. Most of the suite measures emulated density

**Status:** open — coverage gap **Where:** `scripts/harness.mjs`, the `verify:*` scripts

The page builder's default density is Playwright's `deviceScaleFactor`, which is emulation: in Chromium and Firefox it floors a fractional border width to a whole CSS px, and Chromium lays out in 1/64 CSS px. A display does neither — every engine snaps border widths to whole device px, and at display density Chromium held the reference page's hosts to 0.023 device px at 3× where emulation leaves 895 host edges and sizes more than 1/64 device px off. The kit's `mod()` border-floor padding (removed 2026-09-13) was tuned to the emulated floor and put scroller content one device px inside the frame on real displays.

`browserAt` / `build(markup, { dpr, real: true })` renders at display density; `verify:grid` and `verify:scrollbars`' content-origin group use it. Still built on emulated numbers: `cssPxFor` and `holdableScale` (harness), `verify:snap`'s half-pixel tolerance at unholdable scales, `verify:rule`'s printed-not-asserted 1.5× rung, `verify:tile`'s printed inset-layer hairline (the placed tile grid measured pure at display density on all four surfaces), `verify:scrollbars`' ±1 run tolerances, and `docs/THREE-X-DISPLAYS.md`'s unholdable-4/3 analysis and text residual as they apply to Chromium (WebKit does lay out in 1/64 CSS px). `src/scale.ts` cites a "border-floor wobble" among the placement lattice's reasons; that wobble was measured under emulation too. Moving these to display density means re-measuring each, not flipping a flag.

WebKit's own emulation sets the page's device scale factor and matches a display — except at dpr 1.7, where it painted the probe page blank and computed the kit's 1-system-px border as one device px (`0.588235px`) where two were due. Safari reaches that density through page zoom (85% on a 2× display); not checked by hand yet.
