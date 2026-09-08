import { css, html, LitElement, type PropertyValues } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { VfSized } from '../size.js'
import { vfBase } from '../styles/base.js'
import { ScaleController, effectiveScale } from '../scale.js'
import { DocumentListenersController } from '../document-listeners.js'
import { paintSelectionRect } from '../open-art.js'
import type { VfIcon, VfIconSize } from './vf-icon.js'

/** A rectangle in system px from the field's box. */
interface BandRect {
  x: number
  y: number
  width: number
  height: number
}

/** The rubber band in flight, from the press to its release. */
interface Band {
  pointerId: number
  /** The field's box at the press, CSS px. */
  box: DOMRect
  /**
   * Where the band may reach, in system px from the field's box: the field
   * itself, inside every clip above it (a window body, a scroll viewport,
   * the desktop's raster).
   */
  reach: { minX: number; minY: number; maxX: number; maxY: number }
  /** The press, system px from the field's box — the band's fixed corner. */
  origin: { x: number; y: number }
  /**
   * The anchor: the icons selected as the press found them — what Shift or
   * ⌘ kept, nothing after a plain press. Every icon's state under the band
   * is anchor XOR touched, and the anchor comes back on a cancel.
   */
  anchor: Set<VfIcon>
  /** The last rectangle drawn, or null until the first step. */
  rect: BandRect | null
  /** The canvas, from the first step. */
  canvas: HTMLCanvasElement | null
  /** The checker phase last painted, so an unchanged parity paints nothing. */
  phase: number
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), max)

/**
 * `<vf-icon-field>` — the container a field of `vf-icon`s sits in: a desktop's
 * icons, a folder window's contents.
 *
 * Every other set in the kit has its container — `vf-list` owns
 * `vf-list-item`, `vf-radio-group` owns `vf-radio`, `vf-menu` owns
 * `vf-menu-item`, `vf-select` owns `vf-option` — and `vf-icon` was the one
 * item whose container the consumer wrote by hand: a bare
 * `<div role="listbox" aria-multiselectable="true">`, because an `option` is
 * only valid inside a `listbox` that owns it, and every kit container is a
 * positioning anchor by design, so nothing in the kit was neutral enough to
 * stand in. A consumer who forgot the role got icons that silently degraded
 * to pictures. This is that container, as kit furniture:
 *
 * ```html
 * <vf-desktop width="512" height="342">
 *   <vf-icon-field label="Desktop" fill-width fill-height>
 *     <vf-icon label="Macintosh HD" width="64" selectable movable editable left="16" top="24">…</vf-icon>
 *     <vf-icon label="Trash" width="64" selectable movable editable left="16" top="280">…</vf-icon>
 *   </vf-icon-field>
 *   <vf-window heading="Documents" width="320" height="201" scrollbars="both" top="40" left="120">
 *     <vf-icon-field label="Documents">
 *       <vf-icon label="Read Me" width="64" selectable movable editable left="16" top="16">…</vf-icon>
 *     </vf-icon-field>
 *   </vf-window>
 * </vf-desktop>
 * ```
 *
 * ### Semantics through internals
 *
 * `role="listbox"` and `aria-multiselectable="true"` always — the Finder was
 * always multi-select, so there is no attribute for it — and `label` as the
 * accessible name, the way `vf-scroll-area` takes one. Internals values are
 * defaults (SPEC §2): a consumer's own `role`/`aria-*` on the tag still wins.
 * A `selectable` icon inside becomes a real `option` carrying `aria-selected`;
 * `vf-icon` matches this tag directly, since a role written through internals
 * never lands as an attribute for `closest()` to find.
 *
 * ### Layout-neutral, exactly what the div was
 *
 * An in-flow block with no size, no inset and no position of its own,
 * painting nothing — the `vf-stack` posture. A field whose icons are all
 * placed is a zero-height block, so the icons keep anchoring to the desktop's
 * raster or the window's plane, stored coordinates mean what they meant, and
 * a press on the bare dither still reaches the desktop. It takes `top`/`left`
 * and `width`/`height` like the other declared-box containers, so a page that
 * wants the field to be a box places and sizes it, at which point it becomes
 * the anchor — the placement working, as documented for everything.
 * `fill-width`/`fill-height` are the other way to give it a box, read about
 * the host the way `vf-stack` and `vf-container` read them: a filled field
 * stays in flow and static, so its icons keep their anchor, and it has a
 * surface to press — which is what the rubber band needs.
 *
 * ### The rubber band
 *
 * A press on the field's own background — not on an icon — dragged across
 * the field draws the Finder's dotted selection rectangle from the press to
 * the pointer, and the selection follows it live by the Finder's one rule:
 * **an icon is selected exactly when it was selected at the press XOR the
 * rectangle touches it.** The press fixes that anchor: a plain press has
 * already cleared everything (the way any press outside an icon does), so
 * the rectangle simply selects what it touches and releases what it leaves;
 * with Shift or ⌘ held the selection survives the press and the rectangle
 * *toggles* against it — an icon already selected deselects while the
 * rectangle covers it and comes back when it leaves, one that was not
 * selects. Each change reports `vf-select` as a press would. "Touches"
 * means the icon's art cell or its name plate ({@link VfIcon.touches}), not
 * the empty cell beside them, so a rectangle through the gap between two
 * icons selects neither. The release keeps the result; Escape or a
 * `pointercancel` cancels, the rectangle vanishes and the selection goes
 * back to the anchor. A press that never leaves its system pixel draws
 * nothing.
 *
 * The rectangle is drawn with the drag outline's pen ({@link
 * paintSelectionRect}: the dotted one-pixel outline, `filter: invert(1)`
 * under `mix-blend-mode: difference`) at the field's own level, which is
 * where the Finder drew its marquee — on the desktop under the windows, in a
 * window body over that window's content and under any window above it —
 * positioned against the viewport from the field's own shadow, since a
 * layout-neutral field has no box of its own to anchor to. It reaches no
 * further than the field, inside every clip above the field (a window body,
 * a scroll viewport, the raster's edge), so it never paints outside the
 * region the icons are visible in. Its dots are phased against the field's
 * own box; a field at the screen's origin shares the desktop dither's phase.
 *
 * Only a field with a box can be pressed: fill it, or place and size it. An
 * unplaced, unfilled field of placed icons is zero-height and draws no band.
 * `touch-action` is left alone, so on a touch screen a drag on the
 * background pans a scrolling window as it always did; the band is a mouse
 * and pen gesture.
 *
 * ### `size` is the view's
 *
 * `large` or `small`, written onto every icon in the field when set and
 * whenever it changes, so View → by Small Icon is one attribute instead of a
 * loop over every icon. Unset, each icon keeps its own.
 *
 * ### The desktop uses it, and renders none
 *
 * A desktop's icons sit in a field slotted into `vf-desktop` beside the
 * windows, written by the page; a folder window's icons sit in one slotted
 * into the window body. `vf-desktop` builds no field of its own: its furniture
 * is slotted light DOM and the page decides what it is, a desktop with no
 * icons should carry no empty listbox, and a field inside the desktop's
 * shadow is one `closest()` could not reach.
 *
 * @slot - The icons.
 */
@vfElement('vf-icon-field')
export class VfIconField extends VfSized(VfPositioned(LitElement)) {
  static override styles = [
    vfBase,
    css`
      :host {
        /* A block that shrink-wraps: the field is exactly as big as what it
           holds in flow — nothing, for a field of placed icons — so it can
           never hand a size it never declared to anything, and a zero-height
           block intercepts no press meant for the desktop under it. A
           declared width/height lands on the host's inline style (VfSized)
           and beats this; top/left make it the anchor (VfPositioned). */
        display: block;
        width: fit-content;
        /* Typographic transparency — the vf-stack reset, for the same
           reason: vfBase dresses a host as chrome, and a container that
           holds no text of its own must not change how its content reads. */
        font: inherit;
        -webkit-font-smoothing: inherit;
        color: inherit;
        user-select: inherit;
        -webkit-user-select: inherit;
        text-align: inherit;
      }
      /* The same two words a child uses, read about the host — the
         vf-container rule. A percentage is the one fill a page can always
         express: 100% of a desktop's screen, of a window body (a definite
         flex item). The host stays static, so its icons keep their anchor;
         what it gains is a surface to press. */
      :host([fill-width]) {
        width: 100%;
      }
      :host([fill-height]) {
        height: 100%;
      }
    `,
  ]

  /**
   * Accessible name for the field — "Desktop", the folder's name — applied as
   * the listbox's `aria-label` through internals, so a consumer's own
   * `aria-label` on the tag still wins.
   */
  @property() label = ''

  /**
   * The view's icon size, `large` or `small`, written onto every icon in the
   * field — View → by Small Icon as one attribute. Unset, each icon keeps
   * its own `size`.
   */
  @property({ reflect: true }) size?: VfIconSize | null

  // `top`/`left` come from VfPositioned and `width`/`height` from VfSized;
  // stated, they make the field a box and the anchor its icons place against.

  /**
   * Default-on display scaling (true 72dpi size); see src/scale.ts. A lone
   * field with a declared size on a plain page would otherwise resolve that
   * size against the `var(--vf-scale, 1)` fallback while its icons
   * self-scaled around it — the vf-stack reasoning.
   */
  private readonly scale = new ScaleController(this)

  /**
   * ARIA goes through internals, never `setAttribute` on the host: internals
   * values are *defaults*, so a consumer's own `role`/`aria-*` on the tag wins
   * — the platform's own precedence. See SPEC §2.
   */
  readonly #internals = this.attachInternals()

  /** The rubber band in flight, or null between gestures. */
  #band: Band | null = null

  /**
   * Escape mid-band cancels — the in-flight-gesture idiom `vf-icon`'s drag
   * uses, on the document because the field never takes focus. Capture
   * phase, and the key is stopped there, so an enclosing `vf-dialog` never
   * reads it as a dismissal.
   */
  readonly #escape = new DocumentListenersController(this, () => [
    [document, 'keydown', this.#onKeyDown, true],
  ])

  constructor() {
    super()
    this.#internals.role = 'listbox'
    // Always: the Finder's selection was always a set, so there is no
    // attribute to turn this on or off.
    this.#internals.ariaMultiSelectable = 'true'
    // The rubber band, on the host: the press has to land on the field's own
    // background (see #onPointerDown), and the capture keeps the moves
    // flowing once it does.
    this.addEventListener('pointerdown', this.#onPointerDown)
    this.addEventListener('pointermove', this.#onPointerMove)
    this.addEventListener('pointerup', this.#onPointerUp)
    this.addEventListener('pointercancel', this.#onPointerUp)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    // A band cannot outlive the element: the pointer capture went with it,
    // and the Escape listener with the controller.
    this.#band?.canvas?.remove()
    this.#band = null
  }

  protected override updated(changed: PropertyValues<this>): void {
    // Written unconditionally: an empty label clears the internals default
    // rather than the host (the vf-list rule).
    if (changed.has('label')) this.#internals.ariaLabel = this.label || null
    if (changed.has('size')) this.#applySize()
  }

  /** Icons arriving after the view was set take the view's size. */
  #onSlotChange = (): void => {
    this.#applySize()
  }

  /**
   * Push the view's size onto every icon in the field. Descendants rather
   * than direct children, so an icon inside a wrapper is one of the field's
   * too; a property write, which Lit keeps for an icon that has not upgraded
   * yet. Unset means hands off.
   */
  #applySize(): void {
    const size = this.size
    if (size == null) return
    for (const icon of this.querySelectorAll('vf-icon')) {
      if (icon.size !== size) icon.size = size
    }
  }

  /** The icons the band can select: every selectable one in the field. */
  #icons(): VfIcon[] {
    return [...this.querySelectorAll('vf-icon')].filter((icon) => icon.selectable)
  }

  /**
   * A press on the field's own background. `event.target` is the host only
   * when nothing slotted was hit — a press on an icon reaches here with the
   * icon as its target, and that press is the icon's own gesture. The
   * anchor is read after the icons' outside-press listeners have run
   * (document capture, ahead of this): what they left selected is what
   * Shift or ⌘ kept — nothing, after a plain press.
   */
  #onPointerDown = (event: PointerEvent): void => {
    if (this.#band || event.button !== 0 || event.target !== this) return
    const box = this.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return
    const scale = effectiveScale(this)
    const reach = this.#reach(box, scale)
    this.#band = {
      pointerId: event.pointerId,
      box,
      reach,
      origin: this.#point(event, box, scale, reach),
      anchor: new Set(this.#icons().filter((icon) => icon.selected)),
      rect: null,
      canvas: null,
      phase: -1,
    }
    this.setPointerCapture(event.pointerId)
    // No text selection across the page while the band drags.
    event.preventDefault()
  }

  /**
   * A step of the band. The first step whose point differs from the press
   * starts it — a stationary press draws nothing and changes nothing beyond
   * what the press itself did. Each changed rectangle is redrawn and the
   * icons under it re-read.
   */
  #onPointerMove = (event: PointerEvent): void => {
    const band = this.#band
    if (!band || event.pointerId !== band.pointerId) return
    const scale = effectiveScale(this)
    const point = this.#point(event, band.box, scale, band.reach)
    if (!band.rect && point.x === band.origin.x && point.y === band.origin.y) return
    const rect: BandRect = {
      x: Math.min(band.origin.x, point.x),
      y: Math.min(band.origin.y, point.y),
      width: Math.abs(point.x - band.origin.x),
      height: Math.abs(point.y - band.origin.y),
    }
    const last = band.rect
    if (
      last &&
      last.x === rect.x &&
      last.y === rect.y &&
      last.width === rect.width &&
      last.height === rect.height
    ) {
      return
    }
    if (!last) {
      this.#escape.attach()
      band.canvas = this.#makeCanvas()
      this.renderRoot.append(band.canvas)
    }
    band.rect = rect
    this.#paint(band, scale)
    this.#selectUnder(band, scale)
  }

  #onPointerUp = (event: PointerEvent): void => {
    const band = this.#band
    if (!band || event.pointerId !== band.pointerId) return
    this.#end(event.type === 'pointercancel')
  }

  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    this.#end(true)
  }

  /**
   * The release, or a cancel. A band that never started (a click) has
   * nothing to undo. A release keeps the selection the band made; a cancel
   * puts the anchor back.
   */
  #end(cancelled: boolean): void {
    const band = this.#band
    if (!band) return
    this.#band = null
    if (this.hasPointerCapture(band.pointerId)) this.releasePointerCapture(band.pointerId)
    if (!band.rect) return
    this.#escape.detach()
    band.canvas?.remove()
    if (cancelled) {
      for (const icon of this.#icons()) {
        const want = band.anchor.has(icon)
        if (icon.selected !== want) icon.setSelected(want)
      }
    }
  }

  /**
   * A pointer position as a point in system px from the field's box, whole
   * and held inside the band's reach.
   */
  #point(
    event: PointerEvent,
    box: DOMRect,
    scale: number,
    reach: Band['reach']
  ): { x: number; y: number } {
    return {
      x: clamp(Math.round((event.clientX - box.left) / scale), reach.minX, reach.maxX),
      y: clamp(Math.round((event.clientY - box.top) / scale), reach.minY, reach.maxY),
    }
  }

  /**
   * How far the band may reach: the field's own box, intersected with every
   * ancestor that clips — a window body, a scroll viewport, the desktop's
   * raster — found by walking the flat tree, slots and shadow hosts
   * included. In system px from the field's box, whole, rounded inward.
   */
  #reach(box: DOMRect, scale: number): Band['reach'] {
    let left = box.left
    let top = box.top
    let right = box.right
    let bottom = box.bottom
    let node: Node | null = this.assignedSlot ?? this.parentNode
    while (node) {
      if (node instanceof Element) {
        const style = getComputedStyle(node)
        if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
          const clip = node.getBoundingClientRect()
          left = Math.max(left, clip.left)
          top = Math.max(top, clip.top)
          right = Math.min(right, clip.right)
          bottom = Math.min(bottom, clip.bottom)
        }
        node = node.assignedSlot ?? node.parentNode
      } else if (node instanceof ShadowRoot) {
        node = node.host
      } else {
        node = null
      }
    }
    const inward = (v: number): number => Math.round(v * 64) / 64
    return {
      minX: Math.max(0, Math.ceil(inward((left - box.left) / scale))),
      minY: Math.max(0, Math.ceil(inward((top - box.top) / scale))),
      maxX: Math.max(0, Math.floor(inward((right - box.left) / scale))),
      maxY: Math.max(0, Math.floor(inward((bottom - box.top) / scale))),
    }
  }

  /**
   * The band's canvas: the drag outline's XOR pen, positioned against the
   * viewport from the field's own shadow — a layout-neutral field has no
   * positioned box of its own for it to anchor to — and never a hit.
   */
  #makeCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.className = 'selection-rect'
    const style = canvas.style
    style.position = 'fixed'
    style.display = 'block'
    style.pointerEvents = 'none'
    style.filter = 'invert(1)'
    style.mixBlendMode = 'difference'
    style.imageRendering = 'pixelated'
    return canvas
  }

  /**
   * Draw the rectangle where it lands: whole system px from the field's box,
   * which sits on the device grid, so the band does too. The checker's
   * phase follows the rectangle's own corner parity in the field's box.
   */
  #paint(band: Band, scale: number): void {
    const { rect, canvas } = band
    if (!rect || !canvas) return
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    const phase = (((rect.x + rect.y) % 2) + 2) % 2
    // A changed size repaints regardless: the ring is the rectangle itself.
    paintSelectionRect(canvas, width, height, phase)
    band.phase = phase
    canvas.style.left = `${band.box.left + rect.x * scale}px`
    canvas.style.top = `${band.box.top + rect.y * scale}px`
    canvas.style.width = `${width * scale}px`
    canvas.style.height = `${height * scale}px`
  }

  /**
   * The selection under the band — the Finder's rule, re-evaluated for
   * every selectable icon on every changed rectangle: selected exactly when
   * it was in the anchor XOR the rectangle touches it (its art cell or its
   * plate, the icon's own reading). A plain press left an empty anchor, so
   * the rectangle selects what it touches and releases what it leaves; a
   * Shift or ⌘ press kept one, so the rectangle toggles against it. Each
   * change goes through the icon's own gesture route so `vf-select` reports
   * it.
   */
  #selectUnder(band: Band, scale: number): void {
    const { rect } = band
    if (!rect) return
    const area = {
      left: band.box.left + rect.x * scale,
      top: band.box.top + rect.y * scale,
      right: band.box.left + (rect.x + Math.max(1, rect.width)) * scale,
      bottom: band.box.top + (rect.y + Math.max(1, rect.height)) * scale,
    }
    for (const icon of this.#icons()) {
      const want = band.anchor.has(icon) !== icon.touches(area)
      if (icon.selected !== want) icon.setSelected(want)
    }
  }

  protected override render() {
    return html`<slot @slotchange=${this.#onSlotChange}></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-icon-field': VfIconField
  }
}
