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

/**
 * Dispatch the *native* `input`/`change` event a form control's host owes the
 * platform, alongside the kit's `vf-input`/`vf-change`.
 *
 * A form-associated custom element that contributes to `FormData` but never
 * fires `change` is half a native control: `form.addEventListener('change')`
 * delegation hears nothing, and framework bindings (React's `onChange`, Vue's
 * `v-model`) have nothing to bind to. Each control calls this from its **user
 * interaction** paths only — a programmatic `value` set fires nothing, exactly
 * as a native control fires nothing.
 *
 * The flags mirror the platform's own: both bubble; `input` is composed and
 * `change` is not (UI Events). That composed split is also why the kit's
 * *fields* only bridge `change`: their inner native control's own `input`
 * already crosses the shadow boundary and retargets to the host, so
 * re-dispatching it would double-fire every keystroke.
 */
export function emitNative(host: EventTarget, type: 'input' | 'change'): void {
  host.dispatchEvent(
    new Event(type, { bubbles: true, composed: type === 'input' })
  )
}

/**
 * Run a control's **activation behavior** the way HTML runs a native one's: at
 * the *end* of the click's propagation, and not at all if anything on the path
 * called `preventDefault()`.
 *
 * This is what makes `preventDefault()` on a native checkbox — or on any
 * ancestor — actually stop it from checking. A handler that acts where it sits
 * cannot reproduce it: a listener on the control (or, worse, one registered in
 * the constructor, which is first in the host's own listener list) beats every
 * listener a consumer can write, so only a capture-phase cancel ever landed —
 * and even that needs someone to *read* `defaultPrevented`, which is the half
 * that is easy to forget.
 *
 * The deferral works because each node's listener list is read as that node is
 * reached, so a listener added to the window *during* dispatch still runs when
 * the event gets there — by which point `defaultPrevented` is final. The one
 * ordering HTML has that this doesn't: a window listener registered before this
 * one still runs before the action.
 *
 * `stopPropagation()` cancels nothing in HTML — a native button still submits —
 * but it does stop the event ever reaching the window, so a task picks the
 * action up in that case. A task and **never** a microtask: microtasks
 * interleave *between* the listeners of a trusted dispatch, which would put the
 * action back before the path is done.
 *
 * Callers keep their own guards (disabled, re-entrancy, gesture latches) — this
 * owns the timing alone. `vf-button` runs the same shape inline, with the
 * submit proxy's re-entrancy guard woven through it.
 *
 * @param host    the element whose ownerDocument supplies the window to defer on
 * @param event   the click being deferred; its `defaultPrevented` is the verdict
 * @param action  run once, at the end of the path, unless cancelled
 */
export function deferActivation(
  host: Element,
  event: Event,
  action: () => void
): void {
  const view = host.ownerDocument.defaultView
  if (!view) return

  let timer = 0
  const act = (): void => {
    view.removeEventListener('click', act)
    view.clearTimeout(timer)
    if (event.defaultPrevented) return
    action()
  }
  view.addEventListener('click', act)
  timer = view.setTimeout(act, 0)
}
