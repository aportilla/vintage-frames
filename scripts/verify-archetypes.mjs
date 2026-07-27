/**
 * Verifies the window-archetype parameter surface: the chrome added so the
 * five HIG archetypes compose from the two shells (README "Window
 * archetypes") — `vf-dialog closable` / `frame="plain"`, `vf-window
 * variant="utility"` / `scrollbars`, and vf-desktop's floating tier.
 *
 * The construction-sharing assertions mirror verify-chrome's: what two
 * components must render identically is asserted *equal between them*, not
 * just individually right. Groups:
 *
 *  - DIALOG CLOSE BOX: `closable` renders vf-window's widget byte-for-byte
 *    (shared vfWindowWidgets + closeBox()), clicking it closes with
 *    `{ reason: 'close' }`, a drag from the widget never moves the dialog,
 *    and the title inset widens to vf-window's 60px.
 *  - PLAIN FRAME: `frame="plain"` is the dBoxProc trace — 1px outer, 2px
 *    gap, 2px inner band, NO shadow, no title bar — with the heading drawn
 *    in content as the aria-labelledby target, and `closable` ignored.
 *  - UTILITY BAR: variant="utility" measures the windoid trace (12px bar,
 *    7×7 widgets at left:7/right:8, 3px nested zoom square, vf-dots layer),
 *    and a scale-1 raster of the bar is probed pixel-for-pixel against
 *    `Windows/utility-window.png` (npm run extract:windows).
 *  - FLOATING TIER: on a vf-desktop, utility windows stack a band above the
 *    document tier, restack only among themselves, and neither steal nor
 *    lose `active`.
 *  - EDGE RAILS: scrollbars="both" reproduces the TeachText composition —
 *    the built-in scroll area sits flush on the frame with the grow box in
 *    the rail corner.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:archetypes
 */
import { chromium } from 'playwright'
import zlib from 'node:zlib'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

/** Headless Chromium runs at dpr 1, so the default scale is 3/1. */
const S = 3

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps

const browser = await chromium.launch()

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
  return page
}

/** Computed props of a shadow part, plus its rect relative to the frame. */
const partMetrics = (page, hostId, part, props) =>
  page.evaluate(
    ([id, sel, wanted]) => {
      const root = document.getElementById(id).shadowRoot
      const el = root.querySelector(`[part=${sel}]`)
      if (!el) return null
      const cs = getComputedStyle(el)
      const out = {}
      for (const p of wanted) out[p] = cs.getPropertyValue(p)
      const a = el.getBoundingClientRect()
      const f = root.querySelector('[part=frame]').getBoundingClientRect()
      out._rect = { x: a.left - f.left, y: a.top - f.top, w: a.width, h: a.height }
      return out
    },
    [hostId, part, props]
  )

/** Decode an RGBA/RGB 8-bit PNG buffer to { w, h, px } (px[y][x] = [r,g,b]). */
function decodePng(buf) {
  let pos = 8
  let w, h, colorType
  let idat = Buffer.alloc(0)
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    pos += 12 + len
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      colorType = data[9]
    } else if (type === 'IDAT') idat = Buffer.concat([idat, data])
    else if (type === 'IEND') break
  }
  const raw = zlib.inflateSync(idat)
  const ch = colorType === 6 ? 4 : 3
  const stride = w * ch
  const px = []
  let prev = Buffer.alloc(stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const f = raw[p++]
    const line = Buffer.from(raw.subarray(p, p + stride))
    p += stride
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0
      const b = prev[i]
      const c = i >= ch ? prev[i - ch] : 0
      if (f === 1) line[i] = (line[i] + a) & 0xff
      else if (f === 2) line[i] = (line[i] + b) & 0xff
      else if (f === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff
      else if (f === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        line[i] = (line[i] + pr) & 0xff
      }
    }
    const row = []
    for (let x = 0; x < w; x++) row.push([line[x * ch], line[x * ch + 1], line[x * ch + 2]])
    px.push(row)
    prev = line
  }
  return { w, h, px }
}

/* ────────────────────────────────────────────────────────────────────────────
   1. DIALOG CLOSE BOX — closable renders vf-window's widget, identically
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <div style="position:relative">
      <vf-window id="win" heading="Notes" movable
        style="width:300px;height:200px"><p>Body</p></vf-window>
      <vf-dialog id="dlg" heading="Search and Replace" closable open><p>Body</p></vf-dialog>
      <vf-dialog id="bare" heading="Bare" open><p>Body</p></vf-dialog>
    </div>
  `)

  const BOX = ['width', 'height', 'top', 'left', 'border-top-width',
    'border-top-color', 'background-color', 'box-shadow', 'z-index']
  const winBox = await partMetrics(page, 'win', 'close-box', BOX)
  const dlgBox = await partMetrics(page, 'dlg', 'close-box', BOX)
  check('closable dialog renders a close box', dlgBox !== null)
  for (const p of BOX) {
    check(`close box ${p} identical across window/dialog`, winBox[p] === dlgBox[p],
      `${winBox[p]} vs ${dlgBox[p]}`)
  }
  check(`close box is 11px x${S} square`, dlgBox.width === `${11 * S}px` &&
    dlgBox.height === `${11 * S}px`, dlgBox.width)
  check(`close box sits ${8 * S}px in, ${3 * S}px down`,
    dlgBox.left === `${8 * S}px` && dlgBox.top === `${3 * S}px`,
    `${dlgBox.left},${dlgBox.top}`)

  const inset = await page.evaluate(() =>
    getComputedStyle(
      document.getElementById('dlg').shadowRoot.querySelector('[part=title]')
    ).maxWidth
  )
  check(`closable dialog widens the title inset to 60px x${S}`,
    inset === `calc(100% - ${60 * S}px)`, inset)

  const bareBox = await partMetrics(page, 'bare', 'close-box', ['width'])
  check('a dialog without closable renders NO close box', bareBox === null)

  check('dialog close box is qualified by the heading',
    await page.evaluate(() =>
      document.getElementById('dlg').shadowRoot
        .querySelector('[part=close-box]').getAttribute('aria-label')
    ) === 'Close Search and Replace')

  // A drag that starts on the widget must never move the dialog…
  const boxCenter = await page.evaluate(() => {
    const r = document.getElementById('dlg').shadowRoot
      .querySelector('[part=close-box]').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  const before = await page.evaluate(() => {
    const r = document.getElementById('dlg').shadowRoot
      .querySelector('dialog').getBoundingClientRect()
    return { x: r.left, y: r.top }
  })
  await page.mouse.move(boxCenter.x, boxCenter.y)
  await page.mouse.down()
  await page.mouse.move(boxCenter.x + 60, boxCenter.y + 45, { steps: 4 })
  await page.mouse.up()
  const after = await page.evaluate(() => {
    const r = document.getElementById('dlg').shadowRoot
      .querySelector('dialog').getBoundingClientRect()
    return { x: r.left, y: r.top }
  })
  check('a drag starting on the close box does not move the dialog',
    near(before.x, after.x) && near(before.y, after.y),
    `Δ ${after.x - before.x},${after.y - before.y}`)

  // …and a plain click on it closes, with the programmatic reason.
  const closed = await page.evaluate(() => {
    const dlg = document.getElementById('dlg')
    return new Promise((resolve) => {
      dlg.addEventListener('vf-close', (e) => resolve(e.detail.reason), { once: true })
      dlg.shadowRoot.querySelector('[part=close-box]').click()
    })
  })
  check("clicking the close box closes with reason 'close'", closed === 'close', closed)
  check('…and the dialog is closed', await page.evaluate(() =>
    !document.getElementById('dlg').open))
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   2. PLAIN FRAME — frame="plain" is the traced dBoxProc chrome
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-dialog id="plain" frame="plain" heading="Page Setup" closable open>
      <p>Body</p>
    </vf-dialog>
    <!-- NOT open: a second open modal would be the top layer's topmost and
         swallow the Escape aimed at #plain. Naming renders regardless. -->
    <vf-dialog id="unnamed" frame="plain"><p>Body</p></vf-dialog>
  `)

  const frame = await partMetrics(page, 'plain', 'frame',
    ['border-top-width', 'border-top-color', 'box-shadow', 'background-color'])
  check(`plain frame outer rule is 1px x${S} black`,
    frame['border-top-width'] === `${1 * S}px` &&
    frame['border-top-color'] === 'rgb(0, 0, 0)', frame['border-top-width'])
  check('plain frame has NO drop shadow (unlike the alert)',
    frame['box-shadow'] === 'none', frame['box-shadow'])

  const inner = await page.evaluate(() => {
    const el = document.getElementById('plain').shadowRoot
      .querySelector('.vf-modal-frame-inner')
    if (!el) return null
    const cs = getComputedStyle(el)
    return { margin: cs.marginTop, border: cs.borderTopWidth, color: cs.borderTopColor }
  })
  check(`plain frame inner band: 2px x${S} gap then 2px x${S} black band`,
    inner !== null && inner.margin === `${2 * S}px` && inner.border === `${2 * S}px` &&
    inner.color === 'rgb(0, 0, 0)', JSON.stringify(inner))

  check('plain frame renders no title bar',
    (await partMetrics(page, 'plain', 'title-bar', ['height'])) === null)
  check('…and ignores closable (no bar to carry the widget)',
    (await partMetrics(page, 'plain', 'close-box', ['width'])) === null)

  const title = await partMetrics(page, 'plain', 'title',
    ['font-family', 'text-align', 'display', 'margin-bottom', '-webkit-font-smoothing'])
  check('plain heading is drawn in content, centered, in the display face',
    title !== null && title['text-align'] === 'center' && title.display === 'block' &&
    title['font-family'].startsWith('ChiKareGo'), title && title['font-family'])
  check(`plain heading keeps 16px x${S} below itself`,
    title['margin-bottom'] === `${16 * S}px`, title['margin-bottom'])

  const naming = await page.evaluate(() => {
    const grab = (id) => {
      const d = document.getElementById(id).shadowRoot.querySelector('dialog')
      return { by: d.getAttribute('aria-labelledby'), label: d.getAttribute('aria-label') }
    }
    return { plain: grab('plain'), unnamed: grab('unnamed') }
  })
  check('plain dialog is named by its content heading',
    naming.plain.by === 'title' && naming.plain.label === null,
    JSON.stringify(naming.plain))
  check('a heading-less plain dialog falls back to aria-label',
    naming.unnamed.by === null && naming.unnamed.label === 'Dialog',
    JSON.stringify(naming.unnamed))

  // Attach the listener first (and let the evaluate return), THEN press
  // Escape — awaiting an in-page promise before the key exists deadlocks.
  await page.evaluate(() => {
    const dlg = document.getElementById('plain')
    window.__closeReason = new Promise((resolve) => {
      dlg.addEventListener('vf-close', (e) => resolve(e.detail.reason), { once: true })
    })
  })
  await page.keyboard.press('Escape')
  check("Escape still closes the plain dialog with reason 'escape'",
    (await page.evaluate(() => window.__closeReason)) === 'escape')
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   3. UTILITY BAR — the windoid chrome measures (and rasters) the trace
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-window id="uw" variant="utility" heading="Tools" zoomable movable
      style="width:196px;height:92px"><p>Body</p></vf-window>
  `)

  const bar = await partMetrics(page, 'uw', 'title-bar', ['height', 'border-bottom-width'])
  check(`utility bar is --vf-titlebar-height-utility (12px) x${S}`,
    bar.height === `${12 * S}px`, bar.height)

  const layers = await page.evaluate(() => {
    const root = document.getElementById('uw').shadowRoot
    const dots = root.querySelector('.vf-dots')
    const cs = dots ? getComputedStyle(dots) : null
    return {
      dots: cs ? cs.backgroundImage : null,
      dotTop: cs ? cs.top : null,
      dotLeft: cs ? cs.left : null,
      stripes: root.querySelector('.vf-stripes') !== null,
      titleDisplay: getComputedStyle(root.querySelector('[part=title]')).display,
    }
  })
  check('utility bar carries the vf-dots layer, not stripes',
    layers.dots !== null && layers.dots.includes('svg') && !layers.stripes)
  check(`dots layer is inset 2px x${S} vertically and flush horizontally`,
    layers.dotTop === `${2 * S}px` && layers.dotLeft === '0px',
    `${layers.dotTop} / ${layers.dotLeft}`)
  check('utility bar renders no title patch', layers.titleDisplay === 'none')

  const BOX = ['width', 'height', 'top', 'left', 'right', 'box-shadow']
  const close = await partMetrics(page, 'uw', 'close-box', BOX)
  const zoom = await partMetrics(page, 'uw', 'zoom-box', BOX)
  check(`utility widgets are 7px x${S} squares, 2px x${S} down`,
    close.width === `${7 * S}px` && close.height === `${7 * S}px` &&
    close.top === `${2 * S}px` && zoom.width === `${7 * S}px`,
    `${close.width}@${close.top}`)
  check(`close box at left:7px x${S}, zoom at right:8px x${S} (the art is asymmetric)`,
    close.left === `${7 * S}px` && zoom.right === `${8 * S}px`,
    `${close.left} / ${zoom.right}`)
  const nested = await page.evaluate(() => {
    const cs = getComputedStyle(
      document.getElementById('uw').shadowRoot.querySelector('.zoom'), '::after')
    return { w: cs.width, h: cs.height }
  })
  check(`nested zoom square shrinks to 3px x${S}`,
    nested.w === `${3 * S}px` && nested.h === `${3 * S}px`, nested.w)

  // Pressed widget: no sunburst art exists at 7×7, so the interior fills.
  const boxCenter = await page.evaluate(() => {
    const r = document.getElementById('uw').shadowRoot
      .querySelector('[part=close-box]').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await page.mouse.move(boxCenter.x, boxCenter.y)
  await page.mouse.down()
  const pressed = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('uw').shadowRoot
      .querySelector('[part=close-box]'))
    return { bg: cs.backgroundColor, img: cs.backgroundImage, border: cs.borderTopColor }
  })
  await page.mouse.up()
  check('pressed utility widget inverts whole: black fill under a white borderline',
    pressed.bg === 'rgb(0, 0, 0)' && pressed.img === 'none' &&
    pressed.border === 'rgb(255, 255, 255)', JSON.stringify(pressed))

  // Raster: at scale 1 the rendered bar must probe like the reference sheet.
  await page.evaluate(() => {
    const uw = document.getElementById('uw')
    uw.style.setProperty('--vf-scale', '1')
  })
  await page.evaluate(() => document.getElementById('uw').updateComplete)
  const shot = decodePng(await page.locator('#uw').screenshot())
  const dark = (x, y) => {
    const [r, g, b] = shot.px[y][x]
    return (r + g + b) / 3 < 64
  }
  check('raster: 1px frame + full-width bar rule at row 12',
    dark(0, 0) && dark(0, 6) && dark(0, 12) && dark(97, 12) && dark(195, 12) &&
    !dark(1, 1))
  check('raster: dither dots on odd columns of odd rows, flush to the side borders',
    dark(1, 3) && dark(3, 3) && dark(3, 5) && dark(191, 3) && dark(193, 3) &&
    !dark(2, 3) && !dark(4, 3) && !dark(3, 4) && !dark(2, 2) && !dark(3, 11) &&
    !dark(194, 3))
  check('raster: 7×7 close box at x8..14, y3..9',
    dark(8, 3) && dark(14, 3) && dark(8, 9) && dark(14, 9) && dark(8, 6) &&
    dark(14, 6) && !dark(11, 6) && !dark(7, 3) && !dark(15, 3))
  check('raster: 7×7 zoom box at x180..186 with the 4×4 nested square',
    dark(180, 3) && dark(186, 3) && dark(180, 9) && dark(186, 9) &&
    dark(183, 4) && dark(183, 5) && dark(181, 6) && dark(183, 6) &&
    !dark(184, 7) && !dark(185, 8))
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   4. FLOATING TIER — utility windows ride above and outside `active`
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-desktop id="desk" style="display:block;width:900px;height:600px">
      <vf-window id="a" heading="A" style="position:absolute;left:30px;top:30px;width:300px;height:200px"></vf-window>
      <vf-window id="b" heading="B" style="position:absolute;left:150px;top:120px;width:300px;height:200px"></vf-window>
      <vf-window id="u" variant="utility" heading="U" style="position:absolute;left:420px;top:60px;width:150px;height:120px"></vf-window>
      <vf-window id="u2" variant="utility" heading="U2" style="position:absolute;left:520px;top:210px;width:150px;height:120px"></vf-window>
    </vf-desktop>
  `)

  const state = () =>
    page.evaluate(() =>
      Object.fromEntries(
        ['a', 'b', 'u', 'u2'].map((id) => {
          const w = document.getElementById(id)
          return [id, { active: w.hasAttribute('active'), z: Number(w.style.zIndex) }]
        })
      )
    )
  const clickBar = async (id) => {
    const r = await page.evaluate((i) => {
      const bar = document.getElementById(i).shadowRoot.querySelector('[part=title-bar]')
      const b = bar.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    }, id)
    await page.mouse.click(r.x, r.y)
  }

  let s = await state()
  check('initial: the topmost document window alone is active',
    !s.a.active && s.b.active, JSON.stringify({ a: s.a.active, b: s.b.active }))
  check('initial: utility windows stay active on the floating tier',
    s.u.active && s.u2.active)
  check('initial: the floating tier sits a full band above the document tier',
    s.u.z > 1_000_000 && s.u2.z > s.u.z && s.b.z < 1_000_000,
    `u ${s.u.z} u2 ${s.u2.z} b ${s.b.z}`)

  await clickBar('u')
  s = await state()
  check('clicking a palette restacks it within the floating tier',
    s.u.z > s.u2.z, `u ${s.u.z} u2 ${s.u2.z}`)
  check('…without stealing active from the document window',
    s.b.active && s.u.active && s.u2.active,
    JSON.stringify({ b: s.b.active, u: s.u.active }))

  await clickBar('a')
  s = await state()
  check('activating a background document window works as before',
    s.a.active && !s.b.active)
  check('…and never drags a palette below the floating band',
    s.u.z > s.a.z && s.u2.z > s.a.z, `a ${s.a.z} u ${s.u.z}`)
  check('…or clears a palette’s active state', s.u.active && s.u2.active)
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   5. EDGE RAILS — scrollbars="both" is the TeachText composition, built in
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-window id="doc" heading="Read Me" scrollbars="both" resizable
      style="width:420px;height:320px">
      <pre style="margin:0;white-space:pre">${'a long overflowing line of document text here\n'.repeat(40)}</pre>
    </vf-window>
  `)

  const geo = await page.evaluate(() => {
    const root = document.getElementById('doc').shadowRoot
    const frame = root.querySelector('[part=frame]').getBoundingClientRect()
    const area = root.querySelector('vf-scroll-area')
    const rect = area.getBoundingClientRect()
    const bar = root.querySelector('[part=title-bar]').getBoundingClientRect()
    const grow = root.querySelector('[part=grow-box]').getBoundingClientRect()
    const viewport = area.shadowRoot.querySelector('[part=viewport]')
    return {
      left: rect.left - frame.left,
      right: frame.right - rect.right,
      bottom: frame.bottom - rect.bottom,
      overBar: bar.bottom - rect.top,
      overflow: [viewport.dataset.overflowX, viewport.dataset.overflowY],
      growInset: [frame.right - grow.right, frame.bottom - grow.bottom],
      exports: area.getAttribute('exportparts'),
      label: area.label,
    }
  })
  check('built-in scroll area spans the frame edge to edge',
    near(geo.left, 0) && near(geo.right, 0) && near(geo.bottom, 0),
    `l ${geo.left} r ${geo.right} b ${geo.bottom}`)
  check(`…and rides 1px x${S} up under the title-bar rule`,
    near(geo.overBar, 1 * S), String(geo.overBar))
  check('both rails report live overflow',
    geo.overflow[0] === 'true' && geo.overflow[1] === 'true', String(geo.overflow))
  check(`grow box lands in the rail corner (1px x${S} inside the frame)`,
    near(geo.growInset[0], 1 * S) && near(geo.growInset[1], 1 * S),
    String(geo.growInset))
  check('the viewport part is re-exported', geo.exports === 'viewport')
  check("the heading names the scroll region", geo.label === 'Read Me')
  await page.close()
}

await browser.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
