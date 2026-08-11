import { css } from 'lit'
import { vfDisplayDecls } from './display-face.js'

/**
 * The striped title bar shared by vf-window and vf-dialog: a fixed-height row
 * with a 1px bottom rule, and a centered white title patch that interrupts the
 * racing stripes running behind it.
 *
 * Apply `.vf-title-bar` to the bar and `.vf-title` to the title element, and
 * place a `.vf-stripes` layer (see {@link vfStripes}) as the bar's first child.
 *
 * Title geometry is stated in whole system px, traced from the InfiniteMac
 * reference: in the 17px interior (18px bar minus the rule) the cap band sits
 * on rows 4..12 — 4px of white above and below the 9px caps — with 7px of
 * white between the ink and the stripes on either side. The face puts the cap
 * band at rows 3..11 of its 16px line box (ascent 12, caps 9 on the
 * baseline), so the line box rides 1px below the interior top and lands the
 * caps exactly; letters carry a 1px side bearing, so 6px of padding makes the
 * traced 7. Flex-CENTERING either axis is what this recipe deliberately does
 * not do: 16 into 17 halves to a fraction, and (bar − patch)/2 is fractional
 * whenever the two widths' parities differ — half a system px off, which a
 * 3:1 display renders as ink one device px off the grid.
 *
 * The horizontal remainder can't be quantized statically (the patch width
 * follows the heading's text run), so the patch stays flex-centered and
 * `TitleCenterController` (src/chrome.ts) cancels the fraction through
 * `--vf-title-dx` — controller-owned, like the grid-snap offsets.
 *
 * The title's clearance for whatever else shares the bar is set per component
 * with `--vf-title-inset`: vf-dialog takes the 16px default (nothing but the
 * title is in there), vf-window sets 60px so an ellipsized title can't run
 * under its close/zoom widgets.
 *
 * `touch-action` is deliberately NOT declared here. vf-dialog's bar is always a
 * drag handle, vf-window's only when `[movable]` — suppressing touch scrolling
 * on a bar that can't be dragged would be a real behavior change, so each
 * component keeps that one declaration under its own selector.
 */
export const vfTitleBar = css`
  .vf-title-bar {
    position: relative;
    /* Inert unless the frame is a flex column (vf-window); on vf-dialog's plain
       block frame the shorthand simply doesn't apply. */
    flex: none;
    height: calc(var(--vf-scale, 1) * var(--vf-titlebar-height, 18px));
    border-bottom: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
    display: flex;
    /* flex-start, not center: the title states its own whole-pixel row (see
       the margin below); centering 16 into 17 would land it on a half. */
    align-items: flex-start;
    justify-content: center;
    overflow: hidden;
  }
  .vf-title {
    /* Chicago-style title (chrome); slotted body copy keeps the body face. */
    ${vfDisplayDecls}
    position: relative;
    z-index: 1;
    left: var(--vf-title-dx, 0px);
    /* The face's own 16px line box on interior rows 1..16: cap band lands on
       rows 4..12 (4px white above and below the 9px caps — the trace). The
       inherited ratio line-height would give 20px and center fractionally. */
    line-height: calc(var(--vf-scale, 1) * var(--vf-line-height-display, 16px));
    margin-top: calc(var(--vf-scale, 1) * 1px);
    /* 6px + the letters' own 1px side bearing = the traced 7px of white
       between ink and stripes. */
    padding: 0 calc(var(--vf-scale, 1) * 6px);
    max-width: calc(100% - var(--vf-scale, 1) * var(--vf-title-inset, 16px));
    background: var(--vf-white, #fff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

/**
 * The title-bar window widgets (close box left, zoom box right) shared by
 * `vf-window` and a `closable` `vf-dialog` — one recipe so the two components'
 * widgets are identical by construction, like the bar itself (the
 * `Windows/moveable modal dialog.png` reference draws the dialog's close box
 * exactly as the document window's: 11×11 at left:8px). Pair with the
 * templates in src/chrome.ts, which carry the matching class/part contract.
 *
 * Geometry is the standard 18px bar's; vf-window's utility variant overrides
 * the sizes under its own selector. Host-state rules (hiding widgets on an
 * inactive window) stay with the component — a dialog has no inactive state.
 */
export const vfWindowWidgets = css`
  .box {
    position: absolute;
    /* 11×11 box with 3px of clear white above and below it (title-bar
       interior is 17px: 3 + 11 + 3). See SPEC §5 vf-window. */
    top: calc(var(--vf-scale, 1) * 3px);
    z-index: 1;
    width: calc(var(--vf-scale, 1) * 11px);
    height: calc(var(--vf-scale, 1) * 11px);
    padding: 0;
    margin: 0;
    border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
    background: var(--vf-white, #ffffff);
    /* A 1px white patch ring that interrupts the stripes around the
       box (no bevel — flat 1-bit), same buffer the stripes keep from the
       frame edges. --vf-widget-ring is internal geometry, not a theming
       knob: vf-window's utility variant widens it to 2px, the clearance
       the windoid sheet cuts into its dither. */
    box-shadow: 0 0 0 calc(var(--vf-scale, 1) * var(--vf-widget-ring, 1px))
      var(--vf-white, #ffffff);
    font: inherit;
    cursor: var(--vf-cursor, default);
    -webkit-appearance: none;
    appearance: none;
  }
  .close {
    left: calc(var(--vf-scale, 1) * 8px);
  }
  .zoom {
    right: calc(var(--vf-scale, 1) * 8px);
  }
  /* Pressed box (close AND zoom): the interior fills with the classic
     radiating "go-away" sunburst — black 1-bit spokes on the white face
     (4 orthogonal 3px spokes + 4 diagonal 2px ones around an empty center),
     traced pixel-for-pixel from the UI kit's close-button-active-state
     sprite. Both widgets flash the identical graphic while pressed. That
     sprite is the whole 11×11 box; its outer ring is this element's own 1px
     border, so the SVG draws just the 9×9 interior into the padding box. */
  .box:active {
    background-color: var(--vf-white, #ffffff);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9'%3E%3Cpath d='M4 0h1v1h-1zM1 1h1v1h-1zM4 1h1v1h-1zM7 1h1v1h-1zM2 2h1v1h-1zM4 2h1v1h-1zM6 2h1v1h-1zM0 4h3v1h-3zM6 4h3v1h-3zM2 6h1v1h-1zM4 6h1v1h-1zM6 6h1v1h-1zM1 7h1v1h-1zM4 7h1v1h-1zM7 7h1v1h-1zM4 8h1v1h-1z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    background-size: calc(var(--vf-scale, 1) * 9px) calc(var(--vf-scale, 1) * 9px);
  }
  .zoom::after {
    content: '';
    position: absolute;
    /* A small box nested in the TOP-LEFT corner of the widget (classic
       System 7 zoom box). It shares the widget's own top and left border, so
       only its right and bottom edges are drawn: a 6×6 box anchored at the
       padding-box origin whose 1px right/bottom borders land the vertical at
       sprite col 6 and the horizontal at row 6. Traced from the UI kit
       zoom-button rest sprite. */
    top: 0;
    left: 0;
    width: calc(var(--vf-scale, 1) * 6px);
    height: calc(var(--vf-scale, 1) * 6px);
    border-right: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
    border-bottom: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
  }
  /* While pressed the zoom box shows the same sunburst as the close box, so
     its inner detail square gives way to it. */
  .zoom:active::after {
    display: none;
  }
  /* Forced colors: everything the widget draws is already token-routed —
     Canvas face, CanvasText border — but its white patch ring is a
     box-shadow, which forced colors never paints, leaving the box pressed
     against the (rescued — see vfStripes) stripes. forced-color-adjust: none
     turns the widget's own paint back on; with the tokens remapped it still
     renders entirely in the user's pair. The one literal left is the pressed
     sunburst tile (url() images are preserved with their black ink), so that
     repaints as a mask over the ink token — into the padding box, where the
     sprite's 9×9 interior already draws. */
  @media (forced-colors: active) {
    .box {
      forced-color-adjust: none;
    }
    .box:active {
      background-image: none;
    }
    .box:active::before {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--vf-black, #000000);
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9'%3E%3Cpath d='M4 0h1v1h-1zM1 1h1v1h-1zM4 1h1v1h-1zM7 1h1v1h-1zM2 2h1v1h-1zM4 2h1v1h-1zM6 2h1v1h-1zM0 4h3v1h-3zM6 4h3v1h-3zM2 6h1v1h-1zM4 6h1v1h-1zM6 6h1v1h-1zM1 7h1v1h-1zM4 7h1v1h-1zM7 7h1v1h-1zM4 8h1v1h-1z'/%3E%3C/svg%3E");
      mask-repeat: no-repeat;
      mask-position: center;
      mask-size: calc(var(--vf-scale, 1) * 9px) calc(var(--vf-scale, 1) * 9px);
    }
  }
`
