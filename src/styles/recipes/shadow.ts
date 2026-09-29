import { unsafeCSS } from 'lit'

/**
 * The hard 1-bit drop shadow — a solid black copy of the box offset down-right
 * with no blur and no spread, System 7's only depth cue. The offset is
 * tokenized via `--vf-shadow-offset` and scales with `--vf-scale`.
 *
 * The shadow value, for a list: a stroked surface passes it to
 * `vfStrokeDecls({ shadows: vfHardShadow })`, which paints it after the
 * stroke. Every raised surface in the kit does — {@link vfPanel} (menus,
 * popups) and {@link vfChromeFrame} (window frames). One value, so the kit
 * can't grow two shadows.
 */
export const vfHardShadow = unsafeCSS(`calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px))
    calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px)) 0 0
    var(--vf-black, #000)`)

/**
 * {@link vfHardShadow} as the whole `box-shadow` declaration, for a box that
 * casts the shadow and draws no stroke.
 */
export const vfHardShadowDecls = unsafeCSS(`
  box-shadow: ${vfHardShadow};
`)
