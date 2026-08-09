/**
 * The 1-bit style recipes — the barrel every component and the package root
 * import from. Each recipe lives in its own module under `./recipes/`; this
 * file re-exports them so `import { vfBase, vfField } from '../styles/base.js'`
 * keeps working and the public API is one name list.
 *
 * Why the recipes are split across modules rather than declared here: a bundler
 * cannot drop an unused `export const x = css\`…\`` from within a module. The
 * `/* @__PURE__ *\/` annotation that would let it is honored on *call*
 * expressions only — Lit's `css` is a *tagged template*, and esbuild (like
 * Rollup) ignores the annotation there. Whole-module elimination is the one
 * granularity every bundler handles, so a module boundary is the only place a
 * recipe can be dropped at. Before the split, importing a single recipe pulled
 * all 24 KB of them plus both font files; a `vf-button` now carries the four it
 * composes.
 *
 * That is also why the two `@font-face` registrations sit beside the two face
 * recipes (`./recipes/body-face.ts`, `./recipes/display-face.ts`) instead of at
 * the top of this file — a component that sets no chrome type should not ship
 * the Chicago face.
 *
 * Adding a recipe: give it a module here (or add it to the one whose recipes it
 * is always composed with), then re-export it below and from `src/index.ts`.
 */

export { vfBodyDecls } from './recipes/body-face.js'
export { vfDisplay, vfDisplayDecls } from './recipes/display-face.js'
export { vfBase } from './recipes/host.js'
export { vfStaticText } from './recipes/static-text.js'
export { vfDots, vfStripes } from './recipes/pattern.js'
export { vfHardShadowDecls } from './recipes/shadow.js'
export { vfChromeFrame, vfModalFrame, vfPanel } from './recipes/surface.js'
export { vfTitleBar, vfWindowWidgets } from './recipes/title-bar.js'
export { vfFocus, vfFocusRing, vfFocusUnderline } from './recipes/focus.js'
export { vfToggle } from './recipes/toggle.js'
export { vfField } from './recipes/field.js'
export { vfScrollRail } from './recipes/scroll-rail.js'
export {
  TILE_LATTICE,
  tileImage,
  tileRaster,
  tileRects,
  tileSpan,
  vfTileMaskSize,
  vfTileSize,
} from './recipes/tile.js'
export type { TileRect } from './recipes/tile.js'
