import { unsafeCSS } from 'lit'

/**
 * The hard 1-bit drop shadow — a solid black copy of the box offset down-right
 * with no blur and no spread, System 7's only depth cue. The offset is
 * tokenized via `--vf-shadow-offset` and scales with `--vf-scale`.
 *
 * Compose it into any raised surface. Every raised surface in the kit does:
 * {@link vfPanel} (menus, popups) and {@link vfChromeFrame} (window and dialog
 * frames). One declaration, so the kit can't grow two shadows.
 *
 * Kept in its own module because it is the one recipe consumed on its own:
 * vf-swatch composes the shadow without either surface class.
 */
export const vfHardShadowDecls = unsafeCSS(`
  box-shadow: calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px))
    calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px)) 0 0
    var(--vf-black, #000);
`)
