import { css, html, LitElement, nothing } from 'lit'
import {
  property,
  query,
  queryAssignedElements,
} from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { vfBase, vfDisplay, vfFocusUnderline, vfPanel } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import {
  DocumentListenersController,
  releaseAfterGesture,
} from '../document-listeners.js'
import { FocusRuleController } from '../focus-modality.js'
import { MenuPressController } from '../menu-press.js'
import { TypeAheadBuffer } from '../type-ahead.js'
import { emit } from '../events.js'
import type { VfMenuItem } from './vf-menu-item.js'

/**
 * `<vf-menu>` — a pull-down menu: a bar label plus a dropped panel of
 * `<vf-menu-item>` / `<vf-separator>` children.
 *
 * Inside a `<vf-menu-bar>` the bar coordinates open state (only one menu open,
 * hover-switching, outside-click/Escape dismissal) and owns the pointer
 * gesture, which may travel between its menus. Used standalone, the menu
 * toggles itself on label click and manages its own dismissal, its own press
 * gesture and item keyboard navigation (ArrowUp/ArrowDown, Home/End, and the
 * shared first-letter type-ahead — src/type-ahead.ts) while open.
 *
 * Pointer — the two styles `vf-select` supports, on the same terms (see
 * src/menu-press.ts): the System 7 press-drag-release (press the title, slide
 * onto a command, release over it) and a modern quick tap that leaves the menu
 * dropped for a second click.
 *
 * @slot - Menu contents: `vf-menu-item` and `vf-separator` elements.
 * @slot label - Replaces the `label` text in the bar — e.g. a `vf-img` apple
 *   icon for the Apple menu. Keep the `label` attribute set too: it stays the
 *   menu's accessible name (the bar item's `aria-label` and the panel's) when
 *   the visible title is an image.
 * @csspart label - The menu title in the bar (inverts while open).
 * @csspart panel - The dropped `.vf-panel` containing the items.
 * @cssprop [--vf-menubar-height=24px] - `vf-menu-bar`
 */
@vfElement('vf-menu')
export class VfMenu extends LitElement {
  static override styles = [
    vfBase,
    vfDisplay,
    vfPanel,
    css`
      :host {
        display: inline-block;
        position: relative;
      }
      .label {
        display: flex;
        align-items: center;
        height: calc(var(--vf-scale, 1) * var(--vf-menubar-height, 24px));
        padding: 0 calc(var(--vf-scale, 1) * 10px);
        white-space: nowrap;
        /* The press-drag gesture owns pointer moves while the title is held;
           suppress the browser's own touch panning/scrolling so a touch drag
           walks the menu instead of scrolling the page. */
        touch-action: none;
        cursor: default;
      }
      :host([open]) .label {
        /* Forced colors: exempt the inverted title from the mode's text
           backplate, which would land a Canvas slab on the highlight bar —
           see vf-list-item's forced-colors note. The pair is already the
           user's own via the vfBase token remap. */
        @media (forced-colors: active) {
          forced-color-adjust: none;
        }
        background: var(--vf-highlight, #000);
        color: var(--vf-highlight-text, #fff);
      }
      /* The title rides in its own box so the focus rule spans the title and
         not the bar cell's 10px padding — the same reason vf-button wraps its
         label. A line-height of 1 shrinks that box to the face's own em, whose
         bottom edge IS the descender line (the Chicago 12/4 metrics — see
         register-embedded-font.ts), so the rule below it clears every glyph
         instead of being crossed by a 'g' the way the button's is. A slotted
         icon — the Apple menu's vf-img — sizes the box instead, and the same
         rule lands one blank row under the artwork. The title doesn't move
         either way: symmetric half-leading and align-items:center put the
         baseline in the same place at any line height. */
      .title {
        position: relative;
        display: flex;
        align-items: center;
        line-height: 1;
      }
      /* Keyboard focus is the kit's dashed rule under the title, not a ring
         around the bar cell (see vfFocusUnderline) — one blank row under the
         box, so −(1 + 1).

         Gated on a class, not :focus-visible, exactly as vf-select is: the
         press-drag gesture suppresses the browser's own mouse focus and
         MenuPressController calls focus() instead, and Blink reads a
         scripted focus as a visible one. So :focus-visible is true after a
         plain mouse press on a title. FocusRuleController consults the page's
         last input modality instead (see src/focus-modality.ts).

         Only while CLOSED: a dropped menu already says where focus is, in the
         louder of the two languages — the whole cell inverts. Drawing the rule
         under an inverted title as well just adds a second, quieter mark
         saying the same thing (in white, since it is currentColor). The mark
         is for the state the inversion can't express: focused, not yet open.
         The class stays on through the open state, so the rule comes back by
         itself when the menu closes and hands focus back to the title. */
      .label:focus {
        outline: none;
      }
      :host(:not([open])) .label.vf-focus-rule .title::after {
        --vf-focus-underline-offset: -2px;
        ${vfFocusUnderline}
      }
      .panel {
        position: absolute;
        /* The panel anchors to the host, not the corrected label, so it
           composes the snap offset (see grid-snap.ts) to ride along. */
        top: calc(100% + var(--vf-snap-dy, 0px));
        left: var(--vf-snap-dx, 0px);
        min-width: calc(var(--vf-scale, 1) * 180px);
        /* No vertical inset: every panel in Menus.png — both pulldowns, the
           open popup and the closed pill — puts its first row's ink at +4 from
           the border box, which is the 1px border plus the row's own 3px ✓
           bias. The bottom border likewise sits immediately after the last row.
           A 2px inset here displaced every row by 2px against the art; it was
           invisible while the rows themselves were 6px too tall. */
        padding: 0;
        z-index: 1000;
        /* As on the title: the held press, not the browser, owns touch moves
           over the dropped panel. */
        touch-action: none;
        /* Slotted vf-separators render as the classic dimmed dotted menu rule. */
        --vf-separator-color: var(--vf-disabled, #c0c0c0);
        --vf-separator-style: dotted;
      }
      :host(:not([open])) .panel {
        display: none;
      }
      .panel ::slotted(vf-separator) {
        margin: calc(var(--vf-scale, 1) * 2px) 0;
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping (opt in with applyGridSnap()); see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /**
   * Whether the bar title wears the kit's dashed focus rule — keyboard focus
   * only, which this control can't read off `:focus-visible` (see the CSS).
   */
  readonly #focusRule = new FocusRuleController(this)

  /**
   * The menu title shown in the bar, and the menu's accessible name. Slotted
   * `label` content replaces it visually (see the `label` slot) but this text
   * keeps naming the menu for AT.
   */
  @property() label = ''

  /**
   * Whether the panel is dropped. Reflected. Managed by the parent
   * `vf-menu-bar` when present, otherwise by the menu itself.
   */
  @property({ type: Boolean, reflect: true }) open = false

  /**
   * The bar label's tabindex. A parent `vf-menu-bar` owns a roving tabindex
   * across its menus and sets this to 0 on the active menu, -1 on the rest,
   * so the whole bar is a single Tab stop. Defaults to 0 so a standalone
   * menu is Tab-focusable on its own.
   */
  @property({ type: Number, attribute: false }) barTabIndex = 0

  @query('.label') private _labelEl!: HTMLElement

  @queryAssignedElements({ selector: 'vf-menu-item', flatten: true })
  private _assignedItems!: VfMenuItem[]

  /**
   * The System 7 press-drag-release gesture, for a menu standing on its own.
   * Inside a `vf-menu-bar` the bar owns it instead — a press may travel between
   * its menus, so the coordinator has to be the one tracking it.
   */
  readonly #press = new MenuPressController(this, {
    menus: () => [this],
    open: (menu) => {
      menu.open = true
    },
    close: () => {
      this.open = false
    },
  })

  /** The enabled `vf-menu-item` children, in document order. */
  get items(): VfMenuItem[] {
    return this.allItems.filter((item) => !item.disabled)
  }

  /**
   * Every slotted `vf-menu-item`, in document order — **disabled rows
   * included**, unlike {@link items}. The press gesture hit-tests against
   * these: releasing over a disabled row has to cancel, not fall through to
   * whatever the panel covers.
   */
  get allItems(): VfMenuItem[] {
    return this._assignedItems
  }

  /**
   * Viewport rect of the bar title, or `null` before the first render. The
   * press gesture hit-tests by coordinates rather than by event target (see
   * src/menu-press.ts), so it wants the box, not the element.
   */
  get labelRect(): DOMRect | null {
    return this._labelEl?.getBoundingClientRect() ?? null
  }

  /** Whether a `vf-menu-bar` is coordinating this menu. */
  get #inBar(): boolean {
    return this.closest('vf-menu-bar') !== null
  }

  /**
   * Whether this component owns the host `role`. Decided on the FIRST connect
   * only (vf-menu-item's latch): our own write persists on the element, so
   * re-testing `hasAttribute('role')` on a reconnect would read it back as
   * consumer-supplied and freeze it.
   */
  #ownsRole: boolean | undefined

  /** First-letter type-ahead while open standalone; see src/type-ahead.ts. */
  readonly #typeAhead = new TypeAheadBuffer()

  /**
   * Swallows the one `click` the browser synthesises after a pointer press, so
   * the gesture that just dropped the menu isn't immediately toggled shut by
   * its own trailing click. A `click` with no preceding pointerdown (keyboard /
   * assistive-tech activation) still reaches {@link #onLabelClick}. The same
   * guard `vf-select` uses, for the same reason.
   */
  #swallowClick = false

  #onCloseRequest = (): void => {
    // Closing hides the focused slotted item, which would drop focus to
    // <body> — return it to the bar label first, exactly what VfMenuBar's own
    // close-request handler does for its menus. In a bar, the bar's handler
    // owns that move, so only self-manage standalone.
    if (!this.#inBar) this.focus()
    this.open = false
  }

  #onDocPointerDown = (event: PointerEvent): void => {
    if (!event.composedPath().includes(this)) this.open = false
  }

  // Attached only when standalone (a parent vf-menu-bar handles these itself).
  #onDocKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        this.open = false
        this.focus()
        break
      case 'Tab':
        // Let focus move on; close without cancelling the tab, as vf-select
        // does. The host focusout listener is the belt for this suspender.
        this.open = false
        break
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        this.#moveItemFocus(event.key === 'ArrowDown' ? 1 : -1)
        break
      case 'Home':
      case 'End': {
        event.preventDefault()
        const items = this.items
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
        break
      }
      default: {
        // Printable keys run the shared Finder type-ahead over the items, as
        // the bar's handler does for its open menu. Space stays out of the
        // prefix — it is the focused item's activation key — and modified
        // keys stay the consumer's.
        if (
          event.key.length !== 1 ||
          event.key === ' ' ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        ) {
          break
        }
        event.preventDefault()
        const items = this.items
        const current = items.indexOf(document.activeElement as VfMenuItem)
        const index = this.#typeAhead.feed(
          event.key,
          current,
          // Already the enabled rows only, so nothing here is disabled.
          items.map((item) => ({
            text: item.textContent ?? '',
            disabled: false,
          }))
        )
        items[index]?.focus()
        break
      }
    }
  }

  /** Moves keyboard focus through the enabled items, wrapping at the ends. */
  #moveItemFocus(direction: 1 | -1): void {
    const items = this.items
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as VfMenuItem)
    let next: number
    if (current < 0) next = direction === 1 ? 0 : items.length - 1
    else next = (current + direction + items.length) % items.length
    items[next]?.focus()
  }

  /** Outside dismissal + item keyboard nav while open standalone. */
  readonly #docListeners = new DocumentListenersController(this, () => [
    [document, 'pointerdown', this.#onDocPointerDown, true],
    [document, 'keydown', this.#onDocKeydown, true],
  ])

  override connectedCallback(): void {
    super.connectedCallback()
    this.#ownsRole ??= !this.hasAttribute('role')
    this.#syncRole()
    // The bar/standalone split also drives the label's rendered role, and a
    // reconnect alone schedules no re-render — re-parenting between the two
    // contexts must re-evaluate it.
    this.requestUpdate()
    this.addEventListener('vf-menu-close-request', this.#onCloseRequest)
    this.addEventListener('pointerdown', this.#onHostPointerDown)
    this.addEventListener('focusout', this.#onHostFocusOut)
  }

  /**
   * In a bar the host is `role="none"`: the `menubar`'s items are the shadow
   * `.label`s (`menuitem`), and while browsers do compute that ownership
   * through a role-less generic, declaring it keeps the chain explicit.
   * Standalone, the host stays role-less — the label is a `button` there.
   * Skipped when the consumer supplied their own role.
   */
  #syncRole(): void {
    if (!this.#ownsRole) return
    if (this.#inBar) this.setAttribute('role', 'none')
    else this.removeAttribute('role')
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('vf-menu-close-request', this.#onCloseRequest)
    this.removeEventListener('pointerdown', this.#onHostPointerDown)
    this.removeEventListener('focusout', this.#onHostFocusOut)
  }

  /**
   * Focus left the menu entirely while open standalone: close, so an open
   * panel can't outlive the focus that operates it and go on capturing the
   * document's keyboard. Modeled on `VfSelect.handleHostFocusOut`. In a bar,
   * the bar's own focusout listener coordinates instead.
   */
  #onHostFocusOut = (event: FocusEvent): void => {
    if (!this.open || this.#inBar) return
    const next = event.relatedTarget
    if (next instanceof Node && (this.contains(next) || this.renderRoot.contains(next))) {
      return
    }
    this.open = false
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('open')) {
      // A parent vf-menu-bar owns document-level dismissal; only self-manage
      // when standalone.
      if (this.open && !this.#inBar) this.#docListeners.attach()
      else this.#docListeners.detach()
      // A drag leaves the row it picked inverted through the blink; drop the
      // flag once the panel is gone, so a reopened menu never shows a stale
      // highlight.
      if (!this.open) for (const item of this.allItems) item.active = false
      // A type-ahead prefix doesn't survive the panel it was typed into.
      if (!this.open) this.#typeAhead.reset()
    }
  }

  /**
   * A press anywhere in the menu — the title, or a row inside the dropped panel
   * (both bubble up composed). Inside a bar the bar's own listener drives the
   * gesture instead, since it may travel between menus.
   */
  #onHostPointerDown = (event: PointerEvent): void => {
    // Any press in this menu is pointer interaction, so the focus rule goes —
    // and it has to be said explicitly, because a press on an ALREADY-focused
    // title moves no focus and so fires no focusin for the controller to read.
    // Registered on the host, not the title, so mousing into the dropped panel
    // drops it too. This half runs even inside a bar.
    this.#focusRule.suppress()
    if (this.#inBar) return
    this.#press.onPointerDown(event)
  }

  /**
   * Moves keyboard focus to the menu's bar label — the host's one focusable
   * point. Overridden because the platform's `focus()` is a silent no-op here:
   * no `delegatesFocus`, no host tabindex, so the standard method did nothing
   * and `vf-label for` (which calls `target.focus()`) couldn't reach the menu.
   */
  override focus(options?: FocusOptions): void {
    this._labelEl?.focus(options)
  }

  /**
   * @deprecated Use `focus()` — the standard method now does this. (Spelled
   *   without a link: a `{@link}` inside a deprecated tag makes the cem
   *   analyzer attach the parsed AST node to the manifest, which then fails
   *   to serialize — "Converting circular structure to JSON".)
   */
  focusLabel(): void {
    this.focus()
  }

  protected override render() {
    return html`
      <div
        class="label vf-snap ${this.#focusRule.marked ? 'vf-focus-rule' : ''}"
        part="label"
        role=${this.#inBar ? 'menuitem' : 'button'}
        tabindex=${this.barTabIndex}
        aria-haspopup="menu"
        aria-expanded=${this.open ? 'true' : 'false'}
        aria-label=${this.label || nothing}
        @pointerdown=${this.#onLabelPointerDown}
        @click=${this.#onLabelClick}
        @pointerenter=${this.#onLabelEnter}
        @keydown=${this.#onLabelKeydown}
      >
        <span class="title"><slot name="label">${this.label}</slot></span>
      </div>
      <div
        class="panel vf-panel"
        part="panel"
        role="menu"
        aria-label=${this.label || nothing}
      >
        <slot></slot>
      </div>
    `
  }

  /**
   * Requests a toggle. A parent `vf-menu-bar` cancels the internal
   * `vf-menu-toggle-request` event and coordinates; otherwise the menu
   * toggles itself.
   *
   * Standalone, no event is emitted at all: the cancelable request exists for
   * the bar's benefit, and letting it bubble on to the page meant a
   * consumer's delegated handler calling `preventDefault()` on an
   * unrecognised event silently kept the menu from ever opening.
   */
  #requestToggle(): void {
    if (!this.#inBar) {
      this.open = !this.open
      return
    }
    const proceed = emit(
      this,
      'vf-menu-toggle-request',
      { menu: this },
      { cancelable: true, composed: false }
    )
    if (proceed) this.open = !this.open
  }

  /**
   * Arms {@link #swallowClick}: the pointer gesture owns this press. Released
   * when the gesture's trailing click lands — a press-drag-release onto a row
   * dispatches that click at the common ancestor, above this label, so the
   * clearing in {@link #onLabelClick} alone would leave the latch stuck and
   * silently swallow the next assistive-tech click on the title.
   */
  #onLabelPointerDown(): void {
    this.#swallowClick = true
    releaseAfterGesture(() => {
      this.#swallowClick = false
    })
  }

  /**
   * `click` handler for *synthesised* activation — keyboard/assistive-tech
   * clicks that arrive with no preceding pointerdown. A real mouse/touch click
   * is swallowed here because the press gesture already resolved it.
   */
  #onLabelClick(): void {
    if (this.#swallowClick) {
      this.#swallowClick = false
      return
    }
    this.#requestToggle()
  }

  #onLabelEnter(): void {
    // Internal event: while a sibling menu is open, the bar switches to us.
    emit(this, 'vf-menu-hover', { menu: this }, { composed: false })
  }

  #onLabelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const wasOpen = this.open
      this.#requestToggle()
      // APG, menubar and menu-button patterns alike: opening from the
      // keyboard moves focus to the first item, as ArrowDown always did here.
      // Opening without entering parked the keyboard on the title with the
      // panel dropped.
      if (!wasOpen && this.open) void this.#focusFirstItem()
    } else if (event.key === 'ArrowDown' && !this.open) {
      event.preventDefault()
      this.#requestToggle()
      if (this.open) void this.#focusFirstItem()
    }
  }

  /**
   * Focuses the first enabled item once the panel is visible. The reflected
   * `open` attribute (which un-hides the panel) only lands on the host in the
   * next Lit update, so focusing synchronously would silently no-op.
   */
  async #focusFirstItem(): Promise<void> {
    await this.updateComplete
    this.items[0]?.focus()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-menu': VfMenu
  }
}
