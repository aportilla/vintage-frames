import { html, css, LitElement, nothing, type PropertyValues } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import {
  PlacementController,
  VfPositioned,
  placementIn,
  warnMovableContract,
} from '../position.js'
import type { PlacementBounds } from '../position.js'
import { VfSized } from '../size.js'
import {
  vfBase,
  vfStripes,
  vfDots,
  vfFocus,
  vfChromeFrame,
  vfRule,
  vfTitleBar,
  vfWindowWidgets,
} from '../styles/base.js'
import { DOT_MOTIF, DOT_RECTS, DOT_SPAN } from '../styles/recipes/pattern.js'
import {
  TileRasterCache,
  patternOverride,
  tileGrid,
  vfTileGrid,
} from '../tile-grid.js'
import {
  ScaleController,
  effectiveScale,
  snapSys,
  sysLength,
  toSysExact,
} from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { DragController } from '../drag.js'
import { DocumentListenersController } from '../document-listeners.js'
import {
  chromeTitleBar,
  TitleCenterController,
  widgetLabel,
  closeBox,
  zoomBox,
} from '../chrome.js'
import { emit } from '../events.js'
import {
  prefersReducedMotion,
  windowRectFraction,
  WINDOW_RECT_STEP_MS,
  WINDOW_RECT_STEPS,
  WINDOW_RECTS_VISIBLE,
} from '../motion.js'
import { paintSelectionRect, penPhase, xorPenCanvas } from '../open-art.js'
import './vf-scroll-area.js'
import type { VfScrollArea } from './vf-scroll-area.js'

/** A box in viewport CSS px. A `DOMRect` is one; a zero-size box is a point. */
export interface VfViewportBox {
  left: number
  top: number
  right: number
  bottom: number
}

/** The options of {@link VfWindow.show}. */
export interface VfWindowShowOptions {
  /**
   * The box the window opens from, in viewport CSS px — an icon's
   * `cellRect()`, a button's `getBoundingClientRect()`, any rect. Unset, the
   * window shows at once.
   */
  from?: VfViewportBox | null
}

/** The options of {@link VfWindow.hide}. */
export interface VfWindowHideOptions {
  /**
   * The box the window closes to, in viewport CSS px — an icon's
   * `cellRect()`, a button's `getBoundingClientRect()`, any rect. Unset, the
   * window hides at once.
   */
  to?: VfViewportBox | null
}

/** The outline an outline drag moves, on the desktop's drag surface. */
interface WindowOutline {
  canvas: HTMLCanvasElement
  /** The window's offset from the surface at the press, whole system px. */
  base: { x: number; y: number }
  width: number
  height: number
  /** The checker phase last painted, so an unchanged parity paints nothing. */
  phase: number
}

/** An outline drag (`outline-drag`), from the press to its end. */
interface OutlineDrag {
  /** The seeded origin, system px in the container. */
  origin: { x: number; y: number }
  /** The outline, drawn around the window on the press. */
  outline: WindowOutline
  /**
   * Where the release writes the window: the last step's clamped landing,
   * or null while no step has come.
   */
  landing: { x: number; y: number } | null
}

/** A run's rects: their canvases on the drag surface, and their animations. */
interface Rects {
  canvases: HTMLCanvasElement[]
  animations: Animation[]
}

/** A `show({ from })` or `hide({ to })` in flight, from the call until its rects are done. */
interface RectsRun {
  /** A `hide()`: the rects close in on the box, and a removal leaves them running. */
  closing: boolean
  /** The rects' animations, once they run — empty until then. */
  animations: Animation[]
}

interface ResizeState {
  pointerId: number
  /** Press point, in CSS px — the unit pointer events speak. */
  startX: number
  startY: number
  /** The box at press time, in SYSTEM px — the unit the size is stored in. */
  baseWidth: number
  baseHeight: number
  /**
   * A grow-box write is waiting for its update to flush — `updated()` fires
   * the stream `vf-resize` then, after the new box is applied to layout.
   */
  emitPending: boolean
  /** Whether the gesture changed the size at all — gates the commit event. */
  resized: boolean
}

/**
 * The sizeRect's default floors, in system px: a window smaller than this
 * can't be worked. `min-width`/`min-height` replace them per axis.
 */
const MIN_WIDTH = 80
const MIN_HEIGHT = 54

/**
 * One axis of the sizeRect clamp. The max is applied last, so where the two
 * cross the max wins — see {@link VfWindow.minWidth}.
 */
function clampAxis(
  value: number,
  min: number,
  max: number | null | undefined
): number {
  const floored = Math.max(min, value)
  return max == null ? floored : Math.min(max, floored)
}

/**
 * How much of a dragged window must stay inside its parent, in system px —
 * enough of the title bar to grab it back by.
 */
const KEEP_GRABBABLE = 24

/** The chrome frame's border on each side of the title bar, in system px. */
const FRAME_BORDER = 1

/**
 * The windoid dots layer's height in system px: the 12px utility bar minus
 * its 2px inset top and bottom (`vfDots`).
 */
const DOTS_LAYER_HEIGHT = 8

/**
 * `<vf-window>` — the System 7 desktop-window shell.
 *
 * Striped title bar with optional close box (left) and zoom box (right), a
 * solid-white frame with a hard offset shadow, an optional grow box for
 * resizing, optional edge scroll rails (`scrollbars`), and the slim windoid
 * chrome (`variant="utility"`). The HIG's window archetypes are parameter
 * recipes over this shell rather than fixed anatomies — the component enables
 * HIG compliance, it doesn't enforce it (see docs/LAYOUT.md "Window archetypes"):
 * the full document window is `closable zoomable movable resizable
 * scrollbars="both"`, a modeless dialog box is `closable movable`, a utility
 * window is `variant="utility" movable`. Place inside `<vf-desktop>` to get
 * click-to-front stacking and automatic `active` management (utility windows
 * float above the document tier).
 *
 * Every recipe also declares `width` AND `height` ({@link VfSized}), in whole
 * system px — the art's own unit, so the window keeps its proportions to the
 * chrome inside it at every display density (a CSS-px size stays put while
 * the components in it triple). A window is a fixed box in both axes, the way
 * the WIND resource carried it: left to layout it takes whatever its
 * container or content hands it, which is how a title bar ends up wider than
 * the screen or a dialog reflows as it moves — and a window that grows with
 * its body is one the user can neither predict nor (via the grow box) own.
 * Content taller than the declared box is clipped at the frame the way the
 * classic content region was; `scrollbars` lets the user reach the rest.
 * Unset, the window still renders — normal block layout, as before — and
 * says so once in the console.
 *
 * **Opening from a rect.** {@link show} clears `hidden`, and given `from` — a
 * box in viewport CSS px, an icon's `cellRect()` or a button's rect — opens
 * the window from it: dotted rectangles grow from that box toward the
 * window's frame, four on screen at a time, bunched at the box and opening
 * out toward the window, drawn with the icon drag outline's XOR pen on the
 * desktop's drag surface; the window draws once they have drained, eighteen
 * steps later. Until then it matches `:state(opening)` and paints nothing —
 * still laid out, focusable and a hit target, so a page can place it, raise
 * it and focus into it at once, and a press finishes the rects and lands on
 * the window. Under `prefers-reduced-motion`, with no `vf-desktop` on its
 * path, or without `from`, the window shows at once.
 *
 * **Closing to a rect.** {@link hide} sets `hidden`, and given `to` closes
 * the window to it: the same rectangles run the other way, from where the
 * frame was in toward the box, the window gone from the first step. A press
 * finishes them, and removing the window leaves them running. Under
 * `prefers-reduced-motion`, with no `vf-desktop` on its path, or without
 * `to`, the window hides at once. The window knows nothing about icons:
 * `from` and `to` are any rect.
 *
 * **Dragging as an outline.** A `movable` window moves live under the
 * pointer. With `outline-drag` a press on the title bar draws a dotted
 * outline around the window on the desktop's drag surface instead, with the
 * same pen; the drag moves the outline, held where the window can land, and
 * the window moves there on the release. Escape cancels.
 *
 * @slot - Default slot: window body content.
 * @slot header - Optional header content — a band between the title bar and
 *   the body, the full width of the window (the Finder window's header
 *   line): a white interior over a 1px rule, no inset of its own, a
 *   positioning anchor for placed children. As tall as its content unless
 *   `header-height` states it. Under `scrollbars` the vertical rail begins
 *   below it, so the header spans the rail's column. Takes no space until
 *   populated.
 * @slot status - Optional status-bar content — the classic bottom readout
 *   strip ("40px x 40px"): a 1px rule over a 15px white band under the body,
 *   body-face text on its native line. Takes no space until populated; a
 *   `resizable` window's grow box sits flush in its right end.
 * @csspart frame - The outer chrome frame.
 * @csspart title-bar - The striped (or dithered) title bar.
 * @csspart title - The centered title patch (hidden on the utility bar).
 * @csspart close-box - The close widget (left).
 * @csspart zoom-box - The zoom widget (right).
 * @csspart body - The content area.
 * @csspart header - The header strip between the title bar and the body
 *   (when the `header` slot is populated).
 * @csspart status-bar - The bottom status strip (when the `status` slot is
 *   populated).
 * @csspart grow-box - The resize widget (bottom-right, when `resizable`).
 * @csspart viewport - The built-in scroll area's viewport (when `scrollbars`;
 *   re-exported from vf-scroll-area).
 * @fires vf-close - Close box clicked. Detail `{ reason: 'close' }` (shape-
 *   compatible with vf-dialog's `vf-close`). The window does NOT
 *   remove itself; the consumer decides what closing means.
 * @fires vf-zoom - Zoom box clicked. Detail `{}`.
 * @fires vf-resize - The grow box resized the window. Detail `{ width,
 *   height, commit }`, sizes in whole system px: one event per size the drag
 *   writes (`commit: false`), fired after the new box is applied so a handler
 *   that measures reads the resized layout, then a final `commit: true` as
 *   the gesture settles — only when it changed the size. Fired by the gesture
 *   alone: a programmatic `width`/`height` write fires nothing, the way a
 *   value set fires no `vf-change`.
 * @cssprop --vf-dots-pattern - the windoid bar's dot-grid dither — a 2×2 motif,
 *   one black pixel at its origin, on a 30-system-px tile (`vfDots`; override
 *   the whole tile like `--vf-desktop-pattern` — consumer art renders as a
 *   placed tile grid at that same geometry)
 * @cssprop --vf-titlebar-height - window/dialog title bars
 * @cssprop [--vf-titlebar-height-utility=12px] - the slim
 *   `vf-window[variant="utility"]` (windoid) bar — 11px interior + 1px bottom
 *   rule, traced from `Windows/utility-window.png`
 * @cssprop [--vf-status-bar-height=15px] - the status strip: 1px rule + 14px
 *   interior — the grow box's own height, so the two compose flush
 * @cssprop [--vf-line-height=12px] - the body face's native line, which the
 *   status strip's text rides (whole-pixel centered in the 14px interior)
 */
@vfElement('vf-window')
export class VfWindow extends VfSized(VfPositioned(LitElement)) {
  static override styles = [
    vfBase,
    vfStripes,
    vfDots,
    vfTileGrid,
    vfFocus,
    vfChromeFrame,
    vfRule,
    vfTitleBar,
    vfWindowWidgets,
    css`
      :host {
        display: block;
        position: relative;
        --vf-surface: var(--vf-white, #ffffff);
      }
      /* Opening from a rect (show): laid out, focusable and a hit target,
         painting nothing until the rects have drained. Opacity rather than
         visibility, which would drop focus and hand a press to whatever is
         under the window. A rule of its own, never in an :is() list: an
         engine that cannot parse :state() drops the whole list. */
      :host(:state(opening)) {
        opacity: 0;
      }
      /* Skin from vfChromeFrame; the layout is the window's own — a full-size
         flex column so the body takes the slack the title bar and grow box
         don't. */
      .vf-frame {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }

      /* --- Title bar ------------------------------------------------- */
      /* Clearance for the close/zoom widgets either side of the title patch:
         8px offset + an 11px box + its 1px white patch ring, doubled, rounded
         up to the classic 30-per-side. Not a theming knob — it's the widgets'
         own geometry — so it's set on the element, like --vf-focus-offset. */
      .vf-title {
        --vf-title-inset: 60px;
      }
      :host([movable]) .vf-title-bar {
        touch-action: none;
      }
      :host(:not([active])) .vf-stripes,
      :host(:not([active])) .vf-dots {
        display: none;
      }
      /* Inactive window: the stripes go away and the widgets stop being
         drawn (see the widget rule below — they keep their tab stops), but
         the title text stays black — classic System 7 never grayed the
         title. */

      /* --- Window widgets (close / zoom boxes) ----------------------- */
      /* Skin from vfWindowWidgets (shared with vf-dialog); only the
         host-state rule is the window's own — a dialog has no inactive
         state, so blanking widgets with the stripes lives here.

         Blanked with transparent ink, NOT display/visibility: System 7 drew
         an inactive bar bare, and this reproduces exactly that — but the
         controls stay in the tree and the tab order, a modern affordance the
         kit adds (SPEC §1). A background window whose body holds nothing
         focusable (a static About window, the modeless-dialog recipe, a
         palette of labels) is otherwise unreachable by keyboard entirely:
         Tab must be able to land on "Close Bravo" so vf-desktop's focusin
         raise can activate the window — which repaints the widgets under
         the focus that just arrived. It also means deactivation never yanks
         a focused widget out of the tree, so focus can't be dropped to
         <body> by a click on another window. */
      :host(:not([active])) .box {
        border-color: transparent;
        background-color: transparent;
        box-shadow: none;
      }
      :host(:not([active])) .zoom::after {
        border-color: transparent;
      }

      /* --- Utility (windoid) variant --------------------------------- */
      /* The slim floating-window bar, traced from Windows/utility-window.png
         : 11px interior over the 1px rule
         (--vf-titlebar-height-utility: 12px), the vf-dots dither instead of
         stripes, and 7×7 widgets at left:7px / right:8px — the art really is
         asymmetric by that pixel. No title patch: the bar is two system px
         shorter than the display face's line box, so the heading feeds the
         widget labels instead (a consumer retheming a taller bar can re-show
         it through ::part(title)). */
      :host([variant='utility']) .vf-title-bar {
        height: calc(
          var(--vf-scale, 1) * var(--vf-titlebar-height-utility, 12px)
        );
      }
      :host([variant='utility']) .vf-title {
        display: none;
      }
      :host([variant='utility']) .box {
        /* 7×7 box with 2px of clear white above and below (bar interior is
           11px: 2 + 7 + 2). The patch ring stays 2px here where the striped
           bar's is 1px: the windoid sheet deliberately clears two px of
           dither beside its widgets — the flush dot grid lands a dot in the
           column adjacent to the box, and the art blanks it. A custom
           property rather than box-shadow so the
           inactive blanking rule above still wins the cascade. */
        --vf-widget-ring: 2px;
        top: calc(var(--vf-scale, 1) * 2px);
        width: calc(var(--vf-scale, 1) * 7px);
        height: calc(var(--vf-scale, 1) * 7px);
      }
      :host([variant='utility']) .close {
        left: calc(var(--vf-scale, 1) * 7px);
      }
      :host([variant='utility']) .zoom {
        right: calc(var(--vf-scale, 1) * 8px);
      }
      /* Pressed windoid widget: the whole box inverts — black interior under
         a white (invisible, over the patch ring) borderline — rather than the
         big bar's 9×9 sunburst, which cannot land whole on a 5×5 interior. */
      :host([variant='utility']) .box:active {
        border-color: var(--vf-white, #ffffff);
        background-color: var(--vf-black, #000000);
        background-image: none;
      }
      /* The nested zoom square, miniaturized: right/bottom edges land at
         sprite col/row 3 of the 7×7 box (padding col/row 2). */
      :host([variant='utility']) .zoom::after {
        width: calc(var(--vf-scale, 1) * 3px);
        height: calc(var(--vf-scale, 1) * 3px);
      }

      /* --- Body ------------------------------------------------------ */
      /* Clipped at the frame, the way the classic content region was: the
         window is a fixed box (width and height are both declared), so content
         taller than it is content the user reaches with the scrollbars
         parameter, not something that paints out over the desktop.

         What this deliberately does NOT clip is a control's drop-open panel.
         vf-select's list is position:fixed, computed from the control's rect,
         precisely so it escapes clipping ancestors (see vf-select.ts) — and it
         still escapes this one, because nothing between it and the viewport
         establishes a containing block for fixed descendants: the grid-snap
         correction is a position:relative left/top offset, never a transform
         (see grid-snap.ts, "Why an offset and not a transform"). So a popup
         opening near the bottom edge still runs past the window border, as it
         should. A vf-menu panel is anchored position:absolute and would clip —
         but a menu bar belongs to the desktop, not inside a window body. */
      .body {
        /* The positioning anchor for slotted children placed with top/left
           (src/position.ts): coordinates measure from the content region's
           corner — the frame's inner edge, below the title bar — exactly the
           DITL convention. No inset of its own: the classic content region
           had none, and flow content starts at the same corner a placed
           child does. An inset is the content's (a vf-stack pad). */
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
      }
      /* The edge-rail composition pulls the scroll area one system px OUT of
         the body on every side so its frame border repaints the window's
         border (see .edge-scroll below) — clipping the body would shave
         exactly that overhang off. The scroll area does its own clipping. */
      :host([scrollbars]) .body {
        overflow: visible;
      }

      /* --- Edge scroll rails (scrollbars) ----------------------------- */
      /* The TeachText composition (SPEC §5 vf-scroll-area), internalized:
         the built-in scroll area is pulled one system pixel under the window
         frame on every side, so its own frame border repaints the window's
         border lines exactly (no doubled frame), the rails run edge to edge,
         and a resizable window's grow box (z-index 1) lands over the rail
         corner cell — which the render reserves on a single-axis rail too
         (the area's corner flag), except when the status strip holds the
         grow box instead. The same overhang lands the area's top frame line
         on the header's rule, so the vertical rail's top arrow begins
         under the header. */
      .edge-scroll {
        width: calc(100% + var(--vf-scale, 1) * 2px);
        height: calc(100% + var(--vf-scale, 1) * 2px);
        margin: calc(var(--vf-scale, 1) * -1px);
      }

      /* --- Header (slot="header") --------------------------------------- */
      /* A band between the title bar and the body, the full width of the
         window — the Finder window's header line: a white interior over a
         1px rule (vfRule's vf-rule-bottom on the element). Like the body it
         carries no inset and is a positioning anchor: (0,0) is the header's
         own corner, flow content starts there too, an inset is the content's.
         As tall as its content unless header-height states it — rule
         included, the way every kit bar counts its rule (an 18px title bar
         is 17 + 1). Under the scrollbars parameter the edge rails sit in the
         body below it, so the header spans the rail's column and the
         vertical rail's arrows begin under it. Takes no space until the slot
         is populated. Clipped like the body; a drop-open panel still escapes
         (see the body's note). A div with a class, never a <header>: that
         element maps to a banner landmark (see render()). */
      .header {
        position: relative;
        flex: none;
        background: var(--vf-white, #ffffff);
        overflow: hidden;
      }
      .header.empty {
        display: none;
      }

      /* --- Status bar (slot="status") ---------------------------------- */
      /* The classic bottom readout strip: a 1px rule over a white interior,
         15px in all — the grow box's own height, so a resizable window's
         grow box sits flush in the strip's right end the way it sits in the
         scroll rails' corner cell (its top and left borders take over the
         rule there). Body-face text rides its native 12px line, whole-pixel
         centered in the 14px interior. Under the scrollbars parameter, the
         edge rails' bottom frame line lands exactly on the strip's rule (the
         1px overhang), so the two never double up. Takes no space until the
         slot is populated. */
      .status {
        flex: none;
        display: flex;
        align-items: center;
        height: calc(var(--vf-scale, 1) * var(--vf-status-bar-height, 15px));
        /* The rule is vfRule's vf-rule-top on the element. */
        background: var(--vf-white, #ffffff);
        padding-inline: calc(var(--vf-scale, 1) * 6px);
        line-height: calc(var(--vf-scale, 1) * var(--vf-line-height, 12px));
        white-space: nowrap;
        overflow: hidden;
      }
      /* Clear the grow box: its 15px cell plus the strip's own 6px inset. */
      :host([resizable]) .status {
        padding-inline-end: calc(var(--vf-scale, 1) * 21px);
      }
      .status.empty {
        display: none;
      }

      /* --- Grow box --------------------------------------------------- */
      .grow {
        position: absolute;
        right: 0;
        bottom: 0;
        z-index: 1;
        width: calc(var(--vf-scale, 1) * 15px);
        height: calc(var(--vf-scale, 1) * 15px);
        border-top: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        border-left: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        background: var(--vf-white, #ffffff);
        touch-action: none;
        cursor: var(--vf-cursor, default);
      }
      .grow::before {
        content: '';
        position: absolute;
        right: calc(var(--vf-scale, 1) * 1px);
        bottom: calc(var(--vf-scale, 1) * 1px);
        width: calc(var(--vf-scale, 1) * 9px);
        height: calc(var(--vf-scale, 1) * 9px);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
      }
      .grow::after {
        content: '';
        position: absolute;
        top: calc(var(--vf-scale, 1) * 2px);
        left: calc(var(--vf-scale, 1) * 2px);
        width: calc(var(--vf-scale, 1) * 7px);
        height: calc(var(--vf-scale, 1) * 7px);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000000);
        background: var(--vf-white, #ffffff);
      }
      /* Inactive window: the size box empties with the scroll rails (the same
         HIG no-interactive-UX treatment ScrollStateController drives for the
         bars) — its cell and borders stay, the nested squares go. */
      :host(:not([active])) .grow::before,
      :host(:not([active])) .grow::after {
        display: none;
      }
    `,
  ]

  /**
   * Chrome variant. Omit for the standard 18px striped bar; `'utility'` for
   * the slim windoid bar (dot-grid dither, 7×7 widgets, no title patch — the
   * heading still names the widgets). Inside a `vf-desktop`, utility windows
   * float above the document tier and never take the single-active state.
   */
  @property({ reflect: true }) variant?: 'utility'

  /** Title text shown centered in the title bar. */
  @property() heading = ''

  // `width`/`height` come from VfSized — declare BOTH; see the class doc.

  /**
   * Whether this is the frontmost (active) window: stripes and widgets show.
   * Managed automatically by an enclosing `vf-desktop`.
   */
  @property({ type: Boolean, reflect: true }) active = true

  /** Show the close box (left side of the title bar). */
  @property({ type: Boolean, reflect: true }) closable = true

  /** Show the zoom box (right side of the title bar). */
  @property({ type: Boolean, reflect: true }) zoomable = false

  /** Allow dragging the window by its title bar. */
  @property({ type: Boolean, reflect: true }) movable = false

  /**
   * Drag by the title bar as an outline: a press draws a dotted one-pixel
   * rectangle around the window on the desktop's drag surface, with the
   * icon drag outline's pen; the drag moves it, held where the window can
   * land, and the window moves there on the release, in one write. Escape
   * cancels and writes nothing, as does a release that never moved it.
   * Unset, the window moves live under the pointer; with no `vf-desktop` on
   * its path it moves live either way. Only matters with `movable`.
   */
  @property({ type: Boolean, reflect: true, attribute: 'outline-drag' }) outlineDrag = false

  /**
   * Show a grow box at the bottom-right corner for resizing. The drag is
   * bounded per axis by the sizeRect below.
   */
  @property({ type: Boolean, reflect: true }) resizable = false

  /**
   * The sizeRect: the range of sizes the grow box can drag the window to,
   * per axis, in whole system px — GrowWindow's, where the app stated the
   * rectangle and the Window Manager clamped the drag to it. `minWidth` and
   * `minHeight` default to the 80×54 floor a window can still be worked at;
   * the maxes are unbounded. A min equal to its max locks that axis —
   * `min-height="67" max-height="67"` on a strip that scrolls sideways and
   * never grows taller, so the grow box changes the width alone.
   *
   * Bounds the gesture only: an authored `width`/`height` outside the rect
   * renders as declared, and the first grow-box move brings it inside. The
   * clamp runs after the drag's lattice snap, so a bound lands exactly the
   * way an authored size does, even off the lattice (an odd height at 2×);
   * where a min and max cross, the max wins, so a window held under the
   * floor stays put instead of jumping to it.
   */
  @property({ type: Number, attribute: 'min-width' }) minWidth?: number | null

  /** See {@link minWidth}. Default 54. */
  @property({ type: Number, attribute: 'min-height' }) minHeight?: number | null

  /** See {@link minWidth}. Unbounded by default. */
  @property({ type: Number, attribute: 'max-width' }) maxWidth?: number | null

  /** See {@link minWidth}. Unbounded by default. */
  @property({ type: Number, attribute: 'max-height' }) maxHeight?: number | null

  /**
   * Put System 7 scroll rails on the window edge — the classic document
   * window. The body slot renders inside a built-in `vf-scroll-area` pulled
   * one system pixel under the frame on every side, so the rails repaint the
   * border lines and a `resizable` window's grow box lands in the corner
   * cell — reserved on a single-axis rail too (the area's `corner`), unless
   * a populated status strip holds the grow box, when the rail runs edge to
   * edge onto the strip's rule. Values mirror `vf-scroll-area`'s `axis`; the
   * `heading` names the scroll region; the viewport part is re-exported.
   * Content runs to the frame and the rails; an inset is the content's own.
   * The slotted composition (SPEC §5 vf-scroll-area) still works for a well
   * placed inside the body.
   */
  @property({ reflect: true }) scrollbars?: 'vertical' | 'horizontal' | 'both'

  /**
   * The header's height in whole system px, rule included — the way every
   * kit bar counts its rule (an 18px title bar is 17 + 1). Unset, the header
   * is as tall as what is slotted into it, plus the rule. Only matters while
   * the `header` slot is populated.
   */
  @property({ type: Number, attribute: 'header-height' }) headerHeight?:
    | number
    | null

  /** Whether the `header` slot has assigned content (drives the header). */
  @state() private _hasHeader = false

  /** Whether the `status` slot has assigned content (drives the strip). */
  @state() private _hasStatus = false

  /** The content region — the placed-child anchor; exists from the first render. */
  @query('.body') private readonly body!: HTMLDivElement | null

  /** The built-in edge scroll area, while `scrollbars` is set. */
  @query('vf-scroll-area') private readonly scrollArea!: VfScrollArea | null

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping; see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /** Holds the centered title patch on the placement lattice (src/chrome.ts). */
  private readonly titleCenter = new TitleCenterController(this)

  /**
   * The consumer's `--vf-dots-pattern` override, or `''` for the kit dots —
   * which exact-fill path the utility bar takes (src/tile-grid.ts). Re-read
   * every update; a runtime token swap wants a `requestUpdate()`.
   */
  private _dotsPattern = ''

  /** The whole-surface dots raster, cached against its ceiled size. */
  readonly #dotsRaster = new TileRasterCache()

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    if (this.variant === 'utility') {
      this._dotsPattern = patternOverride(this, '--vf-dots-pattern')
    }
  }

  /**
   * The exact dots fill rendered into the utility bar's `.vf-dots` layer
   * (src/tile-grid.ts): the bar interior is the declared width minus the
   * frame borders. The kit raster is ceiled to whole 30-px tiles so a
   * grow-box resize only re-encodes the image when it crosses a tile
   * boundary — the layer's clip crops the overdraw; a consumer
   * `--vf-dots-pattern` renders the placed tile grid at the token's
   * documented 30-px geometry instead. A window with no declared width
   * renders neither and the layer keeps its CSS-repeated tile.
   */
  private _dotsTexture(): unknown {
    if (this.width == null) return undefined
    const barW = Math.max(1, this.width - 2 * FRAME_BORDER)
    if (this._dotsPattern) {
      return tileGrid({ cols: Math.ceil(barW / DOT_SPAN), rows: 1, tile: DOT_SPAN })
    }
    // One motif of overdraw each way: floored bar geometry can leave the
    // layer a fraction of a system px larger than its stated box, and the
    // raster must overshoot rather than stretch. The layer's clip crops it.
    const w = Math.ceil((barW + DOT_MOTIF) / DOT_SPAN) * DOT_SPAN
    const h = DOTS_LAYER_HEIGHT + DOT_MOTIF
    return html`<div
      class="vf-tile-raster"
      style="width:${sysLength(w)};height:${sysLength(
        h
      )};background-image:${this.#dotsRaster.for(DOT_MOTIF, DOT_MOTIF, DOT_RECTS, w, h)}"
    ></div>`
  }

  /**
   * Where a dragged window is allowed to end up, in system px: clamped against
   * the positioning parent (the desktop, usually) so it can't be pushed fully
   * past an edge and lost. Only a grabbable strip has to stay in — a window
   * pushed mostly off-screen is a thing System 7 let you do.
   *
   * The box comes from the placement controller, measured once when the drag
   * began — see {@link PlacementController.moveTo} for why a fresh measurement
   * per move is the wrong one.
   */
  #keepGrabbable = (
    x: number,
    y: number,
    bounds: PlacementBounds
  ): { x: number; y: number } => {
    const width = toSysExact(this.offsetWidth, this)
    return {
      x: Math.min(Math.max(x, KEEP_GRABBABLE - width), bounds.width - KEEP_GRABBABLE),
      y: Math.min(Math.max(y, 0), Math.max(0, bounds.height - KEEP_GRABBABLE)),
    }
  }

  /**
   * Drag placement: the origin lands in `top`/`left` in system px, so a moved
   * window is placed the way an authored one is and holds its spot through a
   * zoom (see src/position.ts).
   */
  private readonly _placement = new PlacementController(this, (x, y, bounds) =>
    this.#keepGrabbable(x, y, bounds)
  )

  /**
   * Title-bar drag-to-move (shared with `vf-dialog` via {@link DragController}).
   * The controller owns the pointer bookkeeping and hands over system px; the
   * placement controller seeds the origin and writes the result.
   */
  private readonly _drag = new DragController(this, {
    onDragStart: (event: PointerEvent): { x: number; y: number } | null => {
      if (!this.movable || event.button !== 0) return null
      // Ignore drags that start on the close/zoom widgets.
      if (
        event
          .composedPath()
          .some(
            (node) =>
              node instanceof HTMLElement && node.classList.contains('box')
          )
      ) {
        return null
      }
      this.#warnIfUnplaced()
      const origin = this._placement.seed()
      this.#startOutlineDrag(origin)
      return origin
    },
    onDrag: (x: number, y: number): void => {
      if (this.#outlineDrag) this.#dragOutlineTo(x, y)
      else this._placement.moveTo(x, y)
    },
    onDragEnd: (_event: PointerEvent | undefined, cancelled: boolean): void => {
      this.#endOutlineDrag(cancelled)
    },
  })

  private _resizeState: ResizeState | null = null

  /**
   * A viewport point (CSS px) as a placement in the window's content region
   * — `{ left, top }` in whole system px on the placement lattice, the pair a
   * child dropped into this window is written with: the body's corner, or
   * under `scrollbars` the scrolled plane, scroll offset included. The anchor
   * sits in the shadow tree, which is why the conversion is a method here
   * rather than the page's own `toSysExact` against a rect. With `child`,
   * the pair to write to that element: the offset its `origin` adds is
   * folded in, so its box's corner lands on the point.
   */
  placementAt(
    clientX: number,
    clientY: number,
    child?: Element
  ): { left: number; top: number } {
    const area = this.scrollArea
    if (area) return area.placementAt(clientX, clientY, child)
    return placementIn(this.body ?? this, clientX, clientY, this, child)
  }

  /**
   * Re-measure the built-in scroll area's overflow and re-sync its rails —
   * a no-op without `scrollbars`. The area re-measures by itself on its
   * content's box, its slot and every placement write; this is the escape
   * hatch for a scroll range that changes with none of those, the way
   * `vf-scroll-area.measure()` is.
   */
  measure(): void {
    this.scrollArea?.measure()
  }

  /**
   * Show the window: `hidden` cleared, and with `from` the window opens from
   * that box — the zoom rects, grown from it toward the frame at the cadence
   * in src/motion.ts (`WINDOW_RECT_*`), the window drawn once they have
   * drained (see the class doc). A run in flight, a `show()` or a `hide()`,
   * is finished first; a press anywhere or Escape finishes this one, and
   * removing the window or a `hide()` takes it down. Resolves once the
   * window draws: `true` when the rects ran, `false` when it showed at once
   * — no `from`, `prefers-reduced-motion`, no `vf-desktop` on its path,
   * nothing of the rects on the screen, or not in the DOM — or never drew.
   * It raises and activates nothing: stacking stays the page's
   * (`vf-desktop.bringToFront`).
   */
  async show(options: VfWindowShowOptions = {}): Promise<boolean> {
    this.#stopRects('finish')
    this.hidden = false
    const from = options.from
    if (!from || prefersReducedMotion()) return false
    // Concealed in this task, so a window appended or un-hidden in it never
    // paints ahead of the rects.
    const run: RectsRun = { closing: false, animations: [] }
    this.#rectsRun = run
    this.#internals.states?.add('opening')
    this.#interrupt.attach()
    // Same-task writes to the pair or the size land first — made before the
    // call, or after it in the same task, which is an update still pending
    // once the first has settled — so the rects end on the frame the page
    // set. A window made this turn renders its shadow meanwhile.
    do {
      await this.updateComplete
    } while (this.isUpdatePending && this.#rectsRun === run)
    if (this.#rectsRun !== run) return false
    const rects = this.isConnected
      ? this.#animateRects(from, this.getBoundingClientRect(), false)
      : null
    if (!rects) {
      this.#endRects()
      return false
    }
    run.animations = rects.animations
    return this.#playOut(run, rects)
  }

  /**
   * Hide the window: `hidden` set, and with `to` the window closes to that
   * box — the rects of {@link show} run the other way, from where the frame
   * is drawn at the call in toward the box, the window gone from their first
   * step. A `show()` still opening is taken down and says `false`; a second
   * `hide()` finishes the first; a press anywhere or Escape finishes the
   * rects; removing the window leaves them running, so a page can remove a
   * window as it closes it. Resolves once the rects are done: `true` when
   * they ran, `false` when the window hid at once — no `to`,
   * `prefers-reduced-motion`, no `vf-desktop` on its path, nothing of the
   * rects on the screen, not in the DOM, or no frame to close from: already
   * hidden, or still opening.
   */
  async hide(options: VfWindowHideOptions = {}): Promise<boolean> {
    const opening = this.#rectsRun?.closing === false
    // Only a drawn window has a frame to close from: shown, and done opening.
    const drawn = !this.hidden && !opening
    // An opening never drew, so its show() says false; a closing is finished.
    this.#stopRects(opening ? 'cancel' : 'finish')
    const to = options.to
    const rects =
      to && drawn && this.isConnected && !prefersReducedMotion()
        ? this.#animateRects(to, this.getBoundingClientRect(), true)
        : null
    this.hidden = true
    if (!rects) return false
    const run: RectsRun = { closing: true, animations: rects.animations }
    this.#rectsRun = run
    this.#interrupt.attach()
    return this.#playOut(run, rects)
  }

  /** Internals, for the `opening` custom state. */
  readonly #internals = this.attachInternals()

  /** The `show({ from })` or `hide({ to })` in flight, or null. */
  #rectsRun: RectsRun | null = null

  /**
   * A press anywhere, or Escape, finishes the rects: an opening window draws
   * at once, and the press lands on it. Scoped to the run, on the document,
   * capture phase, Escape stopped there — the walk's rule (`vf-icon.dragTo`),
   * for the same reasons.
   */
  readonly #interrupt = new DocumentListenersController(this, () => [
    [document, 'pointerdown', this.#onRectsPress, true],
    [document, 'keydown', this.#onRectsKeyDown, true],
  ])

  #onRectsPress = (): void => {
    this.#stopRects('finish')
  }

  #onRectsKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.#rectsRun) return
    event.preventDefault()
    event.stopPropagation()
    this.#stopRects('finish')
  }

  /**
   * End the run in flight now: its rects finished — its call says they ran,
   * and an opening window draws at once — or cancelled, when it says they
   * did not. A run whose rects have not started says `false`.
   */
  #stopRects(how: 'finish' | 'cancel'): void {
    const run = this.#rectsRun
    if (!run) return
    this.#endRects()
    for (const animation of run.animations) animation[how]()
  }

  /** The run over, the window drawn if it was opening, the finishers gone. */
  #endRects(): void {
    this.#rectsRun = null
    this.#internals.states?.delete('opening')
    this.#interrupt.detach()
  }

  /**
   * Wait out a run's rects, then take their canvases down: finished —
   * drained, or a press, Escape or the next call — they ran; cancelled,
   * they did not.
   */
  async #playOut(run: RectsRun, rects: Rects): Promise<boolean> {
    const ran = await Promise.all(rects.animations.map((a) => a.finished)).then(
      () => true,
      () => false
    )
    for (const canvas of rects.canvases) canvas.remove()
    if (this.#rectsRun === run) this.#endRects()
    return ran
  }

  /**
   * The rects between `box` and the window's `frame`, on the desktop's drag
   * surface — the one the `vf-drag-surface-request` handshake finds, as a
   * dragged icon's outline does. Both in whole system px from the corner of
   * its screen; every edge of rect k sits its fraction of the way from the
   * box to the frame ({@link windowRectFraction}), the delta truncated toward
   * zero. Each rect is a canvas of its own, framed once with the XOR pen at
   * its phase on the screen ({@link penPhase}) and hidden, with an animation
   * that shows it for {@link WINDOW_RECTS_VISIBLE} steps: from step k opening,
   * out from the box, and from step 13 − k closing, in toward it. Where two
   * rects share a pixel the later one inverts it back: the surface is no
   * stacking context, so each canvas blends over the ones before it as well
   * as the screen. Null with no desktop on the path, or none of the rects on
   * the screen.
   */
  #animateRects(box: VfViewportBox, frame: VfViewportBox, closing: boolean): Rects | null {
    const surface = this.#requestSurface()
    if (!surface) return null
    const scale = effectiveScale(this)
    const screen = surface.getBoundingClientRect()
    const onScreen = (r: VfViewportBox): VfViewportBox => ({
      left: Math.round((r.left - screen.left) / scale),
      top: Math.round((r.top - screen.top) / scale),
      right: Math.round((r.right - screen.left) / scale),
      bottom: Math.round((r.bottom - screen.top) / scale),
    })
    const small = onScreen(box)
    const big = onScreen(frame)
    // Every rect lies inside the two boxes' union: none shows if it misses the screen.
    if (
      Math.max(small.right, big.right) <= 0 ||
      Math.max(small.bottom, big.bottom) <= 0 ||
      Math.min(small.left, big.left) >= Math.round(screen.width / scale) ||
      Math.min(small.top, big.top) >= Math.round(screen.height / scale)
    ) {
      return null
    }

    const step = WINDOW_RECT_STEP_MS
    const rects: Rects = { canvases: [], animations: [] }
    for (let k = 0; k < WINDOW_RECT_STEPS; k++) {
      const t = windowRectFraction(k)
      const edge = (a: number, b: number): number => a + Math.trunc((b - a) * t)
      const left = edge(small.left, big.left)
      const top = edge(small.top, big.top)
      const width = Math.max(1, edge(small.right, big.right) - left)
      const height = Math.max(1, edge(small.bottom, big.bottom) - top)
      const canvas = xorPenCanvas('window-rect')
      const style = canvas.style
      style.position = 'absolute'
      style.left = sysLength(left)
      style.top = sysLength(top)
      style.width = sysLength(width)
      style.height = sysLength(height)
      style.visibility = 'hidden'
      paintSelectionRect(canvas, width, height, penPhase(left, top))
      surface.append(canvas)
      rects.canvases.push(canvas)
      // Two equal keyframes hold `visible` over the active interval; the
      // inline `hidden` rules before and after it. The end delay pads every
      // rect to the whole run, so all of them finish together.
      const first = closing ? WINDOW_RECT_STEPS - 1 - k : k
      rects.animations.push(
        canvas.animate([{ visibility: 'visible' }, { visibility: 'visible' }], {
          delay: first * step,
          duration: WINDOW_RECTS_VISIBLE * step,
          endDelay: (WINDOW_RECT_STEPS - first) * step,
        })
      )
    }
    return rects
  }

  /**
   * The handshake a dragged icon's outline uses: a desktop on the light-DOM
   * path hands over its drag surface. Null with no desktop.
   */
  #requestSurface(): HTMLElement | null {
    const request: { surface: HTMLElement | null } = { surface: null }
    emit(this, 'vf-drag-surface-request', request, { composed: false })
    return request.surface
  }

  /* --- Outline drag (outline-drag) ---------------------------------- */

  /** The outline drag in flight, or null — a live drag keeps none. */
  #outlineDrag: OutlineDrag | null = null

  /**
   * Escape mid outline-drag cancels it: a document listener scoped to the
   * gesture, capture phase, the key stopped there — the icon drag's rule, so
   * an enclosing dialog never reads it as a dismissal.
   */
  readonly #dragEscape = new DocumentListenersController(this, () => [
    [document, 'keydown', this.#onDragKeyDown, true],
  ])

  #onDragKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.#outlineDrag) return
    event.preventDefault()
    event.stopPropagation()
    this._drag.cancel()
  }

  /**
   * The press of an outline drag: the outline drawn around the window at
   * once, and Escape armed. A window without `outline-drag`, or with no
   * desktop to draw on, keeps no outline drag, and the gesture moves it live.
   */
  #startOutlineDrag(origin: { x: number; y: number }): void {
    this.#endOutlineDrag(true)
    if (!this.outlineDrag) return
    const outline = this.#buildOutline(this.getBoundingClientRect())
    if (!outline) return
    this.#outlineDrag = { origin, outline, landing: null }
    this.#placeOutline(outline, 0, 0)
    this.#dragEscape.attach()
  }

  /**
   * A step of an outline drag: the outline to where the release would land
   * — the step clamped as a live drag is ({@link PlacementController.resolve}).
   */
  #dragOutlineTo(x: number, y: number): void {
    const drag = this.#outlineDrag
    if (!drag) return
    const landing = this._placement.resolve(x, y)
    drag.landing = landing
    this.#placeOutline(drag.outline, landing.x - drag.origin.x, landing.y - drag.origin.y)
  }

  /**
   * Put the outline its delta from where the press drew it, whole system px
   * from the desktop's screen, re-dotted when its phase on the screen changes.
   */
  #placeOutline(outline: WindowOutline, dx: number, dy: number): void {
    const left = outline.base.x + dx
    const top = outline.base.y + dy
    outline.canvas.style.left = sysLength(left)
    outline.canvas.style.top = sysLength(top)
    const phase = penPhase(left, top)
    if (phase === outline.phase) return
    outline.phase = phase
    paintSelectionRect(outline.canvas, outline.width, outline.height, phase)
  }

  /**
   * The outline an outline drag moves: the window's box at the press — its
   * frame, border included, shadow not — as a one-pixel ring on the
   * desktop's drag surface, with the drag outline's pen. Null with no desktop.
   */
  #buildOutline(frame: DOMRect): WindowOutline | null {
    const surface = this.#requestSurface()
    if (!surface) return null
    const scale = effectiveScale(this)
    const screen = surface.getBoundingClientRect()
    const width = Math.max(1, Math.round(frame.width / scale))
    const height = Math.max(1, Math.round(frame.height / scale))
    const canvas = xorPenCanvas('drag-outline')
    const style = canvas.style
    style.position = 'absolute'
    style.width = sysLength(width)
    style.height = sysLength(height)
    surface.append(canvas)
    return {
      canvas,
      base: {
        x: Math.round((frame.left - screen.left) / scale),
        y: Math.round((frame.top - screen.top) / scale),
      },
      width,
      height,
      phase: -1,
    }
  }

  /**
   * The end of an outline drag: the outline down and, released rather than
   * cancelled, the window written where it was — one write, one
   * `vf-placement-change`. A press released without a step writes nothing.
   */
  #endOutlineDrag(cancelled: boolean): void {
    const drag = this.#outlineDrag
    this.#outlineDrag = null
    if (!drag) return
    this.#dragEscape.detach()
    drag.outline.canvas.remove()
    if (!cancelled && drag.landing) this._placement.moveTo(drag.landing.x, drag.landing.y)
  }

  /**
   * Say something the first time a window is opened without a width. The size
   * itself is written by VfSized's controller, from `width`/`height` — which
   * is also what the grow box sets, so a resized window and an authored one
   * are the same declaration and neither can be re-asserted over the other.
   * Controllers run before this hook, so the inline style the warning reads is
   * already written.
   *
   * The stream half of `vf-resize` also fires here, not from the pointermove
   * that wrote the size: by this hook the controller has applied the box, so
   * a handler that measures reads the resized layout — the contract that lets
   * window content follow the grow box without a ResizeObserver.
   */
  protected override updated(): void {
    this.#warnIfUnsized()
    const resize = this._resizeState
    if (resize?.emitPending) {
      resize.emitPending = false
      emit(this, 'vf-resize', {
        width: this.width,
        height: this.height,
        commit: false,
      })
    }
  }

  /** One warning per element, not per render. */
  #warnedNoSize = false

  /** Ditto, for the movable contract. */
  #warnedNoPlacement = false

  /**
   * A movable window states its origin too — the other half of the rectangle a
   * WIND resource carried. See {@link warnMovableContract} for both faults.
   *
   * Checked when a gesture starts rather than on update: the contract is about
   * gestures, this is the moment it becomes observable, and layout is settled
   * by then. An `updated()` check would race a stylesheet that positions the
   * window — the showcase's own icons are placed that way — and latch a
   * warning that was never true.
   */
  #warnIfUnplaced(): void {
    if (this.#warnedNoPlacement) return
    this.#warnedNoPlacement = warnMovableContract(
      this,
      `vf-window${this.heading ? ` ("${this.heading}")` : ''}`,
      '<vf-window movable top="30" left="40" width="240" height="176">'
    )
  }

  /**
   * Both dimensions are required: a window is a fixed box in both axes, and
   * each one left out falls back to a different wrong thing.
   *
   * An inline `width`/`height` is the other honest way to declare it — the grow
   * box writes exactly that — so it counts. A stylesheet rule we cannot tell
   * apart from normal block layout, so it still warns.
   */
  #warnIfUnsized(): void {
    if (this.#warnedNoSize) return
    const missing: string[] = []
    if (this.width == null && this.style.width === '') {
      missing.push('width (falling back to block layout)')
    }
    if (this.height == null && this.style.height === '') {
      missing.push('height (falling back to the content)')
    }
    if (missing.length === 0) return
    this.#warnedNoSize = true
    console.warn(
      `vf-window${this.heading ? ` ("${this.heading}")` : ''}: no ` +
        `${missing.join(', no ')}. A window owns its whole box — declare both ` +
        'in system px: <vf-window width="240" height="176">.'
    )
  }

  override connectedCallback(): void {
    super.connectedCallback()
    // Back from a move with the rects still running — vf-desktop re-inserts
    // a raised window to keep the DOM in stacking order — so the finishers'
    // document listeners, which the controller drops on the way out and never
    // restores, go back on.
    if (this.#rectsRun) this.#interrupt.attach()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    // Drop any in-flight resize: the grow box goes away with the shadow tree, so
    // its pointerup/lostpointercapture never arrives. Matches DragController's
    // and vf-slider's teardown.
    this._resizeState = null
    // Nor an outline drag: its outline is on the desktop's surface, and
    // nothing is written. (vf-desktop never re-inserts a window mid-gesture.)
    this.#outlineDrag?.outline.canvas.remove()
    this.#outlineDrag = null
    // A move is not a removal: a re-inserted window is back before a
    // microtask runs, its rects still going. One that stays out takes an
    // opening down, and `show()` says the rects did not run. A closing runs
    // on: the window was gone already, and its rects are the desktop's.
    if (this.#rectsRun && !this.#rectsRun.closing) {
      queueMicrotask(() => {
        if (!this.isConnected && this.#rectsRun?.closing === false) this.#stopRects('cancel')
      })
    }
  }

  /** The `.empty` gate: the strip renders only while the slot is populated. */
  private _onStatusSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement
    this._hasStatus = slot.assignedElements().length > 0
  }

  /** The header's own gate, on the same terms. */
  private _onHeaderSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement
    this._hasHeader = slot.assignedElements().length > 0
  }

  private _onCloseClick(): void {
    emit(this, 'vf-close', { reason: 'close' })
  }

  private _onZoomClick(): void {
    // Empty `{}` detail (not null) preserved intentionally — see the vf-close
    // detail-shape note; vf-zoom keeps `{}` for consistency with vf-window's
    // other widget events.
    emit(this, 'vf-zoom', {})
  }

  /* --- Grow-box resizing (resizable) -------------------------------- */

  private _onGrowPointerDown(event: PointerEvent): void {
    if (!this.resizable || event.button !== 0) return
    const rect = this.getBoundingClientRect()
    this._resizeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseWidth: toSysExact(rect.width, this),
      baseHeight: toSysExact(rect.height, this),
      emitPending: false,
      resized: false,
    }
    const grow = event.currentTarget as HTMLElement
    grow.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  private _onGrowPointerMove(event: PointerEvent): void {
    const resize = this._resizeState
    if (!resize || event.pointerId !== resize.pointerId) return
    // The grow box writes the same `width`/`height` an author declares, in the
    // same unit: whole system px, snapped onto the placement lattice, so the
    // window stays a whole count of art pixels — every interior metric stays
    // whole with it, the right/bottom borders land on the device grid like
    // the left/top edges, and the box a user grew holds its size through a
    // zoom instead of being re-read as a different number of art pixels at
    // every step. Only the pointer delta crosses units: clientX is real
    // (scaled) CSS px. The sizeRect clamp comes last, after the snap: a
    // bound is an authored number and lands exactly, like an authored size.
    const width = clampAxis(
      snapSys(
        resize.baseWidth + toSysExact(event.clientX - resize.startX, this),
        this
      ),
      this.minWidth ?? MIN_WIDTH,
      this.maxWidth
    )
    const height = clampAxis(
      snapSys(
        resize.baseHeight + toSysExact(event.clientY - resize.startY, this),
        this
      ),
      this.minHeight ?? MIN_HEIGHT,
      this.maxHeight
    )
    // Flag rather than emit: `updated()` fires the event once the write has
    // been applied to layout, and only moves that changed the snapped size
    // fire at all.
    if (width !== this.width || height !== this.height) {
      resize.emitPending = true
      resize.resized = true
    }
    this.width = width
    this.height = height
  }

  /**
   * Ends a grow-box resize on pointerup / pointercancel / lostpointercapture.
   * Idempotent — releasing the capture below re-enters here, and by then
   * `_resizeState` is already null.
   */
  private _onGrowPointerEnd(event: PointerEvent): void {
    const resize = this._resizeState
    if (!resize || event.pointerId !== resize.pointerId) return
    this._resizeState = null
    const grow = event.currentTarget as HTMLElement
    if (grow.hasPointerCapture(event.pointerId)) {
      grow.releasePointerCapture(event.pointerId)
    }
    // The commit half of vf-resize: once per gesture, only when it changed
    // the size — the vf-change rule. A cancel commits too: the size keeps
    // whatever the drag last wrote, and that settled box is the news.
    if (resize.resized) {
      emit(this, 'vf-resize', {
        width: this.width,
        height: this.height,
        commit: true,
      })
    }
  }

  protected override render(): unknown {
    // The frame is a named group, so AT users can tell whose content they are
    // reading when several windows are open — role="group" rather than
    // "region" deliberately: a region is a landmark, and a desktop full of
    // windows would pollute landmark navigation with exactly the elements
    // that shouldn't be there (the review's §9.3 failure, inverted). The
    // title patch names it the way vf-dialog's names its <dialog>; AccName
    // resolves aria-labelledby through display:none, so the utility bar's
    // hidden patch still names the windoid. An untitled window is an unnamed
    // group — unlike a dialog, a group carries no obligation to be named.
    return html`
      <div
        class="vf-frame vf-snap"
        part="frame"
        role="group"
        aria-labelledby=${this.heading ? 'title' : nothing}
      >
        ${chromeTitleBar(
          this._drag,
          html`
            ${this.closable
              ? closeBox(widgetLabel('Close', this.heading), this._onCloseClick)
              : nothing}
            <span class="vf-title" part="title" id="title">${this.heading}</span>
            ${this.zoomable
              ? zoomBox(widgetLabel('Zoom', this.heading), this._onZoomClick)
              : nothing}
          `,
          this.variant === 'utility' ? 'vf-dots' : 'vf-stripes',
          this.variant === 'utility' ? this._dotsTexture() : undefined
        )}
        <div
          class="header vf-rule-bottom ${this._hasHeader ? '' : 'empty'}"
          part="header"
          style=${this.headerHeight != null
            ? `height:${sysLength(this.headerHeight)}`
            : nothing}
        >
          <slot name="header" @slotchange=${this._onHeaderSlotChange}></slot>
        </div>
        <div class="body" part="body">
          ${this.scrollbars
            ? html`
                <vf-scroll-area
                  class="edge-scroll"
                  axis=${this.scrollbars}
                  ?corner=${this.resizable && !this._hasStatus}
                  label=${this.heading || nothing}
                  exportparts="viewport"
                >
                  <slot></slot>
                </vf-scroll-area>
              `
            : html`<slot></slot>`}
        </div>
        <div class="status vf-rule-top ${this._hasStatus ? '' : 'empty'}" part="status-bar">
          <slot name="status" @slotchange=${this._onStatusSlotChange}></slot>
        </div>
        ${this.resizable
          ? html`
              <div
                class="grow"
                part="grow-box"
                @pointerdown=${this._onGrowPointerDown}
                @pointermove=${this._onGrowPointerMove}
                @pointerup=${this._onGrowPointerEnd}
                @pointercancel=${this._onGrowPointerEnd}
                @lostpointercapture=${this._onGrowPointerEnd}
              ></div>
            `
          : nothing}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-window': VfWindow
  }
}
