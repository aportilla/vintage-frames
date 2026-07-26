import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * One managed listener: target, event type, handler, and capture/options —
 * exactly the arguments the add/remove pair is made with. The handler's event
 * parameter is typed `never` (the bottom type) so a handler narrowed to its
 * real event (`(event: PointerEvent) => void`) is accepted without a cast;
 * the single widening cast lives inside the controller.
 */
export type DocumentListenerSpec = readonly [
  target: EventTarget,
  type: string,
  handler: (event: never) => void,
  options?: boolean | AddEventListenerOptions,
]

/**
 * Document-level listeners scoped to a transient state — an open panel, an
 * in-flight gesture.
 *
 * The kit's transient surfaces (`vf-menu`, `vf-menu-bar`, `vf-select`) listen
 * outside their own shadow root while open: capture-phase `pointerdown` for
 * outside dismissal, `scroll`/`resize` to keep a fixed-position panel honest,
 * document-wide keyboard navigation, a press gesture tracked to its release
 * anywhere on the page. Each of them hand-rolled the same bookkeeping —
 * add/remove calls that must mirror each other exactly, an attached guard
 * making both idempotent, and a disconnect cleanup so a host torn down
 * mid-open can't leak listeners onto the document. This controller owns that
 * bookkeeping; the handlers, and when to {@link attach}, stay the host's.
 *
 * The spec list is a thunk, evaluated at attach time, so a controller field
 * may sit above the handler fields it references without capturing their
 * pre-initialization `undefined`. {@link detach} removes exactly the specs
 * the last {@link attach} added.
 *
 * Listeners are detached on host disconnect and are NOT re-attached on
 * reconnect: the state that warranted them (an open panel, a pressed pointer)
 * is itself torn down by the host on disconnect.
 */
export class DocumentListenersController implements ReactiveController {
  /** The specs currently attached; null while detached. */
  private active: readonly DocumentListenerSpec[] | null = null

  constructor(
    host: ReactiveControllerHost,
    private readonly listeners: () => readonly DocumentListenerSpec[]
  ) {
    host.addController(this)
  }

  /** Add every listener. A no-op while already attached. */
  attach(): void {
    if (this.active) return
    this.active = this.listeners()
    for (const [target, type, handler, options] of this.active) {
      target.addEventListener(type, handler as EventListener, options)
    }
  }

  /** Remove every listener the last {@link attach} added. A no-op while detached. */
  detach(): void {
    if (!this.active) return
    for (const [target, type, handler, options] of this.active) {
      target.removeEventListener(type, handler as EventListener, options)
    }
    this.active = null
  }

  hostDisconnected(): void {
    this.detach()
  }
}
