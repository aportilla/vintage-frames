/**
 * Verifies `vf-icon` — the Finder icon.
 *
 * Six groups, each covering a claim the component's doc comment makes:
 *
 *  - CELL: the reserved cell really is the icon resource's, 32×32 large and
 *    16×16 small, with the name plate on a whole-system-px line box and a
 *    whole-px gap — at dpr 1/2/3, where "whole" is the only thing that keeps
 *    the 1-bit art off half device pixels (layout contract rule 1).
 *  - SELECT: a plain press single-selects with NO container managing the set
 *    (the outside-press listener is what buys that), Shift adds, and a press
 *    outside every icon clears. The selected look is asserted as rendered
 *    style: the art inverts, the plate takes the --vf-highlight pair.
 *  - RENAME: the Finder gesture — a press on the plate of an ALREADY-selected
 *    icon opens the field with the whole name selected; the first press never
 *    does. Return commits and fires vf-change, Escape puts the old name back,
 *    and the plate widens as you type.
 *  - MOVABLE: that the parameter is `movable` and the platform's `draggable`
 *    is untouched — the trap the component exists to avoid — plus a drag and
 *    an arrow-key nudge landing on whole system px.
 *  - FOCUS: the dashed rule after Tab and NOT after a mouse press, which the
 *    host cannot get from :focus-visible because it focuses itself (SPEC §4).
 *  - ARIA: role and aria-selected appear with `selectable` and not without.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:icon
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

/** A 1×1 transparent PNG stands in for art: the cell is reserved, not measured. */
const ART32 =
  'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27%3E%3Crect width=%2732%27 height=%2732%27 fill=%27%23000%27/%3E%3C/svg%3E'
const ART16 =
  'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27%3E%3Crect width=%2716%27 height=%2716%27 fill=%27%23000%27/%3E%3C/svg%3E'

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await chromium.launch()

/** Markup FIRST, module SECOND — the upgrade order verify:scale depends on. */
async function build(markup, { dpr = 1 } = {}) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: dpr,
  })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:40px">${markup}`
  )
  await page.evaluate(() => import('/src/index.js'))
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('*')]
        .filter((e) => e.tagName.toLowerCase().startsWith('vf-'))
        .map((e) => e.updateComplete)
    )
  )
  await page.evaluate(() => document.fonts.ready)
  return page
}

const icon = (attrs = '', label = 'Read Me') =>
  `<vf-icon label="${label}" ${attrs}>
     <vf-img slot="large"><img src="${ART32}" alt=""></vf-img>
     <vf-img slot="small"><img src="${ART16}" alt=""></vf-img>
   </vf-icon>`

/** Rects of the host and the two inner boxes, in CSS px. */
const boxes = (page, index = 0) =>
  page.evaluate((i) => {
    const el = document.querySelectorAll('vf-icon')[i]
    const r = (b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })
    const art = el.shadowRoot.querySelector('.art')
    const label = el.shadowRoot.querySelector('.label')
    return {
      scale: parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale')),
      host: r(el.getBoundingClientRect()),
      art: r(art.getBoundingClientRect()),
      label: label ? r(label.getBoundingClientRect()) : null,
    }
  }, index)

// ── CELL ────────────────────────────────────────────────────────────────────
// The cell is the resource's, the plate's line box is whole system px, and the
// gap between them is the --vf-icon-gap default. Checked in DEVICE px, which is
// the unit that has to come out whole.
for (const dpr of [1, 2, 3]) {
  const page = await build(`${icon('selectable')}<hr>${icon('size="small"')}`, { dpr })
  const large = await boxes(page, 0)
  const small = await boxes(page, 1)

  const dev = (css) => css * large.scale === 0 ? 0 : css * dpr
  check(
    `CELL dpr${dpr}  large cell is 32 system px`,
    large.art.w === 32 * large.scale && large.art.h === 32 * large.scale,
    `${large.art.w}×${large.art.h} css at scale ${large.scale}`
  )
  check(
    `CELL dpr${dpr}  small cell is 16 system px`,
    small.art.w === 16 * small.scale && small.art.h === 16 * small.scale,
    `${small.art.w}×${small.art.h} css`
  )
  check(
    `CELL dpr${dpr}  plate line box is 16 system px`,
    large.label.h === 16 * large.scale,
    `${large.label.h} css`
  )
  check(
    `CELL dpr${dpr}  gap between cell and plate is 2 system px`,
    large.label.y - (large.art.y + large.art.h) === 2 * large.scale,
    `${large.label.y - (large.art.y + large.art.h)} css`
  )
  check(
    `CELL dpr${dpr}  every inner edge lands on a whole device px`,
    [large.art.h, large.label.h, large.label.y - large.art.y].every(
      (v) => Number.isInteger(Math.round(v * dpr * 1000) / 1000) && (v * dpr) % 1 === 0
    ),
    `art ${large.art.h * dpr}, plate ${large.label.h * dpr} device px`
  )
  await page.close()
}

// ── PARITY ──────────────────────────────────────────────────────────────────
// The cell is centered over the name, so the offset is whole exactly when the
// box is even. This asserts the rule the class doc states — an even declared
// `width` is exact, and an odd one is the case that needs applyGridSnap().
{
  const page = await build(
    `${icon('width="64"', 'Read Me')}
     ${icon('width="63"', 'Read Me')}
     ${icon('', 'Read Me')}`
  )
  const offsets = await page.evaluate(() =>
    [...document.querySelectorAll('vf-icon')].map((el) => {
      const s = parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale'))
      const f = el.shadowRoot.querySelector('.frame').getBoundingClientRect()
      const a = el.shadowRoot.querySelector('.art').getBoundingClientRect()
      return { box: f.width / s, offset: (a.x - f.x) / s }
    })
  )
  check(
    'PARITY  an even declared width centers the cell on a whole system px',
    offsets[0].box === 64 && offsets[0].offset % 1 === 0,
    `box ${offsets[0].box}, offset ${offsets[0].offset}`
  )
  check(
    'PARITY  an odd one lands on the half pixel the doc warns about',
    offsets[1].offset % 1 === 0.5,
    `box ${offsets[1].box}, offset ${offsets[1].offset}`
  )
  check(
    "PARITY  undeclared, the name's own width decides the box",
    offsets[2].box !== 64 && offsets[2].box === Math.round(offsets[2].box),
    `box ${offsets[2].box}, offset ${offsets[2].offset}`
  )
  await page.close()
}

// ── NAME ────────────────────────────────────────────────────────────────────
// System 7 capped an HFS filename at 31 characters and drew it in full — so a
// name is never abbreviated, never clipped, and never folded: one line, which
// overflows its cell rather than wrapping.
{
  const long = 'Quarterly Results Final v2 (2)!' // exactly 31 characters
  const page = await build(
    `${icon('width="64"', long)}${icon('width="64"', 'Read Me')}${icon('selectable editable', long)}`
  )
  const m = await page.evaluate(() =>
    [...document.querySelectorAll('vf-icon')].map((el) => {
      const s = parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale'))
      const label = el.shadowRoot.querySelector('.label')
      const plate = el.shadowRoot.querySelector('.name')
      const cs = getComputedStyle(label)
      return {
        text: label.textContent,
        lines: Math.round(label.getBoundingClientRect().height / (16 * s)),
        plateW: plate.getBoundingClientRect().width / s,
        overflow: cs.textOverflow,
        wrap: cs.whiteSpace,
      }
    })
  )
  check('NAME  the whole name is in the DOM, un-abbreviated', m[0].text === long, m[0].text)
  check('NAME  no ellipsis anywhere', m.every((r) => r.overflow === 'clip'), m[0].overflow)
  check(
    'NAME  a long name stays on ONE line',
    m.every((r) => r.lines === 1),
    m.map((r) => r.lines).join(',')
  )
  check(
    'NAME  it overflows the cell rather than folding into it',
    m[0].plateW > 64 && m[0].wrap === 'nowrap',
    `${m[0].plateW} system px in a 64 cell, white-space: ${m[0].wrap}`
  )

  // The 31-char cap bounds TYPING, not a label handed in from a data model.
  const over = `${long}-and-then-some`
  await page.evaluate((v) => { document.querySelectorAll('vf-icon')[2].label = v }, over)
  await page.evaluate(() => document.querySelectorAll('vf-icon')[2].updateComplete)
  check(
    'NAME  a label set from your own data is displayed as given, never truncated',
    (await page.evaluate(() =>
      document.querySelectorAll('vf-icon')[2].shadowRoot.querySelector('.label').textContent
    )) === over
  )
  check(
    'NAME  the rename field caps at the 31-char HFS limit',
    await page.evaluate(async () => {
      const el = document.querySelectorAll('vf-icon')[2]
      el.startEditing()
      await el.updateComplete
      return el.shadowRoot.querySelector('input').maxLength === 31
    })
  )
  await page.close()
}

// ── NAMELESS ────────────────────────────────────────────────────────────────
// An icon with no name is a real state — a freshly made one, waiting to be
// called something — so it has to stay usable: selectable, focusable, and
// above all renameable, which is the only way it stops being nameless.
{
  const page = await build(
    `<vf-icon id="none" selectable movable editable>
       <vf-img slot="large"><img src="${ART32}" alt="Untitled"></vf-img>
     </vf-icon>`
  )
  const el = () => page.locator('#none')
  const peek = () =>
    page.evaluate(() => {
      const i = document.getElementById('none')
      return {
        selected: i.selected,
        focused: document.activeElement === i,
        plate: !!i.shadowRoot.querySelector('.name'),
        input: !!i.shadowRoot.querySelector('input'),
        inputW: i.shadowRoot.querySelector('input')?.getBoundingClientRect().width ?? 0,
        scale: parseFloat(getComputedStyle(i).getPropertyValue('--vf-scale')),
      }
    })

  check('NAMELESS  no name means no plate', !(await peek()).plate)

  await el().click()
  const clicked = await peek()
  check('NAMELESS  it still selects from a press on the art', clicked.selected)
  check('NAMELESS  …and still takes focus', clicked.focused)

  await page.keyboard.press('Enter')
  await page.waitForTimeout(80)
  const editing = await peek()
  check('NAMELESS  Return opens the rename field, so it can be given a name', editing.input)
  check(
    'NAMELESS  the empty field is at least a cell wide, not a sliver',
    editing.inputW / editing.scale >= 32,
    `${editing.inputW / editing.scale} system px`
  )

  await page.keyboard.type('Untitled Folder')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(80)
  check(
    'NAMELESS  and naming it sticks',
    (await page.evaluate(() => document.getElementById('none').label)) === 'Untitled Folder'
  )
  await page.close()
}

// ── EMPTY ───────────────────────────────────────────────────────────────────
// A file has to be called something. System 7 refused an empty name, and so
// does this: the edit is dropped and the old name comes back.
{
  const page = await build(icon('selectable editable', 'Read Me'))
  await page.evaluate(() => {
    globalThis.__rejected = []
    globalThis.__changed = []
    document.addEventListener('vf-name-rejected', (e) => globalThis.__rejected.push(e.detail))
    document.addEventListener('vf-change', (e) => globalThis.__changed.push(e.detail))
  })

  const commit = (value) =>
    page.evaluate(async (v) => {
      const el = document.querySelector('vf-icon')
      el.startEditing()
      await el.updateComplete
      const i = el.shadowRoot.querySelector('input')
      i.value = v
      i.dispatchEvent(new Event('input', { bubbles: true }))
      await el.updateComplete
      el.commitEditing()
      await el.updateComplete
      return el.label
    }, value)

  check('EMPTY  committing nothing keeps the old name', (await commit('')) === 'Read Me')
  check(
    'EMPTY  a name of only spaces counts as nothing too',
    (await commit('   ')) === 'Read Me'
  )
  check(
    'EMPTY  the refusal is reported, and never as a change',
    await page.evaluate(
      () => globalThis.__rejected.length === 2 && globalThis.__changed.length === 0
    ),
    await page.evaluate(() => JSON.stringify(globalThis.__rejected[0]))
  )
  check(
    'EMPTY  …carrying what was tried and what was kept',
    await page.evaluate(
      () => globalThis.__rejected[0].kept === 'Read Me' && globalThis.__rejected[0].reason === 'empty'
    )
  )
  check('EMPTY  a real name still commits', (await commit('About This Mac')) === 'About This Mac')
  check(
    'EMPTY  …and that one does fire vf-change',
    await page.evaluate(() => globalThis.__changed.length === 1)
  )

  // An icon that was already nameless has nothing to put back, so nothing is
  // rejected either — it just stays nameless.
  await page.evaluate(async () => {
    globalThis.__rejected = []
    const el = document.querySelector('vf-icon')
    el.label = ''
    await el.updateComplete
    el.startEditing()
    await el.updateComplete
    el.commitEditing()
    await el.updateComplete
  })
  check(
    'EMPTY  a nameless icon left nameless reports nothing',
    await page.evaluate(
      () => globalThis.__rejected.length === 0 && document.querySelector('vf-icon').label === ''
    )
  )
  await page.close()
}

// ── STEADY ──────────────────────────────────────────────────────────────────
// Committing an edit must not move the name a pixel. The plate hugs its text in
// BOTH states, so a short name typed over a long one is already tight and
// centred while you type it, rather than sitting left-justified in an oversized
// field and jumping to the middle on commit.
{
  const page = await build(icon('selectable editable', 'Read Me'), { dpr: 1 })
  const probe = () =>
    page.evaluate(() => {
      const el = document.querySelector('vf-icon')
      const s = parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale'))
      const frame = el.shadowRoot.querySelector('.frame').getBoundingClientRect()
      const plate = el.shadowRoot.querySelector('.name')
      const input = el.shadowRoot.querySelector('input')
      const sys = (v) => +(v / s).toFixed(3)
      const r = document.createRange()
      r.selectNodeContents(plate)
      return {
        plateW: sys(plate.getBoundingClientRect().width),
        plateX: sys(plate.getBoundingClientRect().x - frame.x),
        textX: plate.firstChild ? sys(r.getBoundingClientRect().x - frame.x) : null,
        // Where the field's own run starts — what you actually see while typing.
        fieldTextX: input
          ? sys(input.getBoundingClientRect().x - frame.x) + 2
          : null,
      }
    })

  await page.evaluate(async () => {
    const el = document.querySelector('vf-icon')
    el.startEditing()
    await el.updateComplete
  })
  await page.keyboard.type('Hi')
  await page.waitForTimeout(80)
  const typing = await probe()
  check(
    'STEADY  a short name typed in is already tight, not left in a wide field',
    typing.plateW <= 16,
    `plate ${typing.plateW} system px for "Hi"`
  )
  check(
    'STEADY  the field and the plate put their text in the same place',
    typing.fieldTextX === typing.textX,
    `field ${typing.fieldTextX} vs plate ${typing.textX}`
  )

  await page.keyboard.press('Enter')
  await page.waitForTimeout(80)
  const committed = await probe()
  check(
    'STEADY  committing moves the name not one pixel',
    committed.textX === typing.textX && committed.plateX === typing.plateX,
    `text ${typing.textX} → ${committed.textX}, plate x ${typing.plateX} → ${committed.plateX}`
  )
  check(
    'STEADY  …and the plate is the same box either side of the commit',
    committed.plateW === typing.plateW,
    `${typing.plateW} → ${committed.plateW}`
  )
  await page.close()
}

// ── WELL ────────────────────────────────────────────────────────────────────
// The rename field boxes a highlighted name rather than letting it touch the
// frame: one whole pixel of white well between the black border and the black
// selection, on all four sides. Read off the pixels with the scale pinned to 1,
// so one device pixel is one system pixel and the rows can just be counted.
{
  const page = await build(
    `<style>:root { --vf-scale: 1 }</style>
     <div style="background:#888;padding:24px">${icon('selectable editable', 'selected')}</div>`
  )
  await page.evaluate(async () => {
    const el = document.querySelector('vf-icon')
    el.startEditing()
    await el.updateComplete
  })
  await page.waitForTimeout(120)

  const rect = await page.evaluate(() => {
    const b = document
      .querySelector('vf-icon')
      .shadowRoot.querySelector('input')
      .getBoundingClientRect()
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  })
  const shot = await page.screenshot()
  const scan = await page.evaluate(
    async ([b64, r]) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const at = (x, y) => {
        const d = ctx.getImageData(x, y, 1, 1).data
        return d[0] > 200 ? 'W' : d[0] < 60 ? 'B' : '.'
      }
      // Sample across the run, skipping the rounded-up slack at the far end.
      const xs = []
      for (let x = r.x + 2; x < r.x + r.w - 4; x++) xs.push(x)
      return {
        topBorder: xs.every((x) => at(x, r.y) === 'B'),
        topWell: xs.every((x) => at(x, r.y + 1) === 'W'),
        bottomWell: xs.every((x) => at(x, r.y + r.h - 2) === 'W'),
        bottomBorder: xs.every((x) => at(x, r.y + r.h - 1) === 'B'),
        // …and the same going across, on the row through the selection.
        leftBorder: at(r.x, r.y + Math.floor(r.h / 2)) === 'B',
        leftWell: at(r.x + 1, r.y + Math.floor(r.h / 2)) === 'W',
      }
    },
    [shot.toString('base64'), rect]
  )
  check(
    'WELL  a whole white row inside the border, above and below the selection',
    scan.topBorder && scan.topWell && scan.bottomWell && scan.bottomBorder,
    JSON.stringify(scan)
  )
  check(
    'WELL  and a whole white column inside it either side',
    scan.leftBorder && scan.leftWell,
    JSON.stringify(scan)
  )
  await page.close()
}

// ── TOO LONG ────────────────────────────────────────────────────────────────
// Going past the limit is reported rather than silently swallowed, so a host
// can raise the alert System 7 raised. Both routes: a keystroke at the cap
// (which fires beforeinput and then no input at all) and a paste that
// overshoots (which reaches input already trimmed).
{
  const page = await build(icon('selectable editable', 'Read Me'))
  await page.evaluate(async () => {
    globalThis.__long = []
    document.addEventListener('vf-name-too-long', (e) => globalThis.__long.push(e.detail))
    const el = document.querySelector('vf-icon')
    el.startEditing()
    await el.updateComplete
    const i = el.shadowRoot.querySelector('input')
    i.value = 'x'.repeat(31)
    i.setSelectionRange(31, 31)
    i.focus()
  })

  await page.keyboard.type('Z')
  await page.waitForTimeout(60)
  const typed = await page.evaluate(() => globalThis.__long)
  check(
    'TOO LONG  a keystroke at the cap reports the attempt',
    typed.length === 1 && typed[0].limit === 31 && typed[0].attempted.length === 32,
    JSON.stringify(typed[0] ?? null)
  )
  check(
    'TOO LONG  it carries both what was tried and what was kept',
    typed[0]?.attempted === 'x'.repeat(31) + 'Z' && typed[0]?.accepted === 'x'.repeat(31),
    `accepted ${typed[0]?.accepted?.length} chars`
  )
  check(
    'TOO LONG  and the field still refuses the character',
    (await page.evaluate(() =>
      document.querySelector('vf-icon').shadowRoot.querySelector('input').value
    )) === 'x'.repeat(31)
  )

  // A paste that overshoots from an empty field. It has to be a REAL one: a
  // synthesized ClipboardEvent is untrusted, so Chromium performs no paste and
  // fires no beforeinput — the thing being tested never happens.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(async () => {
    globalThis.__long = []
    await navigator.clipboard.writeText('A'.repeat(50))
    const i = document.querySelector('vf-icon').shadowRoot.querySelector('input')
    i.value = ''
    i.focus()
    i.setSelectionRange(0, 0)
  })
  await page.keyboard.press('ControlOrMeta+V')
  await page.waitForTimeout(80)
  const pasted = await page.evaluate(() => globalThis.__long)
  check(
    'TOO LONG  an overshooting paste reports it too',
    pasted.length >= 1 && pasted[0].attempted.length === 50,
    JSON.stringify(pasted[0] ?? null)
  )
  check(
    'TOO LONG  …and the field keeps only what fits',
    (await page.evaluate(() =>
      document.querySelector('vf-icon').shadowRoot.querySelector('input').value
    )) === 'A'.repeat(31)
  )

  // A deletion never reports.
  await page.evaluate(() => { globalThis.__long = [] })
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(60)
  check(
    'TOO LONG  a deletion reports nothing',
    (await page.evaluate(() => globalThis.__long.length)) === 0
  )

  // Setting an over-long label from code is the consumer's own data: no event.
  await page.evaluate(async () => {
    globalThis.__long = []
    const el = document.querySelector('vf-icon')
    el.cancelEditing()
    el.label = 'B'.repeat(60)
    await el.updateComplete
  })
  check(
    'TOO LONG  a label set from code is left alone and reports nothing',
    await page.evaluate(
      () => globalThis.__long.length === 0 && document.querySelector('vf-icon').label.length === 60
    )
  )
  await page.close()
}

// ── CRISP ───────────────────────────────────────────────────────────────────
// The alignment guarantee, asserted twice over: as geometry, and as the pixels
// that geometry produces.
//
// The frame centers two things over one axis, and a centered child's offset is
// (box − child) / 2 — whole exactly when box and child share a parity. The cell
// is 32 or 16 and a declared width is required even, so sizing the plate to a
// whole EVEN number of system px makes every offset in the component whole by
// construction. Nothing is corrected, nothing is snapped, and the kit's normal
// antialiasing is left on — with the run on whole pixels there is nothing for
// it to smooth, so a single gray pixel means the geometry slipped.
//
// These names are chosen to span the cases: shorter than the cell, longer than
// it, odd and even natural widths, and one that used to fringe (`sdlkfsdf`).
const CRISP_NAMES = ['sdlkfsdf', 'Read Me', 'System Folder', 'abcd', 'Macintosh HD', 'a']

/** Gray = neither black nor white: exactly the fringe, straight off the pixels. */
const grayPixels = async (page) => {
  const shot = await page.screenshot()
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]
      if (r === d[i + 1] && r === d[i + 2] && r > 8 && r < 247) n++
    }
    return n
  }, shot.toString('base64'))
}

const field = (extra = '') =>
  extra + CRISP_NAMES.map((n) => `<div style="padding:8px">${icon('width="64"', n)}</div>`).join('')

for (const dpr of [1, 2, 3]) {
  // Both with a declared cell (the plate centers inside it) and without (the
  // plate sizes the box and the ART centers inside that) — the two directions
  // the parity argument has to hold in.
  for (const declared of [true, false]) {
    const page = await build(
      CRISP_NAMES.map(
        (n) => `<div style="padding:8px">${icon(declared ? 'width="64"' : '', n)}</div>`
      ).join(''),
      { dpr }
    )
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('vf-icon')].map((el) => {
        const s = parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale'))
        const frame = el.shadowRoot.querySelector('.frame').getBoundingClientRect()
        const art = el.shadowRoot.querySelector('.art').getBoundingClientRect()
        const plate = el.shadowRoot.querySelector('.name')
        const pr = plate.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(plate)
        const text = range.getBoundingClientRect()
        const sys = (v) => +(v / s).toFixed(4)
        return {
          name: el.label,
          plateW: sys(pr.width),
          artX: sys(art.x - frame.x),
          plateX: sys(pr.x - frame.x),
          textX: sys(text.x - frame.x),
          artCentre: sys(art.x + art.width / 2 - frame.x),
          plateCentre: sys(pr.x + pr.width / 2 - frame.x),
        }
      })
    )
    const off = rows.filter(
      (r) => r.plateW % 2 || r.artX % 1 || r.plateX % 1 || r.textX % 1
    )
    check(
      `CRISP dpr${dpr} ${declared ? 'width=64' : 'auto   '}  plate even, art/plate/text all on whole system px`,
      off.length === 0,
      off.length ? JSON.stringify(off) : rows.map((r) => `${r.plateW}@${r.textX}`).join(' ')
    )
    // The name hangs off ONE axis with the art, including when it is wider
    // than the cell — where it has to straddle the centre line rather than
    // start at the cell's left edge and run off to the right.
    const skewed = rows.filter((r) => r.artCentre !== r.plateCentre)
    check(
      `CRISP dpr${dpr} ${declared ? 'width=64' : 'auto   '}  art and name share one centre axis`,
      skewed.length === 0 && rows.some((r) => r.plateW > 64),
      skewed.length
        ? JSON.stringify(skewed)
        : `all on ${rows[0].artCentre}, incl. a ${Math.max(...rows.map((r) => r.plateW))}px name`
    )
    check(
      `CRISP dpr${dpr} ${declared ? 'width=64' : 'auto   '}  and not one gray pixel, with smoothing left ON`,
      (await grayPixels(page)) === 0,
      `${await grayPixels(page)} gray px`
    )
    await page.close()
  }
}

// The check has teeth: break the parity the component maintains — an odd plate
// — and the fringe must come straight back. Otherwise "0 gray pixels" could be
// passing for some unrelated reason and would never catch a regression.
{
  const page = await build(
    field(`<style>vf-icon::part(plate) { width: calc(var(--vf-scale, 1) * 39px) }</style>`)
  )
  const grays = await grayPixels(page)
  check(
    'CRISP  an odd plate width brings the fringe back (the check has teeth)',
    grays > 0,
    `${grays} gray px once the plate is forced odd`
  )
  await page.close()
}

// ── SELECT ──────────────────────────────────────────────────────────────────
{
  const page = await build(
    `<div id="field">${icon('selectable', 'One')}${icon('selectable', 'Two')}</div>
     <div id="elsewhere" style="height:60px">outside</div>`
  )
  const flags = () =>
    page.evaluate(() => [...document.querySelectorAll('vf-icon')].map((i) => i.selected))
  const events = await page.evaluate(() => {
    globalThis.__log = []
    document.addEventListener('vf-select', (e) => globalThis.__log.push(e.detail.selected))
    return true
  })

  await page.locator('vf-icon').first().click()
  check('SELECT  a press selects', (await flags())[0] === true)

  await page.locator('vf-icon').nth(1).click()
  check(
    'SELECT  pressing another single-selects, with no container involved',
    JSON.stringify(await flags()) === '[false,true]',
    JSON.stringify(await flags())
  )

  await page.locator('vf-icon').first().click({ modifiers: ['Shift'] })
  check(
    'SELECT  Shift adds rather than replaces',
    JSON.stringify(await flags()) === '[true,true]',
    JSON.stringify(await flags())
  )

  await page.locator('#elsewhere').click()
  check(
    'SELECT  a press outside every icon clears',
    JSON.stringify(await flags()) === '[false,false]',
    JSON.stringify(await flags())
  )

  check(
    'SELECT  every change emitted vf-select',
    (await page.evaluate(() => globalThis.__log.length)) === 6,
    `${await page.evaluate(() => globalThis.__log.join(','))}`
  )

  // The rendered selected look, not the attribute.
  await page.locator('vf-icon').first().click()
  const look = await page.evaluate(() => {
    const el = document.querySelector('vf-icon')
    const art = getComputedStyle(el.shadowRoot.querySelector('.art'))
    // The ink is on the inline .name run, not the .label block — that is what
    // gives each wrapped line its own plate.
    const plate = getComputedStyle(el.shadowRoot.querySelector('.name'))
    return { filter: art.filter, bg: plate.backgroundColor, color: plate.color }
  })
  check('SELECT  the art inverts', look.filter === 'invert(1)', look.filter)
  check(
    'SELECT  the plate takes the kit highlight pair',
    look.bg === 'rgb(0, 0, 0)' && look.color === 'rgb(255, 255, 255)',
    `${look.bg} on ${look.color}`
  )
  await page.close()
}

// ── RENAME ──────────────────────────────────────────────────────────────────
{
  const page = await build(icon('selectable editable', 'Read Me'))
  await page.evaluate(() => {
    globalThis.__changes = []
    document.addEventListener('vf-change', (e) => globalThis.__changes.push(e.detail))
  })
  const plate = () =>
    page.evaluate(() => {
      const el = document.querySelector('vf-icon')
      const b = el.shadowRoot.querySelector('.label').getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width }
    })
  const editing = () =>
    page.evaluate(() => !!document.querySelector('vf-icon').shadowRoot.querySelector('input'))

  // First press selects and must NOT open the field.
  let p = await plate()
  await page.mouse.click(p.x, p.y)
  check('RENAME  the press that selects never starts an edit', (await editing()) === false)

  // Second press on the plate does.
  await page.mouse.click(p.x, p.y)
  check('RENAME  a press on an already-selected plate opens the field', await editing())
  check(
    'RENAME  the whole name starts selected',
    await page.evaluate(() => {
      const i = document.querySelector('vf-icon').shadowRoot.querySelector('input')
      return i.selectionStart === 0 && i.selectionEnd === i.value.length && i.value === 'Read Me'
    })
  )

  const before = (await plate()).w
  await page.keyboard.type('Read Me First and Then Some')
  await page.waitForTimeout(60)
  check(
    'RENAME  the plate widens as you type',
    (await plate()).w > before,
    `${before} → ${(await plate()).w}`
  )

  await page.keyboard.press('Enter')
  await page.waitForTimeout(60)
  check('RENAME  Return closes the field', (await editing()) === false)
  check(
    'RENAME  Return commits the name and fires vf-change',
    await page.evaluate(
      () =>
        document.querySelector('vf-icon').label === 'Read Me First and Then Some' &&
        globalThis.__changes.length === 1 &&
        globalThis.__changes[0].previous === 'Read Me'
    )
  )

  // Escape reverts.
  p = await plate()
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(60)
  await page.keyboard.type('Discarded')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(60)
  check(
    'RENAME  Escape puts the old name back and fires nothing',
    await page.evaluate(
      () =>
        document.querySelector('vf-icon').label === 'Read Me First and Then Some' &&
        globalThis.__changes.length === 1
    ),
    await page.evaluate(() => document.querySelector('vf-icon').label)
  )
  await page.close()
}

// ── MOVABLE ─────────────────────────────────────────────────────────────────
{
  // A sized, positioned container — a vf-desktop or a window body — so the
  // clamp has a real range. A bare one collapses when the icon goes absolute,
  // which is the case `clamp()` in the component leaves alone.
  const page = await build(
    `<div id="desk" style="position:relative;width:600px;height:400px">
       ${icon('movable selectable', 'Drag Me')}
     </div>`
  )
  check(
    'MOVABLE  the parameter is `movable`',
    await page.evaluate(() => document.querySelector('vf-icon').hasAttribute('movable'))
  )
  check(
    'MOVABLE  the platform `draggable` attribute is never written',
    await page.evaluate(() => !document.querySelector('vf-icon').hasAttribute('draggable'))
  )
  check(
    "MOVABLE  HTMLElement's own `draggable` accessor still reads through",
    await page.evaluate(() => {
      const el = document.querySelector('vf-icon')
      return el.draggable === false && !Object.hasOwn(el, 'draggable')
    })
  )

  const at = () =>
    page.evaluate(() => {
      const el = document.querySelector('vf-icon')
      const b = el.getBoundingClientRect()
      return { x: b.x, y: b.y, scale: parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale')) }
    })
  const start = await at()
  await page.mouse.move(start.x + 10, start.y + 10)
  await page.mouse.down()
  // A fractional move, the way a trackpad reports one.
  await page.mouse.move(start.x + 60.4, start.y + 43.7, { steps: 4 })
  await page.mouse.up()
  const moved = await at()
  check(
    'MOVABLE  a drag moves the icon on both axes',
    moved.x > start.x && moved.y > start.y,
    `${start.x},${start.y} → ${moved.x},${moved.y}`
  )
  // The written origin, not the viewport rect: `left`/`top` are what the drag
  // snaps, and they are relative to the container — whose own origin the page
  // owns (contract rule 3, and what applyGridSnap() corrects for).
  const origin = await page.evaluate(() => {
    const el = document.querySelector('vf-icon')
    const s = parseFloat(getComputedStyle(el).getPropertyValue('--vf-scale'))
    return { left: parseFloat(el.style.left) / s, top: parseFloat(el.style.top) / s }
  })
  check(
    'MOVABLE  a fractional drag still lands on whole system px',
    origin.left % 1 === 0 && origin.top % 1 === 0,
    `${origin.left}, ${origin.top} system px`
  )

  await page.evaluate(() => document.querySelector('vf-icon').focus())
  const beforeNudge = await at()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(40)
  const nudged = await at()
  check(
    'MOVABLE  an arrow key nudges one system px',
    nudged.x - beforeNudge.x === nudged.scale,
    `${nudged.x - beforeNudge.x} css px at scale ${nudged.scale}`
  )
  await page.keyboard.press('Shift+ArrowRight')
  await page.waitForTimeout(40)
  const coarse = await at()
  check(
    'MOVABLE  Shift+arrow nudges eight',
    coarse.x - nudged.x === 8 * nudged.scale,
    `${coarse.x - nudged.x} css px`
  )

  // Dragged hard past the far edge, the whole icon stays inside the container.
  await page.mouse.move(coarse.x + 10, coarse.y + 10)
  await page.mouse.down()
  await page.mouse.move(coarse.x + 4000, coarse.y + 4000, { steps: 4 })
  await page.mouse.up()
  const pinned = await page.evaluate(() => {
    const el = document.querySelector('vf-icon')
    const b = el.getBoundingClientRect()
    const d = document.getElementById('desk').getBoundingClientRect()
    return { right: b.right <= d.right, bottom: b.bottom <= d.bottom }
  })
  check(
    'MOVABLE  the whole icon stays inside its container',
    pinned.right && pinned.bottom,
    JSON.stringify(pinned)
  )
  await page.close()
}

// A Trash in the corner: anchored with right/bottom rather than left/top. An
// auto-width absolute box with BOTH edges set spans them, so a seed that did
// not release the far edges would widen the icon instead of moving it.
{
  const page = await build(
    `<div id="desk" style="position:relative;width:600px;height:400px">
       <vf-icon label="Trash" width="64" movable style="position:absolute;right:8px;bottom:8px">
         <vf-img slot="large"><img src="${ART32}" alt=""></vf-img>
       </vf-icon>
     </div>`
  )
  const w = () => page.evaluate(() => document.querySelector('vf-icon').getBoundingClientRect().width)
  const before = await w()
  const b = await page.evaluate(() => {
    const r = document.querySelector('vf-icon').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + 10 }
  })
  await page.mouse.move(b.x, b.y)
  await page.mouse.down()
  await page.mouse.move(b.x - 80, b.y - 60, { steps: 4 })
  await page.mouse.up()
  check(
    'MOVABLE  a right/bottom-anchored icon moves instead of stretching',
    (await w()) === before,
    `${before} → ${await w()}`
  )
  await page.close()
}

// ── FOCUS ───────────────────────────────────────────────────────────────────
{
  const page = await build(`<button id="before">before</button>${icon('selectable editable')}`)
  const ruled = () =>
    page.evaluate(() =>
      document
        .querySelector('vf-icon')
        .shadowRoot.querySelector('.caption')
        .classList.contains('focus-rule')
    )

  await page.locator('#before').focus()
  await page.keyboard.press('Tab')
  await page.waitForTimeout(40)
  check('FOCUS  Tab draws the dashed rule', await ruled())

  await page.locator('vf-icon').click()
  await page.waitForTimeout(40)
  check('FOCUS  a mouse press does not', (await ruled()) === false)

  await page.keyboard.press('Space')
  await page.waitForTimeout(40)
  check('FOCUS  a key after a click reveals it', await ruled())
  await page.close()
}

// ── ARIA ────────────────────────────────────────────────────────────────────
{
  const page = await build(`${icon('selectable')}${icon('')}`)
  const attrs = (i) =>
    page.evaluate((n) => {
      const el = document.querySelectorAll('vf-icon')[n]
      return {
        role: el.getAttribute('role'),
        selected: el.getAttribute('aria-selected'),
        tabindex: el.getAttribute('tabindex'),
      }
    }, i)
  const on = await attrs(0)
  const off = await attrs(1)
  check(
    'ARIA  selectable takes role=option + aria-selected + a tab stop',
    on.role === 'option' && on.selected === 'false' && on.tabindex === '0',
    JSON.stringify(on)
  )
  check(
    'ARIA  a plain icon takes no role and no tab stop',
    off.role === null && off.selected === null && off.tabindex === null,
    JSON.stringify(off)
  )
  await page.close()
}

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
