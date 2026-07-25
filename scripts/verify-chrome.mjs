/**
 * Verifies the shared window/dialog chrome: the `vfChromeFrame` /
 * `vfTitleBar` recipes and the `chromeTitleBar()` markup+drag helper that
 * vf-window and vf-dialog both build their frame from.
 *
 * The extraction that created them was a pure refactor, so the load-bearing
 * assertion is that the two components still render the *same* chrome and that
 * the chrome still measures what the art says. Three groups:
 *
 *  - SHARED: every metric window and dialog have in common is asserted to be
 *    equal *between the two components* — not just individually correct. That's
 *    the check a future one-sided edit trips, which is the whole point of
 *    hoisting the recipe.
 *  - DIFFERENT: the two deliberate divergences survive — the title's widget
 *    clearance (`--vf-title-inset`, 60px on vf-window for its close/zoom boxes
 *    vs the 16px default) and `touch-action`, which vf-window gates on
 *    [movable] while vf-dialog (always a drag handle) sets unconditionally.
 *  - WIRED: the four pointer bindings the helper now owns are live on BOTH
 *    components — a real dragged pointer moves the window and the dialog.
 *
 * Plus the accessible-name work folded into the same pass: vf-window's widgets
 * are qualified by the heading (several windows are open at once by design) and
 * vf-dialog names itself with aria-label when it has no heading to point at.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:chrome
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

/* ────────────────────────────────────────────────────────────────────────────
   1. SHARED — window and dialog render the same frame and title bar
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <div id="host" style="position:relative">
      <vf-window id="win" heading="My Window" movable resizable zoomable
        style="width:300px;height:200px"><p>Body</p></vf-window>
      <vf-dialog id="dlg" heading="My Dialog" open><p>Body</p></vf-dialog>
    </div>
  `)

  const FRAME = ['background-color', 'border-top-width', 'border-right-width',
    'border-bottom-width', 'border-left-width', 'border-top-style',
    'border-top-color', 'box-shadow']
  const winFrame = await partMetrics(page, 'win', 'frame', FRAME)
  const dlgFrame = await partMetrics(page, 'dlg', 'frame', FRAME)

  for (const p of FRAME) {
    check(`frame ${p} identical across window/dialog`, winFrame[p] === dlgFrame[p],
      `${winFrame[p]} vs ${dlgFrame[p]}`)
  }
  // …and each is what the art says, not merely equal to each other.
  check('frame face is white', winFrame['background-color'] === 'rgb(255, 255, 255)',
    winFrame['background-color'])
  check(`frame border is 1px x${S}`, winFrame['border-top-width'] === `${1 * S}px`,
    winFrame['border-top-width'])
  check('frame border is solid black', winFrame['border-top-style'] === 'solid' &&
    winFrame['border-top-color'] === 'rgb(0, 0, 0)')
  check(`frame shadow is the hard ${2 * S}px offset, no blur/spread`,
    winFrame['box-shadow'] === `rgb(0, 0, 0) ${2 * S}px ${2 * S}px 0px 0px`,
    winFrame['box-shadow'])

  const BAR = ['position', 'height', 'border-bottom-width', 'border-bottom-color',
    'display', 'align-items', 'justify-content', 'overflow-x', 'overflow-y']
  const winBar = await partMetrics(page, 'win', 'title-bar', BAR)
  const dlgBar = await partMetrics(page, 'dlg', 'title-bar', BAR)
  for (const p of BAR) {
    check(`title-bar ${p} identical across window/dialog`, winBar[p] === dlgBar[p],
      `${winBar[p]} vs ${dlgBar[p]}`)
  }
  check(`title-bar is --vf-titlebar-height (18px) x${S}`, winBar.height === `${18 * S}px`,
    winBar.height)
  check('title-bar centers its content', winBar['align-items'] === 'center' &&
    winBar['justify-content'] === 'center')
  check('title-bar clips an over-long title', winBar['overflow-x'] === 'hidden')
  check('title-bar sits at the frame origin, inside the border',
    near(winBar._rect.x, 1 * S) && near(winBar._rect.y, 1 * S) &&
    near(dlgBar._rect.x, 1 * S) && near(dlgBar._rect.y, 1 * S),
    `win ${winBar._rect.x},${winBar._rect.y} dlg ${dlgBar._rect.x},${dlgBar._rect.y}`)

  const TITLE = ['font-family', 'font-size', '-webkit-font-smoothing', 'font-weight',
    'background-color', 'white-space', 'text-overflow', 'overflow-x',
    'padding-left', 'padding-right', 'position', 'z-index']
  const winTitle = await partMetrics(page, 'win', 'title', TITLE)
  const dlgTitle = await partMetrics(page, 'dlg', 'title', TITLE)
  for (const p of TITLE) {
    check(`title ${p} identical across window/dialog`, winTitle[p] === dlgTitle[p],
      `${winTitle[p]} vs ${dlgTitle[p]}`)
  }
  check('title is set in the ChiKareGo display face',
    winTitle['font-family'].startsWith('ChiKareGo'), winTitle['font-family'])
  check('title smoothing is off (1-bit edges)',
    winTitle['-webkit-font-smoothing'] === 'none')
  check(`title patch pads 8px x${S} either side`,
    winTitle['padding-left'] === `${8 * S}px` && winTitle['padding-right'] === `${8 * S}px`,
    winTitle['padding-left'])
  check('title patch is opaque white over the stripes',
    winTitle['background-color'] === 'rgb(255, 255, 255)' && winTitle['z-index'] === '1')
  check('title ellipsizes rather than wrapping',
    winTitle['white-space'] === 'nowrap' && winTitle['text-overflow'] === 'ellipsis')

  // The stripe layer is inside both bars and inset by the shared 3px/2px.
  const stripes = (id) =>
    page.evaluate((hostId) => {
      const bar = document.getElementById(hostId).shadowRoot.querySelector('[part=title-bar]')
      const el = bar.querySelector('.vf-stripes')
      if (!el) return null
      const cs = getComputedStyle(el)
      const a = el.getBoundingClientRect()
      const b = bar.getBoundingClientRect()
      return {
        position: cs.position,
        pointerEvents: cs.pointerEvents,
        insetTop: a.top - b.top,
        insetLeft: a.left - b.left,
      }
    }, id)
  const winStripes = await stripes('win')
  const dlgStripes = await stripes('dlg')
  check('both bars carry the stripe layer',
    !!winStripes && !!dlgStripes && winStripes.position === 'absolute')
  check(`stripes inset 3px/2px x${S} in both`,
    near(winStripes.insetTop, 3 * S) && near(winStripes.insetLeft, 2 * S) &&
    near(dlgStripes.insetTop, 3 * S) && near(dlgStripes.insetLeft, 2 * S),
    `win ${winStripes.insetTop}/${winStripes.insetLeft} dlg ${dlgStripes.insetTop}/${dlgStripes.insetLeft}`)
  check('stripes never eat pointer events (the bar is a drag handle)',
    winStripes.pointerEvents === 'none' && dlgStripes.pointerEvents === 'none')

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   2. DIFFERENT — the two deliberate divergences survive the shared recipe
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <div id="host" style="position:relative">
      <vf-window id="win" heading="My Window" movable zoomable
        style="width:300px;height:200px"><p>Body</p></vf-window>
      <vf-window id="fixed" heading="Fixed" style="width:300px;height:120px"><p>B</p></vf-window>
      <vf-dialog id="dlg" heading="My Dialog" open><p>Body</p></vf-dialog>
    </div>
  `)

  const maxWidth = (id) =>
    page.evaluate(
      (hostId) =>
        getComputedStyle(
          document.getElementById(hostId).shadowRoot.querySelector('[part=title]')
        ).maxWidth,
      id
    )
  check(`window title clears its widgets (--vf-title-inset 60px x${S})`,
    (await maxWidth('win')) === `calc(100% - ${60 * S}px)`, await maxWidth('win'))
  check(`dialog title takes the ${16}px default inset`,
    (await maxWidth('dlg')) === `calc(100% - ${16 * S}px)`, await maxWidth('dlg'))

  // The title never reaches under a widget: its right edge stays left of the
  // zoom box's left edge (this is what the inset exists to guarantee).
  const clear = await page.evaluate(() => {
    const root = document.getElementById('win').shadowRoot
    const t = root.querySelector('[part=title]').getBoundingClientRect()
    const z = root.querySelector('[part=zoom-box]').getBoundingClientRect()
    const c = root.querySelector('[part=close-box]').getBoundingClientRect()
    return { titleL: t.left, titleR: t.right, zoomL: z.left, closeR: c.right }
  })
  check('an over-long window title cannot run under the close/zoom boxes',
    clear.titleR <= clear.zoomL && clear.titleL >= clear.closeR,
    `title ${clear.titleL}-${clear.titleR}, boxes ${clear.closeR}/${clear.zoomL}`)

  const touch = (id) =>
    page.evaluate(
      (hostId) =>
        getComputedStyle(
          document.getElementById(hostId).shadowRoot.querySelector('[part=title-bar]')
        ).touchAction,
      id
    )
  check('movable window bar suppresses touch scrolling', (await touch('win')) === 'none')
  check('NON-movable window bar does not (touch scrolling still works)',
    (await touch('fixed')) === 'auto', await touch('fixed'))
  check('dialog bar always suppresses it (always a drag handle)',
    (await touch('dlg')) === 'none')

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   3. RE-THEME — one token move carries every consumer of the shared recipe
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <div id="host" style="position:relative;--vf-titlebar-height:26px;--vf-shadow-offset:4px">
      <vf-window id="win" heading="W" movable style="width:300px;height:200px"><p>B</p></vf-window>
      <vf-dialog id="dlg" heading="D" open><p>B</p></vf-dialog>
      <vf-alert id="alert" variant="caution" open>Careful</vf-alert>
    </div>
  `)
  const barH = async (id) => (await partMetrics(page, id, 'title-bar', ['height'])).height
  check(`re-themed titlebar height carries the window (26px x${S})`,
    (await barH('win')) === `${26 * S}px`, await barH('win'))
  check('…and the dialog, from the same token',
    (await barH('dlg')) === `${26 * S}px`, await barH('dlg'))

  const shadow = async (id) => (await partMetrics(page, id, 'frame', ['box-shadow']))['box-shadow']
  const want = `rgb(0, 0, 0) ${4 * S}px ${4 * S}px 0px 0px`
  check('re-themed shadow offset carries the window', (await shadow('win')) === want,
    await shadow('win'))
  check('…the dialog', (await shadow('dlg')) === want, await shadow('dlg'))
  check('…and the alert, which shares only the shadow (its border stays 2px)',
    (await shadow('alert')) === want, await shadow('alert'))
  const alertBorder = (await partMetrics(page, 'alert', 'frame', ['border-top-width']))['border-top-width']
  check(`alert keeps its own heavier ${2}px x${S} outer rule`,
    alertBorder === `${2 * S}px`, alertBorder)

  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   4. --vf-title-inset is a real knob (the parameterization, not a constant)
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <div id="host" style="position:relative;--vf-title-inset:40px">
      <vf-dialog id="dlg" heading="D" open><p>B</p></vf-dialog>
    </div>
  `)
  const mw = await page.evaluate(() =>
    getComputedStyle(
      document.getElementById('dlg').shadowRoot.querySelector('[part=title]')
    ).maxWidth
  )
  check(`consumer --vf-title-inset reaches the dialog title (40px x${S})`,
    mw === `calc(100% - ${40 * S}px)`, mw)
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   5. WIRED — the helper's four pointer bindings are live on both components
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <div id="host" style="position:relative;height:600px">
      <vf-window id="win" heading="Drag Me" movable
        style="width:300px;height:200px"><p>Body</p></vf-window>
    </div>
  `)
  const bar = await page.evaluate(() => {
    const b = document.getElementById('win').shadowRoot
      .querySelector('[part=title-bar]').getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x + 60, bar.y + 45, { steps: 6 })
  await page.mouse.up()
  const moved = await page.evaluate(() => {
    const el = document.getElementById('win')
    return { pos: getComputedStyle(el).position, left: el.style.left, top: el.style.top }
  })
  check('window title-bar drag moves the window',
    moved.pos === 'absolute' && parseFloat(moved.left) >= 55 && parseFloat(moved.top) >= 40,
    `${moved.left},${moved.top}`)
  check('dragged origin lands on the device grid (no fringe)',
    Number.isInteger(parseFloat(moved.left)) && Number.isInteger(parseFloat(moved.top)),
    `${moved.left},${moved.top}`)

  // A non-movable window must ignore the same gesture.
  await page.evaluate(() => document.getElementById('win').removeAttribute('movable'))
  await page.evaluate(() => document.getElementById('win').updateComplete)
  const before = await page.evaluate(() => document.getElementById('win').style.left)
  const bar2 = await page.evaluate(() => {
    const b = document.getElementById('win').shadowRoot
      .querySelector('[part=title-bar]').getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await page.mouse.move(bar2.x, bar2.y)
  await page.mouse.down()
  await page.mouse.move(bar2.x + 50, bar2.y + 30, { steps: 4 })
  await page.mouse.up()
  const after = await page.evaluate(() => document.getElementById('win').style.left)
  check('a non-movable window ignores the drag', before === after, `${before} → ${after}`)
  await page.close()
}
{
  const page = await build(`
    <vf-dialog id="dlg" heading="Drag Me" open><p>Body</p></vf-dialog>
  `)
  const bar = await page.evaluate(() => {
    const b = document.getElementById('dlg').shadowRoot
      .querySelector('[part=title-bar]').getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  const start = await page.evaluate(() => {
    const d = document.getElementById('dlg').shadowRoot.querySelector('dialog')
    return { ml: parseFloat(d.style.marginLeft), mt: parseFloat(d.style.marginTop) }
  })
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x + 40, bar.y + 25, { steps: 5 })
  await page.mouse.up()
  const end = await page.evaluate(() => {
    const d = document.getElementById('dlg').shadowRoot.querySelector('dialog')
    return { ml: parseFloat(d.style.marginLeft), mt: parseFloat(d.style.marginTop) }
  })
  check('dialog title-bar drag moves the dialog',
    near(end.ml - start.ml, 40, 1.5) && near(end.mt - start.mt, 25, 1.5),
    `Δ ${end.ml - start.ml},${end.mt - start.mt}`)
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   6. ACCESSIBLE NAMES — the fold-ins
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <div id="host" style="position:relative">
      <vf-window id="titled" heading="Read Me" closable zoomable
        style="width:300px;height:120px"><p>B</p></vf-window>
      <vf-window id="untitled" closable zoomable
        style="width:300px;height:120px"><p>B</p></vf-window>
      <vf-window id="inactive" heading="Behind" closable zoomable
        style="width:300px;height:120px"><p>B</p></vf-window>
    </div>
  `)
  const widget = (id, part) =>
    page.evaluate(
      ([hostId, sel]) =>
        document.getElementById(hostId).shadowRoot
          .querySelector(`[part=${sel}]`)
          ?.getAttribute('aria-label') ?? null,
      [id, part]
    )
  check('window close box is qualified by the heading',
    (await widget('titled', 'close-box')) === 'Close Read Me', await widget('titled', 'close-box'))
  check('window zoom box is too',
    (await widget('titled', 'zoom-box')) === 'Zoom Read Me', await widget('titled', 'zoom-box'))
  check('an untitled window falls back to the bare label',
    (await widget('untitled', 'close-box')) === 'Close', await widget('untitled', 'close-box'))

  // Renaming the window renames its widgets.
  await page.evaluate(() => {
    document.getElementById('titled').heading = 'Renamed'
  })
  await page.evaluate(() => document.getElementById('titled').updateComplete)
  check('the labels track a heading change',
    (await widget('titled', 'close-box')) === 'Close Renamed', await widget('titled', 'close-box'))

  // An inactive window's widgets are display:none — absent, not just invisible,
  // so they can't be reached by keyboard either.
  await page.evaluate(() => document.getElementById('inactive').removeAttribute('active'))
  await page.evaluate(() => document.getElementById('inactive').updateComplete)
  const hidden = await page.evaluate(() => {
    const root = document.getElementById('inactive').shadowRoot
    const box = root.querySelector('[part=close-box]')
    box.focus()
    return {
      display: getComputedStyle(box).display,
      focused: root.activeElement === box,
      stripes: getComputedStyle(root.querySelector('.vf-stripes')).display,
    }
  })
  check('inactive window hides its widgets and stripes',
    hidden.display === 'none' && hidden.stripes === 'none',
    `${hidden.display}/${hidden.stripes}`)
  check('…and they are not keyboard-reachable while hidden', hidden.focused === false)
  await page.close()
}
{
  const page = await build(`
    <vf-dialog id="titled" heading="Save Changes" open><p>B</p></vf-dialog>
  `)
  const aria = await page.evaluate(() => {
    const d = document.getElementById('titled').shadowRoot.querySelector('dialog')
    const t = document.getElementById('titled').shadowRoot.querySelector('[part=title]')
    return {
      labelledby: d.getAttribute('aria-labelledby'),
      label: d.getAttribute('aria-label'),
      titleId: t.id,
      titleText: t.textContent,
    }
  })
  check('a titled dialog is named by its title patch',
    aria.labelledby === 'title' && aria.label === null && aria.titleId === 'title' &&
    aria.titleText === 'Save Changes',
    JSON.stringify(aria))
  await page.close()
}
{
  const page = await build(`
    <vf-dialog id="bare" open><p>B</p></vf-dialog>
    <vf-dialog id="named" label="Preferences" open><p>B</p></vf-dialog>
    <vf-dialog id="both" heading="Heading" label="Explicit" open><p>B</p></vf-dialog>
  `)
  const aria = (id) =>
    page.evaluate((hostId) => {
      const d = document.getElementById(hostId).shadowRoot.querySelector('dialog')
      return { labelledby: d.getAttribute('aria-labelledby'), label: d.getAttribute('aria-label') }
    }, id)
  const bare = await aria('bare')
  check('a heading-less dialog names itself instead of pointing at an empty node',
    bare.labelledby === null && bare.label === 'Dialog', JSON.stringify(bare))
  const named = await aria('named')
  check('…using `label` when the consumer supplies one',
    named.labelledby === null && named.label === 'Preferences', JSON.stringify(named))
  const both = await aria('both')
  check('an explicit `label` wins over the heading', both.label === 'Explicit', JSON.stringify(both))

  await page.close()
}
{
  // Real computed accessible name, not just the attribute. aria-label sets an
  // attribute here (unlike internals.ariaLabel), but the attribute proves only
  // that we wrote it — the AX tree proves the name actually computes, which is
  // the thing that was broken when aria-labelledby pointed at an empty node.
  //
  // On its OWN page: several open modals make all but the topmost inert, and an
  // inert dialog is dropped from the AX tree entirely, so probing the one from
  // the group above finds no node at all.
  //
  // The <dialog> lives in the shadow root, so walk the pierced DOM to its
  // nodeId: DOM.querySelector does not cross a shadow boundary, and
  // fetchRelatives reaches ancestors/siblings, not shadow descendants.
  const page = await build(`<vf-dialog id="bare" open><p>B</p></vf-dialog>`)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Accessibility.enable')
  const doc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  const walk = (node, match) => {
    if (match(node)) return node
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
      const found = walk(child, match)
      if (found) return found
    }
    return null
  }
  const attr = (node, name) => {
    const a = node.attributes ?? []
    for (let i = 0; i < a.length; i += 2) if (a[i] === name) return a[i + 1]
    return null
  }
  const host = walk(doc.root, (n) => n.nodeName === 'VF-DIALOG' && attr(n, 'id') === 'bare')
  const nativeDialog = host && walk(host, (n) => n.nodeName === 'DIALOG')
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId: nativeDialog.nodeId,
    fetchRelatives: false,
  })
  const dlgNode = nodes.find((n) => n.role?.value === 'dialog')
  check('Chromium computes the fallback name on the dialog itself',
    dlgNode?.name?.value === 'Dialog', dlgNode?.name?.value ?? 'no dialog node')
  await page.close()
}

/* ────────────────────────────────────────────────────────────────────────────
   7. SCALE 1 — the recipe is authored in system px, not baked at x3
   ──────────────────────────────────────────────────────────────────────── */
{
  const page = await build(`
    <div id="host" style="position:relative;--vf-scale:1">
      <vf-window id="win" heading="W" movable style="width:200px;height:120px"><p>B</p></vf-window>
      <vf-dialog id="dlg" heading="D" open><p>B</p></vf-dialog>
    </div>
  `)
  const bar = async (id) =>
    await partMetrics(page, id, 'title-bar', ['height', 'border-bottom-width'])
  const w = await bar('win')
  const d = await bar('dlg')
  check('at --vf-scale:1 the bar is the authored 18px, both components',
    w.height === '18px' && d.height === '18px', `${w.height}/${d.height}`)
  check('…and the rules are 1px, not 3', w['border-bottom-width'] === '1px' &&
    d['border-bottom-width'] === '1px')
  const frame = await partMetrics(page, 'win', 'frame', ['box-shadow'])
  check('…and the shadow is the authored 2px', frame['box-shadow'] === 'rgb(0, 0, 0) 2px 2px 0px 0px',
    frame['box-shadow'])
  await page.close()
}

await browser.close()

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
