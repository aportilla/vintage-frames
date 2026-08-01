import { css, html, LitElement, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay } from '../styles/base.js'
import { CHECKMARK, glyphSvg } from '../glyphs.js'
import { ScaleController } from '../scale.js'
import { runSelectionBlink, type BlinkHandle } from '../motion.js'
import { releaseAfterGesture } from '../document-listeners.js'
import { emit } from '../events.js'

/** The Mac modifier glyphs, in the order System 7 printed them.
 *
 * Declared ABOVE the class on purpose: `@vfElement` registers the element at
 * class-definition time, which synchronously upgrades any `<vf-menu-item>`
 * already in the document — running `connectedCallback` (and so
 * {@link toAriaKeyshortcuts}) before any statement written below the class
 * has executed. Below, this const was still in its temporal dead zone. */
const MODIFIER_GLYPHS: ReadonlyMap<string, string> = new Map([
  ['⌃', 'Control'],
  ['⌥', 'Alt'],
  ['⇧', 'Shift'],
  ['⌘', 'Meta'],
])

/**
 * Maps a display shortcut ("⌘⇧S") to an `aria-keyshortcuts` value
 * ("Meta+Shift+S"): leading modifier glyphs become ARIA modifier names,
 * whatever follows is the key itself — so "F1" passes through untouched.
 * Empty when there is no key to announce.
 */
function toAriaKeyshortcuts(shortcut: string): string {
  const chars = [...shortcut.trim()]
  const modifiers: string[] = []
  while (chars.length > 0 && MODIFIER_GLYPHS.has(chars[0]!)) {
    modifiers.push(MODIFIER_GLYPHS.get(chars.shift()!)!)
  }
  const key = chars.join('')
  return key ? [...modifiers, key].join('+') : ''
}

/**
 * `<vf-menu-item>` — a single command inside a `<vf-menu>` panel.
 *
 * Renders the classic System 7 menu row: optional ✓ check in the
 * `--vf-select-gutter` left column (16px, shared with vf-select/vf-option),
 * label, and a right-aligned keyboard shortcut. On activation the item
 * performs the classic 3-blink inversion (~250ms), then dispatches
 * `vf-menu-select` and asks its ancestors to close the menu.
 *
 * @slot - The item label.
 * @csspart item - The row container.
 * @csspart check - The ✓ checkmark glyph (rendered when `checked`).
 * @csspart label - The label wrapper around the default slot.
 * @csspart shortcut - The right-aligned shortcut text.
 * @fires vf-menu-select - After the blink completes. `detail: { value, item }`.
 *   Named for the menu rather than plain `vf-select`, which would collide with
 *   the `<vf-select>` popup on any delegated ancestor listener (that component
 *   commits with `vf-change`).
 * @cssprop [--vf-menu-row-height=16px] - `vf-menu-item` row pitch (`Menus.png`;
 *   kept separate from `--vf-popup-height` so re-theming the popup pill doesn't
 *   move pulldown rows)
 * @cssprop [--vf-select-gutter=16px] - checkmark column: `vf-select` left inset
 *   / `vf-option` + `vf-menu-item` ✓ column (shared so the value doesn't shift
 *   on open)
 */
@vfElement('vf-menu-item')
export class VfMenuItem extends LitElement {
  static override styles = [
    vfBase,
    vfDisplay,
    css`
      :host {
        display: block;
        cursor: default;
        outline: none;
      }
      .item {
        display: flex;
        align-items: center;
        /* Menus.png puts every menu row on a 16px pitch: the New Folder / Open
           / Print pulldown's nine inter-band gaps are all exact multiples of 16
           (48, 32, 16, 16, 16, 48, 16, 32, 16 — the 32s and 48s are separator
           groups). A row is 3px above + the 9px glyph + 4px below.

           Its own token rather than a share of --vf-popup-height: the art has
           pulldown and popup rows identical, but tying them would make
           re-theming the popup *pill* move every pulldown row, which is
           semantically wrong. --vf-control-height is scoped to fields (22). */
        height: calc(var(--vf-scale, 1) * var(--vf-menu-row-height, 16px));
        /* Lock the line box to the row box, as vf-option does. vfDisplay's 1.25
           line-height resolves taller than a 16px row, and with align-items:
           center the excess spills equally above and below — invisible per row,
           but it overflowed the panel and summoned a scrollbar the last time a
           row shrank under an inherited line-height. Derived from the same
           expression as the height so a re-theme can't reintroduce the gap. */
        line-height: calc(var(--vf-scale, 1) * var(--vf-menu-row-height, 16px));
        /* Shares --vf-select-gutter with vf-select/vf-option: Menus.png puts a
           pulldown's label ink at the same inset as a popup's, and both hold
           the same 9px ✓. (The token name says "select" for historical
           reasons; it is the checkmark column for every menu surface.) */
        padding: 0 calc(var(--vf-scale, 1) * 12px) 0
          calc(var(--vf-scale, 1) * var(--vf-select-gutter, 16px));
        position: relative;
        white-space: nowrap;
      }
      /* The inherited color deliberately lets a disabled row dim its ✓ along
         with the label. Brief §1 says dimming greys the label only while chrome
         glyphs stay black, but authentic System 7 greyed the whole disabled
         row, check included — and reference behavior wins over the rule of
         thumb. Documented deviation, not an oversight. */
      /* 3px in from the row's left edge on both axes, matching Menus.png (✓ ink
         at +4 from the panel border, i.e. 3 inside it) and vf-option's
         identical rule. The 16px row less the 9px glyph leaves 7 — an odd
         remainder, so it is biased 3 above / 4 below exactly as the art has it
         rather than centred on 3.5 authored px (10.5 device px at the default
         3×), which would fringe at every scale. */
      .check {
        position: absolute;
        left: calc(var(--vf-scale, 1) * 3px);
        top: calc(var(--vf-scale, 1) * 3px);
        display: block;
        color: inherit;
      }
      /* Native 9×9 (1:1, crisp). */
      .check svg {
        display: block;
        width: calc(var(--vf-scale, 1) * 9px);
        height: calc(var(--vf-scale, 1) * 9px);
      }
      .label {
        flex: 1;
      }
      .shortcut {
        margin-left: calc(var(--vf-scale, 1) * 24px);
      }
      :host([disabled]) .item {
        color: var(--vf-disabled, #c0c0c0);
      }
      /* Highlight = full-width inversion (hover, the press-drag's [active],
         keyboard focus, blink "on"). blink-on is scoped to the enabled host
         like its siblings: an item disabled mid-blink has its timer cancelled
         (see updated()), and this keeps it from flashing even for the frame
         before that lands. */
      :host(:not([disabled])) .item:hover,
      :host(:not([disabled])[active]) .item,
      :host(:not([disabled]):focus) .item,
      :host(:not([disabled])) .item.blink-on {
        background: var(--vf-highlight, #000);
        color: var(--vf-highlight-text, #fff);
      }
      /* While blinking, the timer — not the pointer — owns the inversion. Each
         highlight source needs its own override at matching specificity; the
         [active] one is what lets a drag-picked row keep its flag through the
         blink, so the release reads as the highlight flashing off. */
      :host(:not([disabled])) .item.blink-off:hover,
      :host(:not([disabled])[active]) .item.blink-off,
      :host(:not([disabled]):focus) .item.blink-off,
      .item.blink-off {
        background: transparent;
        color: inherit;
      }
    `,
  ]

  private readonly scale = new ScaleController(this)

  // No GridSnapController: an item lives inside its vf-menu's panel, which
  // rides the menu's snap offset (see src/grid-snap.ts).

  /** Disables the item: dimmed text, no highlight, no activation. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Shows the classic ✓ checkmark in the left gutter. */
  @property({ type: Boolean, reflect: true }) checked = false

  /**
   * Transient highlight — the full-row inversion the press-drag gesture paints
   * on the row under the pointer (`:hover` can't: under touch the pointer is
   * captured by the title the press started on). Managed by the menu, mirroring
   * `vf-option[active]`; not part of the authoring API.
   */
  @property({ type: Boolean, reflect: true }) active = false

  /**
   * Declares the item a *checkable* toggle up front, so it carries
   * `role="menuitemcheckbox"` and `aria-checked="false"` from the first render
   * rather than only once it has been checked. Set this on a toggle that starts
   * **off** — otherwise it announces as a plain command until the first flip
   * (the `checked` attribute can't express "checkable but off": for a boolean
   * attribute, presence *is* true).
   */
  @property({ type: Boolean, reflect: true }) checkable = false

  /**
   * Right-aligned keyboard shortcut text, e.g. `"⌘H"`. Display only in the
   * visual sense — the span is `aria-hidden` so the glyphs never concatenate
   * into the item's accessible name ("Print… place of interest sign P") —
   * while the host mirrors it as `aria-keyshortcuts` ("Meta+H"), so AT
   * announces it *as* a shortcut. A consumer's own `aria-keyshortcuts` wins.
   */
  @property() shortcut = ''

  /**
   * Value reported in the `vf-menu-select` event detail. Defaults to the item's
   * trimmed text content when unset.
   */
  @property() value?: string

  /** `'on' | 'off'` while the selection blink runs, otherwise `null`. */
  @state() private _blinkPhase: 'on' | 'off' | null = null

  #blinkHandle: BlinkHandle | undefined
  #blinking = false

  /**
   * Latches true once the item has ever been `checked`, so an item that only
   * ever sets `checked` — without declaring {@link checkable} — is still
   * promoted to a toggle. Folded together with the public prop by
   * {@link #isCheckable}.
   */
  #everChecked = false

  /**
   * Whether this component owns the host `role`. Decided on the FIRST connect
   * only: our own `role` write persists on the element, so re-testing
   * `hasAttribute('role')` on a reconnect would read that write back as
   * consumer-supplied and freeze the role wherever it happened to be.
   */
  #ownsRole: boolean | undefined

  /** Same first-connect latch, for the host `aria-keyshortcuts` mirror. */
  #ownsKeyshortcuts: boolean | undefined

  /**
   * Swallows the one `click` the browser synthesises after a pointer press: the
   * menu's press gesture (src/menu-press.ts) already resolved it, and under
   * `prefers-reduced-motion` — where activation completes synchronously and the
   * blink guard is back down by the time the click lands — the row would
   * otherwise fire `vf-menu-select` twice. Set only inside a `vf-menu`, where
   * that gesture is running; a row used outside one keeps plain click
   * activation. A `click` with no preceding pointerdown (keyboard /
   * assistive tech) always activates — which is exactly why the click listener
   * lives on the HOST (see the constructor): a synthetic `element.click()`
   * targets the node carrying the role, and events dispatched at the host
   * propagate up, never down into its own shadow tree. Cleared by the
   * gesture's trailing click wherever it lands (see releaseAfterGesture) — a
   * press-drag-release dispatches it at an ancestor, above this element.
   */
  #swallowClick = false

  constructor() {
    super()
    // Bound on the host: keydown targets the focused host element and never
    // enters the shadow tree, so a shadow-internal binding would not fire.
    // click for the same reason — `element.click()`, the activation a screen
    // reader or voice control dispatches, targets the host too. A real
    // pointer click bubbles up here from the shadow row, so one listener
    // serves both.
    this.addEventListener('keydown', this.#onKeydown)
    this.addEventListener('pointerdown', this.#onPointerDown)
    this.addEventListener('click', this.#onClick)
  }

  /** True when the item should announce as a toggle, not a plain command. */
  get #isCheckable(): boolean {
    return this.checkable || this.#everChecked
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.#ownsRole ??= !this.hasAttribute('role')
    this.#ownsKeyshortcuts ??= !this.hasAttribute('aria-keyshortcuts')
    // Re-derived (not blindly reset) so re-parenting a checkable item keeps its
    // menuitemcheckbox role and aria-checked — updated() does not re-fire on a
    // reconnect, so an unconditional write here stranded it as a plain command.
    this.#syncRole()
    this.#syncKeyshortcuts()
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#cancelBlink()
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('disabled')) {
      if (this.disabled) {
        this.setAttribute('aria-disabled', 'true')
        // Disabled mid-blink: drop the pending activation. #activate only
        // checked `disabled` on entry, so the timer would otherwise run to
        // completion and dispatch vf-menu-select for a now-disabled item.
        this.#cancelBlink()
      } else this.removeAttribute('aria-disabled')
    }
    if (changed.has('checked') && this.checked) this.#everChecked = true
    if (changed.has('checked') || changed.has('checkable')) this.#syncRole()
    if (changed.has('shortcut')) this.#syncKeyshortcuts()
  }

  /**
   * Mirrors {@link shortcut} onto the host as `aria-keyshortcuts`, normalised
   * from the Mac display glyphs to the ARIA grammar ("⌘⇧S" → "Meta+Shift+S").
   * Skipped when the consumer supplied their own value.
   */
  #syncKeyshortcuts(): void {
    if (!this.#ownsKeyshortcuts) return
    const normalized = toAriaKeyshortcuts(this.shortcut)
    if (normalized) this.setAttribute('aria-keyshortcuts', normalized)
    else this.removeAttribute('aria-keyshortcuts')
  }

  /**
   * Writes the ARIA role and `aria-checked` for the current state. A checkable
   * item announces its on/off state (`aria-checked` is only valid on the
   * checkbox role); a plain command stays `role="menuitem"`. Skipped entirely
   * when the consumer supplied their own role.
   */
  #syncRole(): void {
    if (!this.#ownsRole) return
    if (this.#isCheckable) {
      this.setAttribute('role', 'menuitemcheckbox')
      this.setAttribute('aria-checked', this.checked ? 'true' : 'false')
    } else {
      this.setAttribute('role', 'menuitem')
      this.removeAttribute('aria-checked')
    }
  }

  protected override render() {
    const classes = {
      item: true,
      'blink-on': this._blinkPhase === 'on',
      'blink-off': this._blinkPhase === 'off',
    }
    return html`
      <div class=${classMap(classes)} part="item">
        ${this.checked
          ? html`<span class="check" part="check" aria-hidden="true"
              >${glyphSvg(CHECKMARK, 'checkmark')}</span
            >`
          : nothing}
        <span class="label" part="label"><slot></slot></span>
        ${this.shortcut
          ? html`<span class="shortcut" part="shortcut" aria-hidden="true"
              >${this.shortcut}</span
            >`
          : nothing}
      </div>
    `
  }

  #onPointerDown(): void {
    this.#swallowClick = this.closest('vf-menu') !== null
    if (this.#swallowClick) {
      releaseAfterGesture(() => {
        this.#swallowClick = false
      })
    }
  }

  #onClick(): void {
    if (this.#swallowClick) {
      this.#swallowClick = false
      return
    }
    this.activate()
  }

  #onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      this.activate()
    }
  }

  /**
   * Runs the classic 3-blink inversion, then dispatches `vf-menu-select` and an
   * internal `vf-menu-close-request` so ancestor menu/menu-bar close. Public
   * because the menu's press gesture activates the row a drag was released
   * over, which the row's own `click` never sees (a press that started on the
   * title dispatches its click above both of them). No-op while disabled or
   * already blinking.
   */
  activate(): void {
    if (this.disabled || this.#blinking) return
    this.#blinking = true
    // Shared primitive owns the timing + reduced-motion short-circuit; under
    // reduced motion it runs `onDone` synchronously (no blink), clearing the
    // flag before we retain the handle.
    const handle = runSelectionBlink(
      (on) => {
        this._blinkPhase = on ? 'on' : 'off'
      },
      () => {
        this._blinkPhase = null
        this.#blinking = false
        this.#blinkHandle = undefined
        this.#dispatchSelect()
      }
    )
    if (this.#blinking) this.#blinkHandle = handle
  }

  /**
   * Aborts an in-flight selection blink *without* dispatching — the item is
   * being disabled or torn down, so the pending `vf-menu-select` is dropped.
   */
  #cancelBlink(): void {
    if (!this.#blinking) return
    this.#blinkHandle?.cancel()
    this.#blinkHandle = undefined
    this.#blinking = false
    this._blinkPhase = null
  }

  #dispatchSelect(): void {
    const value = this.value ?? (this.textContent ?? '').trim()
    emit(this, 'vf-menu-select', { value, item: this })
    // Internal coordination event: `vf-menu` / `vf-menu-bar` listen and close.
    emit(this, 'vf-menu-close-request', { item: this })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-menu-item': VfMenuItem
  }
}
