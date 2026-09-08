import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { effectiveScale, snapSys } from './scale.js'

/**
 * The moving side of a pointer drag. A component supplies these callbacks; the
 * {@link DragController} owns the pointer bookkeeping (which button, capture,
 * delta tracking, system-pixel snapping) so window, dialog and icon dragging
 * stay identical.
 *
 * Every coordinate here is in **system px** — the art's own unit, and the unit
 * a placement is stored in, so that a dropped host is still where it was
 * dropped after a zoom. The controller does the one conversion: pointer events
 * arrive in CSS px, and only the *delta* is converted.
 *
 * The trailing parameters on {@link onDrag} and {@link onDragEnd} are
 * additive: a target that declares fewer (`vf-window`, `vf-dialog`) still
 * conforms and simply ignores them.
 */
export interface DragTarget {
  /**
   * A press landed on the drag handle. Return the origin in system px, the
   * space {@link onDrag} writes back in, to begin the drag — or `null` to
   * ignore this press (wrong button, landed on a widget, the host isn't
   * movable). Seed any positioning state here before returning the origin.
   */
  onDragStart(event: PointerEvent): { x: number; y: number } | null
  /**
   * Apply a moved origin, in system px, already snapped onto the lattice.
   * `event` is the pointer move that produced it, for a target that reports
   * the pointer itself (`vf-icon`'s drag events carry `clientX`/`clientY`).
   */
  onDrag(x: number, y: number, event: PointerEvent): void
  /**
   * Optional: the drag ended. `cancelled` tells an abandoned gesture — a
   * `pointercancel`, or {@link DragController.cancel} — from a release;
   * `event` is the pointer event that ended it, `undefined` for a
   * programmatic cancel.
   */
  onDragEnd?(event: PointerEvent | undefined, cancelled: boolean): void
}

/**
 * Drag-to-move for 1-bit chrome. Bind {@link onPointerDown} / {@link onPointerMove}
 * / {@link onPointerUp} to a handle element (`vf-window`'s title bar,
 * `vf-dialog`'s title bar); the controller captures the pointer on that handle,
 * tracks the delta from the press point, and hands the {@link DragTarget} a new
 * origin in system px, snapped onto the placement lattice — whole art pixels,
 * the way QuickDraw moved windows, which is also what keeps the pixel art
 * inside fringe-free (see {@link snapSys}). The target decides how to apply
 * it; all three write it through `top`/`left` (`src/position.ts`).
 */
export class DragController implements ReactiveController {
  #pointerId: number | null = null
  /** The handle the capture was taken on, for {@link cancel} to release. */
  #handle: HTMLElement | null = null
  #startX = 0
  #startY = 0
  #baseX = 0
  #baseY = 0

  constructor(
    private readonly host: ReactiveControllerHost & Element,
    private readonly target: DragTarget
  ) {
    host.addController(this)
  }

  /** Abandon an in-flight drag if the host is torn down mid-gesture. */
  hostDisconnected(): void {
    this.#pointerId = null
    this.#handle = null
  }

  onPointerDown = (event: PointerEvent): void => {
    if (this.#pointerId !== null) return // already dragging with another pointer
    const origin = this.target.onDragStart(event)
    if (!origin) return
    this.#pointerId = event.pointerId
    this.#startX = event.clientX
    this.#startY = event.clientY
    this.#baseX = origin.x
    this.#baseY = origin.y
    // Capture on the handle so moves keep flowing if the pointer leaves it.
    const handle = event.currentTarget as HTMLElement
    this.#handle = handle
    handle.setPointerCapture(event.pointerId)
    // Suppress text selection / native focus shuffling during the drag.
    event.preventDefault()
  }

  onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return
    // The delta is the only thing that has to cross units: the origin is
    // already in system px, and adding a converted delta to it keeps the
    // gesture free of the accumulated rounding a per-step conversion would
    // bring. Trackpads report fractional clientX/Y, so snap every step —
    // the host and all the pixel art inside it stay on the system grid.
    const scale = effectiveScale(this.host)
    this.target.onDrag(
      snapSys(this.#baseX + (event.clientX - this.#startX) / scale, this.host),
      snapSys(this.#baseY + (event.clientY - this.#startY) / scale, this.host),
      event
    )
  }

  /**
   * The release — or, bound to `pointercancel` as every handle binds it, the
   * platform abandoning the gesture (a touch the browser took for a scroll),
   * which the target hears as a cancel.
   */
  onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return
    this.#pointerId = null
    this.#handle = null
    const handle = event.currentTarget as HTMLElement
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId)
    }
    this.target.onDragEnd?.(event, event.type === 'pointercancel')
  }

  /**
   * Abandon the in-flight drag from code — an Escape mid-gesture. The capture
   * is released and the target hears a cancel with no pointer event; the
   * pointer's eventual release then belongs to nobody.
   */
  cancel(): void {
    if (this.#pointerId === null) return
    const id = this.#pointerId
    const handle = this.#handle
    this.#pointerId = null
    this.#handle = null
    if (handle?.hasPointerCapture(id)) handle.releasePointerCapture(id)
    this.target.onDragEnd?.(undefined, true)
  }
}
