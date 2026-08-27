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
