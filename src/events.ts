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
 * The *internal* coordination events (the menu handshakes, the list-item
 * disabled notice) pass `composed: false`: parent and child share one light
 * tree, so crossing shadow roots buys them nothing — and leaking a private,
 * cancelable protocol out of a consumer's own shadow boundary hands their
 * delegated listeners an event they can break the kit by cancelling.
 *
 * @param host      element to dispatch from (the event's `target`)
 * @param name      event type, e.g. `'vf-change'`
 * @param detail    optional `event.detail` payload
 * @param options   set `cancelable` to allow a listener to `preventDefault()`;
 *                  set `composed: false` to keep an internal event inside the
 *                  dispatching tree
 */
export function emit<T = unknown>(
  host: EventTarget,
  name: string,
  detail?: T,
  options?: { cancelable?: boolean; composed?: boolean }
): boolean {
  return host.dispatchEvent(
    new CustomEvent<T>(name, {
      detail: detail as T,
      bubbles: true,
      composed: options?.composed ?? true,
      cancelable: options?.cancelable ?? false,
    })
  )
}
