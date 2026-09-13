/**
 * Verifies automatic device-pixel-grid snapping (src/grid-snap.ts).
 *
 * verify:grid checks that a page's components ARE on the grid. This checks the
 * harder thing: that they get back onto it by themselves after the page puts
 * them off it. Each page is deliberately knocked off-grid with a fractional
 * offset — the generic form of the ratio line-height and text-derived width
 * faults in the layout contract — and the components' own always-on snapping
 * has to recover it. There is no inert baseline to render: the correction is
 * in before the next paint, so the perturbation is proven on the HOST origins
 * (which a component's own correction never moves) and recovery on the
 * corrected paint positions.
 *
 * Two measurements, because passing one without the other means nothing:
 *
 *   GEOMETRY   every vf-* host's origin lands within the controller's deadband
 *              of a whole device pixel.
 *   RASTER     a cropped vf-button contains no pixel that is neither pure black
 *              nor pure white. This is the thing that actually matters — an
 *              origin that measures right but rasterizes soft is still a bug.
 *              A clean page scores 0; an off-grid one scores ~1000, most of it
 *              mid-gray.
 *
 * Then the parts that break in the field rather than in a first render: a
 * reflow (the correction has to be re-applied, and nothing observes position
 * directly), and the `nosnap` opt-out.
 *
 * And a host that moves again after it was corrected — shifted half a device
 * pixel at a time, and carried along by an animated panel above it, at display
 * density (harness `browserAt`) at dpr 1, 2 and 3. Every correction stays
 * within half a device pixel, and matches what a sweep from zero computes for
 * the same layout: the correction depends on where the host is, never on the
 * moves that got it there.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:snap
 */
import { ORIGIN, browserAt, closeBrowsers, heartbeat, launch } from './harness.mjs'

// (`/` is the component reference since the faux desktop moved to the
// system7web repo.)
const PAGES = (process.env.VF_SNAP_PAGES ?? '/').split(',')
const DENSITIES = (process.env.VF_SNAP_DPR ?? '1,2,3').split(',').map(Number)

/** Must match DEADBAND_DEVICE_PX in src/grid-snap.ts, plus float slack. */
const DEADBAND = 0.05 + 1e-4
/** Worst tolerated deviation from pure black/white, out of 255. */
const MAX_LEVEL = 16
/** The fractional offset we knock the page off-grid with. */
const PERTURB = 'body { padding-left: .4px; padding-top: .4px; }'

let failed = false
const check = (ok, label, detail = '') => {
  if (!ok) failed = true
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `   ${detail}` : ''}`)
  heartbeat(label) // this script reports per line, so it feeds the watchdog itself
  return ok
}

/**
 * Worst corrected-paint error over every vf-* host, in device px: the host
 * origin plus the offset its snap variables apply inside it. The paint roots
 * themselves may sit at *authored* fractional offsets (a toggle's centered
 * box), which are the component's design, not a fault. Hosts without a
 * `.vf-snap` target (vf-button-group, vf-radio-group, rows and options that
 * ride a corrected container) are skipped. `hostWorst` is the worst error of
 * the bare host origins — the page's own contribution, which a component's
 * correction never moves, so it is what proves a perturbation landed.
 */
const worstOrigin = (page) =>
  page.evaluate(async () => {
    // trueDpr, not devicePixelRatio — identical at zoom 1, correct under it.
    const { truePixelRatio } = await import('/src/index.ts')
    const dpr = truePixelRatio()
    const err = (css) => Math.abs(css * dpr - Math.round(css * dpr))
    /**
     * Error the engine cannot avoid, discounted before "worst" is reported: a
     * --vf-scale it cannot hold as a whole number of its 1/64-CSS-px layout
     * units leaves every length a fraction short, and a nested one another
     * fraction. Every scale a 1× or 2× display derives is holdable at every
     * zoom, so this is zero there; a true 3× device derives 4/3, which is not.
     * Half a device pixel — what actually smears 1-bit art — is never
     * discounted.
     */
    const floorFor = (host) => {
      const scale =
        parseFloat(getComputedStyle(host).getPropertyValue('--vf-scale')) || 1
      return Math.abs(scale * 64 - Math.round(scale * 64)) < 1e-9 ? 0 : 0.5
    }
    let worst = 0
    let worstRaw = 0
    let hostWorst = 0
    let tag = ''
    let hosts = 0
    for (const host of document.querySelectorAll('*')) {
      if (!host.tagName.toLowerCase().startsWith('vf-')) continue
      const target =
        host.shadowRoot &&
        [...host.shadowRoot.children].find((c) => c.classList.contains('vf-snap'))
      if (!target) continue
      const rect = host.getBoundingClientRect()
      if (!rect.width && !rect.height) continue
      hosts++
      const dx = parseFloat(host.style.getPropertyValue('--vf-snap-dx')) || 0
      const dy = parseFloat(host.style.getPropertyValue('--vf-snap-dy')) || 0
      const raw = Math.max(err(rect.left + dx), err(rect.top + dy))
      const e = raw < floorFor(host) ? 0 : raw
      if (raw > worstRaw) worstRaw = raw
      const hostRaw = Math.max(err(rect.left), err(rect.top))
      if (hostRaw > hostWorst) hostWorst = hostRaw
      if (e > worst) {
        worst = e
        tag = host.tagName.toLowerCase()
      }
    }
    // `worst` is what the kit is answerable for; `hostWorst` is the page's,
    // untouched by corrections — the right figure for "did the perturbation
    // land".
    return {
      worst: +worst.toFixed(6),
      raw: +worstRaw.toFixed(6),
      hostWorst: +hostWorst.toFixed(6),
      tag,
      hosts,
    }
  })

/**
 * Non-1-bit pixels in a crop around the first vf-button, and how far the worst
 * one strays from pure black/white.
 */
const raster = async (page) => {
  // Any fully visible button will do; the margins keep the crop inside the
  // viewport.
  const find = () =>
    page.evaluate(() => {
      const r = [...document.querySelectorAll('vf-button')]
        .map((el) => el.getBoundingClientRect())
        .find(
          (r) =>
            r.width && r.left >= 2 && r.top >= 2 &&
            r.right <= innerWidth - 6 && r.bottom <= innerHeight - 6
        )
      if (!r) return null
      return {
        x: Math.floor(r.left) - 2,
        y: Math.floor(r.top) - 2,
        width: Math.ceil(r.width) + 6,
        height: Math.ceil(r.height) + 6,
      }
    })
  let box = await find()
  if (!box) {
    // The reference page's first button sits below the fold. Scroll one into
    // view — the scroll trigger re-applies corrections before the next paint —
    // and settle before measuring the crop.
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('vf-button')].find(
        (el) => el.getBoundingClientRect().width
      )
      btn?.scrollIntoView({ block: 'center' })
    })
    await settle(page)
    box = await find()
  }
  if (!box) return null
  const png = (await page.screenshot({ clip: box })).toString('base64')
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + data
    await img.decode()
    const canvas = new OffscreenCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const { data: px } = ctx.getImageData(0, 0, img.width, img.height)
    let stray = 0
    let worst = 0
    for (let i = 0; i < px.length; i += 4) {
      const v = px[i]
      if (px[i + 1] !== v || px[i + 2] !== v) {
        stray++
        worst = 255
        continue
      }
      if (v === 0 || v === 255) continue
      stray++
      worst = Math.max(worst, Math.min(v, 255 - v))
    }
    return { stray, worst }
  }, png)
}

const settle = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )

const browser = await launch()

for (const path of PAGES) {
  for (const dpr of DENSITIES) {
    const page = await browser.newPage({
      viewport: { width: 1320, height: 950 },
      deviceScaleFactor: dpr,
    })
    await page.goto(new URL(path, ORIGIN).href, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => customElements.get('vf-button') !== undefined)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)

    console.log(`\n${path}  dpr ${dpr}`)

    // On a true 3× device the derived --vf-scale is 4/3, which Chromium's
    // 1/64-CSS-px layout grid cannot hold, so a tiled fill drifts a fraction of
    // a device pixel further off with each repeat and leaves a fringe no amount
    // of snapping can correct — the offsets are already right. See
    // docs/THREE-X-DISPLAYS.md. The pixel counts are still printed.
    const holdable = await page.evaluate(async () => {
      const { truePixelRatio, devicePxPerSystemPx } = await import('/src/index.ts')
      const d = truePixelRatio()
      const scale = devicePxPerSystemPx(d) / d
      return Math.abs(scale * 64 - Math.round(scale * 64)) < 1e-9
    })
    const rasterCheck = (ok, label, detail) =>
      holdable
        ? check(ok, label, detail)
        : console.log(`  --   ${label} (3× device, unholdable scale)   ${detail}`)

    const clean = await raster(page)
    const before = await worstOrigin(page)
    check(before.worst === 0, 'page starts on the grid', `${before.hosts} hosts`)
    if (clean) rasterCheck(clean.stray === 0, 'page starts crisp', `${clean.stray} stray px`)
    else console.log('  --   raster: no fully visible vf-button — geometry checks only')

    await page.addStyleTag({ content: PERTURB })
    await settle(page)
    // One more sweep before measuring: a correction can itself move nested
    // content (a re-measured width, a stack's centering tie), and the residue
    // waits for the next trigger — which a live page gets constantly and this
    // frozen one has to ask for. (The old opt-in flow forced the same fresh
    // sweep by enabling snapping here.)
    await page.evaluate(async () => {
      const { requestGridSnap } = await import('/src/index.ts')
      requestGridSnap()
    })
    await settle(page)
    const perturbed = await worstOrigin(page)
    check(
      perturbed.hostWorst > DEADBAND,
      'perturbation lands on the hosts',
      `worst host origin ${perturbed.hostWorst} device px`
    )
    check(
      perturbed.worst <= DEADBAND,
      'GEOMETRY  every paint recovered, by itself',
      `worst ${perturbed.worst} device px${perturbed.tag ? ` (${perturbed.tag})` : ''}`
    )
    const perturbedRaster = await raster(page)
    if (perturbedRaster) {
      rasterCheck(
        perturbedRaster.worst <= MAX_LEVEL,
        'RASTER    no visible fringe under the perturbation',
        `${perturbedRaster.stray} stray px (worst ±${perturbedRaster.worst}/255)`
      )
    } else {
      console.log('  --   RASTER skipped: no fully visible vf-button to crop')
    }

    // A reflow moves everything; nothing in the platform reports a pure
    // position change, so this exercises the trigger set.
    await page.setViewportSize({ width: 1180, height: 950 })
    await page.waitForTimeout(250)
    await settle(page)
    const reflowed = await worstOrigin(page)
    check(
      reflowed.worst <= DEADBAND,
      'holds through a reflow',
      `worst ${reflowed.worst} device px${reflowed.tag ? ` (${reflowed.tag})` : ''}`
    )

    // nosnap opts a single element out — and gives it its own styles back,
    // rather than freezing whatever correction was applied when it arrived.
    const optOut = await page.evaluate(async () => {
      const vars = (el) => [
        el.style.getPropertyValue('--vf-snap-dx'),
        el.style.getPropertyValue('--vf-snap-dy'),
      ]
      const corrected = [...document.querySelectorAll('*')]
        .filter((el) => el.tagName.toLowerCase().startsWith('vf-'))
        .find((el) => vars(el).some(Boolean))
      if (!corrected) return null
      const before = corrected.getAttribute('style')
      corrected.setAttribute('nosnap', '')
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const remaining = vars(corrected).filter(Boolean)
      corrected.removeAttribute('nosnap')
      return { tag: corrected.tagName.toLowerCase(), before, remaining }
    })
    check(
      optOut !== null && optOut.remaining.length === 0,
      'nosnap opts a host out and restores it',
      optOut
        ? `${optOut.tag} "${optOut.before}" → "${optOut.remaining.join(' ') || '(cleared)'}"`
        : 'no host was corrected — nothing to opt out'
    )

    await page.close()
  }
}

/*
 * vf-window writes its own inline `position`/`left`/`top` on every frame of a
 * drag — the one component whose host coordinates are actively owned by its
 * own code. The correction lives on the frame inside the shadow root (driven
 * by host variables), so the two must never collide: the drag keeps working
 * untouched, and the frame stays on the grid before, during and after the
 * position flip the first drag performs (in-flow → absolute). Driven on a
 * page small enough that the drag can't land on the wrong window.
 */
{
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 2,
  })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  // The desktop opts out and shifts its content box, so the window has to
  // correct itself rather than inherit an ancestor's correction.
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><body style="margin:0">
     <vf-desktop nosnap style="height:700px;padding:.4px 0 0 .4px">
       <vf-window id="win" heading="Drag Me" movable width="200" height="120"
         ><p>Body</p></vf-window
       >
     </vf-desktop>`
  )
  await page.evaluate(() => import('/src/index.ts'))
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('*')]
        .filter((e) => e.tagName.toLowerCase().startsWith('vf-'))
        .map((e) => e.updateComplete)
    )
  )
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(200)

  console.log('\nvf-window drag  dpr 2')

  const state = () =>
    page.evaluate(async () => {
      const { truePixelRatio } = await import('/src/index.ts')
      const dpr = truePixelRatio()
      const el = document.getElementById('win')
      const frame = el.shadowRoot.querySelector('.vf-snap')
      const rect = frame.getBoundingClientRect()
      const host = el.getBoundingClientRect()
      const err = (v) => Math.abs(v * dpr - Math.round(v * dpr))
      return {
        worst: +Math.max(err(rect.left), err(rect.top)).toFixed(6),
        hostWorst: +Math.max(err(host.left), err(host.top)).toFixed(6),
        left: +host.left.toFixed(3),
        position: getComputedStyle(el).position,
        offset: `${el.style.left || '—'},${el.style.top || '—'}`,
        vars: `${el.style.getPropertyValue('--vf-snap-dx') || '—'},${
          el.style.getPropertyValue('--vf-snap-dy') || '—'
        }`,
      }
    })

  const initial = await state()
  check(
    initial.hostWorst > DEADBAND,
    'the desktop leaves the window host off the grid',
    `worst ${initial.hostWorst} device px`
  )
  check(
    initial.worst <= DEADBAND,
    'in-flow window corrects via its frame',
    `worst ${initial.worst}, vars ${initial.vars}, host left/top ${initial.offset}`
  )

  const bar = await page.evaluate(() => {
    const el = document.getElementById('win')
    const b = el.shadowRoot.querySelector('[part=title-bar]').getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: el.getBoundingClientRect().left }
  })
  await page.mouse.move(bar.x, bar.y)
  await page.mouse.down()
  await page.mouse.move(bar.x + 60, bar.y + 30, { steps: 5 })
  await page.mouse.up()
  await settle(page)

  const dragged = await state()
  check(
    Math.abs(dragged.left - bar.left - 60) < 1.5,
    'the drag still moves the window',
    `${bar.left} → ${dragged.left}`
  )
  check(
    dragged.position === 'absolute',
    'the drag still switches it to absolute',
    dragged.position
  )
  check(
    dragged.worst <= DEADBAND,
    'the dragged window lands on the grid',
    `worst ${dragged.worst} device px, vars ${dragged.vars}, left/top ${dragged.offset}`
  )

  await page.close()
}

/*
 * A host that moves after it was corrected. Nothing in the platform reports a
 * position change, so the controller re-derives its correction on every sweep
 * — and it has to derive it from where the host is now. Derived from the
 * painted position instead (host plus the correction already applied), each
 * move is rounded from wherever the last correction left the paint, every
 * move's rounding error is kept, and controls under an animated panel end up
 * painting whole device pixels outside their boxes. Two movers: a spacer
 * shifted half a device pixel at a time (the tie always rounds the same way,
 * so a kept error grows by half a pixel per move), and a disclosure panel
 * animating its height (one fractional move per frame).
 */
for (const dpr of [1, 2, 3]) {
  const browser = await browserAt(dpr, { width: 900, height: 700 })
  const page = await browser.newPage({ viewport: null })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>
       #panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 300ms ease; }
       #panel.open { grid-template-rows: 1fr; }
       #panel > div { overflow: hidden; }
     </style>
     <body style="margin:0;font:15px/1.45 system-ui,sans-serif">
       <div id="spacer" style="height:10px"></div>
       <div id="panel">
         <div><p style="margin:12px 16px 0">Cache size and connection timeouts rarely need changing. These settings apply to every window.</p></div>
       </div>
       <div style="display:flex;gap:12px;align-items:center;margin:16px">
         <vf-checkbox id="remember">Remember my choice</vf-checkbox>
         <vf-button id="cancel">Cancel</vf-button>
         <vf-button id="ok" variant="default">OK</vf-button>
       </div>
     </body>`
  )
  await page.evaluate(() => import('/src/index.ts'))
  await page.evaluate(() =>
    Promise.all(
      ['remember', 'cancel', 'ok'].map((id) => document.getElementById(id).updateComplete)
    )
  )
  await page.evaluate(() => document.fonts.ready)
  await settle(page)

  console.log(`\na corrected host moves again  dpr ${dpr} (display density)`)

  /** Each host's correction and the one a sweep from zero gives its layout, device px. */
  const corrections = () =>
    page.evaluate(async () => {
      const { truePixelRatio } = await import('/src/index.ts')
      const dpr = truePixelRatio()
      return ['remember', 'cancel', 'ok'].flatMap((id) => {
        const host = document.getElementById(id)
        const r = host.getBoundingClientRect()
        return [
          [r.left, '--vf-snap-dx'],
          [r.top, '--vf-snap-dy'],
        ].map(([edge, name]) => {
          const device = edge * dpr
          return {
            at: `${id} ${name.slice(-2)}`,
            applied: (parseFloat(host.style.getPropertyValue(name)) || 0) * dpr,
            fresh: Math.round(device) - device,
          }
        })
      })
    })
  // A correction is quantized to 1/64 CSS px: half of that step, in device px.
  const slack = dpr / 128 + 1e-6
  let worst = { applied: 0, drift: 0, at: '' }
  const record = (list, { fresh = true } = {}) => {
    for (const c of list) {
      if (Math.abs(c.applied) > Math.abs(worst.applied)) worst.applied = c.applied
      if (!fresh) continue
      const drift = Math.abs(c.applied - c.fresh)
      if (drift > worst.drift) worst = { ...worst, drift, at: c.at }
    }
  }
  const verdict = () =>
    Math.abs(worst.applied) <= 0.5 + slack && worst.drift <= DEADBAND + slack
  const detail = () =>
    `largest correction ${worst.applied.toFixed(3)} device px; ` +
    `furthest from a sweep from zero ${worst.drift.toFixed(3)}${worst.at ? ` (${worst.at})` : ''}`

  /** Clear every correction and sweep: the layout's corrections from zero. */
  const sweepFromZero = async () => {
    await page.evaluate(async () => {
      for (const id of ['remember', 'cancel', 'ok']) {
        const host = document.getElementById(id)
        host.style.removeProperty('--vf-snap-dx')
        host.style.removeProperty('--vf-snap-dy')
      }
      const { requestGridSnap } = await import('/src/index.ts')
      requestGridSnap()
    })
    await settle(page)
  }

  // Half a device pixel, eight times over.
  for (let i = 1; i <= 8; i++) {
    await page.evaluate(
      async ([height]) => {
        document.getElementById('spacer').style.height = `${height}px`
        const { requestGridSnap } = await import('/src/index.ts')
        requestGridSnap()
      },
      [10 + (i % 2) * (0.5 / dpr)]
    )
    await settle(page)
    record(await corrections())
  }
  check(verdict(), 'shifted half a device px eight times, every correction holds', detail())

  // The panel above opens and closes six times, starting from corrections a
  // sweep from zero computed, so nothing the shifts left behind counts here.
  await sweepFromZero()
  worst = { applied: 0, drift: 0, at: '' }
  let travel = 0
  for (let i = 1; i <= 6; i++) {
    const before = await page.evaluate(() => document.getElementById('ok').getBoundingClientRect().top)
    await page.evaluate(() => document.getElementById('panel').classList.toggle('open'))
    // Mid-animation the last sweep can be a frame behind the layout this
    // reads, so only the half-pixel bound holds there; at rest, the match
    // with a sweep from zero too.
    for (let t = 0; t < 3; t++) {
      await page.waitForTimeout(90)
      record(await corrections(), { fresh: false })
    }
    await page.waitForTimeout(180)
    await settle(page)
    record(await corrections())
    const after = await page.evaluate(() => document.getElementById('ok').getBoundingClientRect().top)
    travel += Math.abs(after - before)
  }
  check(
    travel > 20 && verdict(),
    'an animated panel above them, every correction holds',
    `${detail()}; the row travelled ${travel.toFixed(1)} CSS px`
  )

  // The same layout from zero: the corrections it held, recomputed.
  const kept = await corrections()
  await sweepFromZero()
  const fromZero = await corrections()
  const differ = kept
    .map((c, i) => ({ at: c.at, delta: Math.abs(c.applied - fromZero[i].applied) }))
    .filter((d) => d.delta > DEADBAND + slack)
  check(
    differ.length === 0,
    'a sweep from zero computes the corrections it already held',
    differ.length
      ? differ.map((d) => `${d.at} off by ${d.delta.toFixed(3)}`).join(', ')
      : `${kept.length} corrections compared`
  )

  await page.close()
}
await closeBrowsers()

await browser.close()

if (failed) {
  console.log('\nSee src/grid-snap.ts and the layout contract in README.')
  process.exitCode = 1
} else {
  console.log('\nAll snap checks passed.')
}
