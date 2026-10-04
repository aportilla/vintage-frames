/**
 * Verifies the window-archetype parameter surface: the chrome added so the
 * five HIG archetypes compose from the two shells (docs/LAYOUT.md "Window
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
 *    gap, 2px inner band, NO shadow, no title bar and no title of its own —
 *    `heading` becomes the aria-label — and `closable` ignored.
 *  - UTILITY BAR: variant="utility" measures the windoid trace (12px bar,
 *    7×7 widgets at left:7/right:8, 3px nested zoom square, vf-dots layer),
 *    and a scale-1 raster of the bar is probed pixel-for-pixel against
 *    the traced utility-window reference.
 *  - FLOATING TIER: on a vf-desktop, utility windows stack a band above the
 *    document tier, restack only among themselves, and neither steal nor
 *    lose `active`.
 *  - ICON TITLE: a 16×16 icon in a menu's label slot sits in its own plate
 *    (7 px before the cell, 5 after), centered on the bar's line; text keeps
 *    the text plate.
 *  - MENU TIER: a slotted vf-menu-bar sits above both window tiers, so a
 *    dropped menu hit-tests over a palette it overlaps — before and after
 *    the palette restacks — as it does over a document window, and so does
 *    a select's open list in a document window; a
 *    free-standing vf-menu slotted into the desktop rides the same tier.
 *  - END SLOT: a label in the bar's `end` slot sits, pixel for pixel, where
 *    the page recipe the sites wrote for their clocks put it.
 *  - EDGE RAILS: scrollbars="both" reproduces the TeachText composition —
 *    the built-in scroll area sits flush on the frame with the grow box in
 *    the rail corner.
 *  - INACTIVE RAILS: a deactivated window shows no interactive scroll UX —
 *    ScrollStateController toggles data-window-inactive on every managed
 *    scroller inside it (edge rails and slotted components alike), the grow
 *    box goes hollow, and a scroller outside any window never carries the
 *    attribute.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:archetypes
 */
import { check, launch, makeBuild, results, scaleAt } from './harness.mjs'
import zlib from 'node:zlib'

/** These are 1-bit raster measurements, not scale-policy ones, so the fixture
 *  PINS --vf-scale and every figure below is in that unit. */
const PINNED_SCALE = 3
const S = PINNED_SCALE

const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps

const browser = await launch()

const build = makeBuild(browser, { bodyStyle: `margin:0;--vf-scale:${PINNED_SCALE}` })
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
      <vf-window closable id="win" heading="Notes" movable
        style="width:300px;height:200px"><p>Body</p></vf-window>
      <vf-dialog id="dlg" heading="Search and Replace" closable width="200" height="120" open><p>Body</p></vf-dialog>
      <vf-dialog id="bare" heading="Bare" width="200" height="120" open><p>Body</p></vf-dialog>
    </div>
  `)

  const BOX = ['width', 'height', 'top', 'left', 'padding-top',
    'background-color', 'box-shadow', 'z-index']
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
    <vf-dialog id="plain" frame="plain" heading="Page Setup" closable width="200" height="120" open>
      <p>Body</p>
    </vf-dialog>
    <!-- NOT open: a second open modal would be the top layer's topmost and
         swallow the Escape aimed at #plain. Naming renders regardless. -->
    <vf-dialog id="unnamed" frame="plain" width="200" height="120"><p>Body</p></vf-dialog>
  `)

  // Both lines are strokes (vfStrokeDecls): the width is the padding each
  // holds, the ink its shadow list's one inset layer.
  const frame = await partMetrics(page, 'plain', 'frame',
    ['padding-top', 'box-shadow', 'background-color'])
  check(`plain frame outer rule is 1px x${S} black`,
    frame['padding-top'] === `${1 * S}px` &&
    frame['box-shadow'] === `rgb(0, 0, 0) 0px 0px 0px ${1 * S}px inset`, frame['padding-top'])
  check('plain frame has NO drop shadow (unlike the alert)',
    !frame['box-shadow'].split(/,(?![^(]*\))/).some((l) => !l.trim().endsWith('inset')),
    frame['box-shadow'])

  const inner = await page.evaluate(() => {
    const el = document.getElementById('plain').shadowRoot
      .querySelector('.vf-modal-frame-inner')
    if (!el) return null
    const cs = getComputedStyle(el)
    return { margin: cs.marginTop, stroke: cs.paddingTop, shadow: cs.boxShadow }
  })
  check(`plain frame inner band: 2px x${S} gap then 2px x${S} black band`,
    inner !== null && inner.margin === `${2 * S}px` && inner.stroke === `${2 * S}px` &&
    inner.shadow === `rgb(0, 0, 0) 0px 0px 0px ${2 * S}px inset`, JSON.stringify(inner))

  check('plain frame renders no title bar',
    (await partMetrics(page, 'plain', 'title-bar', ['height'])) === null)
  check('…and ignores closable (no bar to carry the widget)',
    (await partMetrics(page, 'plain', 'close-box', ['width'])) === null)

  check('…and draws no title of its own (heading only names it)',
    (await partMetrics(page, 'plain', 'title', ['display'])) === null)

  const naming = await page.evaluate(() => {
    const grab = (id) => {
      const d = document.getElementById(id).shadowRoot.querySelector('dialog')
      return { by: d.getAttribute('aria-labelledby'), label: d.getAttribute('aria-label') }
    }
    return { plain: grab('plain'), unnamed: grab('unnamed') }
  })
  check('plain dialog takes its heading as its accessible name',
    naming.plain.by === null && naming.plain.label === 'Page Setup',
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
    <vf-window closable id="uw" variant="utility" heading="Tools" zoomable movable
      style="width:196px;height:92px"><p>Body</p></vf-window>
  `)

  const bar = await partMetrics(page, 'uw', 'title-bar', ['height'])
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
  check('utility bar carries the vf-dots layer and its tile, not stripes',
    layers.dots !== null && layers.dots.startsWith('url("data:image/png') && !layers.stripes)
  check(`dots layer is inset 2px x${S} vertically and flush horizontally`,
    layers.dotTop === `${2 * S}px` && layers.dotLeft === '0px',
    `${layers.dotTop} / ${layers.dotLeft}`)
  check('utility bar renders no title patch', layers.titleDisplay === 'none')

  // A consumer token on a window with no declared width: the token itself,
  // CSS-repeated on its documented 30-px span, and no kit tile; unset, the
  // kit tile comes back.
  const TOKEN =
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30'%3E` +
    `%3Crect width='1' height='1'/%3E%3C/svg%3E")`
  const dotsWith = async (token) => {
    await page.evaluate(async (token) => {
      const w = document.getElementById('uw')
      if (token) w.style.setProperty('--vf-dots-pattern', token)
      else w.style.removeProperty('--vf-dots-pattern')
      w.requestUpdate()
      await w.updateComplete
    }, token)
    return page.evaluate(() => {
      const dots = document.getElementById('uw').shadowRoot.querySelector('.vf-dots')
      const cs = getComputedStyle(dots)
      return {
        token: dots.classList.contains('vf-dots-token'),
        image: cs.backgroundImage,
        size: cs.backgroundSize,
        kitTile: dots.style.getPropertyValue('--_vf-dots-tile') !== '',
      }
    })
  }
  const withToken = await dotsWith(TOKEN)
  check(`a dots token with no declared width repeats on its 30px x${S} span, no kit tile`,
    withToken.token && withToken.image.includes('svg+xml') && !withToken.kitTile &&
      withToken.size === `${30 * S}px ${30 * S}px`,
    `${withToken.size}, kit tile ${withToken.kitTile}`)
  const without = await dotsWith(null)
  check('…and unset, the kit tile comes back',
    !without.token && without.image.startsWith('url("data:image/png') && without.kitTile)

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
    return { bg: cs.backgroundColor, img: cs.backgroundImage, shadow: cs.boxShadow }
  })
  await page.mouse.up()
  check('pressed utility widget inverts whole: black fill under a white borderline',
    pressed.bg === 'rgb(0, 0, 0)' && pressed.img === 'none' &&
    pressed.shadow.startsWith(`rgb(255, 255, 255) 0px 0px 0px ${1 * S}px inset`),
    JSON.stringify(pressed))

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
      <vf-window closable id="a" heading="A" style="position:absolute;left:30px;top:30px;width:300px;height:200px"></vf-window>
      <vf-window closable id="b" heading="B" style="position:absolute;left:150px;top:120px;width:300px;height:200px"></vf-window>
      <vf-window closable id="u" variant="utility" heading="U" style="position:absolute;left:420px;top:60px;width:150px;height:120px"></vf-window>
      <vf-window closable id="u2" variant="utility" heading="U2" style="position:absolute;left:520px;top:210px;width:150px;height:120px"></vf-window>
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
   4b. MENU TIER — a slotted menu bar's dropped menu covers the floating tier
   ──────────────────────────────────────────────────────────────────────── */
{
  // The palette and the document window both start under the bar, where the
  // File menu drops; one probe point lies inside all three boxes, so the
  // hit-test at that point reads the stack directly.
  const page = await build(`
    <vf-desktop id="desk" style="display:block;width:900px;height:600px">
      <vf-menu-bar id="bar">
        <vf-menu id="file" label="File">
          <vf-menu-item value="new">New</vf-menu-item>
          <vf-menu-item value="open">Open…</vf-menu-item>
          <vf-menu-item value="close">Close</vf-menu-item>
          <vf-menu-item value="save">Save</vf-menu-item>
        </vf-menu>
      </vf-menu-bar>
      <vf-window closable id="doc" heading="Doc" style="position:absolute;left:0;top:80px;width:400px;height:300px"></vf-window>
      <vf-window closable id="pal" variant="utility" heading="Pal" style="position:absolute;left:0;top:80px;width:200px;height:150px"></vf-window>
      <!-- A second palette, clear of the probe point, so a press on the first
           has something to restack over (a lone palette is already topmost in
           its tier and _raise skips the bump). A free-standing menu placed
           over it drops its panel into it, for the same-tier check. -->
      <vf-window closable id="pal2" variant="utility" heading="Pal 2" style="position:absolute;left:600px;top:80px;width:200px;height:150px"></vf-window>
      <vf-menu id="lone" label="Options" left="200" top="25">
        <vf-menu-item value="a">Alpha</vf-menu-item>
        <vf-menu-item value="b">Beta</vf-menu-item>
        <vf-menu-item value="c">Gamma</vf-menu-item>
        <vf-menu-item value="d">Delta</vf-menu-item>
      </vf-menu>
    </vf-desktop>
  `)

  const z = () =>
    page.evaluate(() => ({
      bar: Number(getComputedStyle(document.getElementById('bar')).zIndex),
      lone: Number(getComputedStyle(document.getElementById('lone')).zIndex),
      pal: Number(document.getElementById('pal').style.zIndex),
      pal2: Number(document.getElementById('pal2').style.zIndex),
      doc: Number(document.getElementById('doc').style.zIndex),
    }))
  /** Which slotted child of the desktop the hit-test at `p` lands in. */
  const hit = (p) =>
    page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      const owner = ['bar', 'lone', 'pal', 'pal2', 'doc'].find((id) => {
        const host = document.getElementById(id)
        return host === el || host.contains(el)
      })
      return owner ?? (el ? el.tagName.toLowerCase() : null)
    }, p)
  const labelCentre = (id) =>
    page.evaluate((i) => {
      const r = document.getElementById(i).labelRect
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, id)
  /** A point inside a menu's dropped panel AND a palette's box. */
  const overlapPoint = (menuId, palId) =>
    page.evaluate(([m, w]) => {
      const panel = document.getElementById(m).shadowRoot
        .querySelector('[part=panel]').getBoundingClientRect()
      const pal = document.getElementById(w).getBoundingClientRect()
      const left = Math.max(panel.left, pal.left)
      const top = Math.max(panel.top, pal.top)
      const right = Math.min(panel.right, pal.right)
      const bottom = Math.min(panel.bottom, pal.bottom)
      if (right <= left || bottom <= top) return null
      return { x: (left + right) / 2, y: (top + bottom) / 2 }
    }, [menuId, palId])

  let s = await z()
  check('a slotted menu bar computes a z-index above the floating band',
    s.bar > s.pal && s.pal > 1_000_000, `bar ${s.bar} pal ${s.pal}`)

  const label = await labelCentre('file')
  await page.mouse.click(label.x, label.y)
  await page.evaluate(() => document.getElementById('file').updateComplete)
  check('a tap on the title drops the menu',
    await page.evaluate(() => document.getElementById('file').open))
  const p = await overlapPoint('file', 'pal')
  check('the dropped panel overlaps the palette', p !== null, JSON.stringify(p))
  check('inside the overlap, the hit-test lands on the menu, not the palette',
    p !== null && (await hit(p)) === 'bar', p && (await hit(p)))

  // Closing hands the point back to the palette — the overlap is real, and
  // the palette is still above the document window under it.
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.getElementById('file').updateComplete)
  check('closed, the same point hits the palette (above the document window)',
    p !== null && (await hit(p)) === 'pal', p && (await hit(p)))

  // Restack the palette (a press on its bar) and drop the menu again: the
  // bar's tier holds over a freshly raised palette too.
  const palBar = await page.evaluate(() => {
    const b = document.getElementById('pal').shadowRoot
      .querySelector('[part=title-bar]').getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await page.mouse.click(palBar.x, palBar.y)
  const before = s
  s = await z()
  check('the palette restacked', s.pal > before.pal, `${before.pal} → ${s.pal}`)
  await page.mouse.click(label.x, label.y)
  await page.evaluate(() => document.getElementById('file').updateComplete)
  check('…and the re-dropped menu still covers it',
    p !== null && s.bar > s.pal && (await hit(p)) === 'bar',
    `bar ${s.bar} pal ${s.pal} hit ${p && (await hit(p))}`)

  // A free-standing menu slotted into the desktop rides the same tier: its
  // panel drops into the second palette's box and hit-tests over it. The
  // click lands outside the bar, which closes the bar's menu on the way.
  check('a free-standing slotted menu computes the same tier',
    s.lone === s.bar && s.lone > s.pal2, `lone ${s.lone} bar ${s.bar} pal2 ${s.pal2}`)
  const loneLabel = await labelCentre('lone')
  await page.mouse.click(loneLabel.x, loneLabel.y)
  await page.evaluate(() => document.getElementById('lone').updateComplete)
  check('a tap on the free-standing title drops its menu',
    await page.evaluate(() => document.getElementById('lone').open))
  const q = await overlapPoint('lone', 'pal2')
  check('its panel overlaps the second palette', q !== null, JSON.stringify(q))
  check('inside that overlap, the hit-test lands on the menu, not the palette',
    q !== null && (await hit(q)) === 'lone', q && (await hit(q)))
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.getElementById('lone').updateComplete)
  check('closed, the same point hits the second palette',
    q !== null && (await hit(q)) === 'pal2', q && (await hit(q)))
  await page.close()
}

// A select's open list in a document window covers a palette over it: the
// list is in the top layer, where no window's z-index reaches.
{
  const page = await build(`
    <vf-desktop style="display:block;width:900px;height:600px">
      <vf-window closable id="doc" heading="Doc" style="position:absolute;left:0;top:40px;width:400px;height:400px">
        <vf-select id="sel" label="Size" left="20" top="20">
          <vf-option value="1">One</vf-option>
          <vf-option value="2">Two</vf-option>
          <vf-option value="3">Three</vf-option>
          <vf-option value="4">Four</vf-option>
          <vf-option value="5">Five</vf-option>
        </vf-select>
      </vf-window>
      <!-- Below the pill (at the pinned scale), over the list it drops. -->
      <vf-window closable id="pal" variant="utility" heading="Pal" style="position:absolute;left:0;top:260px;width:300px;height:200px"></vf-window>
    </vf-desktop>
  `)
  const pill = await page.evaluate(() => {
    const r = document.getElementById('sel').shadowRoot.querySelector('[part=control]').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await page.mouse.click(pill.x, pill.y)
  await page.waitForFunction(() =>
    document.getElementById('sel').shadowRoot.querySelector('[part=panel]').getBoundingClientRect().height > 0)
  const probe = await page.evaluate(() => {
    const panel = document.getElementById('sel').shadowRoot.querySelector('[part=panel]').getBoundingClientRect()
    const pal = document.getElementById('pal').getBoundingClientRect()
    const top = Math.max(panel.top, pal.top)
    const bottom = Math.min(panel.bottom, pal.bottom)
    const box = { panel: [panel.top, panel.bottom], pal: [pal.top, pal.bottom] }
    if (bottom <= top) return { owner: null, ...box }
    const x = (Math.max(panel.left, pal.left) + Math.min(panel.right, pal.right)) / 2
    const el = document.elementFromPoint(x, (top + bottom) / 2)
    return { owner: ['sel', 'pal', 'doc'].find((id) => document.getElementById(id).contains(el)) ?? el?.localName, ...box }
  })
  check('a select’s open list covers a palette over its document window', probe.owner === 'sel', JSON.stringify(probe))
  await page.keyboard.press('Escape')
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   4c. END SLOT — the bar's right end, where a clock goes
   ──────────────────────────────────────────────────────────────────────── */
{
  // The page recipe every site wrote for its clock, beside the slot that
  // replaces it: the two bars must render the same pixels.
  const menu = '<vf-menu label="File"><vf-menu-item value="x">X</vf-menu-item></vf-menu>'
  const page = await build(`
    <div style="width:600px">
      <vf-menu-bar id="recipe">${menu}<vf-label id="clockA" style="margin-inline-start:auto;margin-inline-end:calc(var(--vf-scale, 1) * 9px);--vf-label-line-height:20px">12:00 PM</vf-label></vf-menu-bar>
      <vf-menu-bar id="slotted">${menu}<vf-label id="clockB" slot="end">12:00 PM</vf-label></vf-menu-bar>
    </div>
  `, { settle: true })
  const geom = await page.evaluate(() => {
    const at = (bar, label) => {
      const b = document.getElementById(bar).getBoundingClientRect()
      const l = document.getElementById(label).getBoundingClientRect()
      return { x: l.left - b.left, y: l.top - b.top, w: l.width, h: l.height, inset: b.right - l.right }
    }
    return { recipe: at('recipe', 'clockA'), slotted: at('slotted', 'clockB') }
  })
  check('a label in the end slot sits where the page recipe put the clock, 9px in from the end',
    JSON.stringify(geom.recipe) === JSON.stringify(geom.slotted) && near(geom.slotted.inset, 9 * S),
    JSON.stringify(geom))
  const [a, b] = await Promise.all([
    page.locator('#recipe').screenshot(),
    page.locator('#slotted').screenshot(),
  ])
  check('…and the two bars render the same pixels', a.equals(b), `${a.length} / ${b.length} bytes`)
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   4d. ICON TITLE — a 16×16 icon in a menu's label slot
   ──────────────────────────────────────────────────────────────────────── */
{
  // The apple's 16×16 cell lands at x 16, two rows down, and the next title's
  // plate at x 32, from the screen's edge; a text title keeps its own place.
  const page = await build(`
    <div style="width:600px">
      <vf-menu-bar id="iconBar">
        <vf-menu id="apple" label="Apple">
          <vf-img id="art" slot="label" width="16" height="16"><img src="/demo/icons/apple.png" alt="" /></vf-img>
          <vf-menu-item value="about">About</vf-menu-item>
        </vf-menu>
        <vf-menu id="file" label="File"><vf-menu-item value="x">X</vf-menu-item></vf-menu>
      </vf-menu-bar>
      <vf-menu-bar id="textBar">
        <vf-menu id="app" label="Sprite Machine"><vf-menu-item value="about">About</vf-menu-item></vf-menu>
      </vf-menu-bar>
    </div>
  `, { settle: true })
  const geom = await page.evaluate((s) => {
    const sys = (v) => Math.round((v / s) * 100) / 100
    const of = (barId, rect) => {
      const bar = document.getElementById(barId).getBoundingClientRect()
      return { x: sys(rect.left - bar.left), y: sys(rect.top - bar.top), w: sys(rect.width) }
    }
    return {
      cell: of('iconBar', document.getElementById('art').getBoundingClientRect()),
      applePlate: of('iconBar', document.getElementById('apple').labelRect),
      filePlate: of('iconBar', document.getElementById('file').labelRect),
      textPlate: of('textBar', document.getElementById('app').labelRect),
    }
  }, S)
  check(
    'an icon title: the 16×16 cell at x 16, y 2, in a 28px plate from x 9; the next title’s plate at x 32',
    geom.cell.x === 16 && geom.cell.y === 2 && geom.applePlate.x === 9 && geom.applePlate.w === 28 && geom.filePlate.x === 32,
    JSON.stringify(geom)
  )
  check('…and a text title keeps the text plate, from x 9', geom.textPlate.x === 9, JSON.stringify(geom.textPlate))
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   5. EDGE RAILS — scrollbars="both" is the TeachText composition, built in
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-window closable id="doc" heading="Read Me" scrollbars="both" resizable
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

/* ────────────────────────────────────────────────────────────────────────────
   6. INACTIVE RAILS — a deactivated window blanks its scroll UX
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <vf-desktop id="desk" style="display:block;width:900px;height:600px">
      <vf-window closable id="doc" heading="Doc" scrollbars="both" resizable
        style="position:absolute;left:20px;top:20px;width:420px;height:300px">
        <pre style="margin:0;white-space:pre">${'a long overflowing line of document text here\n'.repeat(40)}</pre>
      </vf-window>
      <vf-window closable id="other" heading="Other"
        style="position:absolute;left:460px;top:40px;width:360px;height:300px">
        <vf-list id="slotted" style="height:120px">
          <vf-list-item>Alpha</vf-list-item>
          <vf-list-item>Beta</vf-list-item>
        </vf-list>
      </vf-window>
    </vf-desktop>
    <vf-list id="free" style="width:200px;height:80px">
      <vf-list-item>Gamma</vf-list-item>
    </vf-list>
  `)

  const rails = () =>
    page.evaluate(() => {
      const scroller = (host) => host.shadowRoot.querySelector('.vf-scroll')
      const doc = scroller(
        document.getElementById('doc').shadowRoot.querySelector('vf-scroll-area')
      )
      const grow = getComputedStyle(
        document.getElementById('doc').shadowRoot.querySelector('[part=grow-box]'),
        '::before'
      )
      return {
        docInactive: doc.hasAttribute('data-window-inactive'),
        docOverflow: [doc.dataset.overflowX, doc.dataset.overflowY],
        growHollow: grow.display === 'none',
        slottedInactive: scroller(
          document.getElementById('slotted')
        ).hasAttribute('data-window-inactive'),
        freeInactive: scroller(document.getElementById('free')).hasAttribute(
          'data-window-inactive'
        ),
      }
    })
  const clickBar = async (id) => {
    const r = await page.evaluate((i) => {
      const bar = document.getElementById(i).shadowRoot.querySelector('[part=title-bar]')
      const b = bar.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    }, id)
    await page.mouse.click(r.x, r.y)
    await page.evaluate(() =>
      Promise.all(
        [...document.querySelectorAll('vf-window')].map((w) => w.updateComplete)
      )
    )
  }

  let s = await rails()
  check('background window: its edge rails carry data-window-inactive',
    s.docInactive, JSON.stringify(s))
  check('…while overflow reporting underneath is untouched',
    s.docOverflow[0] === 'true' && s.docOverflow[1] === 'true',
    String(s.docOverflow))
  check('…and its grow box goes hollow', s.growHollow)
  check('active window: a slotted scroller stays live', !s.slottedInactive)
  check('a scroller outside any window never carries the attribute',
    !s.freeInactive)

  await clickBar('doc')
  s = await rails()
  check('activating the window fills its rails back in',
    !s.docInactive && s.growHollow === false,
    JSON.stringify(s))
  check('…and blanks the newly backgrounded window’s slotted scroller',
    s.slottedInactive)

  await clickBar('other')
  s = await rails()
  check('deactivating again re-blanks the edge rails',
    s.docInactive && !s.slottedInactive)
  await page.close()
}

await browser.close()
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
