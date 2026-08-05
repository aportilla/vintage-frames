import { css, html, LitElement } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { VfSized } from '../size.js'
import type { PropertyValues } from 'lit'
import { vfBase, vfDisplayDecls, vfStaticText } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'

/** Serial for the auto-generated id an `aria-labelledby` reference needs. */
let labelIdSeq = 0

/**
 * Roles that take their accessible name from their contents — the ARIA
 * name-from-content set, cut down to the roles a caption might plausibly
 * point at. An element already named by its own visible text has a name of
 * its own, which the aria route must not stamp over.
 */
const NAME_FROM_CONTENT_ROLES = new Set([
  'button',
  'checkbox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'switch',
  'tab',
  'treeitem',
])

/**
 * Whether the target already computes its accessible name from its own
 * content (see {@link VfLabel.for}). An explicit `role` attribute answers
 * exactly; without one, a custom element with visible text is assumed to name
 * itself from it — every interactive `vf-*` control that exposes no `label`
 * property does (the toggles, buttons, rows, options) — and the native tags
 * that do are enumerated. An element with no text has no such name, so the
 * caption may still supply one.
 */
function namesFromContent(target: Element): boolean {
  const text = (target.textContent ?? '').trim()
  if (!text) return false
  const role = target.getAttribute('role')
  if (role) return NAME_FROM_CONTENT_ROLES.has(role.split(/\s+/)[0] ?? '')
  const tag = target.localName
  if (tag.includes('-')) return true
  return (
    tag === 'button' ||
    tag === 'summary' ||
    (tag === 'a' && target.hasAttribute('href'))
  )
}

/** A target that may expose the kit's `label` accessible-name property. */
type Nameable = HTMLElement & { label?: unknown; isDisabled?: boolean }

/**
 * `<vf-label>` — a static System 7 caption.
 *
 * The "Name:" beside a field, the "Mode" heading over a group of radios, a
 * numeric readout beside a slider. Text the page was previously setting by hand
 * in the display face — this is that, as a component, on the kit's grid:
 *
 * - the **Chicago-style chrome face** by default (dialog captions are chrome),
 *   with `face="body"` to switch to Geneva — which is also the kit's fine
 *   print, as it was System 7's: a dialog's small captions are Geneva 9 at
 *   its own strike size;
 * - a **whole-system-pixel line box** (`--vf-label-line-height`, 16px — the
 *   faces' own em), so a column of captions accumulates whole offsets instead of
 *   pushing what follows off the device-pixel grid the way a ratio `line-height`
 *   does (README, layout contract rule 2);
 * - its own {@link GridSnapController}, so the bitmap stems stay on the grid
 *   wherever the page puts it;
 * - a **declared `width`** ({@link VfSized}) — the shared width of a caption
 *   column, so a run of label-and-field rows lands every field on one x.
 *   Left to its text a caption measures whatever its glyphs measure (the
 *   showcase's Apple menu title came to 32.641 system px) and anything sized
 *   from it inherits the fraction; a declared width is whole, and so is the
 *   row built on it (layout contract rule 3). A caption wider than its column
 *   overflows rather than reflowing the row: the number is the column, and a
 *   caption that doesn't fit is a number to raise.
 *
 * `for` points at a control by id, as a native `<label>` does — clicking the
 * caption focuses that control, and the caption text becomes its accessible
 * name (see {@link for} for how, and for what it deliberately doesn't do).
 *
 * Chrome text, so the host is not selectable (SPEC §1); prose belongs in
 * `<vf-paragraph>`, which is.
 *
 * @slot - The caption text.
 * @csspart label - The inner text box.
 * @cssprop --vf-label-line-height - Line box, in system px (default `16px`).
 *   Keep it a whole number — a ratio puts every following line off the grid.
 */
@vfElement('vf-label')
export class VfLabel extends VfSized(VfPositioned(LitElement)) {
  static override styles = [
    vfBase,
    vfStaticText,
    css`
      :host {
        /* A real box, so a page can give a caption column a shared width
           (layout contract rule 3) — inline text can't take one. */
        display: inline-block;
        /* Chrome by default; vfStaticText's face="body" overrides it. */
        ${vfDisplayDecls}
        /* Whole system px, never a ratio — see the class comment. 16px is the
           faces' own em (12 above the baseline + 4 below), which is also
           vf-menu-item's row pitch, so a caption beside a menu or a popup sits
           on the same rhythm. */
        line-height: calc(var(--vf-scale, 1) * var(--vf-label-line-height, 16px));
        cursor: var(--vf-cursor, default);
      }
    `,
  ]

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * The id of the control this caption names, resolved in the label's own tree
   * scope (its document or shadow root), like a native `<label for>`.
   *
   * Two things follow from it. **Clicking the caption focuses the control** —
   * a focus shortcut, not an activation: the kit's toggles carry their own
   * labels, so forwarding a click to one would double up on the label they
   * already have. And **the caption text becomes the control's accessible
   * name**, by whichever route reaches it:
   *
   * - a `vf-*` control's focusable element lives in its shadow root, where an
   *   `aria-label` on the host cannot reach it — which is why each of them
   *   exposes a `label` property that lands on the inner control. That property
   *   is what gets filled in, and only when the consumer left it empty.
   * - anything else (a native `<input>`, an element with a role) is in this
   *   label's own tree scope, so an `aria-labelledby` id reference works; it is
   *   set only when the target has no name of its own — and a name computed
   *   from the target's *content* counts: a `vf-checkbox` with slotted text, a
   *   `vf-button`, a native `<button>` are already named by what they show, and
   *   the caption declines rather than stamping over it.
   *
   * The one target neither route reaches is a control whose focusable element
   * is shadow-internal but which exposes no `label` property because it names
   * from content — `vf-button` is the kit's case. With visible text it needs
   * no caption; an icon-only one should carry its name on the art (`alt` on
   * the slotted `<img>`), which name-from-content picks up the same way.
   *
   * Either way the label puts back what it found when it is removed, the id
   * changes, or the caption text does.
   *
   * Left `undefined` rather than `''` so an unset `for` reflects no attribute
   * at all: `vf-label[for]` is a selector a page will reasonably write, and an
   * empty `for=""` on every plain caption would make it match all of them.
   */
  @property({ reflect: true }) for?: string

  /**
   * Which embedded face to set the caption in — `'display'` (the Chicago-style
   * chrome face, the default) or `'body'` (Geneva). Applied by
   * `vfStaticText`; declared here so it types and reflects.
   */
  @property({ reflect: true }) face?: 'display' | 'body'

  /**
   * Greys the caption to `--vf-disabled`. System 7 dims the label, not the
   * control (SPEC §1), so this is what a caption beside a disabled control
   * wears — the control keeps its solid black box.
   */
  @property({ type: Boolean, reflect: true }) dim = false

  /** The name we handed the target, so we can take back exactly that. */
  #named: { target: Nameable; via: 'property' | 'aria'; value: string } | null = null

  /**
   * Re-derives the pushed name when the caption's text mutates *in place*.
   * `slotchange` only fires when the assigned nodes change — and frameworks
   * (Lit's ChildPart, React) update text by writing `.data` on the existing
   * Text node, which assigns nothing. Without this, a re-rendered caption
   * changed on screen while the control kept the old accessible name forever.
   * Watching the target's own property back is safe: `#link` writes to the
   * *target*, never into this label's subtree, so the observer can't loop.
   */
  #textObserver?: MutationObserver

  constructor() {
    super()
    this.addEventListener('click', this.#handleClick)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.#textObserver ??= new MutationObserver(() => {
      if (this.for) this.#relink()
    })
    this.#textObserver.observe(this, {
      characterData: true,
      childList: true,
      subtree: true,
    })
    this.#link()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#textObserver?.disconnect()
    this.#unlink()
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('for')) this.#link()
  }

  protected override render() {
    return html`<span class="vf-snap" part="label"
      ><slot @slotchange=${this.#handleSlotChange}></slot
    ></span>`
  }

  /** Resolve `for` in this label's own tree scope, as `<label for>` does. */
  #target(): Nameable | null {
    if (!this.for) return null
    const root = this.getRootNode()
    if (!(root instanceof Document || root instanceof ShadowRoot)) return null
    return root.getElementById(this.for)
  }

  /**
   * The caption text is the accessible name, so it has to be re-derived
   * whenever the light DOM changes — including the very first time, since a
   * component defined before the page parses is upgraded with no children yet
   * and `connectedCallback` sees an empty caption.
   */
  #handleSlotChange = (): void => {
    if (this.for) this.#link()
  }

  /** Re-run the wiring: mid-parse retry (see #link) and in-place text edits
   * (see #textObserver) both land here. */
  #relink = (): void => {
    if (this.isConnected) this.#link()
  }

  /** Give the target its name; a no-op if it already has one. */
  #link(): void {
    this.#unlink()
    const target = this.#target()
    if (!target) {
      // A caption is authored before the control it names, so a kit loaded
      // eagerly enough to upgrade this label mid-parse resolves `for` against a
      // document that has not reached the control yet. Clicking would still
      // find it (that lookup is lazy), but the name is pushed, so without this
      // it would silently never land. One listener, deduped by reference.
      if (this.for && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', this.#relink, { once: true })
      }
      return
    }

    const tag = target.localName
    if (tag.includes('-') && !customElements.get(tag)) {
      // A control that hasn't upgraded has no `label` property yet, so testing
      // for one now would send every lazily-defined control down the aria
      // branch — which can't reach into its shadow root. Wait for it instead.
      void customElements.whenDefined(tag).then(() => {
        if (this.isConnected && !this.#named) this.#link()
      })
      return
    }

    const text = (this.textContent ?? '').trim()
    if (!text) return

    if ('label' in target) {
      if (typeof target.label === 'string' && !target.label) {
        target.label = text
        this.#named = { target, via: 'property', value: text }
      }
      return
    }

    if (target.hasAttribute('aria-label') || target.hasAttribute('aria-labelledby')) {
      return
    }
    // A name from content is a name of its own: stamping `aria-labelledby`
    // on a vf-checkbox (or any name-from-content role) would replace its
    // visible slotted text with the caption's. Attributes were the only
    // check here once, and the class doc's "only when the target has no name
    // of its own" was aspiration; this makes it true.
    if (namesFromContent(target)) return
    if (!this.id) this.id = `vf-label-${++labelIdSeq}`
    target.setAttribute('aria-labelledby', this.id)
    this.#named = { target, via: 'aria', value: this.id }
  }

  /** Take back the name — but only if it is still the one we set. */
  #unlink(): void {
    const named = this.#named
    this.#named = null
    if (!named) return
    if (named.via === 'property') {
      if (named.target.label === named.value) named.target.label = ''
    } else if (named.target.getAttribute('aria-labelledby') === named.value) {
      named.target.removeAttribute('aria-labelledby')
    }
  }

  #handleClick = (): void => {
    const target = this.#target()
    if (!target) return
    // `isDisabled` covers an ancestor <fieldset disabled> too (see
    // VfFormControl); the attribute check catches plain elements.
    if (target.isDisabled ?? target.hasAttribute('disabled')) return
    target.focus()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-label': VfLabel
  }
}
