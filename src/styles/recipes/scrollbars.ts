import { css } from 'lit'
import { vfTileSize } from './tile.js'

/**
 * System 7 scrollbars. Add the `vf-scroll` class to a BORDERLESS element with
 * `overflow: auto`/`scroll` that fills its component's frame box, and paint
 * the component's 1px frame over it with a `.vf-scroll-frame` element (a later
 * sibling of the scroller, inside a positioned wrapper). The scrollbar then
 * sits flush with the frame box's edges, and the overlay draws the bar's
 * outer line.
 *
 * Why the frame is an overlay and not a border on the scroller: WebKit pins a
 * scroller's scrollbar rect to whole CSS pixels. A scroller carrying the 1px
 * frame border anchors its scrollbar at the padding edge — a half CSS pixel
 * at dpr 2, where 1 system px is 1.5 CSS px — and Safari paints the entire
 * rail one device pixel adrift: a gap between divider and frame, the frame
 * line thinned, arrow cells off the grid. Borderless, every scrollbar anchor
 * is a whole CSS px at every integer dpr, and Safari renders the rail
 * bit-exactly. (Chromium doesn't snap scrollbar rects and renders both
 * structures identically.)
 *
 * The skin is the classic 16px cell: the outermost 1px column/row runs under
 * the frame overlay, leaving a 1px interior rail plus the 14px channel
 * visible. The trough is a loose 1-bit dot-dither (25% density, traced from
 * the UI kit's "Scroll bg" sprite), the thumb a white box, and the arrow
 * buttons boxed inline-SVG glyphs (one at each end) centered on the 14px
 * visible face. Every element omits its border on the edge the frame overlay
 * covers, so the two never double into a 2px stroke. Firefox falls back to
 * `scrollbar-color` (its native bar simply runs under the overlay's edge).
 *
 * Shared by `vf-scroll-area`, `vf-list` and `vf-text-area` so they never
 * drift.
 *
 * FORCED COLORS (measured under CDP emulation, light and dark themes): author
 * scrollbar styles ARE still consulted, with color-valued properties forced —
 * so the rails, thumb border and channel land on the user's pair by
 * themselves (system colors set via the vfBase token remap render
 * identically). The trough dither self-resolves: its literal-black url() tile
 * is preserved, correct on a light theme and invisible against the forced
 * Canvas channel on a dark one — a clean channel, the idle-rail look. The one
 * genuine residual is the ARROW SPRITES: url() images keep their literal
 * black ink, and mask-image is IGNORED on ::-webkit-scrollbar pseudos (also
 * measured), so the vf-grid re-inking idiom has no purchase here. On a dark
 * theme the arrow buttons render as empty bordered boxes; they keep working,
 * and dropping the sprites would draw exactly the same empty box on light
 * themes too, so they stay. */
export const vfScrollbars = css`
  /* The full 16px cell. The outer 1px along the component frame is covered by
     the .vf-scroll-frame overlay, so the visible bar is the 1px interior rail
     plus the 14px channel. */
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
    cursor: var(--vf-cursor, default);
  }
  /* Loose 1-bit dither: a 25%-density dot lattice — dotted vertical lines two
     pixels apart, each column phase-shifted by one row. A 4×2 tile with a dot
     at (0,0) and (2,1) reproduces the sprite exactly, far airier than a 50%
     checkerboard. */
  .vf-scroll::-webkit-scrollbar-track {
    background-color: var(--vf-white, #fff);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='2'%3E%3Crect width='1' height='1'/%3E%3Crect x='2' y='1' width='1' height='1'/%3E%3C/svg%3E");
    ${vfTileSize(1, 4, 2)}
  }
  /* Interior rail dividing the content from the scrollbar channel. The outer
     edges are drawn by the .vf-scroll-frame overlay (see the border trims
     below). */
  .vf-scroll::-webkit-scrollbar-track:vertical {
    border-left: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-scroll::-webkit-scrollbar-track:horizontal {
    border-top: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  /* The thumb keeps a 1px border across the channel (its short sides) and a
     2px border on each long side: System 7 insets the thumb one pixel from the
     channel rails, so each long side reads as a doubled 1px line — the rail
     (or frame) plus the thumb's own border — but only over the thumb's extent;
     the rail stays 1px above/below it. On the rail side the extra inner pixel
     draws over the continuous rail. On the frame side the OUTER pixel runs
     under the .vf-scroll-frame overlay's line and the inner one is the visible
     inset edge — at 1px that side's border would sit entirely under the
     overlay and the inset line would vanish. */
  .vf-scroll::-webkit-scrollbar-thumb {
    background: var(--vf-scrollbar-thumb, #ffffff);
    border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-scroll::-webkit-scrollbar-thumb:vertical {
    border-left-width: calc(var(--vf-scale, 1) * 2px);
    border-right-width: calc(var(--vf-scale, 1) * 2px);
  }
  .vf-scroll::-webkit-scrollbar-thumb:horizontal {
    border-top-width: calc(var(--vf-scale, 1) * 2px);
    border-bottom-width: calc(var(--vf-scale, 1) * 2px);
  }
  /* The corner only exists when both scrollbars show. It supplies the two
     interior dividers (against the vertical down-arrow above and the horizontal
     right-arrow beside it) that those buttons drop as their container-facing
     edges; its right/bottom edges run under the .vf-scroll-frame overlay. */
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
  /* Nest the arrow boxes cleanly under the frame: any button edge the
     .vf-scroll-frame overlay covers is drawn by the overlay, not the button,
     so the two never double into a 2px stroke. The button's inner edges
     (dividers against the track, and the rail-side edge) stay. */
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

  /* ── Inactive-window rails (driven by ScrollStateController) ─────────────
     The HIG: a window that isn't frontmost must not display interactive
     scroll UX. System 7 blanked a deactivated window's scrollbars back to
     the empty rail — the same placeholder as the idle state above, applied
     to BOTH axes regardless of overflow, so only the white channel and its
     divider stay. The controller toggles data-window-inactive
     (presence-only) from the nearest vf-window ancestor's active state;
     a scroller outside any window never carries it.

     FUTURE: when @container style() queries reach baseline support, this
     signal could go declarative — vf-window cascades a custom property under
     :host(:not([active])) (custom properties already cross every shadow
     boundary here, as --vf-scale proves) and these rules gate on
     @container style(--vf-window-active: false) instead of the attribute,
     retiring the controller's MutationObserver and composed-tree walk. The
     WebKit rebuild at each flip must survive that migration: Safari resolves
     scrollbar pseudo styles only when a scrollbar is (re)created or its
     scroller relays out, not when a selector starts matching — however the
     selector is expressed. See the matching note in src/scroll-state.ts. */
  .vf-scroll[data-window-inactive]::-webkit-scrollbar-track {
    background-image: none;
  }
  .vf-scroll[data-window-inactive]::-webkit-scrollbar-thumb {
    background: transparent;
    border: 0;
  }
  .vf-scroll[data-window-inactive]::-webkit-scrollbar-button {
    display: none;
  }

  /* The component's 1px frame, painted OVER the borderless scroller (see the
     recipe comment for why the scroller itself must not carry it): a later
     sibling of the scroller inside a positioned wrapper, so it stacks above
     the scrollbar and rides the wrapper's grid-snap offset with it. */
  .vf-scroll-frame {
    position: absolute;
    inset: 0;
    border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
    pointer-events: none;
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
    /* Inactive window: thumb and track both go white, so the bar reads as the
       blank rail. Unlike the per-axis idle state (which scrollbar-color can't
       express), window deactivation blanks both axes at once, so Firefox can
       follow it. */
    .vf-scroll[data-window-inactive] {
      scrollbar-color: var(--vf-white, #fff) var(--vf-white, #fff);
    }
  }
`
