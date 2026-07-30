/**
 * Verifies the duplicate-registration guard in src/define.ts.
 *
 * The hazard: `customElements.define()` throws NotSupportedError on a taken
 * name, and an uncaught throw while a module graph evaluates takes every import
 * after it down with it — so one duplicated copy of the library blanks the
 * consumer's page. `defineElement` checks first, keeps the incumbent and warns.
 *
 * The duplicate copy is simulated the way it actually happens in a bundle: the
 * same component module is imported twice under two URLs, so it evaluates twice
 * and produces two distinct classes competing for one tag. Its own imports
 * (styles, controllers) resolve without the query and stay shared, which is the
 * realistic shape — two copies of the elements over one copy of the toolkit.
 *
 * Needs the vite dev server, because it imports single component modules:
 *
 *   npm run dev          # in another shell (port 5173)
 *   npm run verify:define
 */
import { chromium } from 'playwright'

const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()

const warnings = []
page.on('console', (msg) => {
  if (msg.type() === 'warning') warnings.push(msg.text())
})

// A bare page, so the registry starts empty while /src/... requests still hit
// the dev server (same trick as verify-desktop-upgrade.mjs).
await page.route(ORIGIN, (route) =>
  route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' })
)
await page.goto(ORIGIN)
await page.unroute(ORIGIN)

// ── The first copy registers normally ────────────────────────────────────────
await page.evaluate(() => import('/src/components/vf-button.js'))
await page.evaluate(() => customElements.whenDefined('vf-button'))

const firstDefined = await page.evaluate(() => !!customElements.get('vf-button'))
check('the first copy registers <vf-button>', firstDefined)

// ── The hazard this exists for: the native call really does throw ────────────
const nativeThrow = await page.evaluate(() => {
  try {
    customElements.define('vf-button', class extends HTMLElement {})
    return null
  } catch (e) {
    return e.name
  }
})
check(
  'unguarded customElements.define() on a taken name throws (guards the check below)',
  nativeThrow === 'NotSupportedError',
  `threw ${nativeThrow}`,
)

// ── A second copy of the module: must not throw ──────────────────────────────
warnings.length = 0
const secondImport = await page.evaluate(async () => {
  try {
    const mod = await import('/src/components/vf-button.js?duplicate-copy')
    return { ok: true, sameClass: customElements.get('vf-button') === mod.VfButton }
  } catch (e) {
    return { ok: false, error: `${e.name}: ${e.message}` }
  }
})
check(
  'a second copy of the module evaluates without throwing',
  secondImport.ok === true,
  secondImport.error ?? '',
)
check(
  'the tag still resolves to the FIRST copy’s class, not the second',
  secondImport.sameClass === false,
  `registry === second copy’s class: ${secondImport.sameClass}`,
)
check(
  'it warns, naming the tag and the dedupe fix',
  warnings.length === 1 &&
    warnings[0].includes('<vf-button>') &&
    warnings[0].includes('Dedupe vintage-frames'),
  `${warnings.length} warning(s)`,
)

// ── The element still works after the collision ──────────────────────────────
await page.setContent('<vf-button>Click</vf-button>')
await page.evaluate(() => document.querySelector('vf-button').updateComplete)
const rendered = await page.evaluate(() => {
  const el = document.querySelector('vf-button')
  const inner = el.shadowRoot?.querySelector('button[part=button]')
  // The label is slotted, so it reaches the shadow tree through the slot rather
  // than living in it — assert the flattened assignment, not innerText.
  const slotted = inner
    ?.querySelector('slot')
    ?.assignedNodes({ flatten: true })
    .map((n) => n.textContent.trim())
    .join('')
  return { upgraded: !!el.shadowRoot, framed: !!inner, slotted }
})
check(
  'a <vf-button> on the page still upgrades and renders',
  rendered.upgraded === true && rendered.framed === true && rendered.slotted === 'Click',
  `shadow=${rendered.upgraded} button=${rendered.framed} label=${JSON.stringify(rendered.slotted)}`,
)

// ── Re-registering the identical constructor is a silent no-op ───────────────
warnings.length = 0
const idempotent = await page.evaluate(async () => {
  const { defineElement } = await import('/src/define.js')
  const same = customElements.get('vf-button')
  defineElement('vf-button', same)
  return customElements.get('vf-button') === same
})
check('re-registering the identical class is a no-op', idempotent === true)
check('…and stays silent, since nothing is actually wrong', warnings.length === 0, `${warnings.length} warning(s)`)

// ── A free name still registers through the guard ────────────────────────────
const fresh = await page.evaluate(async () => {
  const { defineElement } = await import('/src/define.js')
  class MyControl extends HTMLElement {}
  defineElement('my-control', MyControl)
  return customElements.get('my-control') === MyControl
})
check('an unclaimed name registers normally', fresh === true)

await browser.close()

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
