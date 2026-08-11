import { css, unsafeCSS } from 'lit'
import { tileImage, tileRects, vfTileMaskSize, type TileRect } from './tile.js'

/**
 * The trough's 25% lattice — a 4×2-system-px motif with a dot at (0,0) and
 * (2,1), traced from the UI kit's "Scroll bg" sprite — stated once as rect
 * data. The DOM trough renders it as a whole-surface raster
 * (`tileRaster`, written by `ScrollRailController` — 1-bit at every scale,
 * zoom-minted ones included); the SVG span tile below is the forced-colors
 * mask, which repaints the same art in the remapped ink token.
 */
export const TROUGH_MOTIF_X = 4
export const TROUGH_MOTIF_Y = 2
export const TROUGH_RECTS: readonly TileRect[] = [
  [0, 0, 1, 1],
  [2, 1, 1, 1],
]
const TROUGH_TILE = tileImage(
  TROUGH_MOTIF_X,
  TROUGH_MOTIF_Y,
  tileRects(TROUGH_RECTS)
)

/**
 * System 7 scroll rails, drawn by the kit as ordinary shadow DOM — the skin
 * for the subtree `renderScrollRail()` (src/scroll-rail.ts) produces. The
 * native scrollbar is hidden, never the native scrolling: the scroller keeps
 * real `overflow` scrolling (wheel, trackpad momentum, keyboard, touch and
 * AT scrolling all stay the platform's), and the rail is synced to it by
 * `ScrollRailController`.
 *
 * Why DOM and not the `::-webkit-scrollbar` skin this replaces: the engine
 * owns themed-scrollbar geometry and quantizes it to whole CSS px — WebKit
 * painted the rail one device pixel adrift (or a CSS px short) whenever the
 * scroller's box edges or width left the whole-CSS-px lattice, which the
 * kit's own odd-system-px insets produce constantly at scale 1.5. A DOM rail
 * is kit art: subpixel layout device-snaps at paint like every other element,
 * and the whole defect class is unrepresentable. It also renders identically
 * in every engine (Firefox included), is assertable headless, and lets the
 * trough adopt the exact tile raster the other dithers use.
 *
 * Geometry (system px) — the classic 16px cell, of which the outermost line
 * is the component's own 1px frame: the rail element is the 15 inside it —
 * a 1px divider on the content side (the rail's own border) plus the 14px
 * channel. Arrow cells are 15 long (14 interior + the 1px divider facing the
 * track); their glyphs are the 16-unit sprites windowed to the 14×14
 * interior (`viewBox="1 1 14 14"`), since the sprite's outer ring is exactly
 * the frame/divider lines the borders draw. The thumb is a fixed 16px white
 * box spanning the channel, its border reading as inset 1px from each
 * channel rail over its extent. The component supplies the outer frame as a
 * real border and lays the rail out as a sibling of the scroller — AFTER it,
 * so the state selectors below can reach the rail from the scroller's
 * attributes.
 *
 * States, keyed off the attributes `ScrollStateController` writes on the
 * scroller (now styling real elements, so there is no scrollbar-pseudo
 * re-resolution caveat in any engine):
 * - `data-overflow-{x,y}="false"` — idle rail: arrows stay drawn on a white
 *   channel, divider stays, no dither, no thumb — System 7 drew an active
 *   window's no-overflow bar as arrows on an empty channel, and a scroller
 *   outside a window always counts as active;
 * - `data-window-inactive` — both axes blanked to the bare rail, arrows
 *   included, regardless of overflow (the HIG's inactive-window treatment);
 * - `data-degenerate` (written by `ScrollRailController` when the track is
 *   too short) — `"thumb"` drops the thumb, `"rail"` drops the trough and
 *   arrows too, as the classic Control Manager did.
 * A rail used without the controllers carries no such attributes, so none of
 * these rules match and the full skin renders — the managed behavior stays
 * strictly opt-in.
 *
 * FORCED COLORS: the rails, thumb, channel and frame land on the user's pair
 * through the vfBase token remap like every other element. The arrows are
 * inline `currentColor` SVG now, so they re-ink with the palette (the old
 * `::-webkit-scrollbar` skin's one genuine residual — mask-image is ignored
 * on scrollbar pseudos — dies here). The trough raster keeps literal ink, so
 * it is hidden and the trough repaints as the ink token masked by the same
 * art (the vfDots idiom; the span mask keeps the zoom caveat every masked
 * surface has, an accepted residual).
 */
export const vfScrollRail = css`
  /* Hide the native bar, keep the native scrolling. Both lines ship:
     scrollbar-width reaches Chromium 121+/Firefox/Safari 18.2+, the pseudo
     covers older WebKit — the last scrollbar pseudo left in the kit. */
  .vf-scroll {
    scrollbar-width: none;
  }
  .vf-scroll::-webkit-scrollbar {
    display: none;
  }

  /* The rail: a grid of [arrow | track | arrow] along its axis, sized to the
     15px inside the component frame (1px divider + 14px channel). The rail
     always uses the default arrow pointer, never the host's cursor —
     otherwise a textarea's text I-beam bleeds over the reserved rail. */
  .vf-rail {
    display: grid;
    background: var(--vf-white, #fff);
    cursor: var(--vf-cursor, default);
    touch-action: none;
  }
  .vf-rail--vertical {
    width: calc(var(--vf-scale, 1) * 15px);
    grid-template-rows:
      calc(var(--vf-scale, 1) * 15px)
      1fr
      calc(var(--vf-scale, 1) * 15px);
    border-left: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-rail--horizontal {
    height: calc(var(--vf-scale, 1) * 15px);
    grid-template-columns:
      calc(var(--vf-scale, 1) * 15px)
      1fr
      calc(var(--vf-scale, 1) * 15px);
    border-top: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  /* Explicit placement, so hiding the arrows (inactive-window/degenerate
     states) never reflows the track into an arrow cell — its box holds still
     through every state flip. */
  .vf-rail--vertical .vf-rail-button--decrement {
    grid-row: 1;
  }
  .vf-rail--vertical .vf-rail-track {
    grid-row: 2;
  }
  .vf-rail--vertical .vf-rail-button--increment {
    grid-row: 3;
  }
  .vf-rail--horizontal .vf-rail-button--decrement {
    grid-column: 1;
  }
  .vf-rail--horizontal .vf-rail-track {
    grid-column: 2;
  }
  .vf-rail--horizontal .vf-rail-button--increment {
    grid-column: 3;
  }

  /* Arrow cells: white boxes carrying only the 1px divider that faces the
     track — the frame edges are the component's border, the content edge the
     rail's own divider — so no line ever doubles to 2px. Each cell's padding
     box is by construction the sprite's 14×14 interior, wherever the cell
     sits (flush to the frame, or against the corner cell), so the glyph
     lands at the padding origin with no per-variant offsets. */
  .vf-rail-button {
    display: grid;
    place-items: start;
    background: var(--vf-white, #fff);
    overflow: hidden;
  }
  .vf-rail--vertical .vf-rail-button--decrement {
    border-bottom: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-rail--vertical .vf-rail-button--increment {
    border-top: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-rail--horizontal .vf-rail-button--decrement {
    border-right: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-rail--horizontal .vf-rail-button--increment {
    border-left: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-rail-arrow {
    display: block;
    grid-area: 1 / 1;
    width: calc(var(--vf-scale, 1) * 14px);
    height: calc(var(--vf-scale, 1) * 14px);
  }
  /* Hollow at rest, solid while pressed (ScrollRailController holds
     data-pressed on the button for the press's whole extent, auto-repeat
     included). */
  .vf-rail-arrow--fill,
  .vf-rail-button[data-pressed] .vf-rail-arrow--rest {
    display: none;
  }
  .vf-rail-button[data-pressed] .vf-rail-arrow--fill {
    display: block;
  }

  /* The track between the arrows: the trough (dither) fills it, the thumb
     travels it. */
  .vf-rail-track {
    position: relative;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }
  /* The trough: the token base color under the dither, clipping the raster's
     overdraw (the art is ceiled up to whole motifs of the measured track). */
  .vf-rail-trough {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background-color: var(--vf-scrollbar-track, var(--vf-white, #fff));
    pointer-events: none;
  }
  /* The dither raster ScrollRailController sizes and writes — one image px
     per system px, magnified nearest-neighbor (the vf-img idiom), so the
     lattice is 1-bit at every scale. */
  .vf-rail-trough-art {
    position: absolute;
    top: 0;
    left: 0;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    image-rendering: pixelated;
  }
  /* The fixed System 7 thumb (never proportional): a white 16px box spanning
     the channel. Its border reads as inset 1px from each channel rail — the
     divider and the frame — over its extent; the controller writes its
     travel as a whole-system-px translate. */
  .vf-rail-thumb {
    position: absolute;
    top: 0;
    left: 0;
    background: var(--vf-scrollbar-thumb, #ffffff);
    border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }
  .vf-rail--vertical .vf-rail-thumb {
    width: 100%;
    height: calc(var(--vf-scale, 1) * 16px);
  }
  .vf-rail--horizontal .vf-rail-thumb {
    height: 100%;
    width: calc(var(--vf-scale, 1) * 16px);
  }

  /* The both-axes corner cell. It supplies the two interior dividers
     (against the vertical increment arrow above and the horizontal one
     beside it) that those buttons leave to it; a resizable window's grow box
     lands exactly over it. */
  .vf-rail-corner {
    background: var(--vf-white, #fff);
    border-top: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
    border-left: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
  }

  /* ── Always-a-rail (driven by ScrollStateController) ─────────────────────
     Idle axis: the reserved rail keeps its arrow buttons — System 7 drew
     them on any bar in an active window — while the dither and thumb appear
     only once that axis actually overflows, leaving arrows on a bare white
     channel. The drawn arrows are inert (ScrollRailController's press guard):
     there is nothing to scroll. */
  .vf-scroll[data-overflow-y='false'] ~ .vf-rail--vertical .vf-rail-trough,
  .vf-scroll[data-overflow-y='false'] ~ .vf-rail--vertical .vf-rail-thumb,
  .vf-scroll[data-overflow-x='false'] ~ .vf-rail--horizontal .vf-rail-trough,
  .vf-scroll[data-overflow-x='false'] ~ .vf-rail--horizontal .vf-rail-thumb {
    display: none;
  }
  /* Inactive window: both axes blanked to the bare rail — arrows included,
     unlike the idle state — regardless of overflow: a window that isn't
     frontmost must not display interactive scroll UX (HIG; System 7 blanked
     deactivated scrollbars to the empty rail). */
  .vf-scroll[data-window-inactive] ~ .vf-rail .vf-rail-trough,
  .vf-scroll[data-window-inactive] ~ .vf-rail .vf-rail-thumb,
  .vf-scroll[data-window-inactive] ~ .vf-rail .vf-rail-button {
    display: none;
  }

  /* ── Degenerate tracks (written by ScrollRailController) ─────────────────
     A track shorter than the 16px thumb drops the thumb; a rail too short
     for its arrow cells drops the trough and arrows too and reads as the
     bare white rail — the classic Control Manager's decision table. */
  .vf-rail[data-degenerate] .vf-rail-thumb {
    display: none;
  }
  .vf-rail[data-degenerate='rail'] .vf-rail-trough,
  .vf-rail[data-degenerate='rail'] .vf-rail-button {
    display: none;
  }

  /* Forced colors: the raster keeps literal ink, so it hides and the trough
     repaints as the remapped ink token masked by the same art (the vfDots
     idiom — and like every masked tile, the span mask keeps the zoom
     caveat). Everything else re-inks through the vfBase token remap; the
     arrows are currentColor SVG and follow the palette by themselves. */
  @media (forced-colors: active) {
    .vf-rail-trough {
      background-color: var(--vf-black, #000);
      mask-image: ${unsafeCSS(TROUGH_TILE)};
      ${vfTileMaskSize(TROUGH_MOTIF_X, TROUGH_MOTIF_Y)}
    }
    .vf-rail-trough-art {
      display: none;
    }
  }
`
