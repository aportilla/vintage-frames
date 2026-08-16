import { css, html, LitElement, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { classMap } from 'lit/directives/class-map.js'
import { vfBase, vfDisplay } from '../styles/base.js'
import { CHECKMARK, glyphSvg } from '../glyphs.js'
import { VfPositioned } from '../position.js'
import { ScaleController } from '../scale.js'
import { runSelectionBlink, type BlinkHandle } from '../motion.js'
import { releaseAfterGesture } from '../document-listeners.js'
import { deferActivation, emit } from '../events.js'

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
 * Whether this keydown IS the item's key equivalent: every declared modifier
 * down, no undeclared one, and `event.key` matching the rest of the shortcut
 * case-insensitively (Shift capitalizes a letter's `key`, so "⇧⌘Z" must still
 * meet a `key` of "Z").
 *
 * A shortcut with no ⌘/⌃/⌥ and a single printable key never matches — it
 * renders and announces, but a bare letter claimed globally would hijack
 * typing in every field on the page. A named key ("F1") needs no modifier.
 */
function matchesKeydown(event: KeyboardEvent, shortcut: string): boolean {
  const chars = [...shortcut.trim()]
  const mods = { Meta: false, Control: false, Alt: false, Shift: false }
  while (chars.length > 0 && MODIFIER_GLYPHS.has(chars[0]!)) {
    mods[MODIFIER_GLYPHS.get(chars.shift()!)! as keyof typeof mods] = true
  }
  const key = chars.join('')
  if (!key) return false
  if (!mods.Meta && !mods.Control && !mods.Alt && [...key].length === 1) {
    return false
  }
  return (
    event.metaKey === mods.Meta &&
    event.ctrlKey === mods.Control &&
    event.altKey === mods.Alt &&
    event.shiftKey === mods.Shift &&
    event.key.toLowerCase() === key.toLowerCase()
  )
}

/**
 * `<vf-menu-item>` — a single command inside a `<vf-menu>` panel.
 *
 * Renders the classic System 7 menu row: optional ✓ check in the
 * `--vf-select-gutter` left column (16px, shared with vf-select/vf-option),
 * label, and the keyboard shortcut left-aligned in a right-anchored column,
 * so every ⌘ lands at the same x. On activation the item performs the classic
 * 3-blink inversion (~250ms), then dispatches `vf-menu-select` and asks its
 * ancestors to close the menu.
 *
 * Takes `top`/`left` like every other element ({@link VfPositioned}), for the
 * consumer who wants a row somewhere other than a pulldown. Inside its parent
 * `<vf-menu>` the panel is as wide as its widest row and stacks them in flow,
 * so stating an origin takes that row out of both: it no longer contributes to
 * the panel's width and the rows below close the gap. The placement doing what
 * it says — but not how a pulldown is laid out.
 *
 * @slot - The item label.
 * @csspart item - The row container.
 * @csspart check - The ✓ checkmark glyph (rendered when `checked`).
 * @csspart label - The label wrapper around the default slot.
 * @csspart shortcut - The shortcut text, left-aligned in the shared column.
 * @fires vf-menu-select - After the blink completes. `detail: { value, item }`.
 *   Named for the menu rather than plain `vf-select`, which would collide with
 *   the `<vf-select>` popup on any delegated ancestor listener (that component
 *   commits with `vf-change`).
 * @cssprop [--vf-menu-row-height=16px] - `vf-menu-item` row pitch (`Menus.png`;
 *   kept separate from `--vf-popup-height` so re-theming the popup pill doesn't
 *   move pulldown rows)
 * @cssprop [--vf-menu-shortcut-column=23px] - `vf-menu-item` shortcut slot,
 *   right-anchored with the text left-aligned in it so every ⌘ lands at the
 *   same x (`Menus.png`) — the MDEF reserve, ⌘'s 11px advance + the face's
 *   widest letter (M/W, 12px); widen it to line up longer shortcuts ("⌘⇧S")
 * @cssprop [--vf-select-gutter=16px] - checkmark column: `vf-select` left inset
 *   / `vf-option` + `vf-menu-item` ✓ column (shared so the value doesn't shift
 *   on open)
 */
@vfElement('vf-menu-item')
export class VfMenuItem extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
    vfDisplay,
    css`
      :host {
        display: block;
        cursor: var(--vf-cursor, default);
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
      /* The shortcut is LEFT-aligned ink in a right-anchored slot, the way the
         MDEF drew it: in Menus.png's File pulldown every ⌘ starts at the same
         x — 23px left of the right border — whatever the letter, with ⌘W
         running to within 3px of the border. Flexing the label and letting the
         span hug the right edge instead right-aligned the pairs, so the ⌘
         column jagged with each letter's width. The slot is the classic
         reserve: ⌘'s 11px advance + the face's widest letter (M/W, 12px) —
         sized so ⌘W exactly fills it and no pair moves the anchor.
         min-width, not width, so a longer shortcut ("⌘⇧S") widens its own
         slot rather than painting past the row. The 8px margin is the
         label↔shortcut minimum ("Close Window"'s label box ends at +108, the
         slot starts at +116); it only binds in the row that sets the panel's
         intrinsic width. */
      .shortcut {
        flex: none;
        margin-left: calc(var(--vf-scale, 1) * 8px);
        min-width: calc(
          var(--vf-scale, 1) * var(--vf-menu-shortcut-column, 23px)
        );
        text-align: left;
      }
      /* A shortcut row trades the label's 12px right clearance for the art's
         1px — the slot itself is the clearance there (1 + 23 puts the slot
         edge at −24, and ⌘'s 1px bearing lands its ink at −23, as traced).
         Label-only rows keep the 12. */
      .item.has-shortcut {
        padding-right: calc(var(--vf-scale, 1) * 1px);
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
        /* Forced colors: exempt the inverted row from the mode's text
           backplate, which would land a Canvas slab on the highlight bar —
           see vf-list-item's forced-colors note. The pair is already the
           user's own via the vfBase token remap. */
        @media (forced-colors: active) {
          forced-color-adjust: none;
        }
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
   * Keyboard shortcut, e.g. `"⌘H"`, drawn left-aligned in the panel's
   * shared shortcut column. The span is `aria-hidden` so the glyphs never
   * concatenate into the item's accessible name ("Print… place of interest
   * sign P") — the host mirrors it as `aria-keyshortcuts` ("Meta+H") instead,
   * so AT announces it *as* a shortcut. A consumer's own `aria-keyshortcuts`
   * wins.
   *
   * Inside a `vf-menu`/`vf-menu-bar` that declares `shortcuts`, this is a
   * LIVE key equivalent, not a legend: a matching keydown anywhere on the
   * page activates the item — menu open or not — claiming the stroke with
   * `preventDefault()` (see the document keydown handler below for the full
   * contract).
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
   * ARIA goes through internals, never `setAttribute` on the host: internals
   * values are *defaults*, so a consumer's own `role`/`aria-*` on the tag wins
   * — the platform's own precedence, and the opposite of what a host
   * `setAttribute` gives. See SPEC §2.
   *
   * This is also what retired the pair of first-connect ownership latches this
   * component used to carry. They existed because our own host write was
   * indistinguishable from a consumer's on any later read; an internals default
   * is never on the host to be misread, so ownership needs no latch and a
   * consumer's attribute wins whenever it is present rather than only when it
   * beat us to the first connect.
   */
  readonly #internals = this.attachInternals()

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
    // Re-derived (not blindly reset) so re-parenting a checkable item keeps its
    // menuitemcheckbox role and aria-checked — updated() does not re-fire on a
    // reconnect, so an unconditional write here stranded it as a plain command.
    this.#syncRole()
    this.#syncKeyshortcuts()
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1
    // The key-equivalent ear: always attached while connected, gated live in
    // the handler (the `shortcuts` grant and the shortcut itself may both
    // change after connect).
    document.addEventListener('keydown', this.#onDocKeydown)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    document.removeEventListener('keydown', this.#onDocKeydown)
    this.#cancelBlink()
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('disabled')) {
      this.#internals.ariaDisabled = this.disabled ? 'true' : null
      // Disabled mid-blink: drop the pending activation. #activate only
      // checked `disabled` on entry, so the timer would otherwise run to
      // completion and dispatch vf-menu-select for a now-disabled item.
      if (this.disabled) this.#cancelBlink()
    }
    if (changed.has('checked') && this.checked) this.#everChecked = true
    if (changed.has('checked') || changed.has('checkable')) this.#syncRole()
    if (changed.has('shortcut')) this.#syncKeyshortcuts()
  }

  /**
   * Mirrors {@link shortcut} as the host's `aria-keyshortcuts`, normalised from
   * the Mac display glyphs to the ARIA grammar ("⌘⇧S" → "Meta+Shift+S"). A
   * consumer's own attribute overrides this the way it overrides the role.
   */
  #syncKeyshortcuts(): void {
    this.#internals.ariaKeyShortcuts = toAriaKeyshortcuts(this.shortcut) || null
  }

  /**
   * Writes the ARIA role and `aria-checked` for the current state. A checkable
   * item announces its on/off state (`aria-checked` is only valid on the
   * checkbox role); a plain command stays `role="menuitem"`.
   */
  #syncRole(): void {
    if (this.#isCheckable) {
      this.#internals.role = 'menuitemcheckbox'
      this.#internals.ariaChecked = this.checked ? 'true' : 'false'
    } else {
      this.#internals.role = 'menuitem'
      this.#internals.ariaChecked = null
    }
  }

  protected override render() {
    const classes = {
      item: true,
      'has-shortcut': this.shortcut !== '',
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

  /**
   * The gesture latch is read *now* — it is about a press that already
   * resolved this click — but the activation itself defers to the end of the
   * path, so `preventDefault()` on the item (or above it) cancels the command
   * the way it cancels a native control's. See {@link deferActivation}.
   */
  #onClick(event: MouseEvent): void {
    if (this.#swallowClick) {
      this.#swallowClick = false
      return
    }
    deferActivation(this, event, () => this.activate())
  }

  #onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      this.activate()
    }
  }

  /**
   * The MenuKey() half of {@link shortcut}: a document-level ear that answers
   * the item's key equivalent from anywhere on the page, menu open or not —
   * so File → Save shows ⌘S *and* answers it, with no page-side plumbing.
   *
   * Live only under a grant: an ancestor `vf-menu` or `vf-menu-bar` declaring
   * `shortcuts`. Key equivalents are page-global — the one thing in the kit
   * that is — and a page may hold several menus (a component reference, a
   * dialog mock-up) of which only one is *the* menu bar; the grant says which,
   * the way `applyCursor()` is the page's own call. Checked per event, so
   * toggling the grant needs no re-wiring.
   *
   * Contract, in claim order:
   * - A `defaultPrevented` stroke is already someone's — a page handler that
   *   ran first keeps its key. A match claims with `preventDefault()` (no
   *   `stopPropagation`), so with several items contesting one key the first
   *   connected wins and later page listeners still observe the claimed event.
   * - A disabled item claims nothing: the stroke falls through untouched, so
   *   a grayed Undo leaves ⌘Z to the focused field's own native undo.
   * - Auto-repeat strokes are claimed but activate only once per press.
   * - Activation is the normal path — blink, `vf-menu-select` — plus an
   *   internal flash request so a *closed* ancestor menu answers by flashing
   *   its bar title, exactly MenuKey's acknowledgment; the panel never opens
   *   and focus never moves. An open menu shows the item blink and closes.
   */
  #onDocKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) return
    if (this.disabled || !this.shortcut) return
    if (!this.closest('vf-menu[shortcuts], vf-menu-bar[shortcuts]')) return
    if (!matchesKeydown(event, this.shortcut)) return
    event.preventDefault()
    if (event.repeat || this.#blinking) return
    emit(this, 'vf-menu-flash-request', { item: this }, { composed: false })
    this.activate()
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
    // Skipped when the ancestor menu is CLOSED — a key equivalent activates
    // through the closed panel, and the close paths return focus to the bar
    // label, which would yank it from wherever the user was typing.
    const menu = this.closest('vf-menu')
    if (!menu || menu.hasAttribute('open')) {
      emit(this, 'vf-menu-close-request', { item: this }, { composed: false })
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-menu-item': VfMenuItem
  }
}
