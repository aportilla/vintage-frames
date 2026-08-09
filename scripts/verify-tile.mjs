/**
 * Verifies that every REPEATING fill lands on the device-pixel grid.
 *
 * A single edge tolerates a length the layout grid cannot hold — paint snaps
 * each box to whole device pixels on its own, which is why borders, stepped
 * corners and magnified icon art rasterize exactly even at `--vf-scale` 4/3.
 * A tiled fill does not: it is ONE snapped box holding N unsnapped repeats,
 * each placed at `k × tileSize`, so an unholdable tile size drifts a fraction
 * of a device pixel further with every repeat until the boundary has walked a
 * whole pixel. Before `vfTileSize`, 75% of the desktop dither rasterized to
 * mid-gray at dpr 1.5.
 *
 * The fix is a tile spanning `lcm(motif, 15)` system px (src/styles/recipes/
 * tile.ts): a whole number of motifs, so the art is unchanged, and holdable at
 * every scale the ladder derives, so every repeat lands exactly. This script
 * holds all five tiled surfaces to that — the geometry at six densities, and
 * the raster where the page can actually show it.
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:tile
 */
import { ORIGIN, check, decodePng, launch, report } from './harness.mjs'

/** Chromium's layout grid; Gecko's app unit is 1/60 and the same argument holds. */
const LAYOUT_UNIT = 1 / 64

const DENSITIES = [1, 1.25, 1.5, 2, 2.5, 3]

/**
 * Every repeating fill in the kit, with the motif it is drawn from. `layer` is
 * the tiled element inside the component's shadow root.
 *
 * The scroll trough is stated but not rendered: headless Chromium does not
 * paint `::-webkit-scrollbar` skins at all, so it is held to the arithmetic
 * alone (`spanOk` below), which is the part that was wrong.
 */
const SURFACES = [
  {
    name: 'desktop dither',
    markup: '<vf-desktop id="desk" width="240" height="160"></vf-desktop>',
    host: '#desk',
    layer: '.screen',
    motif: [2, 2],
    raster: true,
  },
  {
    name: 'windoid dots  ',
    markup:
      '<vf-window id="windoid" variant="utility" heading="Tools" width="240" height="60"></vf-window>',
    host: '#windoid',
    layer: '.vf-dots',
    motif: [2, 2],
  },
  {
    name: 'swatch checker',
    markup: '<vf-swatch id="sw"></vf-swatch>',
    host: '#sw',
    layer: '.fill',
    motif: [4, 4],
  },
  {
    name: 'barber stripes',
    markup: '<vf-progress-bar id="pb" indeterminate style="width:240px"></vf-progress-bar>',
    host: '#pb',
    layer: '.fill',
    motif: [12, 12],
  },
]

/** lcm(motif, 15) — the recipe's own rule, restated because this is plain JS. */
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))
const spanOf = (motif) => (motif * 15) / gcd(motif, 15)

const browser = await launch()

// ── the arithmetic, including the surface the page cannot render ──────────
for (const motif of [1, 2, 3, 4, 12]) {
  const span = spanOf(motif)
  const holdableEverywhere = [1, 3 / 2, 4 / 3, 8 / 5, 6 / 5, 5 / 4].every(
    (s) => Math.abs((span * s) / LAYOUT_UNIT - Math.round((span * s) / LAYOUT_UNIT)) < 1e-9
  )
  check(
    `a ${motif}-system-px motif spans ${span}: whole motifs, holdable at every derived scale`,
    span % motif === 0 && holdableEverywhere,
    `${span / motif} motifs`
  )
}
check(
  'the scroll trough states the same spans (4×2 motif → 60×30)',
  spanOf(4) === 60 && spanOf(2) === 30,
  'not rendered: headless Chromium paints no ::-webkit-scrollbar skin'
)

// ── the rendered geometry, at six densities ───────────────────────────────
for (const dpr of DENSITIES) {
  const page = await browser.newPage({
    viewport: { width: 900, height: 800 },
    deviceScaleFactor: dpr,
  })
  await page.route(ORIGIN, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
  )
  await page.goto(ORIGIN)
  await page.unroute(ORIGIN)
  // Each host at its own whole-CSS-px origin, so the measurement is of the
  // tile and not of the page's layout around it.
  await page.setContent(
    '<!doctype html><meta charset="utf-8"><style>body{margin:0}' +
      '[id]{position:absolute;left:0}' +
      // Far enough apart that nothing overlaps at any scale the ladder derives
      // (the desktop's 160 system px is 320 CSS px at the largest of them).
      '#desk{top:0}#windoid{top:340px}#sw{top:440px}#pb{top:520px}</style><body>' +
      SURFACES.map((s) => s.markup).join('')
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
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )

  const scale = await page.evaluate(() =>
    getComputedStyle(document.querySelector('vf-desktop')).getPropertyValue('--vf-scale').trim()
  )
  console.log(`\ndpr ${dpr}  --vf-scale ${scale}  (1 system px = ${(scale * dpr).toFixed(0)} device px)`)

  for (const s of SURFACES) {
    const size = await page.evaluate(
      ([host, layer]) => {
        const el = document.querySelector(host).shadowRoot.querySelector(layer)
        return el ? getComputedStyle(el).backgroundSize : null
      },
      [s.host, s.layer]
    )
    if (!size) {
      check(`${s.name}: layer found`, false, `${s.host} >>> ${s.layer}`)
      continue
    }
    const [w, h] = size.split(' ').map(parseFloat)
    const [mx, my] = s.motif
    const whole = (v) => Math.abs(v - Math.round(v)) < 1e-6
    check(
      `${s.name}: tile is whole in device px`,
      whole(w * dpr) && whole(h * dpr),
      `${size} = ${(w * dpr).toFixed(3)}×${(h * dpr).toFixed(3)} device px`
    )
    check(
      `${s.name}: tile is a whole number of ${mx}×${my} motifs`,
      whole(w / (mx * scale)) && whole(h / (my * scale)),
      `${(w / (mx * scale)).toFixed(3)}×${(h / (my * scale)).toFixed(3)} motifs`
    )
  }

  // ── the raster, where the layer's own origin is whole ────────────────────
  //
  // Only the desktop's is: its tiled layer fills the host from (0,0). The other
  // three sit inside a frame whose 1px border Chromium FLOORS to a whole CSS
  // px (measured: a 1-system-px border paints 3 device px at dpr 3, where a
  // system pixel is 4), which lands the layer on a half device pixel at dpr
  // 1.25/1.5/2.5 and smears a correctly-sized tile anyway. That is a border
  // defect, not a tile one — the residual is printed, not failed.
  // Counted over the fill's INTERIOR, one device pixel in from each edge: an
  // element whose own size is unholdable (160 system px is 213.328 CSS px at
  // 4/3, 319.992 device px) ends on a partially-covered row, and that row is
  // the box's edge rather than anything the tiling did.
  for (const s of SURFACES) {
    const { width, height, bpp, data } = decodePng(await page.locator(s.host).screenshot())
    let impure = 0
    let counted = 0
    for (let y = 1; y < height - 2; y++)
      for (let x = 1; x < width - 2; x++) {
        const i = y * width + x
        const [r, g, b] = [data[i * bpp], data[i * bpp + 1], data[i * bpp + 2]]
        const pure =
          (r === 0 && g === 0 && b === 0) ||
          (r === 255 && g === 255 && b === 255) ||
          (r === 192 && g === 192 && b === 192)
        if (!pure) impure++
        counted++
      }
    const pct = ((impure / counted) * 100).toFixed(1)
    if (s.raster) check(`${s.name}: rasterizes 1-bit`, impure === 0, `${pct}% impure`)
    else console.log(`  --   ${s.name}: ${pct}% impure (layer origin, see above)`)
  }

  await page.close()
}

await report(browser)
