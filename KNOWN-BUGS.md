# Known bugs

Open defects with the evidence already gathered, so picking one up doesn't mean re-deriving it. Close an entry by deleting it.

---

## 3. Most of the suite measures emulated density

**Status:** open — coverage gap **Where:** `scripts/harness.mjs`, the `verify:*` scripts

The page builder's default density is Playwright's `deviceScaleFactor`, which is emulation: Chromium lays out as if at 1×, in 1/64 CSS px, and paints a box edge on a half CSS px one device px off (in Chromium and Firefox it also floors a fractional border width to a whole CSS px, which the kit now meets only under forced colors). A display does neither — at display density Chromium held the reference page's hosts to 0.023 device px at 3× where emulation leaves 895 host edges and sizes more than 1/64 device px off. The kit's `mod()` border-floor padding (removed 2026-09-13) was tuned to the emulated floor and put scroller content one device px inside the frame on real displays.

`browserAt` / `build(markup, { dpr, real: true })` renders at display density; `verify:grid`, `verify:baseline`, and the pixel groups of `verify:scrollbars` and `verify:rule` use it. Still built on emulated numbers: `cssPxFor` and `holdableScale` (harness), `verify:snap`'s half-pixel tolerance at unholdable scales, `verify:rule`'s printed-not-asserted 1.5× rung, `verify:tile`'s printed inset-layer hairline (the placed tile grid measured pure at display density on all four surfaces), and `docs/THREE-X-DISPLAYS.md`'s unholdable-4/3 analysis and text residual as they apply to Chromium (WebKit does lay out in 1/64 CSS px). `src/scale.ts` cites a "border-floor wobble" among the placement lattice's reasons; that wobble was measured under emulation too. Moving these to display density means re-measuring each, not flipping a flag.

WebKit's own emulation sets the page's device scale factor and matches a display — except at dpr 1.7, where it painted the probe page blank and computed a 1-system-px border as one device px (`0.588235px`) where two were due. Safari at 85% on a 2× display was checked by hand on 2026-09-29 and draws that thin border too: it rounds a border width to device px before applying page zoom. The kit no longer draws its lines as borders (`vfStrokeDecls`), so the blank paint is what remains of this.
