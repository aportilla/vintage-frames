import { css, html, LitElement, nothing } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { vfBase, vfFocusRing, vfScrollRail } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { ScrollStateController } from '../scroll-state.js'
import { ScrollRailController, renderScrollRail } from '../scroll-rail.js'

/**
 * `<vf-scroll-area>` — a container whose scrollbars look like System 7.
 *
 * White box with a 1px black frame, an inner scrolling viewport, and scroll
 * rails the kit draws itself as shadow DOM (the shared `vfScrollRail` recipe):
 * boxed arrow buttons at each end, a loose 1-bit dot-dither trough, and the
 * classic fixed 16px thumb. The native scrollbar is hidden, never the native
 * scrolling — wheel, trackpad momentum, keyboard, touch and assistive-tech
 * scrolling stay the platform's, and {@link ScrollRailController} keeps the
 * rail in sync while driving the classic interactions (thumb drag, trough
 * paging, arrow stepping with auto-repeat). Every engine renders the same
 * rail — there is no Firefox fallback skin anymore.
 *
 * Each reserved scroll rail is a permanent placeholder: arrow buttons on an
 * empty white channel sit in the gutter even when the content fits, the
 * dither and thumb filling in only once that axis overflows (System 7 drew
 * an active window's no-overflow bar as arrows on a bare channel; driven
 * by {@link ScrollStateController}). Which rails are reserved is set by
 * {@link axis}; when both are reserved the bottom-right corner joins them,
 * and {@link corner} reserves that cell on a single-axis rail too — the
 * rail stops 15px short of the frame, for a grow box to land in.
 *
 * Size the host (width/height) from the outside; the viewport fills it.
 * Content runs to the frame and the rails — the area adds no inset of its
 * own; an inset is the content's (a `vf-stack pad`).
 *
 * The scrolled plane sizes to its content — never narrower than the
 * viewport, as wide as content that cannot wrap — so the rails follow a row
 * that grows sideways the way they follow copy that grows down, and a
 * `slotchange` re-measures. {@link measure} covers a scroll range that
 * changes with no box changing (a placed child moved through `top`/`left`).
 *
 * @slot - Scrollable content.
 * @csspart viewport - The inner scrolling container.
 * @cssprop --vf-scrollbar-thumb - scrollbar thumb/elevator (white)
 * @cssprop --vf-scrollbar-track - the scroll trough's base color under the
 *   dot-dither (white)
 */
@vfElement('vf-scroll-area')
export class VfScrollArea extends VfPositioned(LitElement) {
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping; see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * Which scroll rails to reserve as permanent placeholders: `vertical`
   * (default), `horizontal`, or `both`. Each reserved rail shows an empty white
   * channel until its axis overflows; the unreserved axis still scrolls
   * natively (wheel, keyboard) but draws no rail.
   */
  @property({ reflect: true }) axis: 'vertical' | 'horizontal' | 'both' =
    'vertical'

  /**
   * Reserve the bottom-right corner cell on a single-axis rail: the rail
   * stops 15px short of the frame and the viewport spans the rest, leaving
   * the 15×15 cell — with the two dividers a `both` rail's corner carries —
   * for a grow box to land in. A `both` rail always has the cell, so the
   * flag changes nothing there. `vf-window[scrollbars resizable]` sets it.
   */
  @property({ type: Boolean, reflect: true }) corner = false

  /**
   * Accessible name for the scrolling viewport, applied as its `aria-label`
   * (an `aria-label` on the host would not reach into the shadow DOM). The
   * viewport is keyboard-focusable while its content overflows, so without a
   * name it is announced only as an anonymous scrollable group; setting
   * `label` also promotes it to a named `role="region"` landmark. While
   * `label` is empty the viewport is a plain `group` when scrollable (an
   * unnamed region is inert) and role-less when not.
   */
  @property() label = ''

  @query('.viewport') private viewport!: HTMLElement | null
  @query('.content') private content!: HTMLElement | null

  /** Reports overflow per axis so the reserved rail(s) activate on overflow. */
  private readonly scrollState = new ScrollStateController(
    this,
    () => this.viewport,
    () => this.content,
    (overflow) => {
      this._scrollable = overflow.x || overflow.y
    }
  )

  /** Syncs the drawn rails to the viewport and drives their interactions. */
  private readonly rail = new ScrollRailController(this, {
    getScroll: () => this.viewport,
    getContent: () => this.content,
  })

  /** Whether the content actually overflows the viewport (either axis). */
  @state() private _scrollable = false

  /**
   * Moves keyboard focus to the scrolling viewport — the focusable element
   * lives inside the shadow root, where the platform's `focus()` can't reach
   * (no `delegatesFocus`, no host tabindex), so `vf-label for` and consumer
   * scripts silently no-opped on the host.
   */
  override focus(options?: FocusOptions): void {
    this.viewport?.focus(options)
  }

  /**
   * Re-measure overflow and re-sync the rails. The area tracks its content's
   * box and its slot by itself; call this for a scroll range that changes
   * with no box changing anywhere — a placed child moved through
   * `top`/`left`, a transform — the way the kit's own fields re-measure on
   * input.
   */
  measure(): void {
    this.scrollState.measure()
    this.rail.sync()
  }

  /** Content added or removed under the fixed box — re-measure. */
  private _onSlotChange(): void {
    this.measure()
  }

  static override styles = [
    vfBase,
    vfScrollRail,
    css`
      :host {
        display: block;
      }
      /* The snapped wrapper: a real 1px frame (the rails' outer line is this
         border), a grid that reserves each rail as its own edge column/row —
         the rails size themselves to the 15px inside the frame — and the
         scroller and rails riding the grid-snap offset as one. */
      .box {
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-columns: 1fr;
        grid-template-rows: 1fr;
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        background: var(--vf-white, #fff);
      }
      :host(:not([axis])) .box,
      :host([axis='vertical']) .box,
      :host([axis='both']) .box,
      :host([corner]) .box {
        grid-template-columns: 1fr auto;
      }
      :host([axis='horizontal']) .box,
      :host([axis='both']) .box,
      :host([corner]) .box {
        grid-template-rows: 1fr auto;
      }
      .viewport {
        grid-area: 1 / 1;
        background: var(--vf-white, #fff);
        /* Native scrolling on every axis; the bar itself is hidden by the
           recipe (.vf-scroll) and the reservation is the rail element, not a
           native gutter. The unreserved axis still scrolls, railless.

           No inset of its own — only the border-floor compensation: engines
           floor the fractional frame border to whole CSS px, and the mod()
           term is exactly what they floored away, so slotted content (and
           the (0,0) of placed children) sits exactly one system px from the
           frame box at every scale (mod is 0 at whole scales). An inset is
           the content's (a vf-stack pad). */
        overflow: auto;
        min-width: 0;
        min-height: 0;
        padding: mod(var(--vf-scale, 1) * 1px, 1px);
      }
      /* A single-axis rail with a reserved corner: the viewport spans the
         track the missing rail would have taken, up to the corner cell, so
         the rail stops 15px short of the frame. (A both-axes rail has no
         missing track — the flag is inert there.) */
      :host([corner][axis='horizontal']) .viewport {
        grid-column: 1 / 3;
      }
      :host([corner]:not([axis])) .viewport,
      :host([corner][axis='vertical']) .viewport {
        grid-row: 1 / 3;
      }
      .vf-rail--vertical {
        grid-area: 1 / 2;
      }
      .vf-rail--horizontal {
        grid-area: 2 / 1;
      }
      .vf-rail-corner {
        grid-area: 2 / 2;
      }
      /* The positioning anchor for slotted children placed with top/left
         (src/position.ts). It must be THIS wrapper and not .box: .content
         rides the scroll, so positioned children travel with the content —
         anchored to .box they would hang fixed over the rail while the plane
         moved beneath them. (0,0) is where flow content starts.

         Sized to its content: never narrower than the viewport, and as wide
         as content that cannot wrap. A block's auto width is the viewport's
         whatever the row inside does, so the controllers' ResizeObserver on
         this box never saw horizontal growth — a row gaining a cell left the
         thumb and the overflow state stale until something else re-measured.
         fit-content is the shrink-to-fit width, not max-content: copy wraps
         exactly as before, and only unwrappable width (a nowrap row, a
         fixed-width box, a wide image) grows the plane — precisely the
         content that overflows sideways. It also makes this box the
         containing block of a sticky child, so a sticky left: 0 strip holds
         across the scroll. */
      .content {
        position: relative;
        width: fit-content;
        min-width: 100%;
      }
      /* Focusable so keyboard users can scroll; inset ring to stay in-box. */
      .viewport:focus-visible {
        --vf-focus-offset: -2px;
        ${vfFocusRing}
      }
    `,
  ]

  protected override render() {
    // The viewport is a Tab stop only while there is actually something to
    // scroll — the state ScrollStateController already measures for the rails.
    // A fitting scroll area used to be a focusable stop with role: generic and
    // no name, a dead Tab press. Whenever it IS a stop it carries a role:
    // `region` when labelled (a named landmark), `group` when not.
    const vertical = this.axis !== 'horizontal'
    const horizontal = this.axis === 'horizontal' || this.axis === 'both'
    const corner = (vertical && horizontal) || this.corner
    return html`
      <div class="box vf-snap">
        <div
          class="viewport vf-scroll"
          part="viewport"
          tabindex=${this._scrollable ? '0' : nothing}
          role=${this.label ? 'region' : this._scrollable ? 'group' : nothing}
          aria-label=${this.label || nothing}
        >
          <div class="content">
            <slot @slotchange=${this._onSlotChange}></slot>
          </div>
        </div>
        ${vertical ? renderScrollRail(this.rail, 'vertical') : nothing}
        ${horizontal ? renderScrollRail(this.rail, 'horizontal') : nothing}
        ${corner
          ? html`<div class="vf-rail-corner" aria-hidden="true"></div>`
          : nothing}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-scroll-area': VfScrollArea
  }
}
