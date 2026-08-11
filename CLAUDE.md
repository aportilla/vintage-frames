# vintage-frames

Lit 3 web components rebuilding the Mac OS System 7 interface pixel-for-pixel.
31 elements, TypeScript, published to npm as `vintage-frames`.

## Commands

- `npm run dev` — Vite dev server on :5173 (the verify scripts expect one)
- `npm test` — the whole verify suite: 34 Playwright driver scripts, run in
  parallel against a server it starts itself. Filter by name
  (`npm test -- focus button`); `npm test -- --bail` stops at the first failure.
- `npm run verify:<name>` — one script against a dev server you started
- `npm run typecheck` / `npm run build`
- Always invoke project scripts through their `npm run` alias, not
  `node scripts/…` directly.

## Invariants — don't break, don't re-litigate

- Everything is authored in **system pixels** on the 1-bit grid; a component
  renders one system px as a whole number of device px. `--vf-scale × trueDpr`
  must stay whole — a fractional origin or size smears the art gray. Details:
  `docs/SIZING.md`.
- **No global CSS ships.** The kit exports no stylesheet; page-level CSS is the
  host page's job (`demo/desktop-page.css` belongs to the showcase, not the kit).
- **One true size.** The bitmap strikes render only at native size — no size
  knobs. Document what components do, never what they lack.
- The embedded faces (`VF Display`/`VF Body`) are the kit's **own re-drawn
  strikes**, built from the plaintext manifests `fonts/VF-*.glyphs.txt` by
  `fonts/manifest-to-font.py`. Credit Susan Kare and Apple as the original
  designers; never describe them as Apple's files. Only `fonts/imported/` is
  genuine Apple artwork.
- Keyboard focus is a 1px dashed underline in the 1-bit idiom; the browser
  ring is a last resort. Accessibility features are *added* in that idiom —
  never write comments or docs implying the classic Mac drew them.
- `dist/`, `custom-elements.json` and `editor/*` are build outputs
  (`npm run build` / `npm run analyze`) — regenerate, don't hand-edit.

## Commits

Concise messages: a summary line plus at most a few sentences. No co-author
or generated-by trailers.

CI fails if `custom-elements.json` / `editor/*` don't match a fresh
`npm run analyze` — after touching `src/`, rerun it and commit the
regenerated files with the change.

## Where things are

- `src/components/vf-*.ts` — the elements; `src/styles/recipes/` — the shared
  1-bit CSS recipes; mixins and controllers sit directly in `src/`
- `docs/` — all documentation beyond the README: SPEC (the full design spec;
  ships to npm), DESIGN-TOKENS (every `--vf-*` token), SIZING (grid/zoom/tile),
  LAYOUT (stack, placement, archetypes), FONTS, ICONS, CURSOR, ACCESSIBILITY,
  TOOLKIT (root exports), DEVELOPING (demo pages, verify suite), PUBLISHING
  (the npm release guide), THREE-X-DISPLAYS
- `README.md` — the consumer storefront, shared by GitHub and npm; deep
  material belongs in `docs/`, not there. Only `README.md` and this file live
  at the root — new docs go in `docs/`
- `fonts/README.md` — the font pipeline and design lineage
- `scripts/*.mjs` — the verify suite; shared harness in `scripts/harness.mjs`
