import { css, html, LitElement, type PropertyValues } from 'lit'
import { property } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { VfSized } from '../size.js'
import { vfBase } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import type { VfIconSize } from './vf-icon.js'

/**
 * `<vf-icon-field>` — the container a field of `vf-icon`s sits in: a desktop's
 * icons, a folder window's contents.
 *
 * Every other set in the kit has its container — `vf-list` owns
 * `vf-list-item`, `vf-radio-group` owns `vf-radio`, `vf-menu` owns
 * `vf-menu-item`, `vf-select` owns `vf-option` — and `vf-icon` was the one
 * item whose container the consumer wrote by hand: a bare
 * `<div role="listbox" aria-multiselectable="true">`, because an `option` is
 * only valid inside a `listbox` that owns it, and every kit container is a
 * positioning anchor by design, so nothing in the kit was neutral enough to
 * stand in. A consumer who forgot the role got icons that silently degraded
 * to pictures. This is that container, as kit furniture:
 *
 * ```html
 * <vf-desktop width="512" height="342">
 *   <vf-icon-field label="Desktop">
 *     <vf-icon label="Macintosh HD" width="64" selectable movable editable left="16" top="24">…</vf-icon>
 *     <vf-icon label="Trash" width="64" selectable movable editable left="16" top="280">…</vf-icon>
 *   </vf-icon-field>
 *   <vf-window heading="Documents" width="320" height="201" scrollbars="both" top="40" left="120">
 *     <vf-icon-field label="Documents">
 *       <vf-icon label="Read Me" width="64" selectable movable editable left="16" top="16">…</vf-icon>
 *     </vf-icon-field>
 *   </vf-window>
 * </vf-desktop>
 * ```
 *
 * ### Semantics through internals
 *
 * `role="listbox"` and `aria-multiselectable="true"` always — the Finder was
 * always multi-select, so there is no attribute for it — and `label` as the
 * accessible name, the way `vf-scroll-area` takes one. Internals values are
 * defaults (SPEC §2): a consumer's own `role`/`aria-*` on the tag still wins.
 * A `selectable` icon inside becomes a real `option` carrying `aria-selected`;
 * `vf-icon` matches this tag directly, since a role written through internals
 * never lands as an attribute for `closest()` to find.
 *
 * ### Layout-neutral, exactly what the div was
 *
 * An in-flow block with no size, no inset and no position of its own,
 * painting nothing — the `vf-stack` posture. A field whose icons are all
 * placed is a zero-height block, so the icons keep anchoring to the desktop's
 * raster or the window's plane, stored coordinates mean what they meant, and
 * a press on the bare dither still reaches the desktop. It takes `top`/`left`
 * and `width`/`height` like the other declared-box containers, so a page that
 * wants the field to be a box places and sizes it, at which point it becomes
 * the anchor — the placement working, as documented for everything.
 *
 * ### `size` is the view's
 *
 * `large` or `small`, written onto every icon in the field when set and
 * whenever it changes, so View → by Small Icon is one attribute instead of a
 * loop over every icon. Unset, each icon keeps its own.
 *
 * ### The desktop uses it, and renders none
 *
 * A desktop's icons sit in a field slotted into `vf-desktop` beside the
 * windows, written by the page; a folder window's icons sit in one slotted
 * into the window body. `vf-desktop` builds no field of its own: its furniture
 * is slotted light DOM and the page decides what it is, a desktop with no
 * icons should carry no empty listbox, and a field inside the desktop's
 * shadow is one `closest()` could not reach.
 *
 * @slot - The icons.
 */
@vfElement('vf-icon-field')
export class VfIconField extends VfSized(VfPositioned(LitElement)) {
  static override styles = [
    vfBase,
    css`
      :host {
        /* A block that shrink-wraps: the field is exactly as big as what it
           holds in flow — nothing, for a field of placed icons — so it can
           never hand a size it never declared to anything, and a zero-height
           block intercepts no press meant for the desktop under it. A
           declared width/height lands on the host's inline style (VfSized)
           and beats this; top/left make it the anchor (VfPositioned). */
        display: block;
        width: fit-content;
        /* Typographic transparency — the vf-stack reset, for the same
           reason: vfBase dresses a host as chrome, and a container that
           holds no text of its own must not change how its content reads. */
        font: inherit;
        -webkit-font-smoothing: inherit;
        color: inherit;
        user-select: inherit;
        -webkit-user-select: inherit;
        text-align: inherit;
      }
    `,
  ]

  /**
   * Accessible name for the field — "Desktop", the folder's name — applied as
   * the listbox's `aria-label` through internals, so a consumer's own
   * `aria-label` on the tag still wins.
   */
  @property() label = ''

  /**
   * The view's icon size, `large` or `small`, written onto every icon in the
   * field — View → by Small Icon as one attribute. Unset, each icon keeps
   * its own `size`.
   */
  @property({ reflect: true }) size?: VfIconSize | null

  // `top`/`left` come from VfPositioned and `width`/`height` from VfSized;
  // stated, they make the field a box and the anchor its icons place against.

  /**
   * Default-on display scaling (true 72dpi size); see src/scale.ts. A lone
   * field with a declared size on a plain page would otherwise resolve that
   * size against the `var(--vf-scale, 1)` fallback while its icons
   * self-scaled around it — the vf-stack reasoning.
   */
  private readonly scale = new ScaleController(this)

  /**
   * ARIA goes through internals, never `setAttribute` on the host: internals
   * values are *defaults*, so a consumer's own `role`/`aria-*` on the tag wins
   * — the platform's own precedence. See SPEC §2.
   */
  readonly #internals = this.attachInternals()

  constructor() {
    super()
    this.#internals.role = 'listbox'
    // Always: the Finder's selection was always a set, so there is no
    // attribute to turn this on or off.
    this.#internals.ariaMultiSelectable = 'true'
  }

  protected override updated(changed: PropertyValues<this>): void {
    // Written unconditionally: an empty label clears the internals default
    // rather than the host (the vf-list rule).
    if (changed.has('label')) this.#internals.ariaLabel = this.label || null
    if (changed.has('size')) this.#applySize()
  }

  /** Icons arriving after the view was set take the view's size. */
  #onSlotChange = (): void => {
    this.#applySize()
  }

  /**
   * Push the view's size onto every icon in the field. Descendants rather
   * than direct children, so an icon inside a wrapper is one of the field's
   * too; a property write, which Lit keeps for an icon that has not upgraded
   * yet. Unset means hands off.
   */
  #applySize(): void {
    const size = this.size
    if (size == null) return
    for (const icon of this.querySelectorAll('vf-icon')) {
      if (icon.size !== size) icon.size = size
    }
  }

  protected override render() {
    return html`<slot @slotchange=${this.#onSlotChange}></slot>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-icon-field': VfIconField
  }
}
