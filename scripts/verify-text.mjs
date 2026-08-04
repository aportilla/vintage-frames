/**
 * Verifies the two static-text components, `vf-label` and `vf-paragraph`.
 *
 * They exist for one reason: text is what puts a page off the device-pixel
 * grid. A ratio `line-height` resolves to whatever it resolves to (17px × 1.65
 * = 28.05px) and every line of prose nudges what follows further off, until the
 * 1-bit borders and bitmap stems below it smear across two device rows. These
 * two components state their line box in whole system px instead, so a column
 * of copy accumulates whole offsets. Four groups:
 *
 *  - LINE BOX: a paragraph's height is exactly `lines × 20` system px (16 under
 *    size="small"), a label's exactly 16 — the claim everything else rests on.
 *  - DRIFT: the A/B. Six paragraphs inside a container with a ratio leading all
 *    land on whole device pixels; six plain `<p>`s in the same container drift
 *    off it. If this ever reads "both clean", the fixture stopped reproducing
 *    the fault and the check is worthless.
 *  - FACE: each component's default face (label = chrome, paragraph = body),
 *    the `face` override that swaps them, `size="small"`, and `dim`.
 *  - FOR: the label/control wiring — click-to-focus, the accessible name it
 *    hands a vf-* control (and the aria-labelledby it uses for anything else),
 *    that it never overwrites a name the consumer set, that a caption filled in
 *    after upgrade still lands, and that removing the label puts it back.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:text
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

/** Headless Chromium runs at dpr 1, so the default scale is 3/1. */
const S = 3

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await chromium.launch()

/** Markup FIRST, module SECOND — the same upgrade order as the other scripts. */
async function build(markup) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${markup}`)
  await page.evaluate(() => import('/src/index.js'))
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('*')]
        .filter((e) => e.tagName.toLowerCase().startsWith('vf-'))
        .map((e) => e.updateComplete)
    )
  )
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  return page
}

const heightOf = (page, id) =>
  page.evaluate((i) => document.getElementById(i).getBoundingClientRect().height, id)

/* ── LINE BOX ─────────────────────────────────────────────────────────────
   Widths are chosen to force a known number of line boxes; the assertion is
   that the height is exactly that many whole system px, with nothing left over
   from half-leading or a font's own metrics. */

{
  const page = await build(`
    <div style="width: 900px">
      <vf-paragraph id="one">One line of copy.</vf-paragraph>
    </div>
    <div style="width: 300px">
      <vf-paragraph id="wrapped">
        A run of copy long enough to wrap onto several line boxes inside this
        narrow column, which is the case a ratio leading gets wrong.
      </vf-paragraph>
      <vf-paragraph id="fine" size="small">
        The same again, in the kit's fine print, which rides a tighter line box.
      </vf-paragraph>
    </div>
    <vf-label id="cap">Name:</vf-label>
  `)

  const one = await heightOf(page, 'one')
  check('paragraph: one line is exactly 20 system px', one === 20 * S, `${one}px`)

  const wrapped = await heightOf(page, 'wrapped')
  check(
    'paragraph: a wrapped run is a whole multiple of 20 system px',
    wrapped % (20 * S) === 0 && wrapped > 20 * S,
    `${wrapped}px = ${wrapped / (20 * S)} lines`
  )

  const fine = await heightOf(page, 'fine')
  check(
    'paragraph: size="small" rides a whole multiple of 16 system px',
    fine % (16 * S) === 0 && fine > 16 * S,
    `${fine}px = ${fine / (16 * S)} lines`
  )

  const cap = await heightOf(page, 'cap')
  check('label: exactly 16 system px tall (the faces’ own em)', cap === 16 * S, `${cap}px`)

  await page.close()
}

/* ── DRIFT ───────────────────────────────────────────────────────────────── */

{
  // The classic host-page mistake: a ratio leading on the container. The plain
  // <p>s inherit it and drift; the components state their own line box.
  const page = await build(`
    <div id="col" style="width: 420px; font-size: 17px; line-height: 1.65">
      ${Array.from({ length: 6 }, (_, i) => `<vf-paragraph class="vf">Paragraph ${i}.</vf-paragraph>`).join('')}
      ${Array.from({ length: 6 }, (_, i) => `<p class="plain" style="margin:0">Paragraph ${i}.</p>`).join('')}
    </div>
  `)

  const drift = await page.evaluate(() => {
    const offGrid = (sel) =>
      [...document.querySelectorAll(sel)].filter((el) => {
        const y = el.getBoundingClientRect().top * window.devicePixelRatio
        return Math.abs(y - Math.round(y)) > 1e-6
      }).length
    return { vf: offGrid('.vf'), plain: offGrid('.plain') }
  })

  check(
    'drift: every vf-paragraph lands on a whole device pixel',
    drift.vf === 0,
    `${6 - drift.vf}/6 on grid`
  )
  check(
    'drift: the plain <p>s in the same column do NOT (fixture still bites)',
    drift.plain > 0,
    `${drift.plain}/6 off grid`
  )

  await page.close()
}

/* ── FACE ─────────────────────────────────────────────────────────────────── */

{
  const page = await build(`
    <vf-label id="l-default">Caption</vf-label>
    <vf-label id="l-body" face="body">Caption</vf-label>
    <vf-label id="l-dim" dim>Caption</vf-label>
    <vf-paragraph id="p-default">Copy</vf-paragraph>
    <vf-paragraph id="p-display" face="display">Copy</vf-paragraph>
    <vf-paragraph id="p-small" size="small">Copy</vf-paragraph>
  `)

  const styles = await page.evaluate(() =>
    Object.fromEntries(
      ['l-default', 'l-body', 'l-dim', 'p-default', 'p-display', 'p-small'].map((id) => {
        const cs = getComputedStyle(document.getElementById(id))
        return [
          id,
          {
            family: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
            size: cs.fontSize,
            smoothing: cs.getPropertyValue('-webkit-font-smoothing'),
            color: cs.color,
          },
        ]
      })
    )
  )

  check(
    'label: chrome face by default',
    styles['l-default'].family === 'Chicago' && styles['l-default'].smoothing === 'none',
    `${styles['l-default'].family} / smoothing ${styles['l-default'].smoothing}`
  )
  check(
    'label: face="body" switches to the body face',
    styles['l-body'].family === 'FindersKeepers',
    styles['l-body'].family
  )
  check(
    'label: dim greys the text to --vf-disabled',
    styles['l-dim'].color === 'rgb(192, 192, 192)',
    styles['l-dim'].color
  )
  check(
    'paragraph: body face by default',
    styles['p-default'].family === 'FindersKeepers',
    styles['p-default'].family
  )
  check(
    'paragraph: face="display" switches to the chrome face',
    styles['p-display'].family === 'Chicago' && styles['p-display'].smoothing === 'none',
    `${styles['p-display'].family} / smoothing ${styles['p-display'].smoothing}`
  )
  check(
    'paragraph: size="small" is the 12px fine print, scaled',
    styles['p-small'].size === `${12 * S}px`,
    styles['p-small'].size
  )

  await page.close()
}

/* ── FOR ──────────────────────────────────────────────────────────────────── */

{
  const page = await build(`
    <vf-label id="cap-name" for="fld-name">Name:</vf-label>
    <vf-text-field id="fld-name"></vf-text-field>

    <vf-label id="cap-volume" for="fld-volume">Level:</vf-label>
    <vf-slider id="fld-volume" label="Volume level"></vf-slider>

    <vf-label id="cap-off" for="fld-off">Locked:</vf-label>
    <vf-text-field id="fld-off" disabled></vf-text-field>

    <vf-label id="cap-native" for="fld-native">Age</vf-label>
    <input id="fld-native" />
  `)

  const name = await page.evaluate(() => ({
    prop: document.getElementById('fld-name').label,
    aria: document
      .getElementById('fld-name')
      .shadowRoot.querySelector('input')
      .getAttribute('aria-label'),
  }))
  check(
    'for: the caption becomes the control’s accessible name, inside its shadow root',
    name.prop === 'Name:' && name.aria === 'Name:',
    `label="${name.prop}" aria-label="${name.aria}"`
  )

  const kept = await page.evaluate(() => document.getElementById('fld-volume').label)
  check('for: a name the consumer set is never overwritten', kept === 'Volume level', kept)

  const native = await page.evaluate(() =>
    document.getElementById('fld-native').getAttribute('aria-labelledby')
  )
  check(
    'for: a native control is named by aria-labelledby instead',
    native === 'cap-native',
    `aria-labelledby="${native}"`
  )

  await page.click('#cap-name')
  const focused = await page.evaluate(() => document.activeElement?.id)
  check('for: clicking the caption focuses the control', focused === 'fld-name', `#${focused}`)

  await page.click('#cap-off')
  const stillFocused = await page.evaluate(() => document.activeElement?.id)
  check(
    'for: clicking a disabled control’s caption focuses nothing',
    stillFocused !== 'fld-off',
    `#${stillFocused}`
  )

  // The caption text arriving after the label upgrades — the order a component
  // defined before the page parses always sees.
  const late = await page.evaluate(async () => {
    const field = document.createElement('vf-text-field')
    field.id = 'fld-late'
    const label = document.createElement('vf-label')
    label.setAttribute('for', 'fld-late')
    document.body.append(field, label)
    await label.updateComplete
    label.textContent = 'Later:'
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return field.label
  })
  check('for: a caption filled in after upgrade still names the control', late === 'Later:', late)

  const restored = await page.evaluate(() => {
    const label = document.getElementById('cap-name')
    label.remove()
    return {
      prop: document.getElementById('fld-name').label,
      aria: document.getElementById('fld-native').getAttribute('aria-labelledby'),
    }
  })
  check(
    'for: removing the label hands the name back',
    restored.prop === '' && restored.aria === 'cap-native',
    `label="${restored.prop}"`
  )

  await page.close()
}

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
