# Vintage Frames — Making Of

Technical notes on the goals of this project and the techniques used to achieve them.

Vintage Frames reproduces the classic Mac OS System 7 interface as Lit web components. The target is pixel accuracy: 1px borders, stepped corners, bitmap type and hard shadows that match the original art, rendered at its original ~72 dpi physical size, on modern displays of any pixel density.

The central technical constraint is that the art is 1-bit. Every pixel is black or white, so there is no antialiasing to absorb small errors. Any edge that fails to land on a whole device pixel is rendered as gray fringing, and the result reads as blurry rather than merely imperfect. Most of the engineering described below exists to keep every painted edge on the device-pixel grid — at authoring time, at scaling time, and at runtime against whatever layout the host page produces.

## 1. Display scaling

**Goal:** render the art at its original physical size and keep it crisp at any `devicePixelRatio`.

Every length in the kit is authored in **system pixels**, the unit of the original art: a button face is 20 system px tall, a menu row 16, a title bar 18. Components never state a CSS length directly; every metric is written as `calc(var(--vf-scale) * Npx)`, so a single inherited custom property scales the entire design — borders, type, glyphs, spacing, the desktop dither — by the same factor.

The default value of `--vf-scale` is `3 / devicePixelRatio`, chosen so that one system pixel always maps to exactly 3 device pixels. This reproduces the original ~72 dpi physical size and guarantees whole-device-pixel edges at any density:

| Display | `--vf-scale` (`3 / devicePixelRatio`) | one system px |
| --- | --- | --- |
| 1× standard | 3.0 | 3 device px |
| 2× retina | 1.5 | 3 device px |
| 3× hi-dpi | 1.0 | 3 device px |

The underlying requirement is that **`--vf-scale × devicePixelRatio` is a whole number** — one system pixel must occupy a countable number of device pixels, or the art is fractional before layout even begins. The default satisfies this on every display; an integrator who sets a custom scale is responsible for keeping the product whole.

This model has a consequence worth stating: physical accuracy means the CSS size varies with the display. The same push button is 60 CSS px tall on a 1× monitor and 20 on a 3× one, while the host page's own 17px body text is the same on both. For a full-screen recreation this is correct behavior. For controls embedded in an ordinary page it changes the chrome-to-copy proportions per display, so the kit leaves the choice to the page: keep the true-size default, or pin `--vf-scale` to a whole number for a fixed relationship to the page's type. The [README](./README.md#display-scaling--true-classic-size-crisp-on-any-screen) covers both options.

## 2. Stepped corners

**Goal:** reproduce the reference art's corner pixels exactly, at any control size, without antialiasing.

A System 7 rounded rectangle is a staircase of whole pixels, and native `border-radius` renders it as an antialiased arc — so the kit does not use `border-radius` at all. Each silhouette is defined as a **corner trace**: the per-row inset of the shape in system pixels, read from the 1× reference sheet by an extraction script (`scripts/extract-button-pixels.py`) and compiled into a stepped CSS `polygon()` clip path whose every vertex is a `calc(var(--vf-scale) * Npx)` multiple ([`src/pixel-frame.ts`](./src/pixel-frame.ts)). The push button's outer edge, for example, is the profile `{ corner: [3, 1, 1], edge: 0 }`: inset 3 on the first row, 1 on the next two, then straight.

Two details make the technique general:

- **Edge anchoring.** Corner vertices are measured from their own edges (`100% - …` on the right and bottom), so one polygon fits any width and height. The straight runs stretch; the traced corners never distort. This is the CSS equivalent of 9-slice scaling.
- **Difference of silhouettes.** Frames are drawn the way QuickDraw's `FrameRoundRect` drew them: the outer silhouette is painted in the frame color, and the face silhouette (inset one pixel, with its own traced corner rows) is painted on top. The 1px outline — including the 2px-wide diagonal step pixels at the corners — is the region the face does not cover. Nothing is stroked, so the reference's border pixels reproduce exactly, and because the fill comes from the element's own `background`, the shapes remain themeable through the same custom properties as everything else.

Under display scaling every vertex lands on a whole device pixel, so no edge antialiases.

## 3. The origin problem

The techniques above make a component pixel-exact relative to its own top-left corner. The host page decides where that corner lands. If the origin falls on a fractional device pixel, the entire interior rasterizes wrong: stepped corners staircase asymmetrically, and hairlines and bitmap glyph stems smear across two device rows and render gray. This is the common integration failure: a page that looks almost right, but muddy.

Drop the components into a standard web page and fractional origins are not an occasional hazard — they are the norm, because ordinary CSS produces fractional positions constantly. The dominant source is ratio line-heights: `line-height: 1.65` on 17px type resolves to 28.05px, so every line of prose above a component moves it another fraction off the grid. The other source is origins computed from measured text: a centered or right-aligned box derives its origin as `edge − width`, so a width taken from a text run — or from a fallback glyph the bitmap faces don't carry — lands the box on a fraction. The components' own sizes stay exact throughout; the fault lies entirely in where the surrounding layout places them.

The kit answers this in two layers. The first is the **layout contract** (documented in the [README](./README.md#staying-on-the-device-pixel-grid--the-layout-contract)), which states what a page must do to stay on the grid: keep `scale × dpr` whole; keep line boxes and spacing on whole pixels; position component-bearing boxes from their start edge or give them whole sizes. But the second rule is exactly the one an ordinary page breaks by accident, one ratio line-height at a time, and expecting every integrator to hold it indefinitely is not realistic. So the second layer has the components enforce their own origins. That is grid snapping.

## 4. Grid snapping

**Goal:** have each component hold its own origin on the device-pixel grid, regardless of the host page's layout.

`applyGridSnap()` ([`src/grid-snap.ts`](./src/grid-snap.ts)) is an opt-in that activates a per-component controller. Each component measures where the page placed it, computes the fractional remainder of its origin in device pixels, and cancels the remainder with an equal and opposite offset. The correction is always under half a device pixel, so nothing visibly moves; the interior simply rasterizes on the grid again. The result, verified by screenshot comparison: a page deliberately knocked off the grid renders bit-identically to a clean one.

The mechanism has four parts, each shaped by a specific measurement or failure.

### The correction is a layout offset, not a transform

`transform: translate()` is the obvious candidate, since transforms do not perturb layout. Measured by counting stray non-1-bit pixels in a screenshot crop of a `vf-button` (a clean render scores 0), it is insufficient:

| dpr | pristine page | off-grid page | corrected via transform | corrected via layout offset |
| --- | --- | --- | --- | --- |
| 1 | 0 | 959 | 189 | **0** |
| 2 | 0 | 990 | 159 | **0** |
| 3 | 0 | 957 | 189 | **89**¹ |

¹ each within 8/255 of pure black or white — the residue of layout-unit quantization, not visible in practice.

A fractional transform recovers only ~80% of the damage because it operates after rasterization: the subtree rasterizes at its layout position and is shifted at composite time, fringe included. A `left`/`top` offset goes through layout, so the interior re-rasterizes at the corrected position. A transform would also make the host a containing block for `position: fixed` descendants, which in testing displaced `vf-select`'s popup panel half a pixel from its control. The correction therefore had to be a layout-stage move.

### Termination

A naive measure-and-correct loop oscillates indefinitely. The cause is layout-engine arithmetic: Chromium lays out in units of 1/64 CSS px, and at dpr 3 a whole device pixel is 1/3 CSS px — not a representable position. The closest available offset leaves an error of up to 1/128 CSS px, the next measurement reads that error, and the controller adjusts again every frame, producing visible jitter.

Two guards make the loop terminate. Corrections are quantized to the 1/64px layout unit before being written, so the controller never requests a position the engine cannot hold. A deadband of 0.05 device px — about 5% coverage on one edge pixel, below what 1-bit art can show — leaves the irreducible error alone. (Gecko lays out in 1/60 CSS px and re-rounds written values; a no-progress check ends the loop there.) The correction is also computed as a delta against the currently applied offset, so a correction that lands short converges on the next pass instead of accumulating error.

### Scheduling

Corrections must be in place before paint, and a page may hold two hundred components, so all correction requests coalesce into a single `requestAnimationFrame` sweep shared by every component on the page. A sweep costs 1–3 ms for ~180 hosts.

The sweep runs **outermost first**, ordered by each host's count of `vf-*` ancestors (counted across shadow boundaries). This ordering is integral to the design, not an optimization: because a component's interior is built from whole system pixels, correcting the outermost host puts everything inside it on the grid, and a nested component then measures a position its ancestor has already corrected and finds no error. On a full-desktop page — a `vf-desktop` containing a menu bar, windows and every control — a single correction on the desktop covers every host on the page.

### Re-triggering

The web platform provides no event for "an element moved." The controller therefore re-runs on a set of conditions that cover the known causes of movement:

- a `ResizeObserver` on every host and on the document element (which grows with content);
- viewport `resize` and `orientationchange`;
- `document.fonts` events, since the bitmap faces register asynchronously and every line box re-measures when one loads;
- display-density changes, via the same watcher that drives `--vf-scale`;
- scroll. Scrolling itself moves nothing in document coordinates — engines keep scroll offsets device-pixel-aligned — but `position: sticky` converts scrolling into layout: a stuck box holds its contents at the stuck geometry, whose fractional residue differs from the in-flow geometry's, so a correction computed in one state is wrong in the other. The listener uses the capture phase to reach light-DOM scrollers, and the deadband keeps quiet sweeps to one rect read per host.

These triggers cannot detect a pure position change with no size change anywhere — content inserted into a fixed-height sibling, for example. `requestGridSnap()` is provided for pages that know they have moved something. A possible future refinement would close the gap without polling: an IntersectionObserver with thresholds armed against the element's exact current rect, re-armed on each fire, at the cost of one observer per host.

### Where the correction is written

The first implementation wrote the correction onto the host element: `left`/`top` on a relatively positioned host, or margins on absolutely positioned and sticky hosts, where `left`/`top` have other meanings. This worked, but made the controller a co-owner of properties that the component or the consumer might also write, and that required supporting machinery: a mechanism-selection step keyed off computed `position`, logic to adopt values written by others (`vf-window` re-seeds inline `left`/`top` on every drag frame), and bookkeeping to remove only the `position: relative` the controller itself had added.

The second implementation removes the conflict entirely: **the host is measured but never moved.** The controller writes exactly two reserved custom properties on the host's inline style — `--vf-snap-dx` and `--vf-snap-dy` — and each component's own stylesheet applies them inside its shadow root. A shared `.vf-snap` class (in the `vfBase` style recipe) offsets the top-level painted elements, and absolutely positioned satellites that anchor to the host — `vf-menu`'s dropped panel, the default button's outer ring — compose the same variables into their insets with `calc()`. Because the host's `position`, `left`, `top` and `margin` are never written, the correction cannot conflict with a consumer's positioning or with `vf-window`'s drag coordinates. The full footprint on the consumer's DOM is two custom properties, and disabling the feature deletes them.

The refactor also clarified what must be measured: **the host, not the painted elements.** The host's origin is the page's contribution and contains the entire error to cancel. The painted elements inside sit at authored offsets, some deliberately fractional — a checkbox's box is centered with a −0.5 device px offset that Chromium paint-snaps as intended — and measuring one of them would cause the controller to "correct" the component's own design. A few components had painted directly on `:host` (the separator's rule, the menu bar's fill, the list and scroll-area frames) and were changed to paint on an inner element so the chrome rides the offset. Row and option elements (`vf-list-item`, `vf-menu-item`, `vf-option`) and the layout-only group components carry no controller; they are positioned by their corrected containers.

The refactor was verified against the first implementation's raster results: the same stray-pixel counts recovered to zero, with the property-ownership machinery removed.

## 5. Font baselines

**Goal:** place text ink at its exact System 7 pixel positions.

The kit's two System 7 bitmap faces — ChiKareGo for chrome text, FindersKeepers for body text — ship embedded in the components and draw on their native 16-design-pixel grid, one design pixel per system pixel. Both WOFF2 files, however, carry incorrect vertical metrics introduced by format conversion: hhea ascender 682, descender 192, line gap 92 of the 1024-unit em — 10.66px, 3px and 1.44px at 16px — values that do not sit on the 64-unit design-pixel grid the glyphs are drawn on. Browsers place a line box's baseline from these metrics. The half-leading computed from them put the baseline about 0.5px high in every whole-pixel line box, and rasterization snapped that to a full device pixel: all text rendered one device pixel above its correct position. The symptom was first observed as fractional gaps in the `vf-select` pill.

The same files' OS/2 typo metrics carry the intended values — 768/256/0, the classic Chicago 12px ascent and 4px descent on a 16px em — but which table a browser prefers varies by platform. The fix overrides the metrics at registration: each face is registered with the CSS descriptors `ascent-override: 75%`, `descent-override: 25%` and `line-gap-override: 0%` ([`src/styles/register-embedded-font.ts`](./src/styles/register-embedded-font.ts)), which pins every browser to the design grid regardless of table preference. With the overrides applied, the select pill measures the reference's 3px above and 4px below the cap.

One limitation remains, and is documented rather than worked around: Chrome snaps aliased text baselines to whole absolute CSS pixels. At dpr 2 (scale 1.5), a pill's ideal baseline sits 19.5 CSS px below its border-box top, so a host at a whole-CSS-px position places the ideal baseline on a half pixel and Chrome's snap misses it by one device pixel. No metric value can change this; only a host at a half-CSS-px position (still on the device grid) renders it exactly. At dpr 1 and 3 the ideal baseline falls on a whole CSS pixel and rendering is exact.

## 6. Verification

**Goal:** prevent these properties from regressing silently. A refactor can move paint by a fraction of a pixel without failing any conventional test, so the verify suite asserts both geometry and rendered pixels, each at dpr 1, 2 and 3.

- **`verify:grid`** measures every `vf-*` host against the device-pixel grid and classifies each fault as `ORIGIN` (layout contract rule 2 or 3) or `SIZE` (rule 1), so a failure identifies which rule was broken. It can be pointed at an integrator's own pages via environment variables.
- **`verify:snap`** perturbs a page deliberately — a ratio line-height and a fractional document offset put every component on the page off the grid — then asserts that `applyGridSnap()` recovers every one, in geometry and in rendered pixels (the perturbed page must render bit-identically to the clean one), and that recovery holds through a reflow, a window drag, the `nosnap` opt-out and the cleanup function.
- **`verify:baseline`** asserts where text ink lands relative to the surrounding chrome, including the known dpr-2 case above.

Two conventions apply throughout the suite. Faults are classified, not just counted, so every failure points at a cause. And the pages the scripts measure never enable snapping themselves, because a page that corrected its own layout would hide the broken state the scripts exist to observe.

## 7. Principles

The recurring rules behind the techniques above:

1. **Author in the art's unit and derive everything.** All lengths are whole system pixels multiplied by one inherited scale factor, and `scale × dpr` must stay a whole number.
2. **No antialiased primitives.** Shapes that were pixel data in the original are shipped as pixel data — traced profiles compiled to stepped polygons — not approximated with curves.
3. **Enforce internally what integrators will break accidentally.** The layout contract was correct but unenforceable as documentation; grid snapping moved the origin rule into the components, where it is kept mechanically.
4. **Corrections must be invisible and reversible.** Under half a device pixel, expressed as reserved custom properties, never written to a property the component or consumer might own, and fully removable.
5. **Measure at the host, correct in the shadow root.** The host boundary is the page's contribution and contains the error; the painted elements are the component's and may include intentional fractional offsets that must not be "corrected."
6. **Work with the engine's arithmetic.** Layout resolves in 1/64 CSS px, baselines snap to whole CSS pixels, and composite-stage transforms do not re-rasterize. The correction loop terminates because it respects these; a version that ignored them jittered.
7. **Verify pixels and document limits.** Claims are asserted against rendered output at multiple densities, failures are classified, and known limitations (the dpr-2 baseline case, the fractional-size half of the contract, the 12px small face) are documented rather than left to be discovered.

## Planned sections

Topics from the rest of the kit that this document does not yet cover:

- **The coordinate system a page can't reach** — why laying out a window needed a component (`vf-stack`) rather than a documented CSS snippet. Scaling is default-on and *per component*, so `--vf-scale` lives on each host and never on the document: `var(--vf-scale, 1)` in a consumer's stylesheet resolves only where the rule's element happens to inherit one, which is true inside a window body and false on an ordinary page, where the fallback silently renders every gap 3× too tight. A unit the page cannot express is a unit the component has to own — and once it does, the layout contract's gap rule stops being a rule and becomes the only value the API accepts. Then the second half: what a layout box may decide *for* you. The first cut had `justify`, `wrap`, and an `align="auto"` that stretched a column — which meant ten components had to be exempted by name from being stretched, a list that would have grown with every new one. Deleting the default put the geometry back where System 7 had it (the content governs the box, and the box shrink-wraps so it can't claim a width nobody declared) and left one child hook, `fill-width`/`fill-height`, named for the outcome rather than the axis so the stack does the flexbox translation. Then two traps found by diffing the ported pixels against the old ones — the kind of thing only a before/after dump catches. `align` is a *legacy HTML presentation attribute*, so `align="end"` on an action row had been quietly right-aligning every run of copy inside it (the attribute is `place` now). And shrink-wrapping via `inline-flex` puts the box on a line box, which can never be shorter than its parent's strut, so a stack shorter than the surrounding leading silently grew by the difference; `width: fit-content` on a block-level box is the same geometry with none of the typography.
- **Scrollbars** — System 7's reserved-rail scrollbars, rebuilt with a shared scroll-state controller and the WebKit dot-dither trough; and why the 1px frame is painted *over* the scroller rather than as its border (WebKit pins scrollbar rects to whole CSS pixels, so a border put the rail's anchors on a half CSS pixel at dpr 2 and set the whole rail one device pixel adrift in Safari).
- **Embedded fonts** — shipping two bitmap faces inside a component library, self-registering on `document.fonts` with no global CSS.
- **Hard shadows and ink boxes** — why a control's ink bounding box differs from its border box, and how the height tokens were split to match the reference sheet.
- **The toggle mixin** — one interaction skeleton over two different base classes, and why `vf-radio` is deliberately not form-associated.
- **The selection blink** — System 7's ~250ms menu-selection blink as a reduced-motion-aware primitive.
- **Press-drag-release** — reviving the gesture the Mac was actually driven by (press a title, slide onto a command, release over it) on top of a click-to-open world: how the two are disambiguated by the gesture rather than by a mode, why hit-testing has to be by coordinates once touch's implicit pointer capture is in play, and what to do about the `click` the browser synthesises after a press it has already answered.
