import { css, unsafeCSS } from 'lit'

// Register the two System 7 bitmap faces on document.fonts so they apply inside
// every component's shadow root — an @font-face rule can't cross that boundary
// (see register-embedded-font.ts). ChiKareGo is the Chicago-style chrome face
// (see vfDisplay); FindersKeepers is the body face (the --vf-font-family default
// below). Every component imports this module, so both register once on load.
import './chikarego-font.js'
import './finders-keepers-font.js'

/**
 * Shared base styles for every Vintage Frames component.
 * See SPEC.md §3 (tokens) and §4 (recipes).
 */
export const vfBase = css`
  :host {
    box-sizing: border-box;
    font-family: var(
      --vf-font-family,
      'FindersKeepers',
      'Geneva',
      'Helvetica Neue',
      Helvetica,
      Arial,
      sans-serif
    );
    font-size: calc(var(--vf-scale, 1) * var(--vf-font-size, 16px));
    font-weight: var(--vf-font-weight, 700);
    line-height: 1.25;
    color: var(--vf-black, #000);
    -webkit-font-smoothing: var(--vf-font-smoothing, antialiased);
    user-select: none;
    -webkit-user-select: none;
  }
  :host *,
  :host *::before,
  :host *::after {
    box-sizing: inherit;
  }
  :host([hidden]) {
    display: none !important;
  }
`

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

/**
 * Racing stripes for title bars. Apply the class to an absolutely-positioned
 * layer inset 3px (top/bottom) and 2px (left/right) within the title bar. At
 * the 18px bar height this yields exactly six 1px stripes spanning the close
 * box's top and bottom edges (title-bar interior 17px, stripes 11px tall).
 */
export const vfStripes = css`
  .vf-stripes {
    position: absolute;
    inset: calc(var(--vf-scale, 1) * 3px) calc(var(--vf-scale, 1) * 2px);
    background: repeating-linear-gradient(
      to bottom,
      var(--vf-black, #000) 0 calc(var(--vf-scale, 1) * 1px),
      transparent calc(var(--vf-scale, 1) * 1px) calc(var(--vf-scale, 1) * 2px)
    );
    pointer-events: none;
  }
`

/**
 * Panel recipe for menus and popups: white face, 1px black border, hard
 * offset shadow.
 */
export const vfPanel = css`
  .vf-panel {
    background: var(--vf-white, #fff);
    border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
    box-shadow: calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px))
      calc(var(--vf-scale, 1) * var(--vf-shadow-offset, 2px)) 0 0
      var(--vf-black, #000);
  }
`

/**
 * The dotted focus outline's two declarations, for composing inside any focus
 * selector whose shape (`:host(:focus-visible) .box`, `.viewport:focus-visible`,
 * a JS-toggled `.focus-ring`, …) is too varied to share a whole rule. Interpolate
 * it into the component's own selector: `.box { ${vfFocusRing} }`.
 *
 * The offset defaults to +2px (ring sits just outside the box); set
 * `--vf-focus-offset` in the same rule to inset it (negative, to stay in-box) or
 * widen it. Keeps the outline default (`--vf-focus-outline`) authoritative in one
 * place so a ring-style change is a single edit.
 */
export const vfFocusRing = css`
  outline: var(--vf-focus-outline, 1px dotted #000);
  outline-offset: calc(var(--vf-scale, 1) * var(--vf-focus-offset, 2px));
`

/**
 * Focus ring for non-text controls where focus and ring share one element.
 * Apply to the focusable element:
 *   .control:focus-visible { ... }
 * or compose this class name onto it.
 */
export const vfFocus = css`
  .vf-focus:focus-visible {
    ${vfFocusRing}
  }
`

/**
 * Shared layout for the two toggle controls (vf-checkbox, vf-radio): the
 * box-and-label row, the host focus suppressed (the ring is drawn on the
 * box/circle instead), and the classic "dim the label, not the control"
 * disabled treatment. The Chicago display face comes from {@link vfDisplay}
 * (both controls compose it), so no font is set here. Each component adds only
 * its own well (`.box`/`.circle`), glyphs and press feedback.
 */
export const vfToggle = css`
  :host {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--vf-scale, 1) * 6px);
    cursor: default;
  }
  /* The focus ring is drawn on the box/circle, not the host. */
  :host(:focus-visible) {
    outline: none;
  }
  /* Disabled dims the label only; the box/circle glyphs stay solid black. */
  .label.dim {
    color: var(--vf-disabled, #c0c0c0);
  }
`

/**
 * The System 7 editable-field skin (SPEC §1/§5): a white well with a 1px black
 * border, no corner radius, Chicago-style display type, and the "focus thickens
 * the border" box-shadow (no dotted ring). Add the `vf-field` class to the inner
 * native `<input>`/`<textarea>`; the host supplies layout (width, height,
 * padding) around it. Shared by vf-text-field, vf-text-area and vf-number-field
 * so the well, focus and disabled treatment stay identical across all three.
 */
export const vfField = css`
  .vf-field {
    background: var(--vf-white, #fff);
    border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
    border-radius: 0;
    /* Editable text is set in the Chicago-style display face. */
    ${vfDisplayDecls}
    font-weight: var(--vf-font-weight, 700);
    line-height: inherit;
    color: var(--vf-black, #000);
    user-select: text;
    -webkit-user-select: text;
    outline: none;
  }
  /* Fields thicken their border on focus instead of a dotted ring. */
  .vf-field:focus {
    box-shadow: 0 0 0 calc(var(--vf-scale, 1) * 1px) var(--vf-black, #000);
  }
  .vf-field::placeholder {
    color: var(--vf-disabled, #c0c0c0);
    font-weight: inherit;
    opacity: 1;
  }
  /* Disabled: the text dims to gray; the solid black box border stays. */
  .vf-field:disabled {
    color: var(--vf-disabled, #c0c0c0);
    box-shadow: none;
  }
  /* Selected text inverts to solid black-on-white — the 1-bit System 7
     selection, not the browser's translucent blue. Reuses the list's highlight
     tokens so every selection in the kit shares one color. */
  .vf-field::selection {
    background-color: var(--vf-highlight, #000);
    color: var(--vf-highlight-text, #fff);
  }
`

/**
 * System 7 scrollbars. Add the `vf-scroll` class to any element with
 * `overflow: auto`/`scroll` that lives inside a 1px-bordered host (the recipe
 * assumes the host border supplies the scrollbar's outer frame).
 *
 * WebKit scrollbars are skinned: 16px wide, a loose 1-bit dot-dither trough
 * (25% density, traced from the UI kit's "Scroll bg" sprite), a white boxed
 * thumb, and boxed arrow buttons with inline-SVG triangle glyphs (one at each
 * end). Every element omits its border on the edge that meets the host, so the
 * two never double into a 2px stroke. Firefox falls back to `scrollbar-color`.
 *
 * Shared by `vf-scroll-area` and `vf-list` so the two never drift.
 */
export const vfScrollbars = css`
  .vf-scroll::-webkit-scrollbar {
    width: calc(var(--vf-scale, 1) * 16px);
    height: calc(var(--vf-scale, 1) * 16px);
  }
  /* The rail always uses the default arrow pointer, never the host's cursor —
     otherwise a textarea's text I-beam bleeds over the reserved scroll rail.
     Custom (styled) scrollbars honor the cursor property; native ones ignore it. */
  .vf-scroll::-webkit-scrollbar,
  .vf-scroll::-webkit-scrollbar-track,
  .vf-scroll::-webkit-scrollbar-thumb,
  .vf-scroll::-webkit-scrollbar-button,
  .vf-scroll::-webkit-scrollbar-corner {
    cursor: default;
  }
  /* Loose 1-bit dither: a 25%-density dot lattice — dotted vertical lines two
     pixels apart, each column phase-shifted by one row. A 4×2 tile with a dot
     at (0,0) and (2,1) reproduces the sprite exactly, far airier than a 50%
     checkerboard. */
  .vf-scroll::-webkit-scrollbar-track {
    background-color: var(--vf-white, #fff);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='2'%3E%3Crect width='1' height='1'/%3E%3Crect x='2' y='1' width='1' height='1'/%3E%3C/svg%3E");
    background-size: calc(var(--vf-scale, 1) * 4px) calc(var(--vf-scale, 1) * 2px);
  }
  /* Interior rail dividing the content from the scrollbar channel. The outer
     edges are left to the host's 1px border (see the border trims below). */
  .vf-scroll::-webkit-scrollbar-track:vertical {
    border-left: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-scroll::-webkit-scrollbar-track:horizontal {
    border-top: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  /* The thumb keeps a full 1px border on every side. System 7 insets the thumb
     one pixel from the channel rails, so each long side reads as a doubled 1px
     line — the rail (or host frame) plus the thumb's own border — but only over
     the thumb's extent; the rail stays 1px above/below it. The rail-side border
     is 2px: the extra inner pixel draws over the continuous rail. The frame-side
     stays 1px and doubles against the host border just outside the channel. */
  .vf-scroll::-webkit-scrollbar-thumb {
    background: var(--vf-scrollbar-thumb, #ffffff);
    border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-scroll::-webkit-scrollbar-thumb:vertical {
    border-left-width: calc(var(--vf-scale, 1) * 2px);
  }
  .vf-scroll::-webkit-scrollbar-thumb:horizontal {
    border-top-width: calc(var(--vf-scale, 1) * 2px);
  }
  /* The corner only exists when both scrollbars show. It supplies the two
     interior dividers (against the vertical down-arrow above and the horizontal
     right-arrow beside it) that those buttons drop as their container-facing
     edges; its right/bottom edges are the host border. */
  .vf-scroll::-webkit-scrollbar-corner {
    background: var(--vf-white, #fff);
    border-top: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
    border-left: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-scroll::-webkit-scrollbar-button {
    display: block;
    width: calc(var(--vf-scale, 1) * 16px);
    height: calc(var(--vf-scale, 1) * 16px);
    background-color: var(--vf-white, #fff);
    border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
    background-repeat: no-repeat;
    background-position: center;
    /* Scale the 16-unit arrow sprite to fill the scaled button (it's drawn via
       background-image with no intrinsic scale otherwise). */
    background-size: calc(var(--vf-scale, 1) * 16px) calc(var(--vf-scale, 1) * 16px);
    /* The sprite is the whole 16-unit cell (frame margin included), so its
       positioning box must be the fixed 16·scale border-box — not the default
       padding-box, which the per-variant dropped borders (see the trims below)
       grow asymmetrically to 15·scale, landing the centered sprite on a
       half-pixel offset that antialiases the arrow. border-box keeps every
       state on the device grid and crisply centered. */
    background-origin: border-box;
  }
  /* Nest the arrow boxes cleanly inside the host's 1px border: any button edge
     that meets the container is drawn by the host border, not the button, so
     the two never double into a 2px stroke. The button's inner edges (dividers
     against the track, and the rail-side edge) stay. */
  .vf-scroll::-webkit-scrollbar-button:vertical {
    border-right: 0;
  }
  .vf-scroll::-webkit-scrollbar-button:vertical:decrement {
    border-top: 0;
  }
  .vf-scroll::-webkit-scrollbar-button:vertical:increment {
    border-bottom: 0;
  }
  .vf-scroll::-webkit-scrollbar-button:horizontal {
    border-bottom: 0;
  }
  .vf-scroll::-webkit-scrollbar-button:horizontal:decrement {
    border-left: 0;
  }
  .vf-scroll::-webkit-scrollbar-button:horizontal:increment {
    border-right: 0;
  }
  /* Single arrow button at each end, classic style. */
  .vf-scroll::-webkit-scrollbar-button:vertical:start:increment,
  .vf-scroll::-webkit-scrollbar-button:vertical:end:decrement,
  .vf-scroll::-webkit-scrollbar-button:horizontal:start:increment,
  .vf-scroll::-webkit-scrollbar-button:horizontal:end:decrement {
    display: none;
  }
  /* Authentic System 7 scroll arrows (arrow + stem), traced from the Classic
     Macintosh UI Kit sprites: a hollow outline at rest that fills solid black
     while the button is pressed (:active). */
  .vf-scroll::-webkit-scrollbar-button:vertical:decrement {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 3h2v1h-2zM6 4h1v1h-1zM9 4h1v1h-1zM5 5h1v1h-1zM10 5h1v1h-1zM4 6h1v1h-1zM11 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM2 8h4v1h-4zM10 8h4v1h-4zM5 9h1v1h-1zM10 9h1v1h-1zM5 10h1v1h-1zM10 10h1v1h-1zM5 11h1v1h-1zM10 11h1v1h-1zM5 12h6v1h-6z'/%3E%3C/svg%3E");
  }
  .vf-scroll::-webkit-scrollbar-button:vertical:decrement:active {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 3h2v1h-2zM6 4h4v1h-4zM5 5h6v1h-6zM4 6h8v1h-8zM3 7h10v1h-10zM2 8h12v1h-12zM5 9h6v1h-6zM5 10h6v1h-6zM5 11h6v1h-6zM5 12h6v1h-6z'/%3E%3C/svg%3E");
  }
  .vf-scroll::-webkit-scrollbar-button:vertical:increment {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M5 3h6v1h-6zM5 4h1v1h-1zM10 4h1v1h-1zM5 5h1v1h-1zM10 5h1v1h-1zM5 6h1v1h-1zM10 6h1v1h-1zM2 7h4v1h-4zM10 7h4v1h-4zM3 8h1v1h-1zM12 8h1v1h-1zM4 9h1v1h-1zM11 9h1v1h-1zM5 10h1v1h-1zM10 10h1v1h-1zM6 11h1v1h-1zM9 11h1v1h-1zM7 12h2v1h-2z'/%3E%3C/svg%3E");
  }
  .vf-scroll::-webkit-scrollbar-button:vertical:increment:active {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M5 3h6v1h-6zM5 4h6v1h-6zM5 5h6v1h-6zM5 6h6v1h-6zM2 7h12v1h-12zM3 8h10v1h-10zM4 9h8v1h-8zM5 10h6v1h-6zM6 11h4v1h-4zM7 12h2v1h-2z'/%3E%3C/svg%3E");
  }
  .vf-scroll::-webkit-scrollbar-button:horizontal:decrement {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M8 2h1v1h-1zM7 3h2v1h-2zM6 4h1v1h-1zM8 4h1v1h-1zM5 5h1v1h-1zM8 5h5v1h-5zM4 6h1v1h-1zM12 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM3 8h1v1h-1zM12 8h1v1h-1zM4 9h1v1h-1zM12 9h1v1h-1zM5 10h1v1h-1zM8 10h5v1h-5zM6 11h1v1h-1zM8 11h1v1h-1zM7 12h2v1h-2zM8 13h1v1h-1z'/%3E%3C/svg%3E");
  }
  .vf-scroll::-webkit-scrollbar-button:horizontal:decrement:active {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M8 2h1v1h-1zM7 3h2v1h-2zM6 4h3v1h-3zM5 5h8v1h-8zM4 6h9v1h-9zM3 7h10v1h-10zM3 8h10v1h-10zM4 9h9v1h-9zM5 10h8v1h-8zM6 11h3v1h-3zM7 12h2v1h-2zM8 13h1v1h-1z'/%3E%3C/svg%3E");
  }
  .vf-scroll::-webkit-scrollbar-button:horizontal:increment {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 2h1v1h-1zM7 3h2v1h-2zM7 4h1v1h-1zM9 4h1v1h-1zM3 5h5v1h-5zM10 5h1v1h-1zM3 6h1v1h-1zM11 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1zM3 8h1v1h-1zM12 8h1v1h-1zM3 9h1v1h-1zM11 9h1v1h-1zM3 10h5v1h-5zM10 10h1v1h-1zM7 11h1v1h-1zM9 11h1v1h-1zM7 12h2v1h-2zM7 13h1v1h-1z'/%3E%3C/svg%3E");
  }
  .vf-scroll::-webkit-scrollbar-button:horizontal:increment:active {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M7 2h1v1h-1zM7 3h2v1h-2zM7 4h3v1h-3zM3 5h8v1h-8zM3 6h9v1h-9zM3 7h10v1h-10zM3 8h10v1h-10zM3 9h9v1h-9zM3 10h8v1h-8zM7 11h3v1h-3zM7 12h2v1h-2zM7 13h1v1h-1z'/%3E%3C/svg%3E");
  }
  /* ── Always-a-rail behavior (driven by ScrollStateController) ─────────────
     A scrollable frame keeps its scroll rail as a permanent placeholder: the
     component reserves the channel per axis (overflow-y/-x: scroll) so an empty
     white rail sits in the gutter even with nothing to scroll, and the bar only
     fills in — dither track, thumb, arrow buttons — once that axis overflows.

     ScrollStateController writes data-overflow-{x,y}="true|false" on the scroll
     element; "false" selects the idle rail below. A plain .vf-scroll used
     WITHOUT the controller carries no such attribute, so none of these rules
     match and its scrollbar behaves exactly as the recipe above — the managed
     behavior is strictly opt-in and can't silently swallow a consumer's bar.

     FUTURE: when @container scroll-state(scrollable) container queries reach
     baseline support, slotted-content components (vf-scroll-area, vf-list) could
     drop the JS controller and gate these same rules with an @container query
     instead; a native textarea's own scrollbar would still need the JS path.
     See the matching note in src/scroll-state.ts. */

  /* Idle track: a plain white channel — the dither returns only on overflow.
     The rail divider (the track's border, above) stays, so the empty gutter
     still reads as a scroll rail. */
  .vf-scroll[data-overflow-y='false']::-webkit-scrollbar-track:vertical,
  .vf-scroll[data-overflow-x='false']::-webkit-scrollbar-track:horizontal {
    background-image: none;
  }
  /* Idle: no thumb (the full-height thumb overflow:scroll would otherwise draw
     goes invisible; its box still reserves the channel, so no layout shift). */
  .vf-scroll[data-overflow-y='false']::-webkit-scrollbar-thumb:vertical,
  .vf-scroll[data-overflow-x='false']::-webkit-scrollbar-thumb:horizontal {
    background: transparent;
    border: 0;
  }
  /* Idle: no arrow buttons — they reappear (single arrow per end) on overflow. */
  .vf-scroll[data-overflow-y='false']::-webkit-scrollbar-button:vertical,
  .vf-scroll[data-overflow-x='false']::-webkit-scrollbar-button:horizontal {
    display: none;
  }

  /* Firefox (no ::-webkit-scrollbar): approximate with scrollbar-color, which
     takes two flat colors — no dither tile, no thumb border. The track default
     is the dither's own average tone: the tile is 2 black cells in 8, so 25%
     black over white ≈ #c0c0c0 (the gray already in the palette as
     --vf-disabled). That reads as the trough does in WebKit while keeping the
     white thumb legible against it — a white track would render the white thumb
     invisible, and the previous bare #808080 was both twice as dark as the
     dither and the one un-tokenized color literal in this file. */
  @supports not selector(::-webkit-scrollbar) {
    .vf-scroll {
      scrollbar-width: auto;
      scrollbar-color: var(--vf-scrollbar-thumb, #ffffff)
        var(--vf-scrollbar-track, #c0c0c0);
    }
  }
`
