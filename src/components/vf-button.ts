import { css, html, nothing, unsafeCSS } from 'lit'
import { property, query } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { vfBase, vfBodyDecls, vfDisplay, vfFocusUnderline } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { VfFormControl } from '../form-control.js'
import {
  BUTTON_FACE,
  BUTTON_FRAME,
  RING_FRAME,
  RING_HOLE,
  RING_INSET,
  steppedRectClip,
  steppedRingClip,
} from '../pixel-frame.js'

/**
 * The `slot` name the submit proxy carries — deliberately one no shadow root
 * offers, so the proxy stays unslotted and therefore unrendered. Declared
 * above the class rather than at the module tail: `@vfElement` upgrades
 * synchronously, and a const below it would be in its temporal dead zone.
 */
const SUBMITTER_SLOT = 'vf-submitter'

/**
 * The classic System 7 push button ("OK", "Cancel", "Install", …).
 *
 * A rounded-rectangle control with a 1px black border and white face that
 * inverts to white-on-black while pressed. `variant="default"` draws the
 * classic bold double ring around the button, marking it as the default
 * action of a dialog. `size="small"` renders the compact 16px button with a
 * body-face label.
 *
 * The rounded corners are not `border-radius` arcs: frame, face, and ring are
 * stepped `clip-path` silhouettes traced pixel-for-pixel from the kit's button
 * reference sheet (see `src/pixel-frame.ts`), so every corner renders as the
 * exact 1-bit staircase with no antialiasing.
 *
 * Keyboard focus — an affordance System 7 didn't have, drawn in its idiom
 * anyway — is a 1px dashed rule under the label text (`vfFocusUnderline`)
 * rather than a ring around the control.
 *
 * Form-associated: place it inside a `<form>` and `type="submit"` submits the
 * form (contributing its `name`/`value` and any `form*` override to the
 * submission), `type="reset"` resets it. Enter and Space activate it via the
 * inner native button, and the submission runs at the end of the click's
 * propagation, so `preventDefault()` on the button cancels it the way it
 * cancels a native one.
 *
 * One thing the platform will not allow: `event.submitter` cannot BE a
 * form-associated custom element. It is the transient native proxy this
 * button submits through — so read the submitting button as
 * `event.submitter.closest('vf-button')`, and its identity from
 * `submitter.name`/`.value` rather than by comparing element references.
 *
 * A host-level `aria-label` / `aria-labelledby` names the inner button, and
 * `description` (or a host-level `aria-describedby`) describes it — the same
 * bridge the fields use, since the role lives on a shadow-internal node the
 * platform can't deliver those to. A `<label for>` deliberately does not
 * name it: a `<button>` is not a labelable element.
 *
 * @slot - The button label.
 * @csspart button - The inner native `<button>` element.
 * @cssprop [--vf-button-height=20px] - `vf-button` face (the default ring's
 *   inner box is 80×20)
 * @cssprop [--vf-control-height-small=16px] - `size="small"` buttons
 */
@vfElement('vf-button')
export class VfButton extends VfPositioned(VfFormControl) {
  static override shadowRootOptions: ShadowRootInit = {
    ...VfFormControl.shadowRootOptions,
    delegatesFocus: true,
  }

  static override styles = [
    vfBase,
    vfDisplay,
    css`
      :host {
        display: inline-flex;
        position: relative;
        cursor: var(--vf-cursor, default);
        /* Display scaling: metrics are authored in *system pixels* and
           multiplied by --vf-scale (default 1 = today's rendering). Opt a
           subtree into true 72dpi size via applyScale()/--vf-scale — see
           src/scale.ts. The chrome font scales with the control. */
        font-size: calc(var(--vf-scale, 1) * var(--vf-font-size-display, 16px));
      }
      /* Breathing room for the default-button ring drawn at inset -4 system px.
         A vf-button-group zeroes this (via --vf-button-ring-margin) and reserves
         the ring space itself, so grouped button *faces* align instead of their
         margin boxes — see src/components/vf-button-group.ts. */
      :host([variant='default']) {
        margin: calc(
          var(--vf-scale, 1) * var(--vf-button-ring-margin, ${RING_INSET}px)
        );
      }
      /* The default ring: a 3px stepped band with a transparent 1px gap to the
         button, clipped as an evenodd donut so the gap shows the surface
         behind it (the reference's gap pixels are alpha-0). */
      :host([variant='default'])::before {
        content: '';
        position: absolute;
        /* The ring anchors to the host, not the corrected button, so each
           inset composes the snap offset (see grid-snap.ts) to ride along. */
        top: calc(var(--vf-scale, 1) * -${RING_INSET}px + var(--vf-snap-dy, 0px));
        left: calc(var(--vf-scale, 1) * -${RING_INSET}px + var(--vf-snap-dx, 0px));
        bottom: calc(var(--vf-scale, 1) * -${RING_INSET}px - var(--vf-snap-dy, 0px));
        right: calc(var(--vf-scale, 1) * -${RING_INSET}px - var(--vf-snap-dx, 0px));
        background: var(--vf-black, #000);
        clip-path: ${unsafeCSS(steppedRingClip(RING_FRAME, RING_HOLE))};
        pointer-events: none;
      }
      /* Disabled default: the fat outer ring dims to gray; the inner button
         border stays solid black (see button:disabled) — the System 7 reading,
         where the ring and the title dim together and the button's own frame
         does not. (The original dimmed with a 50% stipple; gray standing in
         for it is the kit's one liberty here — SPEC §1.)

         Both disabled routes need a selector, because only one of them is an
         attribute: an ancestor <fieldset disabled> disables the control
         through formDisabledCallback, which sets the form-disabled custom
         state and never touches the disabled attribute. Keyed on the
         attribute alone, a default button inside a disabled fieldset greyed
         its label — that comes from the inner <button>'s own :disabled —
         while its ring stayed solid black. Separate rules rather than one
         :is() list: an engine that doesn't parse :state() drops the whole
         selector it appears in, and the attribute case should survive that
         on its own. */
      :host([variant='default'][disabled])::before {
        background: var(--vf-disabled, #c0c0c0);
      }
      :host([variant='default']:state(form-disabled))::before {
        background: var(--vf-disabled, #c0c0c0);
      }
      /* The native button paints no box of its own — its frame and face are
         the stepped pseudo-element silhouettes below. Keeping the clip-paths
         off the button itself leaves the hit area a plain rectangle, and
         anything painted outside the silhouette (a ring a consumer restores
         on ::part(button)) unclipped. */
      button {
        position: relative;
        /* Own stacking context so the negative-z silhouettes stay inside the
           button: above everything behind it, below the label. */
        z-index: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        /* 20px, not the 22px fields: the reference sheets put the button face
           at 80×20 (and the default ring's inner box at exactly that), so the
           ring traces were authored against a 20px face. --vf-control-height
           stays the *field* height — see SPEC §3. */
        height: calc(var(--vf-scale, 1) * var(--vf-button-height, 20px));
        min-width: calc(var(--vf-scale, 1) * 64px);
        /* Fill the host so a vf-button-group can stretch this face to the
           shared column width. Standalone (shrink-wrapped host) it's a no-op. */
        flex: var(--vf-button-flex, 0 1 auto);
        padding: 0 calc(var(--vf-scale, 1) * 14px);
        background: none;
        border: none;
        color: var(--vf-black, #000);
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
        line-height: inherit;
        white-space: nowrap;
        cursor: inherit;
      }
      /* Frame: the outer silhouette in solid black. The face below covers all
         but the outline, leaving the reference's exact border pixels — the
         QuickDraw difference-of-silhouettes, not a stroked border. */
      button::before,
      button::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
      }
      button::before {
        background: var(--vf-black, #000);
        clip-path: ${unsafeCSS(steppedRectClip(BUTTON_FRAME))};
      }
      /* Face: white fill inset one pixel, with its own traced corner steps. */
      button::after {
        background: var(--vf-white, #fff);
        clip-path: ${unsafeCSS(steppedRectClip(BUTTON_FACE))};
      }
      /* Pressed: instant white-on-black inversion. */
      button:active:not(:disabled) {
        color: var(--vf-white, #fff);
      }
      button:active:not(:disabled)::after {
        background: var(--vf-black, #000);
      }
      /* The label rides in its own box so the focus underline can span the
         text and not the button's padding: as the flex item it shrink-wraps
         to the label, and its 20px line box puts the baseline a known
         distance above its bottom edge (see vfFocusUnderline). */
      .label {
        position: relative;
      }
      /* Keyboard focus is the dashed rule under the label, not a ring around
         the control — so the UA's own outline goes. */
      button:focus-visible {
        outline: none;
      }
      /* …and off the host too. Blink doesn't currently propagate
         :focus-visible to a delegatesFocus host, so today this paints nothing
         — but SPEC §vf-button claims the ring is off on both, and that claim
         should hold because the component says so, not because one engine
         happens to agree. Its own rule, not a selector list with the above:
         one unparsed selector would drop the other with it. */
      :host(:focus-visible) {
        outline: none;
      }
      button:focus-visible .label::after {
        ${vfFocusUnderline}
      }
      /* Small: the 16px button from the reference's third row. The corner
         traces are identical (verified against the 80×16 sample sheet row),
         so only the metrics change — and the label drops to the body face,
         matching the sheet's smaller Geneva-9-style labels. The padding is
         the 14px above, deliberately: it was tuned from 10 to match the tall
         button, so this rule states only what actually differs. */
      :host([size='small']) {
        ${vfBodyDecls}
      }
      :host([size='small']) button {
        height: calc(var(--vf-scale, 1) * var(--vf-control-height-small, 16px));
        min-width: calc(var(--vf-scale, 1) * 48px);
      }
      /* Disabled: only the label dims to gray; the solid black border stays. */
      button:disabled {
        color: var(--vf-disabled, #c0c0c0);
      }
    `,
  ]

  /**
   * When set to `'default'`, draws the classic double ring that marks the
   * default button (activated by Return in real System 7 dialogs).
   */
  @property({ reflect: true }) variant?: 'default'

  /**
   * When set to `'small'`, renders the compact 16px button from the
   * reference sheet's third row: same pixel-traced corners, body-face label.
   */
  @property({ reflect: true }) size?: 'small'

  /**
   * Activation behavior, mirroring native `<button type>`:
   * `'submit'` submits the associated form, `'reset'` resets it and
   * `'button'` (the default) does nothing beyond the `click` event.
   *
   * Two deliberate departures from `<button>`, both pointing the same way — a
   * `vf-button` never submits unless it was asked to. HTML's *missing*-value
   * default is `submit`; here it is `button`, because a custom element that
   * silently submitted the form it happens to sit in is the wrong surprise.
   * The *invalid*-value default follows the missing one rather than HTML's
   * (which is also `submit`), so a misspelling does nothing instead of
   * submitting.
   */
  @property({ reflect: true }) type: 'button' | 'submit' | 'reset' = 'button'

  /** Form field name; submitted as `name=value` when `type="submit"`. */
  @property({ reflect: true }) name = ''

  /** Value submitted under `name` when `type="submit"`. */
  @property({ reflect: true }) value = ''

  /**
   * The submission overrides native `<button>` carries, honored on
   * `type="submit"` only, exactly as HTML honors them: each is handed to the
   * native proxy {@link activate} submits through, so the *behavior* is the
   * platform's rather than an emulation of it.
   *
   * One difference from the native IDL, in the getters only: `formAction`
   * returns the string you set, where `HTMLButtonElement.formAction` returns
   * it resolved against the document's base URL. The submission itself
   * resolves normally — it is the proxy's `formaction` doing the work.
   */
  @property({ attribute: 'formaction', reflect: true }) formAction = ''

  /** See {@link formAction}. Overrides the form's `enctype`. */
  @property({ attribute: 'formenctype', reflect: true }) formEnctype = ''

  /** See {@link formAction}. Overrides the form's `method`. */
  @property({ attribute: 'formmethod', reflect: true }) formMethod = ''

  /**
   * See {@link formAction}. Skips the form's constraint validation, so a
   * "Save Draft" button submits past a failing `required`.
   */
  @property({ type: Boolean, attribute: 'formnovalidate', reflect: true })
  formNoValidate = false

  /** See {@link formAction}. Overrides the form's `target`. */
  @property({ attribute: 'formtarget', reflect: true }) formTarget = ''

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  @query('button') private buttonEl!: HTMLButtonElement | null

  /** True while {@link activate} runs — see the re-entrancy note there. */
  #activating = false

  /**
   * {@link type}, resolved the way HTML resolves an enumerated attribute:
   * ASCII case-insensitively, with anything unrecognized falling to the
   * default.
   *
   * Comparing the raw property is the bug this replaces. `type="SUBMIT"` — a
   * perfectly valid spelling on a native button — passed the `!== 'button'`
   * guard and then failed the `=== 'submit'` one, so it submitted the form
   * with its `name`/`value` silently dropped: the action taken, the payload
   * lost, and in that order.
   */
  private get resolvedType(): 'button' | 'submit' | 'reset' {
    const value = String(this.type ?? '').toLowerCase()
    if (value === 'submit') return 'submit'
    if (value === 'reset') return 'reset'
    return 'button'
  }

  /**
   * Forwards a synthetic activation to the real `<button>` in the shadow
   * root. A `click()` on the host dispatches at the host and propagates *up*,
   * never down to the inner button's listener — so the native control, the
   * actual activation surface, is handed the call instead. Its click then
   * bubbles back out composed, exactly as a pointer's does. This is what the
   * fields' implicit submission (Enter) activates as the form's default
   * button; a disabled button swallows it natively, as it should.
   *
   * Before the first render there is no inner button to forward to. A native
   * `click()` always fires, so rather than doing nothing this falls back to
   * dispatching at the host — no activation behavior to run yet, but the
   * event a caller asked for.
   */
  override click(): void {
    const button = this.buttonEl
    if (button) button.click()
    else super.click()
  }

  override render() {
    return html`
      <button
        part="button"
        class="vf-snap"
        type="button"
        aria-label=${this.hostAriaLabel || nothing}
        aria-describedby=${this.describedBy}
        ?disabled=${this.isDisabled}
        @click=${this.handleClick}
      >
        <span class="label"><slot></slot></span>
      </button>
      ${this.renderDescription()}
    `
  }

  /**
   * The click that may become an activation.
   *
   * HTML runs a button's activation behavior only once its click has finished
   * propagating, which is what makes `preventDefault()` on the button — or on
   * anything above it — cancel the submission. This listener sits on the
   * inner `<button>`: the *first* stop on that path, not the last. Acting
   * here would beat every listener a consumer can write, so the ordinary
   * spelling silently failed and only a capture-phase cancel ever landed.
   *
   * So the action is deferred to the end of the path. A listener added to the
   * window *during* dispatch still runs when the event reaches it — each
   * node's listener list is read as that node is reached — and by then
   * `defaultPrevented` is final. The one ordering HTML has that this doesn't:
   * a window listener registered before ours still runs after us.
   */
  private handleClick = (event: MouseEvent): void => {
    if (this.isDisabled || this.#activating) return
    if (this.resolvedType === 'button') return
    const view = this.ownerDocument.defaultView
    if (!view) return

    let timer = 0
    const act = (): void => {
      view.removeEventListener('click', act)
      view.clearTimeout(timer)
      if (event.defaultPrevented) return
      this.activate()
    }
    view.addEventListener('click', act)
    // stopPropagation() cancels nothing in HTML — a native button still
    // submits — but it does stop the event ever reaching the window. A task
    // picks the action up in that case. A task and never a microtask: those
    // interleave BETWEEN the listeners of a trusted dispatch, which would put
    // the action back before the path is done.
    timer = view.setTimeout(act, 0)
  }

  /**
   * The activation behavior HTML gives a `<button type="submit"|"reset">`,
   * performed through a transient native proxy.
   *
   * A form-associated custom element cannot be a form's submitter: the
   * platform rejects one outright (`requestSubmit(vfButton)` throws a
   * TypeError, "not a submit button"), and a bare `requestSubmit()` submits
   * with `event.submitter === null` and none of this button's name/value.
   *
   * The proxy is a child of THIS element carrying a `slot` no shadow root
   * offers, which is three things at once. It is a light-DOM descendant of
   * the host, so `event.submitter.closest('vf-button')` finds the button that
   * submitted — as close to submitter identity as the platform permits, and
   * the reason it lives here rather than at the end of the form. Being
   * unslotted it is never rendered, never measured and never in the
   * accessibility tree, so it needs no clipping to hide. And being off the
   * flattened tree, its own click cannot travel back up through the shadow
   * `<button>` this component's own handler is bound to — which, slotted,
   * would have been an infinite recursion rather than a stray event.
   */
  private activate(): void {
    const type = this.resolvedType
    const form = this.internals.form
    if (!form || type === 'button' || this.isDisabled) return

    const proxy = document.createElement('button')
    proxy.type = type
    proxy.slot = SUBMITTER_SLOT
    // Without this the proxy's click reaches the form and the host as a
    // SECOND click for one press — a delegating `e.target.closest('button')`
    // handler firing twice, on a target already removed from the document.
    // Ending propagation at the proxy costs nothing: HTML runs the activation
    // behavior after the dispatch either way, cancelled only by
    // preventDefault().
    proxy.addEventListener('click', (event) => event.stopPropagation())
    if (type === 'submit') {
      if (this.name) {
        proxy.name = this.name
        proxy.value = this.value
      }
      // HTML honors these on a submit button only.
      if (this.formAction) proxy.formAction = this.formAction
      if (this.formEnctype) proxy.formEnctype = this.formEnctype
      if (this.formMethod) proxy.formMethod = this.formMethod
      if (this.formTarget) proxy.formTarget = this.formTarget
      proxy.formNoValidate = this.formNoValidate
    }

    this.#activating = true
    try {
      this.append(proxy)
      proxy.click()
    } finally {
      proxy.remove()
      this.#activating = false
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-button': VfButton
  }
}
