import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { snapToDevicePx } from './scale.js'

/**
 * The moving side of a pointer drag. A component supplies these callbacks; the
 * {@link DragController} owns the pointer bookkeeping (which button, capture,
 * delta tracking, device-pixel snapping) so window and dialog dragging stay
 * identical.
 */
export interface DragTarget {
  /**
   * A press landed on the drag handle. Return the origin the delta is added to
   * — in the same coordinate space {@link onDrag} writes back — to begin the
   * drag, or `null` to ignore this press (wrong button, landed on a widget, the
   * host isn't movable). Seed any positioning state (e.g. switch to absolute)
   * here before returning the origin.
   */
  onDragStart(event: PointerEvent): { x: number; y: number } | null
  /** Apply a moved origin. Already snapped onto the device-pixel grid. */
  onDrag(x: number, y: number): void
  /** Optional: the drag ended (pointer released or cancelled). */
  onDragEnd?(): void
}

/**
 * Drag-to-move for 1-bit chrome. Bind {@link onPointerDown} / {@link onPointerMove}
 * / {@link onPointerUp} to a handle element (`vf-window`'s title bar,
 * `vf-dialog`'s title bar); the controller captures the pointer on that handle,
 * tracks the delta from the press point, and hands the {@link DragTarget} a new
 * origin snapped onto the device grid — the same snap every JS-written position
 * goes through so the pixel art inside never grows an antialiasing fringe (see
 * scale.ts). The target decides how to apply it (a window writes `left`/`top`, a
 * modal dialog writes its centering margins).
 */
export class DragController implements ReactiveController {
  #pointerId: number | null = null
  #startX = 0
  #startY = 0
  #baseX = 0
  #baseY = 0

  constructor(
    host: ReactiveControllerHost,
    private readonly target: DragTarget
  ) {
    host.addController(this)
  }

  /** Abandon an in-flight drag if the host is torn down mid-gesture. */
  hostDisconnected(): void {
    this.#pointerId = null
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
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    // Suppress text selection / native focus shuffling during the drag.
    event.preventDefault()
  }

  onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return
    // Trackpads report fractional clientX/Y — snap every step so the host (and
    // all the pixel art inside it) stays on the device grid.
    this.target.onDrag(
      snapToDevicePx(this.#baseX + (event.clientX - this.#startX)),
      snapToDevicePx(this.#baseY + (event.clientY - this.#startY))
    )
  }

  onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return
    this.#pointerId = null
    const handle = event.currentTarget as HTMLElement
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId)
    }
    this.target.onDragEnd?.()
  }
}
