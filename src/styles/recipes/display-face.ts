import { css, unsafeCSS } from 'lit'

// Register the Chicago-style ChiKareGo chrome face on document.fonts (see the
// matching note in ./body-face.ts). This is the half of the type system a
// component can genuinely do without — a separator, a progress bar, a stack or
// a grid sets no chrome type — so keeping the registration here rather than in
// the barrel is what lets those components ship without the file.
import '../chikarego-font.js'

/**
 * The three declarations that switch text to the Chicago-style ChiKareGo
 * display face — the family via --vf-font-family-display, 16px so the 1024-upm
 * pixel grid lands exactly, and grayscale smoothing off for crisp 1-bit edges.
 * Each is tokenized for retheming. Compose onto a rule for one chrome element,
 * or use {@link vfDisplay} to apply to the whole host.
 */
export const vfDisplayDecls = unsafeCSS(`
  font-family: var(
    --vf-font-family-display,
    'ChiKareGo',
    'Chicago',
    'ChicagoFLF',
    'Charcoal',
    'Geneva',
    'Helvetica Neue',
    Helvetica,
    Arial,
    sans-serif
  );
  font-size: calc(var(--vf-scale, 1) * var(--vf-font-size-display, 16px));
  -webkit-font-smoothing: var(--vf-font-smoothing-display, none);
`)

/**
 * Chicago-style display type applied to the whole host. Compose into any
 * component whose text is entirely "chrome": buttons, menus, menu items,
 * checkbox/radio labels, popup menus. Components that mix a chrome title with
 * body content (windows, dialogs, fieldsets) instead apply {@link vfDisplayDecls}
 * to just their title/legend element, leaving slotted body copy on the vfBase
 * FindersKeepers body face.
 */
export const vfDisplay = css`
  :host {
    ${vfDisplayDecls}
  }
`
