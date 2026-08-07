/**
 * Verifies the kit's dashed keyboard-focus rule (`vfFocusUnderline`,
 * src/styles/base.ts), which replaces the browser's ring on the ten controls
 * that can carry the mark themselves. Two placements, one recipe: INSIDE the
 * control, under the ink it marks — vf-button underlines its label, vf-checkbox
 * its box, vf-radio its circle, the three editable fields (vf-text-field,
 * vf-text-area, vf-number-field) their well, and vf-menu its bar title — or
 * BELOW it, under the whole box, where the control has no interior to give:
 * vf-select's one line is already the label and the ▼, a vf-swatch is nothing
 * but fill, and a vf-slider's only interior is a handle that moves. Focus
 * visibility is an accessibility affordance the kit ADDS to System 7's
 * vocabulary — it is not something the original drew — so what these checks
 * defend is that the added affordance obeys the 1-bit grid as strictly as the
 * traced chrome does.
 *
 * The load-bearing facts, all asserted against rendered pixels rather than the
 * CSS that produces them:
 *
 *  - GEOMETRY: the rule is 1 system px tall, leaves exactly one blank row
 *    between itself and the ink above it (glyph, box border, sprite, the well's
 *    bottom edge, the rail — or, for vf-select and a `shadow` vf-swatch, the
 *    hard shadow the box casts, which no box the pseudo-element can size to
 *    contains; the flat swatch is checked too, since that offset is a calc()
 *    over the depth in play rather than a constant), and
 *    spans that element's own box — the label, not the button's padded face;
 *    the whole well, not the toggle's row; the number field's well, not the
 *    stepper beside it; the menu's title, not the bar cell around it; the
 *    slider's whole rail, not just the handle.
 *  - PATTERN: 1 system px on, 1 off, every pixel pure black or pure white. A
 *    feathered dash is the failure this exists to catch, so the check refuses
 *    any intermediate gray, including in the case that provokes it: a grouped
 *    button whose centered odd-width label lands on a half system px.
 *  - NO RING: nothing paints outside the button's silhouette, a toggle's well
 *    column carries exactly two ink bands, and a field's border is still the
 *    1px it was — the box-shadow that used to thicken it on focus is gone.
 *    Every outline involved — the inner button's and input's, the
 *    (delegatesFocus) hosts', the wells' — must be off.
 *  - MODALITY: keyboard focus shows it, a pointer never does. Four controls
 *    can't get that from `:focus-visible`, for two opposite reasons, and the
 *    checks below pin BOTH as the reason src/focus-modality.ts exists. The
 *    fields, because the selector is specified to match any focus of an element
 *    that takes keyboard input, so it is ALREADY true for a clicked text field:
 *    all three pointer routes into one (a click in the well, typing after it,
 *    and a click on its vf-label caption, which focuses it programmatically)
 *    must leave it unmarked. And vf-select / vf-menu / vf-slider, because each
 *    suppresses the browser's own mouse focus to run a press-drag gesture and
 *    calls focus() itself, which Blink reads as a VISIBLE focus. The nastiest
 *    route is a press on an already-focused one: it moves no focus, so there is
 *    no focus event to read the modality at, and the control has to drop the
 *    mark from its own pointerdown.
 *  - PRESSED: currentColor inverts the rule to white on the black face.
 *  - The controls with no face to carry the mark keep the dotted ring, so
 *    vf-scroll-area is checked as the canary.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:focus
 */
import {
  check, decodePng, isBlack, isWhite, launch, makeBuild, report, rgb,
} from './harness.mjs'

/** Headless Chromium runs at dpr 1, so the default scale is 3/1. */
const S = 3
/** Padding around the screenshot clip, in device px. */
const PAD = 9
/** …and for a control whose rule sits below its box, past a 2px hard shadow. */
const BELOW_PAD = 6 * S

const browser = await launch()

/** A page with the kit loaded and every vf-* element upgraded. */
const build = makeBuild(browser, {
  viewport: { width: 900, height: 500 },
  bodyStyle: 'margin:0;background:#fff;padding:24px',
  settle: true,
})

/**
 * The rendered state of one control: its computed focus declarations plus a
 * screenshot of `frameSel`'s box with `pad` device px of the page around it.
 * `targetSel` is the element carrying the rule — the button's label wrapper,
 * or the toggles' well, which is its own frame.
 *
 * Returned coordinates are device px within that clip: `x0`/`y0`/`w`/`h` are
 * the frame's box, `ruleX0`/`ruleX1` the x-range the rule may occupy.
 */
async function shoot(page, id, frameSel = 'button', targetSel = '.label', pad = PAD) {
  const geo = await page.evaluate(
    ([elId, frame, target]) => {
      const host = document.getElementById(elId)
      // 'host' clips around the element itself: the toggles' wells sit on a
      // half system px inside their row, so their own box is the wrong origin
      // to measure whole rows from — the host's is whole.
      const frameEl = frame === 'host' ? host : host.shadowRoot.querySelector(frame)
      const targetEl = host.shadowRoot.querySelector(target)
      const after = getComputedStyle(targetEl, '::after')
      const f = frameEl.getBoundingClientRect()
      const t = targetEl.getBoundingClientRect()
      return {
        face: { x: f.x, y: f.y, w: f.width, h: f.height },
        target: { x: t.x - f.x, y: t.y - f.y, w: t.width, h: t.height },
        drawn: after.content !== 'none',
        height: parseFloat(after.height),
        bottom: parseFloat(after.bottom),
        hostOutline: getComputedStyle(host).outlineStyle,
        frameOutline: getComputedStyle(frameEl).outlineStyle,
        targetOutline: getComputedStyle(targetEl).outlineStyle,
        scale: parseFloat(getComputedStyle(host).getPropertyValue('--vf-scale')),
      }
    },
    [id, frameSel, targetSel]
  )
  const shot = await page.screenshot({
    clip: {
      x: geo.face.x - pad,
      y: geo.face.y - pad,
      width: geo.face.w + 2 * pad,
      height: geo.face.h + 2 * pad,
    },
  })
  return {
    ...geo,
    png: decodePng(shot),
    x0: pad,
    y0: pad,
    w: Math.round(geo.face.w),
    h: Math.round(geo.face.h),
    // The button's rule spans its label; a toggle's spans its whole well —
    // one device px of slack each side, since the checkbox's grows over its
    // border and the wells sit on a half system px inside the row.
    ruleX0: pad + geo.target.x,
    ruleX1: pad + geo.target.x + geo.target.w,
  }
}

/**
 * Ink runs along one row of the face interior, as [start, end) device-px
 * pairs. Used both to find the dashed row and to measure its pattern.
 */
function runs(png, y, x0, x1, ink) {
  const out = []
  let start = null
  for (let x = Math.round(x0); x < Math.round(x1); x++) {
    if (ink(png, x, y)) {
      if (start === null) start = x
    } else if (start !== null) {
      out.push([start, x])
      start = null
    }
  }
  if (start !== null) out.push([start, Math.round(x1)])
  return out
}

/**
 * The rows of the rule's column that carry ink, grouped into bands: the
 * control's own ink, then the dashed rule under it. `ink` swaps to
 * white-on-black for a pressed face.
 *
 * The button scans the face interior (its frame would join every band into
 * one); a toggle scans the whole clip with a device px of slack each side, so
 * that a stray ring above or beside the well shows up as an extra band.
 */
function bands(s, ink, { inset = S, slack = 0 } = {}) {
  const rows = []
  for (let y = inset ? s.y0 + inset : 0; y < (inset ? s.y0 + s.h - inset : s.png.height); y++) {
    if (runs(s.png, y, s.ruleX0 - slack, s.ruleX1 + slack, ink).length) rows.push(y)
  }
  const groups = []
  for (const y of rows) {
    const last = groups[groups.length - 1]
    if (last && y === last[last.length - 1] + 1) last.push(y)
    else groups.push([y])
  }
  return groups
}

// ── the default push button, focused by keyboard ──────────────────────────
{
  const page = await build('<vf-button id="b">Button</vf-button>')
  await page.keyboard.press('Tab')
  const s = await shoot(page, 'b')

  check('Tab focuses the button and draws the underline', s.drawn)
  check(
    'the UA ring is off on both the inner button and the host',
    s.frameOutline === 'none' && s.hostOutline === 'none',
    `button=${s.frameOutline} host=${s.hostOutline}`
  )

  const groups = bands(s, isBlack)
  check('the label shows two ink bands: the glyphs and the rule', groups.length === 2,
    `found ${groups.length}`)
  const [glyphs, rule] = groups
  check('the rule is 1 system px tall', rule.length === S, `${rule.length} device px`)
  check(
    'one blank system px row separates it from the glyph ink',
    rule[0] - (glyphs[glyphs.length - 1] + 1) === S,
    `gap=${(rule[0] - (glyphs[glyphs.length - 1] + 1)) / S} system px`
  )
  // The face's own geometry: 20px tall, glyph ink on rows 5..13 (the 12/4 em
  // centered), baseline on row 14, so the rule lands on row 15.
  check(
    'the rule sits on row 15 of the 20px face (baseline + 1)',
    (rule[0] - s.y0) / S === 15,
    `row ${(rule[0] - s.y0) / S}`
  )

  const dashes = runs(s.png, rule[0], s.ruleX0, s.ruleX1, isBlack)
  check('the dashes are 1 system px on', dashes.every(([a, b]) => b - a === S),
    `widths=${[...new Set(dashes.map(([a, b]) => b - a))]}`)
  check(
    'the gaps are 1 system px off',
    dashes.every(([a], i) => i === 0 || a - dashes[i - 1][1] === S),
    `gaps=${[...new Set(dashes.slice(1).map(([a], i) => a - dashes[i][1]))]}`
  )
  check(
    'the rule starts on ink at the label box, and ends within a dash of it',
    Math.abs(dashes[0][0] - s.ruleX0) <= 1 &&
      s.ruleX1 - dashes[dashes.length - 1][1] <= S + 1,
    `label=${s.ruleX0.toFixed(1)}..${s.ruleX1.toFixed(1)} ` +
      `rule=${dashes[0][0]}..${dashes[dashes.length - 1][1]}`
  )
  // Nothing between the dashes may be a partial tone: that is what a
  // gradient stop landing off the device grid would produce.
  const impure = []
  for (let x = Math.round(s.ruleX0); x < Math.round(s.ruleX1); x++) {
    for (let y = rule[0]; y <= rule[rule.length - 1]; y++) {
      if (!isBlack(s.png, x, y) && !isWhite(s.png, x, y)) impure.push([x - s.x0, y - s.y0, rgb(s.png, x, y)])
    }
  }
  check('every pixel of the rule is pure black or white', !impure.length,
    `${impure.length} feathered, first ${JSON.stringify(impure[0] ?? null)}`)

  // No ring: the band outside the silhouette stays page white.
  const outside = []
  for (let y = 0; y < s.png.height; y++) {
    for (let x = 0; x < s.png.width; x++) {
      const inFace = x >= s.x0 - 1 && x < s.x0 + s.w + 1 && y >= s.y0 - 1 && y < s.y0 + s.h + 1
      if (!inFace && !isWhite(s.png, x, y)) outside.push([x - s.x0, y - s.y0])
    }
  }
  check('nothing paints outside the button silhouette', !outside.length,
    `${outside.length} px, first ${JSON.stringify(outside[0] ?? null)}`)
  await page.close()
}

// ── :focus-visible semantics: a mouse click must not show it ──────────────
{
  const page = await build('<vf-button id="b">Button</vf-button>')
  await page.locator('#b').click()
  const clicked = await shoot(page, 'b')
  check('a mouse click leaves the button focused but unmarked', !clicked.drawn)
  await page.keyboard.press('Tab')
  await page.keyboard.down('Shift')
  await page.keyboard.press('Tab')
  await page.keyboard.up('Shift')
  const tabbed = await shoot(page, 'b')
  check('tabbing back to it marks it again', tabbed.drawn)
  await page.close()
}

// ── pressed: the rule inverts with the label ──────────────────────────────
{
  const page = await build('<vf-button id="b">Button</vf-button>')
  await page.keyboard.press('Tab')
  const box = await page.locator('#b').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  const s = await shoot(page, 'b')
  const groups = bands(s, isWhite)
  const rule = groups[groups.length - 1]
  const dashes = runs(s.png, rule[0], s.ruleX0, s.ruleX1, isWhite)
  check(
    'pressed: the rule inverts to white dashes on the black face',
    groups.length === 2 && rule.length === S && dashes.length > 4 &&
      dashes.every(([a, b]) => b - a === S),
    `bands=${groups.length} height=${rule.length / S} dashes=${dashes.length}`
  )
  await page.mouse.up()
  await page.close()
}

// ── the other two shapes: small, and the default button's ring ────────────
{
  const page = await build(
    '<vf-button id="s" size="small">Button</vf-button>' +
      '<vf-button id="d" variant="default">Button</vf-button>'
  )
  await page.keyboard.press('Tab')
  const small = await shoot(page, 's')
  const sg = bands(small, isBlack)
  check('size=small draws the rule too', small.drawn && sg.length === 2)
  check(
    'small: still one blank system px row below the glyph ink',
    sg.length === 2 && sg[1][0] - (sg[0][sg[0].length - 1] + 1) === S,
    sg.length === 2 ? `gap=${(sg[1][0] - (sg[0][sg[0].length - 1] + 1)) / S}` : ''
  )

  await page.keyboard.press('Tab')
  const def = await shoot(page, 'd')
  const dg = bands(def, isBlack)
  check('variant=default draws the rule inside its face', def.drawn && dg.length === 2)
  check(
    'default: the rule sits on row 15 of the face, clear of the ring',
    dg.length === 2 && (dg[1][0] - def.y0) / S === 15,
    dg.length === 2 ? `row ${(dg[1][0] - def.y0) / S}` : ''
  )
  // The ring is the host's ::before at inset -4: it must still be there.
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('d'), '::before')
    return { content: cs.content, top: cs.top }
  })
  check('default: the double ring is untouched', ring.content === '""' && ring.top === '-12px',
    JSON.stringify(ring))
  await page.close()
}

// ── the half-pixel case: a grouped button centering an odd-width label ────
{
  const page = await build(
    '<vf-button-group><vf-button id="b">Cancel</vf-button>' +
      '<vf-button>Save As…</vf-button></vf-button-group>'
  )
  await page.keyboard.press('Tab')
  const s = await shoot(page, 'b')
  const offGrid = Math.abs(s.target.x - Math.round(s.target.x)) > 1e-6
  const rule = bands(s, isBlack)[1] ?? []
  const impure = []
  for (let x = Math.round(s.ruleX0); x < Math.round(s.ruleX1); x++) {
    for (const y of rule) {
      if (!isBlack(s.png, x, y) && !isWhite(s.png, x, y)) impure.push([x, y])
    }
  }
  check(
    'a group centers this label off the system-px grid (the case under test)',
    offGrid,
    `label offset ${s.target.x} device px`
  )
  check('…and the rule still rasterizes pure black/white', rule.length === S && !impure.length,
    `${impure.length} feathered`)
  await page.close()
}

// ── the two toggles: the rule goes under the WELL, not the label ──────────
const ruleRow = {}
// `inset` is how far the rule is pulled in from each side of the 13px well, in
// system px: the checkbox's spans it, the radio's is narrowed to 9 because the
// shape above it is round.
for (const [tag, id, well, inset] of [
  ['vf-checkbox', 'c', '.box', 0],
  ['vf-radio', 'r', '.circle', 2],
]) {
  const width = 13 - 2 * inset
  const page = await build(`<${tag} id="${id}" checked>Label</${tag}>`)
  await page.keyboard.press('Tab')
  const s = await shoot(page, id, 'host', well)

  check(`${tag}: Tab draws the rule`, s.drawn)
  check(
    `${tag}: no outline left on the host or the well`,
    s.hostOutline === 'none' && s.targetOutline === 'none',
    `host=${s.hostOutline} well=${s.targetOutline}`
  )

  // Scanning the whole clip, not just the well: a ring would show up here as
  // a third band (above the control) or widen the two.
  const groups = bands(s, isBlack, { inset: 0, slack: 1 })
  check(
    `${tag}: two ink bands in the well's column — the control, then the rule`,
    groups.length === 2,
    `found ${groups.length}`
  )
  const [ink, rule] = groups.length === 2 ? groups : [[], []]
  check(`${tag}: the rule is 1 system px tall`, rule.length === S, `${rule.length} device px`)
  // The checkbox's border IS its well's bottom edge, so its gap is exactly the
  // one blank row both controls are anchored for. The radio's 12px sprite sits
  // half a system px proud of its 13px well, so the same anchor reads as one
  // row or two depending on which way that half pixel rounds.
  const gap = rule.length ? rule[0] - (ink[ink.length - 1] + 1) : NaN
  check(
    tag === 'vf-checkbox'
      ? `${tag}: one blank system px row separates it from the box`
      : `${tag}: the rule clears the sprite by a row (± the sprite's half-px inset)`,
    tag === 'vf-checkbox' ? gap === S : gap >= S && gap <= 2 * S,
    `gap=${(gap / S).toFixed(2)} system px`
  )

  const dashes = rule.length ? runs(s.png, rule[0], s.ruleX0 - 1, s.ruleX1 + 1, isBlack) : []
  check(
    `${tag}: 1 system px on, 1 off — ${Math.ceil(width / 2)} dashes over ${width} system px`,
    dashes.length === Math.ceil(width / 2) &&
      dashes.every(([a, b]) => b - a === S) &&
      dashes.every(([a], i) => i === 0 || a - dashes[i - 1][1] === S),
    `${dashes.length} dashes, widths=${[...new Set(dashes.map(([a, b]) => b - a))]}`
  )
  check(
    inset
      ? `${tag}: it sits ${inset} system px inside the well on each side`
      : `${tag}: it spans the well's own box, edge to edge`,
    dashes.length > 0 &&
      Math.abs(dashes[0][0] - (s.ruleX0 + inset * S)) <= 1 &&
      // The pattern ends on ink, so the last dash's far edge IS the rule's.
      Math.abs(s.ruleX1 - inset * S - dashes[dashes.length - 1][1]) <= 1,
    dashes.length
      ? `well=${s.ruleX0}..${s.ruleX1} rule=${dashes[0][0]}..${dashes[dashes.length - 1][1]}`
      : ''
  )
  const impure = []
  for (let x = Math.round(s.ruleX0) - 1; x < Math.round(s.ruleX1) + 1; x++) {
    for (const y of rule) {
      if (!isBlack(s.png, x, y) && !isWhite(s.png, x, y)) impure.push([x, y])
    }
  }
  check(`${tag}: every pixel of the rule is pure black or white`, !impure.length,
    `${impure.length} feathered`)
  ruleRow[tag] = rule.length ? rule[0] - s.y0 : null
  await page.close()

  const clickPage = await build(`<${tag} id="${id}">Label</${tag}>`)
  await clickPage.locator(`#${id}`).click()
  const clicked = await shoot(clickPage, id, 'host', well)
  check(`${tag}: a mouse click leaves it focused but unmarked`, !clicked.drawn)
  await clickPage.close()
}

// Both wells are the same 13px box in the same 20px row, so a mixed list must
// put the two rules on one line — the reason the radio's offset is −2 to the
// checkbox's −3 rather than both being "one row under the ink".
check(
  'the checkbox and radio rules land on the same row of their host',
  ruleRow['vf-checkbox'] !== null && ruleRow['vf-checkbox'] === ruleRow['vf-radio'],
  `checkbox=${ruleRow['vf-checkbox']} radio=${ruleRow['vf-radio']} device px from the host top`
)

// ── the three editable fields: the rule goes under the WELL ───────────────
// What replaced the box-shadow that used to thicken the border on focus, so
// each field is checked for the rule AND for a border that is still 1px.
for (const [tag, markup] of [
  ['vf-text-field', '<vf-text-field id="f"></vf-text-field>'],
  ['vf-text-area', '<vf-text-area id="f" rows="2"></vf-text-area>'],
  ['vf-number-field', '<vf-number-field id="f"></vf-number-field>'],
]) {
  const page = await build(markup)
  await page.keyboard.press('Tab')
  const s = await shoot(page, 'f', '.vf-field-well', '.vf-field-well')

  check(`${tag}: Tab draws the rule`, s.drawn)
  check(
    `${tag}: no outline left on the host or the well`,
    s.hostOutline === 'none' && s.targetOutline === 'none',
    `host=${s.hostOutline} well=${s.targetOutline}`
  )

  // One column down the middle of an empty well carries the whole geometry:
  // the top border, the bottom border, then the rule. Three bands of exactly
  // 1 system px each proves the border did NOT thicken (the box-shadow this
  // replaced would have doubled the first two) and that the rule is a hairline.
  const cx = Math.round(s.x0 + s.w / 2)
  const column = bands({ ...s, ruleX0: cx, ruleX1: cx + 1 }, isBlack, { inset: 0 })
  check(
    `${tag}: three 1px ink rows down the well — top border, bottom border, rule`,
    column.length === 3 && column.every((b) => b.length === S),
    `bands=${column.map((b) => b.length / S).join(',')} system px`
  )
  const [, bottom, rule] = column.length === 3 ? column : [[], [], []]
  const gap = rule.length ? rule[0] - (bottom[bottom.length - 1] + 1) : NaN
  check(
    `${tag}: one blank system px row separates it from the well's bottom edge`,
    gap === S,
    `gap=${gap / S} system px`
  )

  const dashes = rule.length ? runs(s.png, rule[0], s.ruleX0, s.ruleX1, isBlack) : []
  check(
    `${tag}: 1 system px on, 1 off across the well`,
    dashes.length > 4 &&
      dashes.every(([a, b]) => b - a === S) &&
      dashes.every(([a], i) => i === 0 || a - dashes[i - 1][1] === S),
    `${dashes.length} dashes, widths=${[...new Set(dashes.map(([a, b]) => b - a))]}`
  )
  check(
    `${tag}: it spans the well's own box, edge to edge`,
    dashes.length > 0 &&
      Math.abs(dashes[0][0] - s.ruleX0) <= 1 &&
      s.ruleX1 - dashes[dashes.length - 1][1] <= S + 1,
    dashes.length
      ? `well=${s.ruleX0}..${s.ruleX1} rule=${dashes[0][0]}..${dashes[dashes.length - 1][1]}`
      : ''
  )
  const impure = []
  for (let x = Math.round(s.ruleX0); x < Math.round(s.ruleX1); x++) {
    for (const y of rule) {
      if (!isBlack(s.png, x, y) && !isWhite(s.png, x, y)) impure.push([x - s.x0, y - s.y0, rgb(s.png, x, y)])
    }
  }
  check(
    `${tag}: every pixel of the rule is pure black or white`,
    rule.length && !impure.length,
    `${impure.length} feathered, first ${JSON.stringify(impure[0] ?? null)}`
  )

  // The 1-system-px band immediately around the well — exactly where the old
  // focus box-shadow painted, and (below) the rule's blank row. On the number
  // field it also stays clear of the stepper, which starts 3 system px out.
  const halo = []
  for (let y = s.y0 - S; y < s.y0 + s.h + S; y++) {
    for (let x = s.x0 - S; x < s.x0 + s.w + S; x++) {
      const inWell = x >= s.x0 && x < s.x0 + s.w && y >= s.y0 && y < s.y0 + s.h
      if (!inWell && !isWhite(s.png, x, y)) halo.push([x - s.x0, y - s.y0])
    }
  }
  check(
    `${tag}: nothing paints in the row just outside the well (no ring, no thickening)`,
    !halo.length,
    `${halo.length} px, first ${JSON.stringify(halo[0] ?? null)}`
  )
  await page.close()

  // Modality. The mark is keyboard-only, which for a field cannot come from
  // :focus-visible — see the header and src/focus-modality.ts. The caption is
  // here for the third route: vf-label `for` focuses the control from a click
  // on the caption, so the field itself sees nothing but a programmatic
  // focus(), and only a page-wide view of the modality can tell it apart.
  const well = ['.vf-field-well', '.vf-field-well']
  const modalPage = await build(`<vf-label id="cap" for="f">Name:</vf-label>${markup}`)

  await modalPage.locator('#f').click()
  const clicked = await shoot(modalPage, 'f', ...well)
  check(`${tag}: a mouse click into the well leaves it unmarked`, !clicked.drawn)
  const nativeFv = await modalPage.evaluate(() =>
    document.getElementById('f').shadowRoot.querySelector('.vf-field').matches(':focus-visible')
  )
  check(
    `${tag}: …while the native control DOES match :focus-visible (why the class exists)`,
    nativeFv
  )

  await modalPage.keyboard.type('ab')
  const typed = await shoot(modalPage, 'f', ...well)
  check(`${tag}: typing after that click still leaves it unmarked`, !typed.drawn)

  // Out to the page, then back by Tab: same field, keyboard route, marked.
  await modalPage.mouse.click(4, 4)
  await modalPage.keyboard.press('Tab')
  const tabbed = await shoot(modalPage, 'f', ...well)
  check(`${tag}: tabbing to it after that click marks it`, tabbed.drawn)

  // And the caption route, which is a pointer landing focus from elsewhere.
  await modalPage.mouse.click(4, 4)
  await modalPage.locator('#cap').click()
  const viaLabel = await shoot(modalPage, 'f', ...well)
  const landed = await modalPage.evaluate(() => document.activeElement?.id)
  check(`${tag}: clicking its vf-label caption focuses it (guards the check below)`, landed === 'f',
    `activeElement=#${landed}`)
  check(`${tag}: …and that pointer route leaves it unmarked too`, !viaLabel.drawn)
  await modalPage.close()
}

// ── the boxes that mark BELOW themselves: the rule goes UNDER, not inside ───
// vf-select and vf-swatch have no interior to lend the mark — the pill's one
// line is already the label and the ▼, and every pixel inside the swatch is
// the color it exists to show — so the rule drops below the whole box. Which
// means it has to clear the hard shadow, ink that sits outside every box the
// pseudo-element could size itself to. What's checked is the ink profile: the
// box AND whatever shadow it casts as one band, one blank row, then the rule.
//
// vf-swatch runs twice because its shadow is a parameter, not a constant: the
// offset is a calc() over the depth actually in play, so the flat default (the
// palette-cell case, no shadow at all) and the raised `shadow` reading have to
// land the rule one blank row under DIFFERENT amounts of ink.
for (const [tag, markup, frame, shadow] of [
  [
    'vf-select',
    '<vf-select id="x" value="a"><vf-option value="a">Macintosh HD</vf-option>' +
      '<vf-option value="b">Backup</vf-option></vf-select>',
    '.control',
    1,
  ],
  ['vf-swatch', '<vf-swatch id="x"></vf-swatch>', 'button', 0],
  ['vf-swatch shadow', '<vf-swatch id="x" shadow></vf-swatch>', 'button', 2],
]) {
  const page = await build(markup)
  await page.keyboard.press('Tab')
  const s = await shoot(page, 'x', frame, frame, BELOW_PAD)

  check(`${tag}: Tab draws the rule`, s.drawn)
  check(
    `${tag}: no outline left on the host or the control`,
    s.hostOutline === 'none' && s.frameOutline === 'none',
    `host=${s.hostOutline} control=${s.frameOutline}`
  )

  // Scanning the whole clip: the box's own side borders put ink in every one
  // of its rows, so the control and its shadow read as a single band, and a
  // ring would show up as a third one (or widen these two).
  const withShadow = shadow ? ' with its hard shadow' : ''
  const groups = bands(s, isBlack, { inset: 0 })
  check(
    `${tag}: two ink bands — the box${withShadow}, then the rule`,
    groups.length === 2,
    `found ${groups.length}`
  )
  const [ink, rule] = groups.length === 2 ? groups : [[], []]
  check(
    `${tag}: the ink above it is the box${shadow ? ` plus its ${shadow}px shadow` : ''}, nothing more`,
    ink.length === s.h + shadow * S,
    `${ink.length / S} system px vs the box's ${s.h / S} + ${shadow}`
  )
  check(`${tag}: the rule is 1 system px tall`, rule.length === S, `${rule.length} device px`)
  check(
    `${tag}: one blank system px row separates it from the ink above`,
    rule.length ? rule[0] - (ink[ink.length - 1] + 1) === S : false,
    rule.length ? `gap=${(rule[0] - (ink[ink.length - 1] + 1)) / S} system px` : ''
  )
  // The point of the placement: it is BELOW the box, not inside it the way
  // vf-button's sits on row 15 of its own 20px face.
  check(
    `${tag}: it sits outside the box entirely, ${shadow + 1} system px below it`,
    rule.length ? rule[0] - (s.y0 + s.h) === (shadow + 1) * S : false,
    rule.length ? `${(rule[0] - (s.y0 + s.h)) / S} system px below the box's bottom edge` : ''
  )

  const dashes = rule.length ? runs(s.png, rule[0], s.ruleX0, s.ruleX1, isBlack) : []
  check(
    `${tag}: 1 system px on, 1 off`,
    dashes.length > 4 &&
      dashes.every(([a, b]) => b - a === S) &&
      dashes.every(([a], i) => i === 0 || a - dashes[i - 1][1] === S),
    `${dashes.length} dashes, widths=${[...new Set(dashes.map(([a, b]) => b - a))]}`
  )
  check(
    `${tag}: it spans the border box — the shape the control reads as, not the shadow`,
    dashes.length > 0 &&
      Math.abs(dashes[0][0] - s.ruleX0) <= 1 &&
      s.ruleX1 - dashes[dashes.length - 1][1] <= S + 1,
    dashes.length
      ? `box=${s.ruleX0}..${s.ruleX1} rule=${dashes[0][0]}..${dashes[dashes.length - 1][1]}`
      : ''
  )
  const impure = []
  for (let x = Math.round(s.ruleX0); x < Math.round(s.ruleX1); x++) {
    for (const y of rule) {
      if (!isBlack(s.png, x, y) && !isWhite(s.png, x, y))
        impure.push([x - s.x0, y - s.y0, rgb(s.png, x, y)])
    }
  }
  check(
    `${tag}: every pixel of the rule is pure black or white`,
    rule.length && !impure.length,
    `${impure.length} feathered, first ${JSON.stringify(impure[0] ?? null)}`
  )
  await page.close()

  // Modality: keyboard only. The select's pointer route is a round trip — the
  // first click opens the list, the second releases on the current item, which
  // closes it and hands focus back to the pill. That is the one pointer gesture
  // that ENDS with the control focused, so it's the one worth checking.
  const clickPage = await build(markup)
  await clickPage.locator('#x').click()
  if (tag === 'vf-select') await clickPage.locator('#x').click()
  const focused = await clickPage.evaluate(
    (sel) => document.getElementById('x').shadowRoot.querySelector(sel).matches(':focus'),
    frame
  )
  check(`${tag}: a mouse click leaves the control focused (guards the check below)`, focused)
  const clicked = await shoot(clickPage, 'x', frame, frame, BELOW_PAD)
  check(`${tag}: …and unmarked`, !clicked.drawn)
  if (tag === 'vf-select') {
    // The pill is the second control in the kit that cannot read the modality
    // off :focus-visible, and it gets there the opposite way to a text field:
    // not because the selector is specified to match a clicked field, but
    // because the pill suppresses the browser's mouse focus and calls focus()
    // itself, which Blink treats as a visible focus. Pin that, since it is the
    // whole reason the class gate is there.
    const nativeFv = await clickPage.evaluate(() =>
      document.getElementById('x').shadowRoot.querySelector('.control').matches(':focus-visible')
    )
    check(`${tag}: …while it DOES match :focus-visible (why the modality gate exists)`, nativeFv)
  }
  // Out to the page, then back by Tab: same control, keyboard route, marked.
  await clickPage.mouse.click(4, 4)
  await clickPage.keyboard.press('Tab')
  const tabbed = await shoot(clickPage, 'x', frame, frame, BELOW_PAD)
  check(`${tag}: tabbing to it after that click marks it`, tabbed.drawn)
  if (tag === 'vf-select') {
    // The open list is itself where focus is, so the rule stands down — as a
    // dropped vf-menu's does. It matters most for a ONE-option menu, whose
    // panel overlays the pill exactly and so would leave the rule hanging in
    // the open below it rather than covering it.
    await clickPage.keyboard.press(' ')
    const open = await clickPage.evaluate(() =>
      document.getElementById('x').shadowRoot.querySelector('.panel').classList.contains('open')
    )
    check(`${tag}: Space opens the list (guards the check below)`, open)
    const whileOpen = await shoot(clickPage, 'x', frame, frame, BELOW_PAD)
    check(`${tag}: …and while open the rule stands down`, !whileOpen.drawn)
    await clickPage.keyboard.press('Escape')
    const reclosed = await shoot(clickPage, 'x', frame, frame, BELOW_PAD)
    check(`${tag}: Escape closes it and the rule comes back`, reclosed.drawn)
  }
  await clickPage.close()
}

// ── the menu title: the rule goes under the TITLE, not the bar cell ───────
// A bar title is text in a 24px cell with 10px of padding each side, so the
// rule spans the title's own box — and hangs one row under it rather than one
// row under the baseline, because the same box holds the Apple menu's 16px
// vf-img and a rule tucked under the baseline crosses both that artwork and a
// descender.
// Standalone rather than in a vf-menu-bar, so the bar's own 1px bottom rule —
// which lands inside the 24px cell — doesn't join the scan as a third band.
{
  const page = await build('<vf-menu id="x" label="Page"><vf-menu-item>Setup</vf-menu-item></vf-menu>')
  await page.keyboard.press('Tab')
  const s = await shoot(page, 'x', '.label', '.title', BELOW_PAD)

  check('vf-menu: Tab draws the rule', s.drawn)
  check(
    'vf-menu: no outline left on the host or the bar cell',
    s.hostOutline === 'none' && s.frameOutline === 'none',
    `host=${s.hostOutline} label=${s.frameOutline}`
  )
  check(
    'vf-menu: the rule spans the title, not the cell it sits in',
    s.target.w < s.w,
    `title ${s.target.w / S} of the cell's ${s.w / S} system px`
  )

  // Scan the title's own column across the whole clip: the glyph ink, then the
  // rule. A ring would add a band above the glyphs or beside them.
  const groups = bands(s, isBlack, { inset: 0 })
  check('vf-menu: two ink bands — the glyphs, then the rule', groups.length === 2,
    `found ${groups.length}`)
  const [glyphs, rule] = groups.length === 2 ? groups : [[], []]
  check('vf-menu: the rule is 1 system px tall', rule.length === S, `${rule.length} device px`)
  // The anchor is the title's own BOX — the em box, whose bottom is the
  // descent line — not the glyph ink and not the baseline. That is what lets
  // one offset serve both a descender and the Apple menu's 16px vf-img.
  check(
    'vf-menu: it hangs one blank system px row under the title box',
    rule.length ? rule[0] - (s.y0 + s.target.y + s.target.h) === S : false,
    rule.length ? `gap=${(rule[0] - (s.y0 + s.target.y + s.target.h)) / S} system px` : ''
  )
  // So a descender clears it — where vf-button's, one row under the baseline,
  // would be crossed by the same glyph. ("Page" is chosen for the 'g'; its ink
  // stops a row short of the descent line, so the measured gap is 2.)
  check(
    "vf-menu: …so the 'g' of \"Page\" never crosses it",
    rule.length ? rule[0] - (glyphs[glyphs.length - 1] + 1) >= S : false,
    rule.length ? `ink gap=${(rule[0] - (glyphs[glyphs.length - 1] + 1)) / S} system px` : ''
  )
  const dashes = rule.length ? runs(s.png, rule[0], s.ruleX0, s.ruleX1, isBlack) : []
  check(
    'vf-menu: 1 system px on, 1 off across the title',
    dashes.length > 4 &&
      dashes.every(([a, b]) => b - a === S) &&
      dashes.every(([a], i) => i === 0 || a - dashes[i - 1][1] === S),
    `${dashes.length} dashes, widths=${[...new Set(dashes.map(([a, b]) => b - a))]}`
  )
  const impure = []
  for (let x = Math.round(s.ruleX0); x < Math.round(s.ruleX1); x++) {
    for (const y of rule) {
      if (!isBlack(s.png, x, y) && !isWhite(s.png, x, y)) impure.push([x - s.x0, y - s.y0])
    }
  }
  check('vf-menu: every pixel of the rule is pure black or white', rule.length && !impure.length,
    `${impure.length} feathered`)
  await page.close()

  // Modality. The press gesture suppresses the browser's mouse focus and calls
  // focusLabel() itself, so :focus-visible is true after a plain click — and a
  // press on an ALREADY-focused title moves no focus at all, which is why the
  // menu suppresses the rule from its own pointerdown. Check that harder case:
  // Tab to the title first, THEN click it.
  const clickPage = await build(
    '<vf-menu-bar><vf-menu id="x" label="Page"><vf-menu-item>Setup</vf-menu-item></vf-menu>' +
      '<vf-menu label="File"><vf-menu-item>New</vf-menu-item></vf-menu></vf-menu-bar>'
  )
  await clickPage.keyboard.press('Tab')
  const tabbed = await shoot(clickPage, 'x', '.label', '.title', BELOW_PAD)
  check('vf-menu: Tab marks it (guards the check below)', tabbed.drawn)
  await clickPage.locator('#x').click()
  const clicked = await shoot(clickPage, 'x', '.label', '.title', BELOW_PAD)
  check('vf-menu: clicking the title it was already on unmarks it', !clicked.drawn)
  const nativeFv = await clickPage.evaluate(() =>
    document.getElementById('x').shadowRoot.querySelector('.label').matches(':focus-visible')
  )
  check('vf-menu: …while it DOES match :focus-visible (why the modality gate exists)', nativeFv)
  await clickPage.close()

  // A dropped menu inverts its whole cell, which says where focus is louder
  // than the rule does — so the rule is for the state the inversion can't
  // express, and stands down while the menu is open. Keyboard route
  // throughout, so the mark is on for every step it should be.
  const openPage = await build(
    '<vf-menu-bar><vf-menu id="x" label="Page"><vf-menu-item>Setup</vf-menu-item></vf-menu>' +
      '<vf-menu label="File"><vf-menu-item>New</vf-menu-item></vf-menu></vf-menu-bar>'
  )
  await openPage.keyboard.press('Tab')
  check('vf-menu: focused and closed — marked', (await shoot(openPage, 'x', '.label', '.title', BELOW_PAD)).drawn)
  await openPage.keyboard.press('ArrowDown')
  const opened = await openPage.evaluate(() => document.getElementById('x').open)
  check('vf-menu: ArrowDown drops the menu (guards the check below)', opened)
  const whileOpen = await shoot(openPage, 'x', '.label', '.title', BELOW_PAD)
  check('vf-menu: …and while open the rule stands down — the inversion is the mark', !whileOpen.drawn)
  // Nothing white left under the inverted title either: the rule is
  // currentColor, so a surviving one would read as a white dashed line on the
  // black cell — a second white band below the glyphs. Scanned inside the
  // PLATE, not the cell: the hilite is inset one system px top and bottom
  // (the bar's white shows above it by design — see vf-menu's label styles),
  // so the scan skips that row plus one device px of boundary.
  const inverted = bands(whileOpen, isWhite, { inset: S + 1 })
  check(
    'vf-menu: no white dashes under the inverted title',
    inverted.length === 1,
    `${inverted.length} white bands inside the cell (the glyphs alone)`
  )
  await openPage.keyboard.press('Escape')
  const closed = await shoot(openPage, 'x', '.label', '.title', BELOW_PAD)
  check('vf-menu: Escape closes it and the rule comes back', closed.drawn)
  await openPage.close()
}

// ── the slider: the rule goes under the RAIL, not around the handle ───────
// The handle moves with the value, so a mark on it marked the value rather
// than the control. The rail is the slider's whole extent; the rule runs its
// full width one blank row under it, and the handle occludes the dashes it
// passes over exactly as it occludes the rail behind it.
{
  const page = await build('<vf-slider id="x" value="45" style="width:300px"></vf-slider>')
  await page.keyboard.press('Tab')
  const s = await shoot(page, 'x', '.track', '.track', BELOW_PAD)

  check('vf-slider: Tab draws the rule', s.drawn)
  check('vf-slider: no outline left on the host', s.hostOutline === 'none', s.hostOutline)

  // Where the handle is, so the scans can stay off it. It is opaque and
  // z-index 1, so it occludes the dashes it passes over.
  const thumb = await page.evaluate(() => {
    const root = document.getElementById('x').shadowRoot
    const t = root.querySelector('.thumb').getBoundingClientRect()
    const track = root.querySelector('.track').getBoundingClientRect()
    return { left: t.x - track.x, right: t.right - track.x }
  })
  const thumbX0 = s.x0 + thumb.left
  const thumbX1 = s.x0 + thumb.right

  // A 6-system-px window a quarter of the way along, clear of the handle. A
  // window and not one column: the pattern is 1 on / 1 off, so a single column
  // lands in a gap half the time.
  const probe = { ...s, ruleX0: Math.round(s.x0 + s.w / 4), ruleX1: Math.round(s.x0 + s.w / 4) + 6 * S }
  const column = bands(probe, isBlack, { inset: 0 })
  check('vf-slider: two ink bands down the rail — the rail, then the rule',
    column.length === 2, `found ${column.length}`)
  const [rail, rule] = column.length === 2 ? column : [[], []]
  check('vf-slider: the rail is still its 4 system px', rail.length === 4 * S,
    `${rail.length / S} system px`)
  check('vf-slider: the rule is 1 system px tall', rule.length === S, `${rule.length} device px`)
  check(
    'vf-slider: one blank system px row separates it from the rail',
    rule.length ? rule[0] - (rail[rail.length - 1] + 1) === S : false,
    rule.length ? `gap=${(rule[0] - (rail[rail.length - 1] + 1)) / S} system px` : ''
  )

  // The rule runs the WHOLE rail, not just under the handle — so it is checked
  // on BOTH sides of the handle, out to each end of the rail.
  const row = rule.length ? rule[0] : -1
  const clean = (from, to) => {
    const d = runs(s.png, row, from, to, isBlack)
    return {
      d,
      ok:
        d.length > 2 &&
        d.every(([a, b]) => b - a === S) &&
        d.every(([a], i) => i === 0 || a - d[i - 1][1] === S),
    }
  }
  const left = rule.length ? clean(s.ruleX0, thumbX0) : { d: [], ok: false }
  const right = rule.length ? clean(thumbX1, s.ruleX1) : { d: [], ok: false }
  check(
    'vf-slider: 1 system px on, 1 off from the left end up to the handle',
    left.ok && Math.abs(left.d[0]?.[0] - s.ruleX0) <= 1,
    `${left.d.length} dashes from ${left.d[0]?.[0]} (rail starts ${s.ruleX0})`
  )
  check(
    'vf-slider: …and on from the handle out to the right end',
    right.ok && s.ruleX1 - right.d[right.d.length - 1]?.[1] <= S + 1,
    `${right.d.length} dashes to ${right.d[right.d.length - 1]?.[1]} (rail ends ${s.ruleX1})`
  )
  const impure = []
  for (let x = Math.round(s.ruleX0); x < Math.round(thumbX0); x++) {
    for (const y of rule) {
      if (!isBlack(s.png, x, y) && !isWhite(s.png, x, y)) impure.push([x - s.x0, y - s.y0])
    }
  }
  check('vf-slider: every pixel of the rule is pure black or white', rule.length && !impure.length,
    `${impure.length} feathered`)
  await page.close()

  // Modality: a drag never marks it, but the arrow keys reveal it mid-gesture.
  const clickPage = await build('<vf-slider id="x" value="45" style="width:300px"></vf-slider>')
  await clickPage.keyboard.press('Tab')
  const tabbed = await shoot(clickPage, 'x', '.track', '.track', BELOW_PAD)
  check('vf-slider: Tab marks it (guards the check below)', tabbed.drawn)
  await clickPage.locator('#x').click()
  const clicked = await shoot(clickPage, 'x', '.track', '.track', BELOW_PAD)
  check('vf-slider: clicking the rail it was already focused on unmarks it', !clicked.drawn)
  await clickPage.keyboard.press('ArrowRight')
  const keyed = await shoot(clickPage, 'x', '.track', '.track', BELOW_PAD)
  check('vf-slider: an arrow key after that click reveals it again', keyed.drawn)
  await clickPage.close()
}

// ── canary: a control with no face to carry the mark keeps the dotted ring ─
{
  const page = await build(
    '<vf-scroll-area id="a" style="width:120px;height:80px"><p>Scrolling copy.</p></vf-scroll-area>'
  )
  await page.keyboard.press('Tab')
  const ring = await page.evaluate(() => {
    const viewport = document.getElementById('a').shadowRoot.querySelector('.viewport')
    const cs = getComputedStyle(viewport)
    return {
      style: cs.outlineStyle,
      width: cs.outlineWidth,
      focused: viewport.matches(':focus-visible'),
    }
  })
  check(
    'vf-scroll-area still focuses with the dotted ring (the rule is only for controls that can draw it)',
    ring.focused && ring.style === 'dotted' && ring.width === '1px',
    JSON.stringify(ring)
  )
  await page.close()
}

await report(browser)
