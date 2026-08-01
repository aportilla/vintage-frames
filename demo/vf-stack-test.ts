/**
 * Behavior for vf-stack-test.html — the `<vf-stack>` configuration playground.
 *
 * A workbench rather than a demo page: one stack in a marked-off stage, every
 * public parameter of it on a control, a palette of children to put in it, and
 * the markup that reproduces the result printed underneath.
 *
 * Three things are worth knowing before editing:
 *
 *   1. Each palette entry's `markup` is the SINGLE source for both the live
 *      child and the printed sample — the child is parsed from that string, so
 *      the sample cannot drift from the stage. examples.html plays the same
 *      trick with its inert `<template>`s.
 *
 *   2. The config is written to the stack as PROPERTIES, and the printed
 *      markup is generated from the same config with defaults omitted — so the
 *      sample shows what an author would actually type, not what the component
 *      reflected back.
 *
 *   3. The child DOM is mutated in place (append / move / remove), never
 *      rebuilt wholesale, so text typed into a field on the stage survives a
 *      change to `gap`.
 *
 * Nothing here writes `--vf-scale`. Scaling is internal to the components, and
 * a bench that imposed a scale would stop showing what a consumer's page gets;
 * `effectiveScale()` is read only to REPORT what they chose.
 */
import {
  applyGridSnap,
  effectiveScale,
  getZoom,
  requestGridSnap,
  truePixelRatio,
} from '../src/index.js'
import type {
  VfButton,
  VfCheckbox,
  VfList,
  VfNumberField,
  VfRadioGroup,
  VfSelect,
  VfStack,
  VfStackPlace,
  VfStackDirection,
} from '../src/index.js'

/** Query a required element; fail loudly if the markup drifts. */
function $<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`vf-stack-test: missing element ${selector}`)
  return el
}

/* ------------------------------------------------------------------ *
 * The palette — what can go in the stack.
 * ------------------------------------------------------------------ */

interface ChildKind {
  /** Value in the palette popup, and the key a preset names. */
  id: string
  /** What the palette and the child list call it. */
  name: string
  /**
   * The light DOM this entry adds — and, verbatim, the markup the sample
   * prints. One source, so the two cannot disagree.
   */
  markup: string
}

/**
 * Chosen to cover both halves of the fill rule: the controls drawn at a size of
 * their own, which ask for nothing (button, popup, field, swatch, image), and
 * the ones drawn as a track or a frame that IS the width, which have no size to
 * keep and read wrong until they're filled (separator, slider, progress bar,
 * fieldset, list, scroll area, copy). Plus a nested stack, an empty stack — the
 * spacer that owns a row's slack — and a plain `<div>`, a child the kit knows
 * nothing about.
 */
const CHILD_KINDS: readonly ChildKind[] = [
  {
    id: 'button',
    name: 'vf-button',
    markup: '<vf-button>Cancel</vf-button>',
  },
  {
    id: 'button-default',
    name: 'vf-button (default)',
    markup: '<vf-button variant="default">OK</vf-button>',
  },
  {
    id: 'button-small',
    name: 'vf-button (small)',
    markup: '<vf-button size="small">Set…</vf-button>',
  },
  {
    id: 'button-group',
    name: 'vf-button-group',
    markup: `<vf-button-group>
  <vf-button>Cancel</vf-button>
  <vf-button variant="default">OK</vf-button>
</vf-button-group>`,
  },
  {
    id: 'label',
    name: 'vf-label',
    markup: '<vf-label width="72">Name:</vf-label>',
  },
  {
    id: 'paragraph',
    name: 'vf-paragraph',
    markup:
      '<vf-paragraph>Click Install to place DragThing on your hard disk.</vf-paragraph>',
  },
  {
    id: 'text-field',
    name: 'vf-text-field',
    markup: '<vf-text-field placeholder="untitled"></vf-text-field>',
  },
  {
    id: 'text-area',
    name: 'vf-text-area',
    markup: '<vf-text-area rows="3"></vf-text-area>',
  },
  {
    id: 'number-field',
    name: 'vf-number-field',
    markup: '<vf-number-field value="72" min="1" max="600"></vf-number-field>',
  },
  {
    id: 'checkbox',
    name: 'vf-checkbox',
    markup: '<vf-checkbox checked>Show ruler</vf-checkbox>',
  },
  {
    id: 'radio-group',
    name: 'vf-radio-group',
    markup: `<vf-radio-group name="orientation" value="portrait">
  <vf-radio value="portrait">Portrait</vf-radio>
  <vf-radio value="landscape">Landscape</vf-radio>
</vf-radio-group>`,
  },
  {
    id: 'select',
    name: 'vf-select',
    markup: `<vf-select value="hd">
  <vf-option value="hd">Macintosh HD</vf-option>
  <vf-option value="floppy">Untitled Disk</vf-option>
</vf-select>`,
  },
  {
    id: 'slider',
    name: 'vf-slider',
    markup: '<vf-slider value="40"></vf-slider>',
  },
  {
    id: 'progress-bar',
    name: 'vf-progress-bar',
    markup: '<vf-progress-bar value="60"></vf-progress-bar>',
  },
  {
    id: 'swatch',
    name: 'vf-swatch',
    markup: '<vf-swatch color="#cc0033"></vf-swatch>',
  },
  {
    id: 'separator',
    name: 'vf-separator',
    markup: '<vf-separator></vf-separator>',
  },
  {
    id: 'separator-vertical',
    name: 'vf-separator (vertical)',
    markup: '<vf-separator vertical></vf-separator>',
  },
  {
    id: 'fieldset',
    name: 'vf-fieldset',
    markup: `<vf-fieldset legend="Options">
  <vf-checkbox checked>Wrap text</vf-checkbox>
</vf-fieldset>`,
  },
  {
    id: 'list',
    name: 'vf-list',
    markup: `<vf-list value="chooser">
  <vf-list-item value="chooser">Chooser</vf-list-item>
  <vf-list-item value="key-caps">Key Caps</vf-list-item>
  <vf-list-item value="note-pad">Note Pad</vf-list-item>
</vf-list>`,
  },
  {
    id: 'scroll-area',
    // Sized in `em` on purpose: on a vf-* host 1em is the kit's 16-system-px
    // face, so 5em is 80 system px at every density — the technique a page
    // uses where it can't write the unit itself (examples.css says the same).
    name: 'vf-scroll-area',
    markup: `<vf-scroll-area style="height: 5em">
  <vf-paragraph>A scroll area reserves its rail and fills it in on overflow, so the frame never moves.</vf-paragraph>
  <vf-paragraph>Enough copy to overflow the box and bring the rail to life.</vf-paragraph>
</vf-scroll-area>`,
  },
  {
    id: 'grid',
    name: 'vf-grid',
    markup: `<vf-grid columns="4" rows="2" cell-width="16" cell-height="16">
  <vf-swatch color="#000000"></vf-swatch>
  <vf-swatch color="#ffffff"></vf-swatch>
  <vf-swatch color="#cc0033"></vf-swatch>
  <vf-swatch color="#ff6600"></vf-swatch>
  <vf-swatch color="#ffcc00"></vf-swatch>
  <vf-swatch color="#33cc33"></vf-swatch>
  <vf-swatch color="#0066cc"></vf-swatch>
  <vf-swatch color="#663399"></vf-swatch>
</vf-grid>`,
  },
  {
    id: 'img',
    name: 'vf-img',
    markup: `<vf-img width="32" height="32">
  <img src="/demo/icons/puzzle.png" alt="Puzzle" />
</vf-img>`,
  },
  {
    id: 'stack-field-row',
    name: 'vf-stack (field row)',
    markup: `<vf-stack fill-width direction="row" gap="8">
  <vf-label width="80" for="name">Name:</vf-label>
  <vf-text-field fill-width id="name"></vf-text-field>
</vf-stack>`,
  },
  {
    id: 'stack-action-row',
    name: 'vf-stack (action row)',
    markup: `<vf-stack fill-width place="end">
  <vf-button-group>
    <vf-button>Cancel</vf-button>
    <vf-button variant="default">OK</vf-button>
  </vf-button-group>
</vf-stack>`,
  },
  {
    id: 'stack-spacer',
    name: 'vf-stack (empty — a spacer)',
    markup: '<vf-stack></vf-stack>',
  },
  {
    id: 'div',
    name: 'plain <div> (not a vf-* child)',
    markup: '<div class="page-child">A div of the page’s own</div>',
  },
]

const KIND_BY_ID = new Map(CHILD_KINDS.map((kind) => [kind.id, kind]))

/* ------------------------------------------------------------------ *
 * State.
 * ------------------------------------------------------------------ */

/**
 * `place` carries the unset state as a value of its own, the way the control
 * has to offer it: `null` is "left off", which resolves per direction. It is
 * not a value the attribute can take — the component has no `auto`.
 */
interface StackConfig {
  direction: VfStackDirection
  gap: number
  /** top, right, bottom, left — in system px, always four values here. */
  pad: [number, number, number, number]
  place: VfStackPlace | null
  /** `null` means the property is left off entirely, not set to zero. */
  width: number | null
  height: number | null
}

/** A fresh copy every time — `pad` is a mutable array. */
function defaults(): StackConfig {
  return {
    direction: 'column',
    gap: 12,
    pad: [0, 0, 0, 0],
    place: null,
    width: null,
    height: null,
  }
}

interface ChildEntry {
  id: string
  kind: ChildKind
  el: HTMLElement
  fillWidth: boolean
  fillHeight: boolean
}

let config = defaults()
let entries: ChildEntry[] = []
let selectedId = ''
let nextId = 0

/* ------------------------------------------------------------------ *
 * Presets — whole configurations, including the README's own example.
 * ------------------------------------------------------------------ */

interface Preset {
  id: string
  name: string
  config: () => StackConfig
  children: readonly { kind: string; fillWidth?: boolean; fillHeight?: boolean }[]
}

const PRESETS: readonly Preset[] = [
  {
    // Where the page starts. Three buttons and nothing else: the plainest
    // thing a stack can hold, and three different widths and heights, so
    // every parameter shows its effect on the first click.
    id: 'buttons',
    name: 'Three buttons',
    config: () => defaults(),
    children: [
      { kind: 'button' },
      { kind: 'button-default' },
      { kind: 'button-small' },
    ],
  },
  {
    id: 'panel',
    name: 'Window panel (README)',
    config: () => defaults(),
    children: [{ kind: 'stack-field-row' }, { kind: 'stack-action-row' }],
  },
  {
    // The one place a main-axis fill matters: without the declared width there
    // is no slack, and the field would sit at its own 180 system px.
    id: 'field-row',
    name: 'Labeled field row',
    config: () => ({ ...defaults(), direction: 'row', gap: 8, width: 300 }),
    children: [{ kind: 'label' }, { kind: 'text-field', fillWidth: true }],
  },
  {
    id: 'action-row',
    name: 'Action row',
    config: () => ({ ...defaults(), place: 'end', width: 300 }),
    children: [{ kind: 'button-group' }],
  },
  {
    // The justify="between" composition, without a justify: the slack has to
    // belong to something, so it belongs to an empty stack.
    id: 'ends',
    name: 'Both ends of a row',
    config: () => ({ ...defaults(), direction: 'row', width: 300 }),
    children: [
      { kind: 'button' },
      { kind: 'stack-spacer', fillWidth: true },
      { kind: 'button-default' },
    ],
  },
  {
    id: 'fill',
    name: 'What fill-width is for',
    config: () => ({ ...defaults(), gap: 10, width: 260 }),
    children: [
      { kind: 'label' },
      { kind: 'select' },
      { kind: 'separator', fillWidth: true },
      { kind: 'fieldset', fillWidth: true },
      { kind: 'slider', fillWidth: true },
      { kind: 'paragraph' },
    ],
  },
  {
    // Nothing declared at all: the column is exactly as wide as its widest
    // child, which is the whole geometry rule in one screen.
    id: 'content',
    name: 'Content governs the box',
    config: () => ({ ...defaults(), gap: 8 }),
    children: [
      { kind: 'button' },
      { kind: 'button-default' },
      { kind: 'select' },
      { kind: 'separator', fillWidth: true },
    ],
  },
  {
    id: 'padded',
    name: 'Padded panel (flush window)',
    config: () => ({ ...defaults(), pad: [14, 12, 10, 12], width: 300 }),
    children: [
      { kind: 'paragraph' },
      { kind: 'fieldset' },
      { kind: 'stack-action-row' },
    ],
  },
  {
    id: 'empty',
    name: 'Empty stack',
    config: () => defaults(),
    children: [],
  },
]

/* ------------------------------------------------------------------ *
 * Elements.
 * ------------------------------------------------------------------ */

const stack = $<VfStack>('#stack')
const markupOut = $<HTMLElement>('#markup')
const readoutOut = $<HTMLElement>('#readout')

const directionGroup = $<VfRadioGroup>('#direction')
const gapField = $<VfNumberField>('#gap')
const padFields: readonly VfNumberField[] = [
  $<VfNumberField>('#pad-t'),
  $<VfNumberField>('#pad-r'),
  $<VfNumberField>('#pad-b'),
  $<VfNumberField>('#pad-l'),
]
const placeSelect = $<VfSelect>('#place')
const widthOn = $<VfCheckbox>('#width-on')
const widthField = $<VfNumberField>('#width')
const heightOn = $<VfCheckbox>('#height-on')
const heightField = $<VfNumberField>('#height')

const palette = $<VfSelect>('#palette')
const addButton = $<VfButton>('#add')
const childList = $<VfList>('#children')
const upButton = $<VfButton>('#up')
const downButton = $<VfButton>('#down')
const removeButton = $<VfButton>('#remove')
const clearButton = $<VfButton>('#clear')
const fillWidthBox = $<VfCheckbox>('#fill-width')
const fillHeightBox = $<VfCheckbox>('#fill-height')

const presetSelect = $<VfSelect>('#preset')
const presetButton = $<VfButton>('#apply-preset')

/* ------------------------------------------------------------------ *
 * Children.
 * ------------------------------------------------------------------ */

function elementFrom(markup: string): HTMLElement {
  const template = document.createElement('template')
  template.innerHTML = markup.trim()
  const el = template.content.firstElementChild
  if (!(el instanceof HTMLElement)) {
    throw new Error(`vf-stack-test: palette markup has no element root`)
  }
  return el
}

function addChild(kindId: string, fillWidth = false, fillHeight = false): void {
  const kind = KIND_BY_ID.get(kindId)
  if (!kind) return
  const el = elementFrom(kind.markup)
  if (fillWidth) el.setAttribute('fill-width', '')
  if (fillHeight) el.setAttribute('fill-height', '')
  const entry: ChildEntry = {
    id: `child-${nextId++}`,
    kind,
    el,
    fillWidth,
    fillHeight,
  }
  entries.push(entry)
  selectedId = entry.id
}

function selected(): ChildEntry | undefined {
  return entries.find((entry) => entry.id === selectedId)
}

/** Anything in the kit that takes `disabled` — see {@link setDisabled}. */
type Disableable = HTMLElement & {
  disabled: boolean
  requestUpdate(): void
  updateComplete: Promise<boolean>
}

/**
 * Enable or disable a control — with a workaround, not a pattern.
 *
 * Re-enabling a `VfFormControl` does not repaint on its own. `disabled` is
 * reflected, and for a form-associated element the UA calls
 * `formDisabledCallback` for the element's OWN attribute, synchronously, from
 * inside Lit's reflection step: `LitElement.update()` has already called
 * `render()` with the stale `isDisabled`, and `__markUpdated()` wipes the
 * changed-property map immediately after — so the `formDisabled = false` write
 * that callback makes is recorded and then dropped. The control keeps its
 * disabled rendering, and a `vf-button`'s inner `<button disabled>` keeps it
 * for real. Disabling looks fine because that render was already correct.
 *
 * The extra `requestUpdate()` after the commit is what repaints. Delete this
 * helper (and call `.disabled` directly) once the base class handles it.
 */
function setDisabled(el: Disableable, disabled: boolean): void {
  if (el.disabled === disabled) return
  el.disabled = disabled
  if (!disabled) void el.updateComplete.then(() => el.requestUpdate())
}

/**
 * Put the stack's DOM in the state's order — and only when it differs, so a
 * gap change doesn't move (and re-connect) every child.
 */
function syncStackChildren(): void {
  const want = entries.map((entry) => entry.el)
  const have = [...stack.children]
  const same =
    want.length === have.length && want.every((el, i) => have[i] === el)
  if (!same) stack.replaceChildren(...want)
}

function renderChildList(): void {
  childList.replaceChildren(
    ...entries.map((entry, i) => {
      const item = document.createElement('vf-list-item')
      item.value = entry.id
      const fills = [
        entry.fillWidth ? 'fill-width' : '',
        entry.fillHeight ? 'fill-height' : '',
      ].filter(Boolean)
      item.textContent =
        `${i + 1}. ${entry.kind.name}` +
        (fills.length > 0 ? ` · ${fills.join(' ')}` : '')
      return item
    })
  )

  if (!selected()) selectedId = entries[entries.length - 1]?.id ?? ''
  childList.value = selectedId

  const current = selected()
  fillWidthBox.checked = current?.fillWidth ?? false
  fillHeightBox.checked = current?.fillHeight ?? false
  for (const control of [
    upButton,
    downButton,
    removeButton,
    fillWidthBox,
    fillHeightBox,
  ]) {
    setDisabled(control, current === undefined)
  }
  setDisabled(clearButton, entries.length === 0)
}

function move(delta: -1 | 1): void {
  const i = entries.findIndex((entry) => entry.id === selectedId)
  const j = i + delta
  const a = entries[i]
  const b = entries[j]
  if (!a || !b) return
  entries[i] = b
  entries[j] = a
  sync()
  // A pure reorder resizes nothing, and nothing in the platform reports a
  // position-only change — the one case the README says to ask for by hand.
  requestGridSnap()
}

function removeSelected(): void {
  const i = entries.findIndex((entry) => entry.id === selectedId)
  if (i < 0) return
  entries.splice(i, 1)
  selectedId = entries[Math.min(i, entries.length - 1)]?.id ?? ''
  sync()
}

/* ------------------------------------------------------------------ *
 * Config → the live stack, and → the printed markup.
 * ------------------------------------------------------------------ */

/** The shortest CSS shorthand equivalent to the four pad values. */
function padShorthand(): string {
  const [top, right, bottom, left] = config.pad
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return ''
  if (top === bottom && right === left) {
    return top === right ? `${top}` : `${top} ${right}`
  }
  if (right === left) return `${top} ${right} ${bottom}`
  return `${top} ${right} ${bottom} ${left}`
}

function applyConfig(): void {
  stack.direction = config.direction
  stack.gap = config.gap
  stack.pad = padShorthand() || undefined
  stack.place = config.place ?? undefined
  stack.width = config.width ?? undefined
  stack.height = config.height ?? undefined
}

function indent(source: string, by: number): string {
  const pad = ' '.repeat(by)
  return source
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n')
}

/**
 * The markup an author would type for the current configuration — generated
 * from the config rather than read back off the element, so a parameter left
 * at its default doesn't show up as an attribute nobody would write.
 */
function markupText(): string {
  const attrs: string[] = []
  if (config.direction !== 'column') attrs.push(`direction="${config.direction}"`)
  if (config.gap !== 0) attrs.push(`gap="${config.gap}"`)
  const pad = padShorthand()
  if (pad !== '') attrs.push(`pad="${pad}"`)
  if (config.place !== null) attrs.push(`place="${config.place}"`)
  if (config.width !== null) attrs.push(`width="${config.width}"`)
  if (config.height !== null) attrs.push(`height="${config.height}"`)

  const open = `<vf-stack${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`
  if (entries.length === 0) return `${open}</vf-stack>`

  const body = entries
    .map((entry) => {
      const fills = [
        entry.fillWidth ? ' fill-width' : '',
        entry.fillHeight ? ' fill-height' : '',
      ].join('')
      return indent(
        fills === ''
          ? entry.kind.markup
          : entry.kind.markup.replace(/^<([a-z-]+)/, `<$1${fills}`),
        2
      )
    })
    .join('\n')
  return `${open}\n${body}\n</vf-stack>`
}

/* ------------------------------------------------------------------ *
 * The measurement.
 *
 * The stack's whole claim is that a gap declared in system px renders as a
 * whole count of device px at any density, so the bench checks it rather than
 * asserting it.
 * ------------------------------------------------------------------ */

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** One resolved edge metric of a child, in CSS px. */
function edge(el: Element, property: string): number {
  return parseFloat(getComputedStyle(el).getPropertyValue(property)) || 0
}

function readoutText(): string {
  const scale = effectiveScale(stack)
  // trueDpr: device px per CSS px including browser zoom (identical to
  // devicePixelRatio at 100% zoom in every engine).
  const dpr = truePixelRatio()
  const perSystemPx = scale * dpr
  const box = stack.getBoundingClientRect()

  // The size half of rule 3 — the half snapping deliberately doesn't cover,
  // because no amount of moving a box fixes a box that MEASURES fractionally.
  // Undeclared, the stack inherits whatever width its container has; that is
  // what `width`/`height` are for.
  const wide = box.width * dpr
  const tall = box.height * dpr
  const whole = (n: number): boolean => Math.abs(n - Math.round(n)) < 0.01

  const lines = [
    `--vf-scale ${round(scale)} · trueDpr ${round(dpr)} · zoom ${Math.round(getZoom() * 100)}% · 1 system px = ` +
      `${round(perSystemPx)} device px ` +
      (Math.abs(perSystemPx - Math.round(perSystemPx)) < 1e-6
        ? '✓'
        : '✗ keep --vf-scale × trueDpr whole (rule 1)'),
    `stack box ${round(box.width)} × ${round(box.height)} CSS px = ` +
      `${round(wide)} × ${round(tall)} device px ` +
      (whole(wide) && whole(tall)
        ? '✓'
        : '✗ fractional — declare width/height (rule 3, the half snapping cannot fix)'),
  ]

  // The geometry rule, measured rather than asserted: a column is as wide as
  // its widest child and a row as tall as its tallest — unless that axis was
  // declared, which is the author overriding the content on purpose.
  const column = config.direction !== 'row'
  const declared = column ? config.width : config.height
  const firstEntry = entries[0]
  if (firstEntry) {
    // Margin box, not border box: what a column is as wide as is the widest
    // child INCLUDING its own margins, and one of the kit's controls has them —
    // `variant="default"` reserves its ring that way, which is why an OK button
    // measures 7 system px wider than it draws.
    const extent = (el: Element): number => {
      const rect = el.getBoundingClientRect()
      return column
        ? rect.width + edge(el, 'margin-left') + edge(el, 'margin-right')
        : rect.height + edge(el, 'margin-top') + edge(el, 'margin-bottom')
    }
    const biggest = Math.max(...entries.map((entry) => extent(entry.el)))
    const inner = column
      ? box.width - edge(stack, 'padding-left') - edge(stack, 'padding-right')
      : box.height - edge(stack, 'padding-top') - edge(stack, 'padding-bottom')
    const rule = column ? 'widest child' : 'tallest child'
    lines.push(
      declared === null
        ? `content box ${round(inner)} CSS px = the ${rule}'s margin box ` +
            `(${round(biggest)}) ` +
            (Math.abs(inner - biggest) < 0.5 ? '✓' : '✗')
        : `content box ${round(inner)} CSS px — declared, not content; the ` +
            `${rule}'s margin box measures ${round(biggest)}`
    )
  }

  const first = entries[0]?.el
  const second = entries[1]?.el
  if (!first || !second) {
    lines.push('gap — add a second child to measure it')
  } else {
    const a = first.getBoundingClientRect()
    const b = second.getBoundingClientRect()
    const between =
      config.direction === 'row' ? b.left - a.right : b.top - a.bottom
    // A flex container doesn't collapse margins, so what sits between two
    // border boxes is the gap PLUS whatever margin the children carry — and
    // one of them does: `variant="default"` reserves 4 system px for its ring
    // that way, which is the whole reason vf-button-group exists.
    const margins =
      edge(first, config.direction === 'row' ? 'margin-right' : 'margin-bottom') +
      edge(second, config.direction === 'row' ? 'margin-left' : 'margin-top')
    const device = (between - margins) * dpr
    const expected = config.gap * perSystemPx
    lines.push(
      `gap ${config.gap} system px → ${round(device)} device px between the ` +
        `first two children ` +
        (Math.abs(device - expected) < 0.01
          ? `✓ (expected ${round(expected)})`
          : `✗ (expected ${round(expected)})`) +
        (margins > 0
          ? `, past ${round(margins * dpr)} device px of the children's own margin`
          : '')
    )
  }

  return lines.join('\n')
}

let readoutPending = false
function scheduleReadout(): void {
  if (readoutPending) return
  readoutPending = true
  requestAnimationFrame(() => {
    readoutPending = false
    readoutOut.textContent = readoutText()
  })
}

/* ------------------------------------------------------------------ *
 * The one function every control calls.
 * ------------------------------------------------------------------ */

function sync(): void {
  applyConfig()
  syncStackChildren()
  renderChildList()
  markupOut.textContent = markupText()
  scheduleReadout()
}

/** Push the config back out to the controls — presets and Load need it. */
function syncControls(): void {
  directionGroup.value = config.direction
  gapField.value = String(config.gap)
  padFields.forEach((field, i) => {
    field.value = String(config.pad[i] ?? 0)
  })
  placeSelect.value = config.place ?? 'default'

  widthOn.checked = config.width !== null
  setDisabled(widthField, config.width === null)
  if (config.width !== null) widthField.value = String(config.width)

  heightOn.checked = config.height !== null
  setDisabled(heightField, config.height === null)
  if (config.height !== null) heightField.value = String(config.height)
}

/* ------------------------------------------------------------------ *
 * Wiring.
 * ------------------------------------------------------------------ */

/** The kit's value events: `vf-input` while dragging/typing, `vf-change` on commit. */
function onValue(el: HTMLElement, handler: () => void): void {
  el.addEventListener('vf-input', handler)
  el.addEventListener('vf-change', handler)
}

function valueOf(event: Event): string {
  return (event as CustomEvent<{ value?: string }>).detail?.value ?? ''
}

function wholeOf(field: VfNumberField, fallback = 0): number {
  const n = Number.parseFloat(field.value)
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback
}

directionGroup.addEventListener('vf-change', (event) => {
  config.direction = valueOf(event) === 'row' ? 'row' : 'column'
  sync()
})

onValue(gapField, () => {
  config.gap = wholeOf(gapField)
  sync()
})

padFields.forEach((field, i) => {
  onValue(field, () => {
    config.pad[i] = wholeOf(field)
    sync()
  })
})

placeSelect.addEventListener('vf-change', (event) => {
  const value = valueOf(event)
  config.place = value === 'default' ? null : (value as VfStackPlace)
  sync()
})

widthOn.addEventListener('vf-change', () => {
  config.width = widthOn.checked ? wholeOf(widthField, 260) : null
  setDisabled(widthField, !widthOn.checked)
  sync()
})

onValue(widthField, () => {
  if (!widthOn.checked) return
  config.width = wholeOf(widthField, 260)
  sync()
})

heightOn.addEventListener('vf-change', () => {
  config.height = heightOn.checked ? wholeOf(heightField, 160) : null
  setDisabled(heightField, !heightOn.checked)
  sync()
})

onValue(heightField, () => {
  if (!heightOn.checked) return
  config.height = wholeOf(heightField, 160)
  sync()
})

addButton.addEventListener('click', () => {
  addChild(palette.value)
  sync()
})

childList.addEventListener('vf-change', (event) => {
  selectedId = valueOf(event)
  renderChildList()
})

upButton.addEventListener('click', () => move(-1))
downButton.addEventListener('click', () => move(1))
removeButton.addEventListener('click', removeSelected)

clearButton.addEventListener('click', () => {
  entries = []
  selectedId = ''
  sync()
})

fillWidthBox.addEventListener('vf-change', () => {
  const entry = selected()
  if (!entry) return
  entry.fillWidth = fillWidthBox.checked
  entry.el.toggleAttribute('fill-width', entry.fillWidth)
  sync()
})

fillHeightBox.addEventListener('vf-change', () => {
  const entry = selected()
  if (!entry) return
  entry.fillHeight = fillHeightBox.checked
  entry.el.toggleAttribute('fill-height', entry.fillHeight)
  sync()
})

presetButton.addEventListener('click', () => {
  const preset = PRESETS.find((p) => p.id === presetSelect.value)
  if (!preset) return
  loadPreset(preset)
})

function loadPreset(preset: Preset): void {
  config = preset.config()
  entries = []
  selectedId = ''
  nextId = 0
  for (const child of preset.children) {
    addChild(child.kind, child.fillWidth === true, child.fillHeight === true)
  }
  selectedId = entries[0]?.id ?? ''
  syncControls()
  sync()
}

// A resize changes neither the config nor the children, but it does move the
// stack — re-measure so the readout never goes stale.
window.addEventListener('resize', scheduleReadout)

/* ------------------------------------------------------------------ *
 * Start.
 * ------------------------------------------------------------------ */

function fillSelect(
  select: VfSelect,
  items: readonly { id: string; name: string }[]
): void {
  select.replaceChildren(
    ...items.map(({ id, name }) => {
      const option = document.createElement('vf-option')
      option.value = id
      option.textContent = name
      return option
    })
  )
  select.value = items[0]?.id ?? ''
}

fillSelect(palette, CHILD_KINDS)
fillSelect(presetSelect, PRESETS)

// Snapping is a page-level opt-in the components can't make for themselves, so
// the bench makes it the way a consumer's page would — once, unconditionally.
// ?nosnap is the escape, for looking at the page without it.
if (!new URLSearchParams(location.search).has('nosnap')) applyGridSnap()

const opening = PRESETS[0]
if (opening) loadPreset(opening)

// The bitmap faces land after the first paint, and every measurement above is
// a text-sized box — re-measure once they are in.
void document.fonts.ready.then(scheduleReadout)
