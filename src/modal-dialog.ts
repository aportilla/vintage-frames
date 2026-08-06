import { css, LitElement } from 'lit'
import type { PropertyValues } from 'lit'
import { property, query } from 'lit/decorators.js'
import {
  onScaleChange,
  ScaleController,
  snapSys,
  sysLength,
  toSysExact,
} from './scale.js'
import { emit } from './events.js'

/** Reason a modal closed, carried by the `vf-close` event's detail. */
export type VfCloseReason = 'escape' | 'close'

/**
 * The width an undeclared modal falls back to, in system px — a classic
 * dialog's own measure, wide enough for a line of chrome text and a button row.
 * It exists so an unsized modal still renders, and still owns a *definite*
 * width so dragging cannot squeeze it; the console says what to declare.
 */
export const MODAL_FALLBACK_WIDTH = 260

/**
 * How much of a placed modal must stay inside the viewport, in system px —
 * enough of the title bar to grab it back by, the same strip `vf-window` keeps.
 */
const KEEP_GRABBABLE = 24

/**
 * Shared native-`<dialog>` styles for the modal shells: a chromeless top-layer
 * dialog (the frame is drawn by the subclass) with a fully transparent
 * backdrop — pure System 7, no dimming.
 */
export const modalDialogStyles = css`
  dialog {
    padding: 0;
    margin: auto;
    border: none;
    background: transparent;
    overflow: visible;
    color: inherit;
    font: inherit;
    /* showModal()'s focusing steps fall back to focusing the dialog itself
       when no descendant is chosen as the focus delegate — WebKit and Firefox
       reach that with the kit's controls hidden inside shadow roots — and
       both then draw their native ring around the top-layer box. The modal
       frame already announces the surface, and focus marks inside it are the
       kit's own (1-bit, on the controls), so the UA ring is suppressed rather
       than restyled. */
    outline: none;
  }
  /* Scoped to [open]: an unqualified display here would out-cascade the UA's
     dialog:not([open]) { display: none } (author origin beats UA origin) and
     paint every closed dialog. Flex, so the frame child can resolve against
     the dialog's real box even when no height is declared and the UA's
     dialog:modal max-height is what caps it — a percentage height resolves
     to auto against that (indefinite) box, which left the frame content-tall
     and spilling past the border with its buttons unreachable; a flex child
     with min-height: 0 shrinks to the capped box instead, and the shells'
     inner scroll region takes over from there. */
  dialog[open] {
    display: flex;
    flex-direction: column;
  }
  dialog::backdrop {
    background: transparent;
    /* The backdrop is top-layer: no page cursor rule can reach it, so the
       kit-wide cursor token (SPEC §3) is read here — \`::backdrop\` inherits
       custom properties from its dialog in current engines; where it doesn't,
       the fallback is the arrow it always showed. */
    cursor: var(--vf-cursor, default);
  }
`

/**
 * Base class for the modal shell `vf-dialog` — and for a consumer's own
 * modal (an alert box, say) authored against the kit.
 *
 * Owns the native `<dialog>` lifecycle every modal shares: `open` sync, `show()` /
 * `close()`, the {@link top}/{@link left} placement (stated or centered) and the
 * single `close` funnel that drops the written origin and fires `vf-close` with
 * the reason. Because every close path — Escape, `close()`, backdrop — routes
 * through the native `close` event, an Escape-close no longer leaves a stale
 * origin behind, so the next open re-derives it.
 *
 * Removing an open modal from the DOM is a close path too. HTML's dialog
 * *removing steps* take the element out of the top layer **without** running
 * the close algorithm — no `close` event, no focus restoration — which is
 * exactly what the standard framework pattern of unmounting a dialog instead
 * of calling `close()` does. `disconnectedCallback` routes that path through
 * the same funnel: the removed element still fires `vf-close` (heard by
 * listeners on the element itself — it has left the tree, so nothing
 * bubbles), `open` and the pinned margins reconcile so a re-append mounts it
 * closed and re-centered, and focus returns to the element that was focused
 * when the modal opened.
 *
 * Subclasses supply only the frame chrome: a `render()` returning
 * `<dialog @cancel=${this._onNativeCancel} @close=${this._onNativeClose}>` with
 * their role/ARIA and body, and {@link modalDialogStyles} in `static styles`.
 *
 * @fires vf-close - The modal closed. `detail: { reason: 'escape' | 'close' }`.
 */
export class VfModalDialog extends LitElement {
  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  protected readonly scale = new ScaleController(this)

  /** Whether the modal is open. Kept in sync with the native `<dialog>`. */
  @property({ type: Boolean, reflect: true }) open = false

  /**
   * Modal width in whole system px — the art's own unit, so the box holds its
   * proportion to the chrome inside it at every display density.
   *
   * **Declare it.** A modal owns its width; it is not a shape its content
   * happens to fall into. The platform's own default is `fit-content` measured
   * against the space *left over* beside its offsets — and stating an offset is
   * exactly how the box is placed and dragged ({@link top}), so an undeclared
   * modal squeezes itself and reflows its text as it moves toward an edge.
   * Unset, it falls back to {@link MODAL_FALLBACK_WIDTH} and says so once in
   * the console.
   */
  @property({ type: Number }) width?: number

  /**
   * Modal height in whole system px.
   *
   * **Declare it,** with {@link width}. A modal is a fixed box in both axes —
   * the same rule `vf-window` follows, for the same reason: the classic shells
   * carried both dimensions in the resource, and a box that grows with its body
   * is one whose buttons move under the pointer as its text changes. Unset, the
   * body sizes to its content — the old behavior — and it says so once in the
   * console.
   *
   * Content taller than the declared box is clipped at the frame.
   */
  @property({ type: Number }) height?: number

  /**
   * Offset from the top of the **viewport**, in whole system px — the same
   * `top`/`left` pair every other component takes ({@link VfPositioned}), in
   * the same unit, with one difference the platform forces: `showModal()` puts
   * the box in the top layer, whose containing block is the viewport rather
   * than the nearest positioned ancestor. So these coordinates are screen
   * coordinates, not the parent's.
   *
   * Leave both unset and the modal is **centered** — recomputed on open, and
   * again whenever its own box or the viewport changes, which is what keeps a
   * dialog whose slotted content upgrades after `showModal()` from opening at
   * the offset its smaller first render centered at. Dragging the title bar
   * states the pair; setting either back to `null` returns the modal to
   * centering.
   */
  @property({ type: Number }) top?: number | null

  /** Offset from the left of the viewport, in whole system px. See {@link top}. */
  @property({ type: Number }) left?: number | null

  @query('dialog') protected _dialog!: HTMLDialogElement

  /**
   * The declared box as inline styles for the subclass's `<dialog>`:
   * `style=${styleMap(this.dialogSize)}`. Width always resolves to something
   * definite — the declaration or the fallback — because that is what keeps a
   * drag from squeezing the box.
   */
  protected get dialogSize(): Record<string, string | null> {
    return {
      width: sysLength(this.width ?? MODAL_FALLBACK_WIDTH),
      height: this.height === undefined ? null : sysLength(this.height),
    }
  }

  /** One warning per element, on the open that first shows an unsized modal. */
  #warnedNoSize = false

  /**
   * Say it once, when an unsized modal is first shown — a hidden one is not
   * yet anybody's problem, and the name in the message is what makes it
   * findable in a page with several.
   *
   * Both dimensions are required, as on `vf-window`, but they fail differently:
   * an undeclared width takes a definite fallback (a squeezing box is worse
   * than a wrong-but-stable one), while an undeclared height just sizes to the
   * content and says so.
   */
  #warnIfUnsized(): void {
    if (this.#warnedNoSize || !this.open) return
    const missing: string[] = []
    if (this.width === undefined) {
      missing.push(`width (falling back to ${MODAL_FALLBACK_WIDTH} system px)`)
    }
    if (this.height === undefined) {
      missing.push('height (falling back to the content)')
    }
    if (missing.length === 0) return
    this.#warnedNoSize = true
    // Read the name off attributes: `heading` and `label` belong to the
    // subclasses, and the base has no business knowing which is which.
    const name = this.getAttribute('heading') ?? this.getAttribute('label') ?? ''
    console.warn(
      `${this.localName}${name ? ` ("${name}")` : ''}: no ` +
        `${missing.join(', no ')}. A modal owns its whole box — declare both ` +
        `in system px: <${this.localName} width="320" height="140">.`
    )
  }

  /** Close reason pending for the next native `close` event. */
  #closeReason: VfCloseReason | null = null

  /**
   * The element that was focused when the modal opened. The normal close path
   * restores focus natively, but the removal path (see the class doc) skips
   * the close algorithm, and by the time `disconnectedCallback` runs, focus
   * has already fallen to `<body>` — so we keep our own record.
   */
  #invoker: Element | null = null

  /** Open the modal (native `showModal()`), pinned onto the device grid. */
  show(): void {
    this.open = true
    if (this.hasUpdated) this.#syncDialog()
  }

  /** Close the modal. Fires `vf-close` with `{ reason: 'close' }`. */
  close(): void {
    this.open = false
    if (this.hasUpdated) this.#syncDialog()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('open')) this.#syncDialog()
    if (changed.has('top') || changed.has('left')) this.settle()
    this.#warnIfUnsized()
  }

  /* --- Placement ----------------------------------------------------- */

  /**
   * The viewport in system px — `documentElement.clientWidth/Height` rather
   * than `innerWidth/Height`, because that is the box a `position: fixed`
   * top-layer element actually resolves against (it excludes a classic
   * space-consuming scrollbar).
   */
  #viewport(): { width: number; height: number } {
    const root = document.documentElement
    return {
      width: toSysExact(root.clientWidth || window.innerWidth, this),
      height: toSysExact(root.clientHeight || window.innerHeight, this),
    }
  }

  /**
   * Keep a grabbable strip on screen, as `vf-window` does against its
   * positioning parent — a modal's is the viewport. With a declared width
   * nothing else stops a drag at an edge, and a `frame="plain"` modal has no
   * title bar to recover it by at all.
   */
  #keepOnScreen(x: number, y: number): { x: number; y: number } {
    const view = this.#viewport()
    const width = toSysExact(this._dialog?.offsetWidth ?? 0, this)
    return {
      x: Math.min(Math.max(x, KEEP_GRABBABLE - width), view.width - KEEP_GRABBABLE),
      y: Math.min(Math.max(y, 0), Math.max(0, view.height - KEEP_GRABBABLE)),
    }
  }

  /** The origin that centers the box in the viewport, in system px. */
  #centered(): { x: number; y: number } {
    const view = this.#viewport()
    const rect = this._dialog?.getBoundingClientRect()
    return {
      x: (view.width - toSysExact(rect?.width ?? 0, this)) / 2,
      y: (view.height - toSysExact(rect?.height ?? 0, this)) / 2,
    }
  }

  /**
   * State the origin, in system px — clamped on screen and snapped onto the
   * placement lattice, so what `top`/`left` report is what you can see. This is
   * what a title-bar drag calls; a modal that has been placed this way stays
   * placed, and re-centers only if the pair is cleared.
   */
  protected placeAt(x: number, y: number): void {
    const kept = this.#keepOnScreen(x, y)
    this.left = snapSys(kept.x, this)
    this.top = snapSys(kept.y, this)
  }

  /**
   * Write the origin onto the top-layer box: the stated one, or the centered
   * one while the pair is unset. Both go on as a live `calc()` in system px
   * ({@link sysLength}), so a zoom re-resolves the offset with every other
   * metric instead of leaving the box behind at a stale CSS-px constant — and
   * both are re-clamped here, which is what catches a viewport that shrank
   * (zooming in leaves fewer system px on the screen) without forgetting where
   * the modal was put.
   *
   * `position` is deliberately untouched: the UA already makes an open modal
   * `position: fixed`, and the four inset/margin declarations are what turn its
   * `inset: 0; margin: auto` centering into a stated origin.
   */
  protected settle(): void {
    const dialog = this._dialog
    if (!dialog?.open) return
    const stated = this.left != null || this.top != null
    const origin = stated ? { x: this.left ?? 0, y: this.top ?? 0 } : this.#centered()
    const kept = this.#keepOnScreen(origin.x, origin.y)
    dialog.style.left = sysLength(snapSys(kept.x, this))
    dialog.style.top = sysLength(snapSys(kept.y, this))
    dialog.style.right = 'auto'
    dialog.style.bottom = 'auto'
    dialog.style.margin = '0'
  }

  /** Hand the box back to the UA's own centering, for the next open to redo. */
  #clearPlacement(): void {
    const style = this._dialog?.style
    if (!style) return
    for (const property of ['left', 'top', 'right', 'bottom', 'margin']) {
      style.removeProperty(property)
    }
  }

  /**
   * Reconcile the native `<dialog>` with `open`. Opening states the origin —
   * the author's, or the centered one — onto the top-layer box; the UA's own
   * `margin: auto` centering lands on a half pixel whenever viewport minus
   * dialog is odd, which fringes all the 1-bit chrome inside. Closing just
   * calls `dialog.close()`, routing teardown through the native `close` event
   * so {@link _onNativeClose} is the one place placement is cleared and
   * `vf-close` is fired.
   */
  #syncDialog(): void {
    const dialog = this._dialog
    if (!dialog) return
    if (this.open && !dialog.open) {
      this.#invoker = document.activeElement
      dialog.showModal()
      this.settle()
      this.#watchGeometry(dialog)
    } else if (!this.open && dialog.open) {
      dialog.close()
    }
  }

  /**
   * Re-derive the placement rather than keep the latch. The open-time geometry
   * can be wrong by the next frame in three ways, and all three land here:
   * slotted content upgrading after `showModal()` grows the box (an unplaced
   * modal would otherwise hold the offset its small first render centered at,
   * stranding its bottom off-screen), the viewport resizing under it, and a
   * zoom or density change — which rescales every metric, moves the placement
   * lattice, and leaves fewer system px on the screen to fit in.
   *
   * What survives differs by how the modal got where it is, and that is the
   * point: an unplaced modal re-centers (it never claimed a spot), while one
   * the user dragged — or the author placed — keeps its stated origin and is
   * only re-clamped. The old behavior re-centered both, trading a dragged
   * position away on every one of these signals to avoid the stranded case.
   */
  #resettle = (): void => this.settle()

  #resizeObserver?: ResizeObserver
  #stopScaleWatch?: () => void

  /**
   * While open, watch everything that invalidates the placement: the dialog's
   * own box changing (content upgrade/growth, and `--vf-scale` moving under a
   * zoom or density change, since every metric resizes with it), the viewport
   * resizing, and the scale itself — which the box alone would miss on a page
   * that pins `--vf-scale`, where a zoom moves the lattice without resizing
   * anything. Undone in {@link _onNativeClose} / `disconnectedCallback`.
   */
  #watchGeometry(dialog: HTMLDialogElement): void {
    if (typeof ResizeObserver !== 'undefined' && !this.#resizeObserver) {
      this.#resizeObserver = new ResizeObserver(this.#resettle)
      this.#resizeObserver.observe(dialog)
    }
    window.addEventListener('resize', this.#resettle)
    this.#stopScaleWatch ??= onScaleChange(this.#resettle)
  }

  #unwatchGeometry(): void {
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = undefined
    window.removeEventListener('resize', this.#resettle)
    this.#stopScaleWatch?.()
    this.#stopScaleWatch = undefined
  }

  /**
   * Torn out of the DOM while open (the framework-unmount path — see the
   * class doc). `close()` routes the teardown through the same native-`close`
   * funnel every other path uses; the focus restore is ours to do, since the
   * removing steps already dropped focus to `<body>` before this ran.
   */
  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#unwatchGeometry()
    const dialog = this._dialog
    if (dialog?.open) {
      dialog.close()
      const invoker = this.#invoker
      const active = document.activeElement
      if (
        invoker instanceof HTMLElement &&
        invoker.isConnected &&
        (active === null || active === document.body)
      ) {
        invoker.focus()
      }
    }
    this.#invoker = null
  }

  /** Native `cancel` (Escape): remember the reason; `close` follows. */
  protected _onNativeCancel(): void {
    this.#closeReason = 'escape'
  }

  /**
   * Native `close` — the single teardown funnel for every close path. Drops
   * the written origin so the next open re-derives it from the box it will
   * actually have (a stated `top`/`left` is the author's or the user's and
   * survives, and is re-applied by that open), syncs `open`, and fires
   * `vf-close` with the reason.
   */
  protected _onNativeClose(): void {
    const reason = this.#closeReason ?? 'close'
    this.#closeReason = null
    this.#invoker = null
    this.#unwatchGeometry()
    this.open = false
    this.#clearPlacement()
    emit(this, 'vf-close', { reason })
  }
}
