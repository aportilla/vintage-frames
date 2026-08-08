/**
 * Verifies automatic device-pixel-grid snapping (src/grid-snap.ts).
 *
 * verify:grid checks that a page's components ARE on the grid. This checks the
 * harder thing: that they get back onto it by themselves after the page puts
 * them off it. Each page is deliberately knocked off-grid with a fractional
 * offset — the generic form of the ratio line-height and text-derived width
 * faults in the layout contract — and then applyGridSnap() has to recover it.
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
 * directly), the `nosnap` opt-out, and the cleanup function.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:snap
 */
import { ORIGIN, heartbeat, launch } from './harness.mjs'

// ?nosnap: blog.html turns snapping on itself, which would correct the
// perturbation before the broken baseline is measured — the page has to stay
// inert so enableSnap() below is the only thing that flips the switch.
const PAGES = (process.env.VF_SNAP_PAGES ?? '/,/blog.html?nosnap').split(',')
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
 * ride a corrected container) are skipped.
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
      if (e > worst) {
        worst = e
        tag = host.tagName.toLowerCase()
      }
    }
    // `worst` is what the kit is answerable for; `raw` includes the engine's
    // own quantization, which is common-mode across a before/after comparison
    // and so is the right figure for "did the perturbation land".
    return { worst: +worst.toFixed(6), raw: +worstRaw.toFixed(6), tag, hosts }
  })

/**
 * Non-1-bit pixels in a crop around the first vf-button, and how far the worst
 * one strays from pure black/white.
 */
const raster = async (page) => {
  const box = await page.evaluate(() => {
    // Any fully visible button will do — the first in the document can sit
    // below the fold (the showcase at --vf-scale 3), which used to skip this
    // check silently. The margins keep the crop inside the viewport.
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

/**
 * Turn snapping on through the library's own entry point. The demo pages import
 * `../src/index.js`, which Vite serves as /src/index.ts — importing the same
 * specifier here yields the same module instance, and therefore the same
 * scheduler the components registered with.
 */
const enableSnap = (page) =>
  page.evaluate(async () => {
    const mod = await import('/src/index.ts')
    window.__vfSnapOff = mod.applyGridSnap()
    // Two frames: one for the sweep, one to be sure it settled.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })

const disableSnap = (page) =>
  page.evaluate(async () => {
    window.__vfSnapOff?.()
    await new Promise((r) => requestAnimationFrame(r))
  })

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
    const broken = await worstOrigin(page)
    const brokenRaster = await raster(page)
    check(
      broken.raw > DEADBAND,
      'perturbation knocks it off the grid',
      `worst ${broken.raw} device px (${broken.tag || 'engine quantization'})`
    )

    await enableSnap(page)
    const snapped = await worstOrigin(page)
    check(
      snapped.worst <= DEADBAND,
      'GEOMETRY  every host back on the grid',
      `worst ${snapped.worst} device px${snapped.tag ? ` (${snapped.tag})` : ''}`
    )
    const snappedRaster = await raster(page)
    if (snappedRaster && brokenRaster) {
      rasterCheck(
        snappedRaster.worst <= MAX_LEVEL,
        'RASTER    no visible fringe left',
        `${brokenRaster.stray} stray px (worst ±${brokenRaster.worst}/255) → ` +
          `${snappedRaster.stray} (worst ±${snappedRaster.worst}/255)`
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

    await disableSnap(page)
    const restored = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((el) => el.tagName.toLowerCase().startsWith('vf-'))
        .filter(
          (el) =>
            el.style.getPropertyValue('--vf-snap-dx') ||
            el.style.getPropertyValue('--vf-snap-dy')
        ).length
    )
    check(restored === 0, 'cleanup restores every host', `${restored} left with snap variables`)

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
      const err = (v) => Math.abs(v * dpr - Math.round(v * dpr))
      return {
        worst: +Math.max(err(rect.left), err(rect.top)).toFixed(6),
        left: +el.getBoundingClientRect().left.toFixed(3),
        position: getComputedStyle(el).position,
        offset: `${el.style.left || '—'},${el.style.top || '—'}`,
        vars: `${el.style.getPropertyValue('--vf-snap-dx') || '—'},${
          el.style.getPropertyValue('--vf-snap-dy') || '—'
        }`,
      }
    })

  const off = await state()
  check(off.worst > DEADBAND, 'window starts off the grid', `worst ${off.worst} device px`)

  await enableSnap(page)
  const on = await state()
  check(
    on.worst <= DEADBAND,
    'in-flow window corrects via its frame',
    `worst ${on.worst}, vars ${on.vars}, host left/top ${on.offset}`
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

  await disableSnap(page)
  await page.close()
}

await browser.close()

if (failed) {
  console.log('\nSee src/grid-snap.ts and the layout contract in README.')
  process.exitCode = 1
} else {
  console.log('\nAll snap checks passed.')
}
