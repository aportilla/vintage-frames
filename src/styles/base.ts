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
 * Focus ring for non-text controls. Apply to the focusable element:
 *   .control:focus-visible { ... }
 * or compose this class name onto it.
 */
export const vfFocus = css`
  .vf-focus:focus-visible {
    outline: var(--vf-focus-outline, 1px dotted #000);
    outline-offset: calc(var(--vf-scale, 1) * 2px);
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
  /* Firefox (no ::-webkit-scrollbar): approximate with scrollbar-color. */
  @supports not selector(::-webkit-scrollbar) {
    .vf-scroll {
      scrollbar-width: auto;
      scrollbar-color: var(--vf-scrollbar-thumb, #ffffff) #808080;
    }
  }
`
