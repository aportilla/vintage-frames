/**
 * The shared harness behind every `verify:*` script.
 *
 * The scripts are Playwright *drivers*: Node reaches into a real page and
 * asserts what the browser actually computed — rendered pixels, resolved
 * `calc()`, the accessibility tree, the device-pixel grid at three densities.
 * That direction is deliberate and load-bearing. `:focus-visible` and the
 * kit's focus-modality rule only respond to *trusted* input, which nothing
 * running inside the page can produce; clipped screenshots, per-context
 * `deviceScaleFactor` and the CDP Accessibility domain are all Node-side too.
 * jsdom can resolve none of it.
 *
 * What every script used to carry its own copy of — a page builder, a
 * `check()`, a tally, a PNG decoder, a CDP accessibility walker — lives here
 * once. 25 of the 28 `check()` definitions were byte-identical; this is that
 * one, plus the four helpers with more than one caller.
 *
 * A script stays runnable on its own (`npm run verify:focus`, against a dev
 * server you started), and `npm test` runs the whole suite and starts the
 * server itself — see scripts/test.mjs.
 */
import { chromium } from 'playwright'
import { inflateSync } from 'node:zlib'

/** Where the dev server is. `npm test` passes this through to every child. */
export const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

/**
 * CSS px per system px at `dpr` — the kit's own derivation, restated here
 * because harness.mjs is plain JS and cannot import the TypeScript source:
 * `round(96/72 × trueDpr)` whole device px per system px (src/zoom.ts,
 * `devicePxPerSystemPx`), divided back into CSS px.
 *
 *   dpr 1 → 1 device px  → scale 1
 *   dpr 2 → 3 device px  → scale 1.5
 *   dpr 3 → 4 device px  → scale 1.333…
 *
 * A script that measures CSS px multiplies its authored system-px figures by
 * this rather than by a literal — the constant that used to sit at the top of
 * nine scripts was 3, which was the *old* fixed target and only ever right on a
 * 2× display.
 */
export const devicePxPerSystemPxAt = (dpr = 1) =>
  Math.min(24, Math.max(1, Math.round((96 / 72) * dpr)))

/** Chromium's layout grid: used lengths are stored in 1/64 CSS px. */
export const LAYOUT_UNIT = 1 / 64

/**
 * Whether the engine can hold `scale` exactly, and so render every whole count
 * of system px on a whole device px.
 *
 * True at every scale the kit derives for a 1× or 2× display, at every zoom:
 * page zoom multiplies computed lengths at style time, so the layout length is
 * `systemPx × target / baseDpr` — whole, or a half. A *true* 3× device is the
 * case that is not: its 4/3 divides into thirds, which 1/64ths cannot express.
 */
export const holdableScale = (scale) =>
  Math.abs(scale / LAYOUT_UNIT - Math.round(scale / LAYOUT_UNIT)) < 1e-9

/**
 * The CSS length the engine will actually produce for `systemPx` at `scale` —
 * the ideal, snapped to the layout grid. Asserting against this rather than
 * against the ideal keeps a test exact on hardware where the ideal is
 * unrepresentable, instead of loosening it with a tolerance.
 */
export const cssPxFor = (systemPx, scale) => {
  const exact = systemPx * scale
  const units = exact / LAYOUT_UNIT
  // Blink FLOORS to the layout unit on this path (measured: 32 system px at
  // scale 4/3 is 42.6667 exactly and lands at 2730/64, not 2731/64), so a
  // floor with a hair of float slack is what reproduces it.
  return (Math.abs(units - Math.round(units)) < 1e-9
    ? Math.round(units)
    : Math.floor(units)) * LAYOUT_UNIT
}

/** …the same figure in device px. */
export const devicePxFor = (systemPx, scale, dpr) => cssPxFor(systemPx, scale) * dpr

/**
 * How far off a whole device pixel a measurement may land: zero where the scale
 * is holdable, one layout unit where it is not (a true 3× device).
 */
export const gridTolerance = (scale, dpr = 1) =>
  holdableScale(scale) ? 1e-6 : Math.max(1e-6, dpr * LAYOUT_UNIT)

export const scaleAt = (dpr = 1) => devicePxPerSystemPxAt(dpr) / dpr

/** The scale at headless Chromium's default density. */
export const SCALE = scaleAt(1)

// ─────────────────────────────────────────────────────────── checks & tally

/** Every check's outcome, in order, for {@link report} to count. */
export const results = []

// ───────────────────────────────────────────────────────────── the watchdog

/**
 * A stalled script must not be able to stall the suite.
 *
 * Playwright bounds its own calls, but not a promise the *page* returns: the
 * idiom `page.evaluate(() => new Promise(r => el.addEventListener(evt, r)))`
 * waits forever if the event never fires, and a click that missed or a dialog
 * that didn't close is exactly how that happens. One such wait cost a CI run
 * its whole 20-minute budget and printed nothing, because a script that never
 * exits never flushes the checks it had already passed.
 *
 * So: no progress for this long and the script prints what it got, names the
 * check it stalled *after*, and exits 1 — a diagnosable failure instead of a
 * hang. `VF_STALL_TIMEOUT=0` turns it off (for a debugging session under a
 * breakpoint).
 */
const STALL_MS = Number(process.env.VF_STALL_TIMEOUT ?? 120_000)
let stallTimer
let lastProgress = 'the first check (nothing has been checked yet)'

function onStall() {
  const failed = results.filter((r) => !r).length
  console.log(
    `\n[watchdog] no progress for ${STALL_MS / 1000}s after: ${lastProgress}\n` +
      '[watchdog] whatever ran next never resolved — usually an in-page promise ' +
      'waiting for an event that never fired.'
  )
  console.log(`\n${results.length - failed}/${results.length} checks passed (STALLED — incomplete)`)
  process.exit(1)
}

/**
 * Restart the stall clock. {@link check} calls it; the few scripts that report
 * per-line instead of per-check (grid, snap, blog, control-heights) call it
 * from their own `check` so they are covered too.
 */
export function heartbeat(label) {
  if (!(STALL_MS > 0)) return
  if (label) lastProgress = label
  clearTimeout(stallTimer)
  stallTimer = setTimeout(onStall, STALL_MS)
  // Never the reason the process stays alive — only the reason it stops.
  stallTimer.unref?.()
}
heartbeat()

/**
 * Record one assertion. Deliberately not `expect`: a script runs ALL of its
 * checks and reports every failure, where a throwing assertion would abandon
 * the rest of the file at the first one. `detail` carries the measured value,
 * which is what makes a failure diagnosable without a re-run.
 */
export function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  heartbeat(name)
}

/**
 * Await a promise the *page* returned, with a deadline.
 *
 * Playwright times out its own calls, but not a promise the page hands back:
 * `page.evaluate(() => new Promise(r => el.addEventListener('x', r)))` waits
 * forever when the event never fires. Wrapping that wait here turns a missing
 * event into `undefined` — a check that fails naming what didn't arrive —
 * instead of a script that never returns.
 */
export const within = (promise, ms = 5000) =>
  Promise.race([promise, new Promise((r) => setTimeout(r, ms))])

/**
 * Close the browser, print the tally, exit with the suite's verdict. The
 * "N/M checks passed" line is the format scripts/test.mjs reads back for its
 * summary column.
 */
export async function report(browser) {
  if (browser) await browser.close()
  const failed = results.filter((r) => !r).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}

// ────────────────────────────────────────────────────────────── the browser

/**
 * One Chromium for a script. Headless runs at dpr 1, so the default scale is 3.
 *
 * The args pin text rasterization, the one part of a "rendered pixels" suite
 * that is otherwise not the same on every machine. Linux Chromium hints glyph
 * outlines through FreeType and antialiases them per LCD subpixel; macOS does
 * neither, and `-webkit-font-smoothing` — which the kit sets to `none` — is
 * implemented on macOS only. The difference broke these assertions in both
 * directions at once: subpixel filtering paints *colour* into art that is
 * meant to be 1-bit (verify:snap counted 540 such pixels on a clean page),
 * while hinting rounds glyph outlines back onto whole pixels and hides the
 * half-pixel faults the fringe checks exist to catch (verify:icon's teeth
 * check found no fringe when it deliberately forced one).
 *
 * So: rasterize the outline as authored, and antialias in grayscale. Subpixel
 * *positioning* stays on deliberately — that is what lets a glyph sit at half
 * a pixel, which is the fault being detected.
 */
export const launch = (options = {}) =>
  chromium.launch({
    ...options,
    args: ['--font-render-hinting=none', '--disable-lcd-text', ...(options.args ?? [])],
  })

/**
 * Build the page builder a script uses.
 *
 * The two-step exists so a script states its own page shape once —
 * `const build = makeBuild(browser, { viewport: …, bodyStyle: … })` — and
 * every call site stays `await build(markup)`.
 *
 * The route interception is what makes `setContent` work against the dev
 * server's origin: the page navigates to ORIGIN for a same-origin document,
 * then the content is replaced, so a bare `import('/src/index.js')` resolves
 * through Vite exactly as a consumer's would.
 *
 * Options:
 * - `viewport`     the page box (default 1200×900)
 * - `dpr`          deviceScaleFactor — the grid/scale scripts drive 1, 2 and 3
 * - `bodyStyle`    inline style on `<body>` (default `margin:0`)
 * - `reducedMotion` emulate `prefers-reduced-motion`, which makes the kit's
 *                  selection blink synchronous so a commit lands before the
 *                  next `evaluate` — the idiom every keyboard-driving script
 *                  relies on
 * - `settle`       wait two animation frames after the fonts land, for scripts
 *                  that screenshot (one frame is not enough to guarantee the
 *                  first paint of a just-upgraded tree)
 * - `forcedColors` emulate a forced-colors theme
 */
export function makeBuild(browser, defaults = {}) {
  return async function build(markup = '', overrides = {}) {
    // The density-sweeping scripts (grid, scale, stack, position, icon, zoom)
    // call build(markup, 2) — a bare dpr is the only override they ever want.
    if (typeof overrides === 'number') overrides = { dpr: overrides }
    const {
      viewport = { width: 1200, height: 900 },
      dpr,
      bodyStyle = 'margin:0',
      reducedMotion = false,
      settle = false,
      forcedColors,
      origin = ORIGIN,
    } = { ...defaults, ...overrides }

    const page = await browser.newPage({
      viewport,
      ...(dpr === undefined ? {} : { deviceScaleFactor: dpr }),
    })
    const media = {}
    if (reducedMotion) media.reducedMotion = 'reduce'
    if (forcedColors) media.forcedColors = forcedColors
    if (Object.keys(media).length) await page.emulateMedia(media)

    await page.route(origin, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
    )
    await page.goto(origin)
    await page.unroute(origin)
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><body style="${bodyStyle}">${markup}`
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
    if (settle) {
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      )
    }
    return page
  }
}

// ───────────────────────────────────────────────────────────────── pixels

/**
 * Minimal PNG decode — Playwright's screenshots are 8-bit RGBA/RGB,
 * non-interlaced, so this handles exactly that and no more. Returned as
 * `{ width, height, bpp, data }` with `data` a flat row-major buffer.
 *
 * A decoder rather than a comparison library on purpose: the kit's pixel
 * assertions are about *structure* — how many ink bands a column carries, how
 * wide each dash is, whether any pixel is an intermediate gray — which a
 * snapshot diff cannot express and which stays readable as prose.
 */
export function decodePng(buf) {
  let pos = 8
  let ihdr
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    if (type === 'IHDR') ihdr = buf.subarray(pos + 8, pos + 8 + len)
    else if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len))
    pos += 12 + len
  }
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const bpp = ihdr[9] === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = x >= bpp && prev ? prev[x - bpp] : 0
      let v = row[x]
      switch (filter) {
        case 1: v += a; break
        case 2: v += b; break
        case 3: v += (a + b) >> 1; break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
      }
      cur[x] = v & 0xff
    }
  }
  return { width, height, bpp, data: out }
}

/** The RGB triple at a pixel. */
export const rgb = (png, x, y) => {
  const i = (y * png.width + x) * png.bpp
  return [png.data[i], png.data[i + 1], png.data[i + 2]]
}
/** Ink. The threshold is loose so a subpixel-dark edge still counts as ink… */
export const isBlack = (png, x, y) => rgb(png, x, y).every((c) => c < 32)
/** …and paper, likewise — anything between the two is the smear 1-bit art forbids. */
export const isWhite = (png, x, y) => rgb(png, x, y).every((c) => c > 224)

// ──────────────────────────────────────────────── the accessibility tree

/** Walk the pierced DOM (CDP `DOM.getDocument`), shadow roots included. */
export const walk = (node, match) => {
  if (match(node)) return node
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
    const found = walk(child, match)
    if (found) return found
  }
  return null
}

/** One attribute off a CDP node (its `attributes` is a flat name/value list). */
export const attr = (node, name) => {
  const a = node.attributes ?? []
  for (let i = 0; i < a.length; i += 2) if (a[i] === name) return a[i + 1]
  return null
}

/** A CDP session with the Accessibility domain enabled, one per page. */
export async function ax(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Accessibility.enable')
  return cdp
}

/**
 * The AX node the browser computed for a shadow part of a `vf-*` host — or
 * for the host itself when `partName` is null.
 *
 * Reading the real computed tree rather than the ARIA attributes that feed it
 * is the whole point: what a consumer's `aria-label` on a host *resolves to*
 * on the control inside its shadow root is exactly the thing that used to be
 * silently inert, and no attribute assertion would have caught it.
 */
export async function axFor(cdp, hostId, partName = null) {
  const doc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  const host = walk(doc.root, (n) => attr(n, 'id') === hostId)
  const el = partName ? host && walk(host, (n) => attr(n, 'part') === partName) : host
  if (!el) return null
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId: el.nodeId,
    fetchRelatives: false,
  })
  return nodes[0] ?? null
}

export const axName = (node) => node?.name?.value ?? ''
export const axDescription = (node) => node?.description?.value ?? ''
export const axRole = (node) => node?.role?.value ?? ''
