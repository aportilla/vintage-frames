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

// ─────────────────────────────────────────────────────────── checks & tally

/** Every check's outcome, in order, for {@link report} to count. */
export const results = []

/**
 * Record one assertion. Deliberately not `expect`: a script runs ALL of its
 * checks and reports every failure, where a throwing assertion would abandon
 * the rest of the file at the first one. `detail` carries the measured value,
 * which is what makes a failure diagnosable without a re-run.
 */
export function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

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

/** One Chromium for a script. Headless runs at dpr 1, so the default scale is 3. */
export const launch = (options) => chromium.launch(options)

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
