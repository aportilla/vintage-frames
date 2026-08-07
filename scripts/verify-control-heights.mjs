/**
 * Verifies the three control-height tokens against the 1x reference sheets.
 *
 * `--vf-control-height: 22px` once drove buttons, popups AND fields, but the
 * sheets disagree with each other about what that height is. Black-ink bounding
 * boxes, measured off the 1x button and controls reference sheets (which
 * agree with each other) with the stdlib PNG reader now in scripts/bitmap.py:
 *
 *   button face      80 × 20   (no shadow; the default ring's inner box, and the
 *                               ring traces in pixel-frame.ts assume it)
 *   small button     80 × 16
 *   text field      170 × 22, 215 × 22   (no shadow — 22 IS the border box)
 *   popup pill      157 × 19  → border box 156 × 18 plus its 1px hard shadow
 *                               (`ui-sprites/Pop-up menu REFERENCE.png` shows
 *                               the shadow row/column outside the border)
 *   little arrows    15 × 25
 *
 * So the token split: --vf-control-height stays the *field* height, with
 * --vf-button-height (20) and --vf-popup-height (18) alongside it, and the
 * vf-option row derived as the pill's content height (--vf-popup-height - 2px).
 *
 * Also covers the original vf-number-field regression this file was written for:
 * the host used to be `align-items: stretch` with the 15×25 stepper as the only
 * fixed-height child, so the <input> stretched to 25px and ignored the token.
 * And its width sibling: the well's automatic flex minimum was the input's
 * definite 4em width, so a host narrowed to 4em or less pushed the stepper past
 * its own border box, under whatever sat beside it.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:control-heights
 */
import { ORIGIN, check, launch, report } from './harness.mjs'

/** Native sprite size from `ui-sprites/Little arrows.png`. */
const STEPPER_H = 25
/** --vf-control-height: the text-field height. */
const CONTROL_H = 22
/** --vf-button-height: the button face. */
const BUTTON_H = 20
/** --vf-popup-height: the vf-select pill's border box. */
const POPUP_H = 18
/** --vf-control-height-small: the compact button. */
const SMALL_H = 16
/** Derived: the option row = the pill's content height. */
const OPTION_H = POPUP_H - 2
/** How far the default ring outsets the button box (RING_INSET, pixel-frame.ts). */
const RING_INSET = 4

const OPTIONS = `
  <vf-option value="a">Alpha</vf-option>
  <vf-option value="b">Bravo</vf-option>
  <vf-option value="c">Charlie</vf-option>
`

const MARKUP = `
  <vf-text-field id="text" value="abc"></vf-text-field>
  <vf-number-field id="num" value="5"></vf-number-field>
  <vf-number-field id="themed" value="5" style="--vf-control-height: 30px"></vf-number-field>
  <!-- 64 system px = exactly the input's 4em: the width that used to push the
       stepper out of the host box (the showcase's Page Setup row). -->
  <vf-number-field id="narrow" value="100" style="width: calc(var(--vf-scale, 1) * 64px)"></vf-number-field>

  <vf-button id="btn">OK</vf-button>
  <vf-button id="def" variant="default">Install</vf-button>
  <vf-button id="small" size="small">Small</vf-button>

  <div id="scope" style="--vf-button-height: 30px">
    <vf-button id="btn-themed">Themed</vf-button>
    <vf-text-field id="text-in-scope" value="abc"></vf-text-field>
  </div>

  <div style="height: 160px"></div>
  <vf-select id="pop" value="b">${OPTIONS}</vf-select>
  <vf-select id="pop-themed" value="c" style="--vf-popup-height: 26px">${OPTIONS}</vf-select>

  <div style="height: 40px"></div>
  <vf-menu id="menu" label="File" open>
    <vf-menu-item id="mi" checked>Alpha</vf-menu-item>
    <vf-menu-item id="mi2">Bravo</vf-menu-item>
  </vf-menu>

  <div id="gscope" style="--vf-select-gutter: 30px">
    <vf-select id="pop-gutter" value="a">${OPTIONS}</vf-select>
    <vf-menu id="menu-gutter" label="Edit" open>
      <vf-menu-item id="mi-gutter" checked>Alpha</vf-menu-item>
    </vf-menu>
  </div>

  <!-- Last, and closed: an open panel is absolutely positioned at z-index 1000,
       so a menu left open here would cover the controls the blocks above click. -->
  <div id="mscope" style="--vf-menu-row-height: 24px">
    <vf-menu id="menu-themed" label="View">
      <vf-menu-item id="mi-themed" checked>Alpha</vf-menu-item>
      <vf-menu-item id="mi-themed2">Bravo</vf-menu-item>
    </vf-menu>
  </div>

  <div id="pscope" style="--vf-popup-height: 26px">
    <vf-menu id="menu-in-popup-scope" label="Special">
      <vf-menu-item id="mi-ps">Alpha</vf-menu-item>
      <vf-menu-item id="mi-ps2">Bravo</vf-menu-item>
    </vf-menu>
  </div>
`

const browser = await launch()
const page = await browser.newPage()

await page.route(ORIGIN, (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
)
await page.goto(ORIGIN)
await page.unroute(ORIGIN)
await page.setContent(MARKUP)
await page.evaluate(() => import('/src/index.js'))
await page.evaluate(() =>
  Promise.all(
    ['vf-number-field', 'vf-button', 'vf-select', 'vf-option', 'vf-menu', 'vf-menu-item'].map(
      (t) => customElements.whenDefined(t)
    )
  )
)
await page.evaluate(() =>
  Promise.all(
    [
      ...document.querySelectorAll(
        'vf-text-field, vf-number-field, vf-button, vf-select, vf-option, vf-menu, vf-menu-item'
      ),
    ].map((e) => e.updateComplete)
  )
)

/** Rendered geometry of one field, in CSS px, plus the page's effective scale. */
const geom = (id) =>
  page.evaluate((elId) => {
    const host = document.getElementById(elId)
    const inner = host.shadowRoot.querySelector('input')
    const stepper = host.shadowRoot.querySelector('.stepper')
    const hostRect = host.getBoundingClientRect()
    const innerRect = inner.getBoundingClientRect()
    return {
      scale: parseFloat(getComputedStyle(host).getPropertyValue('--vf-scale')),
      dpr: window.devicePixelRatio,
      host: hostRect.height,
      well: innerRect.height,
      stepper: stepper ? stepper.getBoundingClientRect().height : null,
      // Where the well sits inside the host box — the biased remainder.
      offsetTop: innerRect.top - hostRect.top,
    }
  }, id)

const text = await geom('text')
const num = await geom('num')
const themed = await geom('themed')
const s = num.scale

check('page is at the default 3-device-px-per-system-px scale', s === 3 / num.dpr, `scale=${s}`)

// ── vf-number-field: the well follows the token, not the sprite ──
check(
  'the number-field well matches the token, not the sprite',
  num.well === CONTROL_H * s,
  `well=${num.well} expected=${CONTROL_H * s} (sprite would be ${STEPPER_H * s})`
)
check(
  'the number-field well is exactly as tall as a vf-text-field well',
  num.well === text.well,
  `number=${num.well} text=${text.well}`
)
check(
  'the stepper still renders at its native 15×25',
  num.stepper === STEPPER_H * s,
  `stepper=${num.stepper} expected=${STEPPER_H * s}`
)
check(
  'the taller sprite sets the host height',
  num.host === STEPPER_H * s,
  `host=${num.host} expected=${STEPPER_H * s}`
)

// ── The odd remainder must not put the well on a half pixel ──
const offsetDevicePx = num.offsetTop * num.dpr
check(
  'the well is biased one whole pixel, not centered on a half pixel',
  offsetDevicePx === Math.round(offsetDevicePx) && num.offsetTop === s,
  `offsetTop=${num.offsetTop}css / ${offsetDevicePx}device (centering would be ${(1.5 * s).toFixed(1)}css)`
)
check(
  'both well edges land on whole device pixels',
  Number.isInteger((num.offsetTop + num.well) * num.dpr),
  `bottom=${(num.offsetTop + num.well) * num.dpr}device`
)
check(
  'retheming --vf-control-height resizes the well',
  themed.well === 30 * s,
  `well=${themed.well} expected=${30 * s}`
)
check(
  'retheming the well does not rescale the sprite',
  themed.stepper === STEPPER_H * s,
  `stepper=${themed.stepper} expected=${STEPPER_H * s}`
)
check(
  'a well taller than the sprite drives the host height itself',
  themed.host === 30 * s + s,
  `host=${themed.host} expected=${30 * s + s}`
)

// ── A narrowed host keeps the stepper inside its own border box ──
// The well's automatic flex minimum was the input's definite 4em width, so a
// host width at or under 4em overflowed gap + stepper to the right, under the
// next thing in the row. The well must give up the 3 + 15 the stepper needs.
const narrow = await page.evaluate(() => {
  const host = document.getElementById('narrow')
  const hostRect = host.getBoundingClientRect()
  const wellRect = host.shadowRoot.querySelector('.vf-field-well').getBoundingClientRect()
  const stepperRect = host.shadowRoot.querySelector('.stepper').getBoundingClientRect()
  return {
    host: hostRect.width,
    hostRight: hostRect.right,
    well: wellRect.width,
    stepperRight: stepperRect.right,
  }
})
check(
  'a 64px host is honored',
  narrow.host === 64 * s,
  `host=${narrow.host} expected=${64 * s}`
)
check(
  'the stepper stays inside the narrowed host',
  narrow.stepperRight <= narrow.hostRight + 0.5,
  `stepperRight=${narrow.stepperRight} hostRight=${narrow.hostRight}`
)
check(
  'the well gives up exactly the gap + sprite width (still whole system px)',
  narrow.well === (64 - 3 - 15) * s,
  `well=${narrow.well} expected=${(64 - 3 - 15) * s}`
)

// ── vf-button: the face is 20, not the fields' 22 ──
const face = (id) =>
  page.evaluate((elId) => {
    const host = document.getElementById(elId)
    const btn = host.shadowRoot.querySelector('button')
    const ring = getComputedStyle(host, '::before')
    return {
      host: host.getBoundingClientRect().height,
      face: btn.getBoundingClientRect().height,
      // The default ring is drawn by ::before at inset:-RING_INSET.
      ringTop: ring.content === 'none' ? null : parseFloat(ring.top),
    }
  }, id)

const btn = await face('btn')
const def = await face('def')
const small = await face('small')

check(
  'the button face is --vf-button-height (20), not the 22px field height',
  btn.face === BUTTON_H * s,
  `face=${btn.face} expected=${BUTTON_H * s} (the old shared token would be ${CONTROL_H * s})`
)
check(
  'the button is genuinely shorter than a text field — the split is real',
  btn.face === text.well - 2 * s,
  `button=${btn.face} field=${text.well}`
)
check(
  'the default button uses the same 20px face',
  def.face === BUTTON_H * s,
  `face=${def.face} expected=${BUTTON_H * s}`
)
check(
  'the default ring outsets that face by RING_INSET, giving the reference 28',
  def.ringTop === -RING_INSET * s && def.host + 2 * RING_INSET * s === 28 * s,
  `ringTop=${def.ringTop} ringBox=${def.host + 2 * RING_INSET * s} expected=${28 * s}`
)
check(
  'the small button is untouched at 16',
  small.face === SMALL_H * s,
  `face=${small.face} expected=${SMALL_H * s}`
)
check(
  'the button face lands on whole device pixels',
  Number.isInteger(btn.face * num.dpr),
  `face=${btn.face * num.dpr}device`
)

// ── The tokens are independent: retheming buttons must not move fields ──
const btnThemed = await face('btn-themed')
const textInScope = await geom('text-in-scope')
check(
  'retheming --vf-button-height resizes the button',
  btnThemed.face === 30 * s,
  `face=${btnThemed.face} expected=${30 * s}`
)
check(
  'retheming --vf-button-height leaves a text field in the same scope alone',
  textInScope.well === CONTROL_H * s,
  `well=${textInScope.well} expected=${CONTROL_H * s}`
)

// ── vf-select: the pill is 18, its rows the 16px content height ──
// The rows must be measured with the panel OPEN: a closed `.panel` is
// display:none, so its slotted options have zero-size rects.
const openSelect = async (id) => {
  const box = await page.evaluate((elId) => {
    const r = document
      .getElementById(elId)
      .shadowRoot.querySelector('.control')
      .getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top }
  }, id)
  await page.mouse.move(box.x, box.y)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForFunction(
    (elId) => {
      const panel = document.getElementById(elId).shadowRoot.querySelector('.panel')
      return getComputedStyle(panel).display !== 'none'
    },
    id,
    { timeout: 2000 }
  )
  return box
}

const popup = (id) =>
  page.evaluate((elId) => {
    const host = document.getElementById(elId)
    const control = host.shadowRoot.querySelector('.control')
    const option = host.querySelector('vf-option')
    const panel = host.shadowRoot.querySelector('.panel')
    return {
      pill: control.getBoundingClientRect().height,
      row: option.getBoundingClientRect().height,
      // A popup this short must never scroll. The row height and the inherited
      // line-height are set independently, so a row shorter than its own line
      // box spills — invisibly per row, but the LAST row's spill overflows the
      // panel and skins a scrollbar onto every popup in the kit.
      panelOverflow: panel.scrollHeight - panel.clientHeight,
      rowOverflow: option.scrollHeight - Math.round(option.getBoundingClientRect().height),
    }
  }, id)

/** Where the selected row landed relative to its panel, with the list open. */
const overlayOf = (id, value) =>
  page.evaluate(
    ({ elId, val }) => {
      const host = document.getElementById(elId)
      const selected = host.querySelector(`vf-option[value="${val}"]`)
      return {
        index: [...host.querySelectorAll('vf-option')].indexOf(selected),
        rowTop: selected.getBoundingClientRect().top,
        panelTop: host.shadowRoot.querySelector('.panel').getBoundingClientRect().top,
      }
    },
    { elId: id, val: value }
  )

const pillBox = await openSelect('pop')
const pop = await popup('pop')
const overlay = await overlayOf('pop', 'b')
await page.keyboard.press('Escape')
const themedBox = await openSelect('pop-themed')
const popThemed = await popup('pop-themed')
const themedOverlay = await overlayOf('pop-themed', 'c')
await page.keyboard.press('Escape')

check(
  'the popup pill is --vf-popup-height (18), not the 22px field height',
  pop.pill === POPUP_H * s,
  `pill=${pop.pill} expected=${POPUP_H * s} (the old shared token would be ${CONTROL_H * s})`
)
check(
  'the option row is the pill CONTENT height (18 - 2 borders = 16)',
  pop.row === OPTION_H * s,
  `row=${pop.row} expected=${OPTION_H * s}`
)
check(
  'the option row is derived from the pill, not a stale literal',
  pop.row === pop.pill - 2 * s,
  `row=${pop.row} pill=${pop.pill}`
)
check(
  'both popup metrics land on whole device pixels',
  Number.isInteger(pop.pill * num.dpr) && Number.isInteger(pop.row * num.dpr),
  `pill=${pop.pill * num.dpr}device row=${pop.row * num.dpr}device`
)
check(
  'retheming --vf-popup-height resizes the pill',
  popThemed.pill === 26 * s,
  `pill=${popThemed.pill} expected=${26 * s}`
)
check(
  'retheming --vf-popup-height carries the rows with it (derived, not hardcoded)',
  popThemed.row === 24 * s,
  `row=${popThemed.row} expected=${24 * s}`
)
// Regression guard: the control-height split took the option row 20 → 16 but
// left the inherited 1.25 line-height at 20px, so every row's text spilled and
// the last row's spill scrolled the panel — a System 7 scrollbar on a 4-item
// popup. The row's line-height is now derived from the same expression as its
// height, so this must hold for a re-themed pill too.
check(
  'a short popup does not scroll (row line box fits the row box)',
  pop.panelOverflow === 0 && pop.rowOverflow === 0,
  `panelOverflow=${pop.panelOverflow} rowOverflow=${pop.rowOverflow}`
)
check(
  'a re-themed popup still does not scroll',
  popThemed.panelOverflow === 0 && popThemed.rowOverflow === 0,
  `panelOverflow=${popThemed.panelOverflow} rowOverflow=${popThemed.rowOverflow}`
)

// ── The overlay invariant the row height exists to serve ──
// The panel lays the SELECTED row's white cell directly over the pill's white
// content, so the selected row's top must land on the pill's content top —
// pill.top + 1px border — whatever the selected index is. That only holds if
// positionPanel offsets by the row's true rendered height.
check(
  'the panel opens with a non-zero selected index (the case that can drift)',
  overlay.index > 0 && themedOverlay.index > 0,
  `default=${overlay.index} themed=${themedOverlay.index}`
)
check(
  'the selected row lays exactly on the pill content top',
  Math.abs(overlay.rowTop - (pillBox.top + s)) < 0.5,
  `row=${overlay.rowTop} pillContent=${pillBox.top + s} panel=${overlay.panelTop}`
)
// The payoff of positionPanel reading the row's RENDERED height: with the old
// hardcoded ITEM_HEIGHT this drifts by index × (themed row − constant).
check(
  'a re-themed popup still lays its selected row on the pill content top',
  Math.abs(themedOverlay.rowTop - (themedBox.top + s)) < 0.5,
  `row=${themedOverlay.rowTop} pillContent=${themedBox.top + s} ` +
    `(a constant row height would miss by ${themedOverlay.index * (24 - OPTION_H) * s})`
)

// ── Horizontal sibling: the checkmark gutter ──
// The vertical half above asserts the selected row lands on the pill's content
// TOP. This is the same invariant on the other axis: the label must not shift
// horizontally when the list opens either. Measured off the reference art
// (three pill instances + four menu panels): an open menu's label ink sits 17px
// from the panel's border box and its ✓ ink at +4..12. One shared gutter of 16
// (+1px border) reproduces both.
const GUTTER = 16
/** ✓ ink inset from the row's own left edge, per Menus.png. */
const CHECK_INSET = 3

/** Content-box left edges of a select's closed label and its open rows. */
const gutterOf = (id) =>
  page.evaluate((elId) => {
    const host = document.getElementById(elId)
    const control = host.shadowRoot.querySelector('.control')
    const label = host.shadowRoot.querySelector('.label')
    const option = host.querySelector('vf-option')
    const cs = getComputedStyle(option)
    const panel = host.shadowRoot.querySelector('.panel')
    return {
      controlLeft: control.getBoundingClientRect().left,
      labelLeft: label.getBoundingClientRect().left,
      optionLeft: option.getBoundingClientRect().left,
      optionPad: parseFloat(cs.paddingLeft),
      borderLeft: parseFloat(getComputedStyle(control).borderLeftWidth),
      panelLeft: panel.getBoundingClientRect().left,
      panelBorder: parseFloat(getComputedStyle(panel).borderLeftWidth),
      panelPad: parseFloat(getComputedStyle(panel).paddingLeft),
    }
  }, id)

// A standalone open vf-menu closes itself on any outside pointerdown (and on
// Escape), so it must be re-opened right before measuring — opening a select
// in this same suite is exactly such a pointerdown.
const reopenMenu = (id) =>
  page.evaluate(async (elId) => {
    const menu = document.getElementById(elId)
    menu.open = true
    await menu.updateComplete
  }, id)

const menuOf = (id, itemId) =>
  page.evaluate(
    ({ elId, iId }) => {
      const panel = document.getElementById(elId).shadowRoot.querySelector('.panel')
      const item = document.getElementById(iId)
      const row = item.shadowRoot.querySelector('.item')
      const label = item.shadowRoot.querySelector('.label')
      const check = item.shadowRoot.querySelector('.check')
      return {
        panelLeft: panel.getBoundingClientRect().left,
        panelBorder: parseFloat(getComputedStyle(panel).borderLeftWidth),
        rowLeft: row.getBoundingClientRect().left,
        labelLeft: label.getBoundingClientRect().left,
        checkLeft: check ? check.getBoundingClientRect().left : null,
      }
    },
    { elId: id, iId: itemId }
  )

// The rows only have real rects with the panel open, so re-open it: the
// vertical section above closed both popups with Escape.
await openSelect('pop')
const gut = await gutterOf('pop')
await reopenMenu('menu')
const menu = await menuOf('menu', 'mi')

check(
  'the closed pill insets its label by the gutter (16), not the old 22',
  Math.abs(gut.labelLeft - (gut.controlLeft + gut.borderLeft + GUTTER * s)) < 0.5,
  `label=${gut.labelLeft} expected=${gut.controlLeft + gut.borderLeft + GUTTER * s} ` +
    `(the old 22 would be ${gut.controlLeft + gut.borderLeft + 22 * s})`
)
check(
  'the open option row uses the same gutter as the closed pill',
  Math.abs(gut.optionPad - GUTTER * s) < 0.5,
  `optionPad=${gut.optionPad} expected=${GUTTER * s}`
)
// THE invariant the shared gutter exists for, on the horizontal axis.
check(
  'the selected label sits at the same x closed and open',
  Math.abs(gut.labelLeft - (gut.optionLeft + gut.optionPad)) < 0.5,
  `closed=${gut.labelLeft} open=${gut.optionLeft + gut.optionPad} ` +
    `[control=${gut.controlLeft} panel=${gut.panelLeft} ` +
    `panelBorder=${gut.panelBorder} panelPad=${gut.panelPad} option=${gut.optionLeft}]`
)
check(
  'a menu row uses the same gutter as the popup (shared token, not a literal 22)',
  Math.abs(menu.labelLeft - (menu.rowLeft + GUTTER * s)) < 0.5,
  `label=${menu.labelLeft} expected=${menu.rowLeft + GUTTER * s} ` +
    `(the old hardcoded 22 would be ${menu.rowLeft + 22 * s})`
)
check(
  'the menu ✓ sits 3px inside the row, matching Menus.png (+4 from the border)',
  menu.checkLeft !== null &&
    Math.abs(menu.checkLeft - (menu.rowLeft + CHECK_INSET * s)) < 0.5,
  `check=${menu.checkLeft} expected=${menu.rowLeft + CHECK_INSET * s}`
)
check(
  'the ✓ inset lands on whole device pixels (centring it would be a half px)',
  Number.isInteger(CHECK_INSET * s * num.dpr),
  `${CHECK_INSET * s * num.dpr}device (centring 9 in ${GUTTER} would be ${
    ((GUTTER - 9) / 2) * s * num.dpr
  })`
)
check(
  'the gutter lands on whole device pixels',
  Number.isInteger(GUTTER * s * num.dpr),
  `${GUTTER * s * num.dpr}device`
)

// Re-theming must carry the pill, its rows AND the menu rows together — the
// whole point of the three sharing one token rather than three literals.
await page.keyboard.press('Escape')
await openSelect('pop-gutter')
const gutThemed = await gutterOf('pop-gutter')
await reopenMenu('menu-gutter')
const menuThemed = await menuOf('menu-gutter', 'mi-gutter')

check(
  'retheming --vf-select-gutter moves the closed pill label',
  Math.abs(gutThemed.labelLeft - (gutThemed.controlLeft + gutThemed.borderLeft + 30 * s)) < 0.5,
  `label=${gutThemed.labelLeft} expected=${gutThemed.controlLeft + gutThemed.borderLeft + 30 * s}`
)
check(
  'retheming --vf-select-gutter carries the option rows with it',
  Math.abs(gutThemed.optionPad - 30 * s) < 0.5,
  `optionPad=${gutThemed.optionPad} expected=${30 * s}`
)
check(
  'retheming --vf-select-gutter carries the MENU rows with it',
  Math.abs(menuThemed.labelLeft - (menuThemed.rowLeft + 30 * s)) < 0.5,
  `label=${menuThemed.labelLeft} expected=${menuThemed.rowLeft + 30 * s}`
)
check(
  'the closed↔open invariant still holds under a re-themed gutter',
  Math.abs(gutThemed.labelLeft - (gutThemed.optionLeft + gutThemed.optionPad)) < 0.5,
  `closed=${gutThemed.labelLeft} open=${gutThemed.optionLeft + gutThemed.optionPad}`
)

// ── Vertical: the menu row pitch ──
// Menus.png puts every menu row on a 16px pitch — the New Folder / Open / Print
// pulldown's nine inter-band gaps are all multiples of 16 — and every panel in
// the sheet puts its first row's ink at +4 from the border box, i.e. the 1px
// border plus the row's own 3px ✓ bias, with no panel inset. Ours was a 22px
// row inside a 2px-padded panel.
const MENU_ROW_H = 16

const menuRowsOf = (id, itemIds) =>
  page.evaluate(
    ({ elId, ids }) => {
      const panel = document.getElementById(elId).shadowRoot.querySelector('.panel')
      const pcs = getComputedStyle(panel)
      const rowOf = (i) => document.getElementById(i).shadowRoot.querySelector('.item')
      const first = rowOf(ids[0])
      const check = document.getElementById(ids[0]).shadowRoot.querySelector('.check')
      return {
        panelTop: panel.getBoundingClientRect().top,
        panelHeight: panel.getBoundingClientRect().height,
        panelBorderTop: parseFloat(pcs.borderTopWidth),
        panelBorderBottom: parseFloat(pcs.borderBottomWidth),
        panelPadTop: parseFloat(pcs.paddingTop),
        rowTops: ids.map((i) => rowOf(i).getBoundingClientRect().top),
        rowHeights: ids.map((i) => rowOf(i).getBoundingClientRect().height),
        lineHeight: parseFloat(getComputedStyle(first).lineHeight),
        checkTop: check ? check.getBoundingClientRect().top : null,
      }
    },
    { elId: id, ids: itemIds }
  )

await page.keyboard.press('Escape')
await reopenMenu('menu')
const rows = await menuRowsOf('menu', ['mi', 'mi2'])

check(
  `a menu row is ${MENU_ROW_H}px, not the old 22`,
  Math.abs(rows.rowHeights[0] - MENU_ROW_H * s) < 0.5,
  `row=${rows.rowHeights[0]} expected=${MENU_ROW_H * s} (the old 22 would be ${22 * s})`
)
check(
  `menu rows are on a ${MENU_ROW_H}px pitch`,
  Math.abs(rows.rowTops[1] - rows.rowTops[0] - MENU_ROW_H * s) < 0.5,
  `pitch=${rows.rowTops[1] - rows.rowTops[0]} expected=${MENU_ROW_H * s}`
)
// The art has the panel's border sit directly on the first row.
check(
  'the panel adds no vertical inset above the first row',
  rows.panelPadTop === 0 &&
    Math.abs(rows.rowTops[0] - (rows.panelTop + rows.panelBorderTop)) < 0.5,
  `rowTop=${rows.rowTops[0]} panelContentTop=${rows.panelTop + rows.panelBorderTop} pad=${rows.panelPadTop}`
)
// Reference ✓ ink at +4 from the border box = 1px border + 3px into the row.
check(
  'the ✓ sits 3px into the row vertically (Menus.png +4 from the border)',
  rows.checkTop !== null && Math.abs(rows.checkTop - (rows.rowTops[0] + 3 * s)) < 0.5,
  `check=${rows.checkTop} expected=${rows.rowTops[0] + 3 * s}`
)
check(
  'the 16px row less the 9px ✓ is biased 3/4, never centred on a half pixel',
  Number.isInteger(3 * s * num.dpr) && !Number.isInteger(((MENU_ROW_H - 9) / 2) * s * num.dpr),
  `bias=${3 * s * num.dpr}device, centring would be ${((MENU_ROW_H - 9) / 2) * s * num.dpr}`
)
// The vf-option regression in miniature: vfDisplay's 1.25 line-height resolves
// taller than a 16px row, and the spill overflowed the panel into a scrollbar.
// That bug PASSED the re-themed check (a 24px row clears a 20px line box), so
// this has to be asserted at the default size too.
check(
  'the line box never exceeds the row box',
  rows.lineHeight <= rows.rowHeights[0] + 0.5,
  `lineHeight=${rows.lineHeight} row=${rows.rowHeights[0]}`
)
check(
  'the panel is exactly its rows plus its borders (nothing overflows)',
  Math.abs(
    rows.panelHeight -
      (rows.panelBorderTop + rows.panelBorderBottom + 2 * MENU_ROW_H * s)
  ) < 0.5,
  `panel=${rows.panelHeight} expected=${
    rows.panelBorderTop + rows.panelBorderBottom + 2 * MENU_ROW_H * s
  }`
)
check(
  'the menu row pitch lands on whole device pixels',
  Number.isInteger(MENU_ROW_H * s * num.dpr),
  `${MENU_ROW_H * s * num.dpr}device`
)
// The art has a pulldown row and a popup row identical; the kit was internally
// inconsistent (popup 16, pulldown 22) between the token split and this pass.
check(
  'a menu row and a popup option row are the same height, as the art has them',
  MENU_ROW_H === OPTION_H,
  `menu=${MENU_ROW_H} option=${OPTION_H}`
)

await reopenMenu('menu-themed')
const rowsThemed = await menuRowsOf('menu-themed', ['mi-themed', 'mi-themed2'])
check(
  'retheming --vf-menu-row-height moves the rows',
  Math.abs(rowsThemed.rowHeights[0] - 24 * s) < 0.5 &&
    Math.abs(rowsThemed.rowTops[1] - rowsThemed.rowTops[0] - 24 * s) < 0.5,
  `row=${rowsThemed.rowHeights[0]} pitch=${rowsThemed.rowTops[1] - rowsThemed.rowTops[0]} expected=${24 * s}`
)
check(
  'a re-themed row still holds its line box',
  rowsThemed.lineHeight <= rowsThemed.rowHeights[0] + 0.5,
  `lineHeight=${rowsThemed.lineHeight} row=${rowsThemed.rowHeights[0]}`
)
// Independence is why this is its own token rather than a share of the popup's:
// re-theming the select PILL must not move pulldown rows.
await reopenMenu('menu-in-popup-scope')
const rowsPopupScope = await menuRowsOf('menu-in-popup-scope', ['mi-ps', 'mi-ps2'])
check(
  'retheming --vf-popup-height does NOT move menu rows',
  Math.abs(rowsPopupScope.rowHeights[0] - MENU_ROW_H * s) < 0.5,
  `row=${rowsPopupScope.rowHeights[0]} expected=${MENU_ROW_H * s} ` +
    `(deriving from the pill would give ${(26 - 2) * s})`
)

await report(browser)
