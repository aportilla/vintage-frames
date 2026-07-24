/**
 * Dispatch a `vf-*` CustomEvent following the kit's SPEC §4 convention: every
 * public component event bubbles and crosses shadow roots (`bubbles: true`,
 * `composed: true`) so an ancestor listener in the light DOM can hear it.
 *
 * Centralises the boilerplate that was hand-rolled at 30+ call sites (and in
 * three near-identical private `#emit`/`_emit` wrappers). Returns
 * `dispatchEvent`'s result — `false` when a `cancelable` event was canceled
 * (used by the internal `vf-menu-toggle-request` handshake), otherwise `true`.
 *
 * @param host      element to dispatch from (the event's `target`)
 * @param name      event type, e.g. `'vf-change'`
 * @param detail    optional `event.detail` payload
 * @param options   set `cancelable` to allow a listener to `preventDefault()`
 */
export function emit<T = unknown>(
  host: EventTarget,
  name: string,
  detail?: T,
  options?: { cancelable?: boolean }
): boolean {
  return host.dispatchEvent(
    new CustomEvent<T>(name, {
      detail: detail as T,
      bubbles: true,
      composed: true,
      cancelable: options?.cancelable ?? false,
    })
  )
}
