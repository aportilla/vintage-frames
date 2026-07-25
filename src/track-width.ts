import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * Measured width of an indicator's track box, for components that draw their
 * own 1-bit geometry into it.
 *
 * `vf-slider` and `vf-progress-bar` can't express their fill in CSS: both snap
 * it to whole *system* pixels so the 1px leading edge (and the slider's thumb
 * sprite) lands on the device grid instead of fringing, which means they need
 * the track's width as a number before they can render. This controller
 * supplies it — a {@link ResizeObserver} on the track box, floored to a whole
 * CSS px, requesting a host update whenever it changes.
 *
 * Wiring the observer is the fiddly part, and it is the reason this is a
 * controller rather than two copies of the same twenty lines: the track lives
 * in the shadow root, so it does not exist on the host's *first* connect but
 * does on every later one. Both components previously called their observe
 * helper from `connectedCallback` *and* `firstUpdated`, where the first-mount
 * call is a guarded no-op that exists only so a reconnect re-observes. Here
 * that is one entry point driven by the controller lifecycle, which is also
 * why re-observing is skipped when the element hasn't changed: `observe()` on
 * an already-observed element re-fires the initial callback, and `hostUpdated`
 * runs on every update.
 */
export class TrackWidthController implements ReactiveController {
  private resizeObserver?: ResizeObserver
  private observed: Element | null = null
  private measured = 0

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly getTrack: () => HTMLElement | null | undefined
  ) {
    host.addController(this)
  }

  /**
   * Content width of the track in CSS px (already scaled — convert with
   * `toSys()` before doing system-pixel math). `0` until first measured, which
   * each component treats as "not measured yet" and falls back from.
   */
  get width(): number {
    return this.measured
  }

  hostConnected(): void {
    this.wire()
  }

  hostUpdated(): void {
    this.wire()
  }

  hostDisconnected(): void {
    // Unobserve, but keep the instance: a ResizeObserver stays usable after
    // disconnect(), and a re-parented component would otherwise allocate a
    // fresh one on every move. Clearing `observed` is what lets the next
    // connect re-observe through the same guard.
    this.resizeObserver?.disconnect()
    this.observed = null
  }

  /** (Re-)attach the observer to the track box, once per distinct element. */
  private wire(): void {
    if (typeof ResizeObserver === 'undefined') return
    const track = this.getTrack()
    if (!track || track === this.observed) return
    this.resizeObserver ??= new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const next = Math.floor(entry.contentRect.width)
      if (next === this.measured) return
      this.measured = next
      this.host.requestUpdate()
    })
    this.resizeObserver.observe(track)
    this.observed = track
  }
}
