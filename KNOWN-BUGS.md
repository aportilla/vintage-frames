# Known bugs

Open defects with the evidence already gathered, so picking one up doesn't mean re-deriving it. Close an entry by deleting it.

---

## 1. Four fractional origins on the component reference page

**Status:** open — makes `npm test` 32/34 **Blocks:** `verify:grid`, `verify:snap` **Where:** `demo/examples.css` — `.example__stage` / `.specimen`

Four components land on half-pixels on `index.html`:

| component | section | off | dpr 1 | dpr 2 |
| --- | --- | --- | --- | --- |
| `vf-label` | `#vf-fieldset` | y | `y=25701.813` | `y=26847.203` |
| `vf-button` | `#vf-stack` | x | `x=377.500` | `x=409.750` |
| `vf-checkbox` | `#focus` | x | `x=437.375` | `x=437.375` |
| `vf-select` | `#focus` | x | `x=547.297` | `x=547.297` |

Clean at dpr 3 (289/289), because `--vf-scale` is 1 there and nothing can be fractional. So this is ORIGIN, not SIZE — page layout, not a scale fault.

**Cause.** `.example__stage` is `display: flex; flex-wrap: wrap; gap: 16px` and `.specimen` is a column whose width is `max(caption, component)`. The caption is 12px mono text, so the cell takes a fractional width and hands the *next* flex item a fractional start. `examples.css:386` already describes this and says it is "precisely what `applyGridSnap()` is for" — which is true for the paint, but the host boxes stay off, and that is what both verify scripts measure.

**How it surfaced.** It is not new. It was `examples.html` before the 2026-08-11 repo split, and no script ever pointed at that page — `verify:grid` and `verify:snap` walked `/`, which was the faux desktop and was clean. Promoting the reference page to `/` pointed them at it for the first time. Confirmed by running the pre-split tree's own `verify-grid.mjs` against its own `examples.html`: same four, with `vf-checkbox x=453.375` and `vf-select x=563.297` identical.

**Why `verify:snap` fails too.** Its first assertion is `page starts on the grid` — it needs a clean page to knock off-grid before it can test recovery. It cannot use a page that is already off.

**Fix.** Whole-pixel widths for the specimen cells (or whole-pixel `flex-basis`), so a cell never hands its neighbour a fractional start. Both scripts should go green together. Independent of bug 2.

---

## 2. `vf-checkbox`'s snap correction doesn't land

**Status:** open — paint only; does not affect any test **Where:** `src/components/vf-checkbox.ts` + `src/grid-snap.ts`

With `applyGridSnap()` on, the snapper correctly detects all four hosts from bug 1 and writes a correction to each. Three of the four then paint on the grid. `vf-checkbox` does not:

| component | correction written | paint on grid |
| --- | --- | --- |
| `vf-label` | `dy: 0.1875px` | yes |
| `vf-button` | `dx: -0.5px` | yes |
| `vf-select` | `dx: -0.296875px` | yes |
| **`vf-checkbox`** | `dx: -0.375px` (dpr 1), `dx: +0.125px` (dpr 2) | **no** |

Measured on the `.vf-snap` element inside each shadow root — the host box is the wrong thing to measure here, since the snapper deliberately never moves it.

The dpr-2 value is the tell: `+0.125px` where every other correction that session came out negative. Suspect a sign or magnitude error in how the checkbox's painted root picks up `--vf-snap-dx`, likely tangled with the authored −0.5px toggle centering that `grid-snap.ts` already has a note about.

Fixing bug 1 removes the fractional input and hides this — so measure it first, or perturb a checkbox deliberately to keep a repro.

---

## 3. Grid snapping is still opt-in

**Status:** open decision, not a defect **Where:** `docs/SIZING.md:149` — "It stays opt-in for now."

The components snap themselves: each measures its own position and corrects inside its own shadow root, never touching the host's `position` / `left` / `top` / `margin`. `applyGridSnap()` does not do the snapping — it is one shared switch that turns the components' own self-snapping on, refcounted, so it costs one scheduler rather than an observer per component.

The original intent was for this to be default-on, and it never got flipped. A consumer who never calls `applyGridSnap()` gets no correction at all today, which is the opposite of "renders correctly on a blank page with no global CSS". Deciding this is a design call, not a bug fix.

---

## 4. The desktop's grid coverage left with the desktop

**Status:** open — coverage gap, in the other repo **Where:** `system7web`

`verify:grid` and `verify:snap` used to walk the faux desktop at `/`, which was the kit's most demanding grid target: a full-viewport raster, absolutely positioned icons, nine windows. That page moved to `system7web` on 2026-08-11 and nothing audits it now. `docs/SIZING.md` documents `VF_GRID_PAGES` / `VF_SNAP_PAGES` / `VF_ORIGIN`, which is enough to point these scripts at that repo's dev server without copying them.
