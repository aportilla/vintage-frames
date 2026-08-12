# Known bugs

Open defects with the evidence already gathered, so picking one up doesn't mean re-deriving it. Close an entry by deleting it.

---

## 1. `vf-checkbox`'s box paints half a system px low

**Status:** open — paint only; no test measures it **Where:** `src/components/vf-checkbox.ts:51`

The checkbox's `.box` is 13 system px tall and `align-items: center` centers it in the 20-system-px control row: `(20 − 13) / 2` is 3.5, an exact tie, so the paint root sits half a system px below the grid. Measured on a deliberately perturbed page (`padding: .4px 0 0 .4px`) with `applyGridSnap()` on, as the error of each component's own `.vf-snap` paint root in device px:

| component | dpr 1 | dpr 2 | dpr 3 |
| --- | --- | --- | --- |
| `vf-button` | 0, 0 | 0, 0 | 0.016, 0.016 |
| **`vf-checkbox`** | **0, 0.5** | **0, 0.5** | 0.016, 0.047 |
| `vf-select` | 0, 0 | 0, 0 | 0.016, 0 |
| `vf-label` | 0, 0 | 0, 0 | 0, 0.016 |

**Not a fault in the snapper**, which the earlier version of this entry suspected (a sign or magnitude error, from the one dpr-2 correction that came out positive). The corrections written to the checkbox are the same ones written to its neighbours on the same page — `-0.390625px` at dpr 1, `+0.109375px` at dpr 2 — and they land: the *host* origin is on the grid in both axes, and so is the paint root's x. Only y is off, by the same half pixel at every perturbation, which is the authored 3.5 and not a residue. dpr 3 is clean because 3.5 system px is 14 whole device px at a 4/3 scale.

**Same class as the `vf-stack` centering tie** that `CrossCenterController` now settles (src/cross-center.ts) — but this one needs no measuring: both numbers are the component's own constants, so it is a static rule. 3 system px above the box or 4, one of which is what a real System 7 checkbox did.

**Repro.** Build `<vf-checkbox checked>` on a body with `padding: .4px 0 0 .4px`, call `applyGridSnap()`, and compare `shadowRoot.querySelector('.vf-snap').getBoundingClientRect()` against a whole device pixel. Nothing on the reference page reproduces it any more — its four fractional origins are fixed — so the perturbation is now the only way in.

---

## 2. Grid snapping is still opt-in

**Status:** open decision, not a defect **Where:** `docs/SIZING.md:96` — "It stays opt-in for now."

The components snap themselves: each measures its own position and corrects inside its own shadow root, never touching the host's `position` / `left` / `top` / `margin`. `applyGridSnap()` does not do the snapping — it is one shared switch that turns the components' own self-snapping on, refcounted, so it costs one scheduler rather than an observer per component.

The original intent was for this to be default-on, and it never got flipped. A consumer who never calls `applyGridSnap()` gets no correction at all today, which is the opposite of "renders correctly on a blank page with no global CSS". Deciding this is a design call, not a bug fix.

---

## 3. The desktop's grid coverage left with the desktop

**Status:** open — coverage gap, in the other repo **Where:** `system7web`

`verify:grid` and `verify:snap` used to walk the faux desktop at `/`, which was the kit's most demanding grid target: a full-viewport raster, absolutely positioned icons, nine windows. That page moved to `system7web` on 2026-08-11 and nothing audits it now. `docs/SIZING.md` documents `VF_GRID_PAGES` / `VF_SNAP_PAGES` / `VF_ORIGIN`, which is enough to point these scripts at that repo's dev server without copying them.
