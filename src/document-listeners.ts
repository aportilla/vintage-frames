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
/**
 * Runs `release` once the in-flight press gesture is over — its trailing
 * `click`, wherever that lands, or a `pointercancel` if no click ever comes.
 *
 * A swallow-click latch armed on `pointerdown` cannot be cleared by the
 * element's own click handler alone: per UI Events, the click after a
 * press-drag-release is dispatched at the nearest common inclusive ancestor of
 * the pointerdown and pointerup targets, so a press that releases elsewhere
 * lands it *above* the pressed element, the clearing handler never runs, and
 * the stuck latch silently swallows the next synthetic (assistive-tech)
 * click. One-shot and bubble-phase, so the element's own click handler — the
 * swallow itself — always runs first.
 */
export function releaseAfterGesture(release: () => void): void {
  const done = (): void => {
    document.removeEventListener('click', done)
    document.removeEventListener('pointercancel', done)
    release()
  }
  document.addEventListener('click', done)
  document.addEventListener('pointercancel', done)
}

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
