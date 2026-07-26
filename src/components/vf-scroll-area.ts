import { css, html, LitElement, nothing } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { vfBase, vfScrollbars, vfFocusRing } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { ScrollStateController } from '../scroll-state.js'

/**
 * `<vf-scroll-area>` — a container whose scrollbars look like System 7.
 *
 * White box with a 1px black frame and an inner scrolling viewport. The
 * WebKit scrollbars are the shared `vfScrollbars` recipe: the classic 16px bar
 * whose outer line is the frame (painted as an overlay above the borderless
 * viewport — see the recipe comment for the Safari reason), a loose 1-bit
 * dot-dither trough, a white boxed thumb, and boxed arrow buttons that nest
 * cleanly under the frame. Firefox falls back to `scrollbar-color`.
 *
 * Each reserved scroll rail is a permanent placeholder: an empty white channel
 * sits in the gutter even when the content fits, filling in with the
 * dither/thumb/arrows only once that axis overflows (System 7 behavior, driven
 * by {@link ScrollStateController}). Which rails are reserved is set by
 * {@link axis}; when both are reserved the bottom-right corner joins them.
 *
 * Size the host (width/height) from the outside; the viewport fills it.
 *
 * @slot - Scrollable content.
 * @csspart viewport - The inner scrolling container.
 */
@customElement('vf-scroll-area')
export class VfScrollArea extends LitElement {
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * Which scroll rails to reserve as permanent placeholders: `vertical`
   * (default), `horizontal`, or `both`. Each reserved rail shows an empty white
   * channel until its axis overflows; the unreserved axis scrolls on demand.
   */
  @property({ reflect: true }) axis: 'vertical' | 'horizontal' | 'both' =
    'vertical'

  /**
   * Accessible name for the scrolling viewport, applied as its `aria-label`
   * (an `aria-label` on the host would not reach into the shadow DOM). The
   * viewport is keyboard-focusable, so without a name it is announced only as
   * an anonymous scrollable group; setting `label` also promotes it to a named
   * `role="region"` landmark. The role is omitted while `label` is empty,
   * since an unnamed region is inert.
   */
  @property() label = ''

  @query('.viewport') private viewport!: HTMLElement | null
  @query('.content') private content!: HTMLElement | null

  /** Reports overflow per axis so the reserved rail(s) activate on overflow. */
  private readonly scrollState = new ScrollStateController(
    this,
    () => this.viewport,
    () => this.content
  )

  static override styles = [
    vfBase,
    vfScrollbars,
    css`
      :host {
        display: block;
      }
      .box {
        /* The snapped wrapper: .vf-snap makes it the positioned anchor the
           .vf-scroll-frame overlay insets against, and the scroller and frame
           ride its grid-snap offset as one. The host doesn't clip — the
           shifted box may paint up to half a device pixel outside it. */
        width: 100%;
        height: 100%;
      }
      .viewport {
        /* Borderless: the 1px frame is the .vf-scroll-frame overlay painted on
           top, so the scrollbar rect anchors on whole CSS px — WebKit snaps
           scrollbar rects to whole CSS px, and a border here would put the
           anchors on half CSS px at dpr 2 and set the whole rail one device
           pixel adrift in Safari (see the vfScrollbars recipe comment). */
        background: var(--vf-white, #fff);
        width: 100%;
        height: 100%;
        /* 9 = the old 8px inset + the 1px the dropped border occupied, keeping
           the content's position relative to the frame. */
        padding: calc(var(--vf-scale, 1) * 9px);
      }
      /* Reserve a rail per the host's axis. overflow-*: scroll keeps the
         styled track (and its divider) painted even with nothing to scroll, so
         the idle rail shows; ScrollStateController toggles data-overflow-* to
         fill it in on overflow. The unreserved axis is auto (on-demand).

         scrollbar-gutter: stable reserves the vertical (inline-end) 16px channel
         — required because modern Chromium draws a zero-width overlay bar for a
         styled ::-webkit-scrollbar, so overflow alone reserves nothing. There is
         no gutter property for the horizontal (block) axis, so a reserved
         horizontal rail relies on overflow-x: scroll (classic scrollbars);
         overlay browsers won't reserve it, matching their skin limitation. */
      :host(:not([axis])) .viewport,
      :host([axis='vertical']) .viewport,
      :host([axis='both']) .viewport {
        overflow-y: scroll;
        scrollbar-gutter: stable;
      }
      :host(:not([axis])) .viewport,
      :host([axis='vertical']) .viewport {
        overflow-x: auto;
      }
      :host([axis='horizontal']) .viewport,
      :host([axis='both']) .viewport {
        overflow-x: scroll;
      }
      :host([axis='horizontal']) .viewport {
        overflow-y: auto;
      }
      /* Focusable so keyboard users can scroll; inset ring to stay in-box. */
      .viewport:focus-visible {
        --vf-focus-offset: -2px;
        ${vfFocusRing}
      }
    `,
  ]

  protected override render() {
    return html`
      <div class="box vf-snap">
        <div
          class="viewport vf-scroll"
          part="viewport"
          tabindex="0"
          role=${this.label ? 'region' : nothing}
          aria-label=${this.label || nothing}
        >
          <div class="content"><slot></slot></div>
        </div>
        <div class="vf-scroll-frame" aria-hidden="true"></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-scroll-area': VfScrollArea
  }
}
