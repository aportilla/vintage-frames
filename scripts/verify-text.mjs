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
 *  - LINE BOX: text wraps at the face's native System 7 pitch — body copy at
 *    `lines × 12` system px (Geneva 9's strike line), chrome copy and captions
 *    at `lines × 16` (Chicago 12's) — the claim everything else rests on.
 *  - FACE PITCH: the pitch is the face's, not the component's — the
 *    `--vf-line-height` / `--vf-line-height-display` face tokens move every
 *    wrap site at once (paragraph, label, the text area's rows), and the
 *    per-component tokens still override them for their component alone.
 *  - DECLARED BOX: `width` is the measure a paragraph wraps to and `height` a
 *    box its copy overflows rather than grows — the DITL static-text rectangle
 *    a placed dialog layout states; both live against --vf-scale, both undone
 *    by removing the attribute.
 *  - DRIFT: the A/B. Six paragraphs inside a container with a ratio leading all
 *    land on whole device pixels; six plain `<p>`s in the same container drift
 *    off it. If this ever reads "both clean", the fixture stopped reproducing
 *    the fault and the check is worthless.
 *  - FACE: each component's default face (label = chrome, paragraph = body),
 *    the `face` override that swaps them, and `dim`.
 *  - FOR: the label/control wiring — click-to-focus, the accessible name it
 *    hands a vf-* control (and the aria-labelledby it uses for anything else),
 *    that it never overwrites a name the consumer set, that a caption filled in
 *    after upgrade still lands, and that removing the label puts it back.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:text
 */
import { SCALE, check, launch, makeBuild, report } from './harness.mjs'

/** Headless Chromium runs at dpr 1, where the kit derives 1 device px per system px. */
const S = SCALE

const browser = await launch()

/** Markup FIRST, module SECOND — the same upgrade order as the other scripts. */
const build = makeBuild(browser, { settle: true })
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
    </div>
    <div style="width: 300px">
      <vf-paragraph id="chrome" face="display">
        A run of chrome copy long enough to wrap onto several line boxes
        inside this narrow column, the way an alert's copy does.
      </vf-paragraph>
    </div>
    <vf-label id="cap">Name:</vf-label>
    <vf-label id="fine" face="body">Approximate disk space needed: 4,584K</vf-label>
  `)

  const one = await heightOf(page, 'one')
  check(
    'paragraph: one line is exactly 12 system px (Geneva 9’s native line)',
    one === 12 * S,
    `${one}px`
  )

  const wrapped = await heightOf(page, 'wrapped')
  check(
    'paragraph: a wrapped run is a whole multiple of 12 system px',
    wrapped % (12 * S) === 0 && wrapped > 12 * S,
    `${wrapped}px = ${wrapped / (12 * S)} lines`
  )

  const chrome = await heightOf(page, 'chrome')
  check(
    'paragraph[face=display]: chrome copy wraps at 16 system px (Chicago 12’s native line)',
    chrome % (16 * S) === 0 && chrome > 16 * S,
    `${chrome}px = ${chrome / (16 * S)} lines`
  )

  const cap = await heightOf(page, 'cap')
  check('label: exactly 16 system px tall (Chicago 12’s line, the faces’ em)', cap === 16 * S, `${cap}px`)

  const fine = await heightOf(page, 'fine')
  check(
    'label[face=body]: fine print sits on 12 system px (Geneva 9’s native line)',
    fine === 12 * S,
    `${fine}px`
  )

  await page.close()
}

/* ── FACE PITCH ───────────────────────────────────────────────────────────
   Retheming a face states family, size and line together: the face tokens
   are what the wrap sites read, under the per-component overrides. Values
   here are arbitrary-but-even (see the token docs on why even). */

{
  const page = await build(`
    <div style="--vf-line-height: 14px; --vf-line-height-display: 18px">
      <vf-paragraph id="fp-body">One line of copy.</vf-paragraph>
      <vf-paragraph id="fp-display" face="display">One line of copy.</vf-paragraph>
      <vf-label id="fp-label">Caption</vf-label>
      <vf-label id="fp-fine" face="body">Fine print</vf-label>
      <vf-paragraph id="fp-override" style="--vf-paragraph-line-height: 24px"
        >One line of copy.</vf-paragraph>
      <vf-text-area id="fp-area" rows="4"></vf-text-area>
    </div>
    <vf-text-area id="fp-area-default" rows="4"></vf-text-area>
  `)

  const h = {}
  for (const id of ['fp-body', 'fp-display', 'fp-label', 'fp-fine', 'fp-override', 'fp-area', 'fp-area-default'])
    h[id] = await heightOf(page, id)

  check('face pitch: --vf-line-height moves body copy', h['fp-body'] === 14 * S, `${h['fp-body']}px`)
  check(
    'face pitch: --vf-line-height-display moves chrome copy',
    h['fp-display'] === 18 * S,
    `${h['fp-display']}px`
  )
  check('face pitch: a label follows the display token', h['fp-label'] === 18 * S, `${h['fp-label']}px`)
  check('face pitch: body-face fine print follows the body token', h['fp-fine'] === 14 * S, `${h['fp-fine']}px`)
  check(
    'face pitch: the per-component token still overrides the face token',
    h['fp-override'] === 24 * S,
    `${h['fp-override']}px`
  )
  check(
    'face pitch: the text area wraps entry rows on the display token',
    h['fp-area'] === (4 * 18 + 8) * S,
    `${h['fp-area']}px`
  )
  check(
    'face pitch: an untouched text area is rows × 16 + the 4px pads',
    h['fp-area-default'] === (4 * 16 + 8) * S,
    `${h['fp-area-default']}px`
  )

  await page.close()
}

/* ── DECLARED BOX ─────────────────────────────────────────────────────────
   `width`/`height` (VfSized) — the size half of the DITL story. A placed
   paragraph shrink-wraps its longest line, so the declared width is what
   states the measure; the declared height is a box copy overflows rather
   than grows; the write is the live calc, and removing the attribute hands
   the axis back to layout. */

{
  const page = await build(`
    <div style="position: relative; width: 600px; height: 500px">
      <vf-paragraph id="placed" top="10" left="50" width="100">
        A run of copy long enough to need several line boxes at a narrow measure.
      </vf-paragraph>
      <vf-paragraph id="boxed" top="100" left="50" width="100" height="60">
        A run of copy long enough to need several line boxes at a narrow
        measure — decidedly more of them than the five the declared sixty
        system pixels have room for.
      </vf-paragraph>
    </div>
  `)

  const placed = await page.evaluate(() => {
    const el = document.getElementById('placed')
    const rect = el.getBoundingClientRect()
    return { width: rect.width, height: rect.height, inline: el.style.width }
  })
  check(
    'declared box: a placed paragraph wraps at its stated measure',
    placed.width === 100 * S && placed.height % (12 * S) === 0 && placed.height > 12 * S,
    `${placed.width}px wide, ${placed.height / (12 * S)} lines`
  )
  check(
    'declared box: the write is the live calc, not a resolved px',
    placed.inline === 'calc(var(--vf-scale, 1) * 100px)',
    placed.inline
  )

  const boxed = await page.evaluate(() => {
    const el = document.getElementById('boxed')
    return {
      box: el.getBoundingClientRect().height,
      // The host doesn't clip, so its own scrollHeight stays the box; the
      // inner <p> is where the too-tall copy actually measures.
      copy: el.shadowRoot.querySelector('p').getBoundingClientRect().height,
    }
  })
  check(
    'declared box: copy that outgrows the height overflows rather than growing it',
    boxed.box === 60 * S && boxed.copy > 60 * S,
    `box ${boxed.box}px, copy ${boxed.copy}px`
  )

  const released = await page.evaluate(async () => {
    const el = document.getElementById('placed')
    el.removeAttribute('width')
    await el.updateComplete
    return { inline: el.style.width, width: el.getBoundingClientRect().width }
  })
  check(
    'declared box: removing the attribute returns the axis to layout',
    released.inline === '' && released.width !== 100 * S,
    `inline "${released.inline}", ${released.width}px wide`
  )

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
  `)

  const styles = await page.evaluate(() =>
    Object.fromEntries(
      ['l-default', 'l-body', 'l-dim', 'p-default', 'p-display'].map((id) => {
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
    styles['l-default'].family === 'VF Display' && styles['l-default'].smoothing === 'none',
    `${styles['l-default'].family} / smoothing ${styles['l-default'].smoothing}`
  )
  check(
    'label: face="body" switches to the body face',
    styles['l-body'].family === 'VF Body',
    styles['l-body'].family
  )
  check(
    'label: dim greys the text to --vf-disabled',
    styles['l-dim'].color === 'rgb(192, 192, 192)',
    styles['l-dim'].color
  )
  check(
    'paragraph: body face by default',
    styles['p-default'].family === 'VF Body',
    styles['p-default'].family
  )
  check(
    'paragraph: face="display" switches to the chrome face',
    styles['p-display'].family === 'VF Display' && styles['p-display'].smoothing === 'none',
    `${styles['p-display'].family} / smoothing ${styles['p-display'].smoothing}`
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

await report(browser)
