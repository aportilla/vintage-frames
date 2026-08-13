# Known bugs

Open defects with the evidence already gathered, so picking one up doesn't mean re-deriving it. Close an entry by deleting it.

---

## 1. The desktop's grid coverage left with the desktop

**Status:** open — coverage gap, in the other repo **Where:** `system7web`

`verify:grid` and `verify:snap` used to walk the faux desktop at `/`, which was the kit's most demanding grid target: a full-viewport raster, absolutely positioned icons, nine windows. That page moved to `system7web` on 2026-08-11 and nothing audits it now. `docs/SIZING.md` documents `VF_GRID_PAGES` / `VF_SNAP_PAGES` / `VF_ORIGIN`, which is enough to point these scripts at that repo's dev server without copying them.
