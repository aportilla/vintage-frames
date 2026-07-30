/**
 * Verifies custom-elements.json against the source it claims to describe.
 *
 * The manifest is a generated artifact, so it can go stale or go quiet: the
 * analyzer finds elements by decorator name, and this kit registers with
 * `@vfElement` rather than Lit's `@customElement` (see custom-elements-manifest
 * .config.mjs). If that plugin ever stops matching, `cem analyze` still exits 0
 * and simply emits a manifest with no custom elements in it — a silent failure
 * that would ship editor data describing nothing.
 *
 * It also holds the doc comments to their word. `@csspart`, `@slot` and `@fires`
 * are hand-written claims about the rendered output, and nothing else checks
 * them, so a renamed part or a removed event leaves the tag documented forever.
 * Each declared name has to appear somewhere in src as a real `part="…"`,
 * `<slot>` or `emit()` — searched across the whole kit rather than the one
 * component, because parts legitimately come from shared chrome templates
 * (src/chrome.ts) and from composed children (vf-window's `viewport` is
 * vf-scroll-area's).
 *
 * Static only — no browser, no dev server:
 *
 *   npm run analyze && npm run verify:manifest
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

const results = []
function check(name, pass, detail = '') {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

/** Every .ts file under src, flattened, so a name can be searched kit-wide. */
const srcFiles = []
for (const dir of ['src', 'src/components', 'src/styles']) {
  for (const f of readdirSync(join(ROOT, dir))) {
    if (f.endsWith('.ts')) srcFiles.push(read(join(dir, f)))
  }
}
const allSrc = srcFiles.join('\n')

const manifest = JSON.parse(read('custom-elements.json'))
const elements = manifest.modules
  .flatMap((m) => m.declarations ?? [])
  .filter((d) => d.customElement && d.tagName)

// ── 1. Every registered element reached the manifest ─────────────────────────
const componentDir = join(ROOT, 'src/components')
const registered = readdirSync(componentDir)
  .filter((f) => f.endsWith('.ts'))
  .flatMap((f) => [...read(join('src/components', f)).matchAll(/@vfElement\('([^']+)'\)/g)])
  .map((m) => m[1])
  .sort()

const inManifest = elements.map((e) => e.tagName).sort()
const missing = registered.filter((t) => !inManifest.includes(t))

check(
  'every @vfElement in src reached the manifest',
  registered.length > 0 && missing.length === 0,
  `${inManifest.length}/${registered.length}${missing.length ? ` — missing ${missing.join(', ')}` : ''}`,
)

// ── 2. The editor data covers the same set ───────────────────────────────────
const vscode = JSON.parse(read('editor/vscode.html-custom-data.json'))
const webTypes = JSON.parse(read('editor/web-types.json'))
const vscodeTags = vscode.tags.map((t) => t.name).sort()
const webTypeTags = (webTypes.contributions?.html?.elements ?? []).map((e) => e.name).sort()

check(
  'the VS Code HTML data covers every element',
  JSON.stringify(vscodeTags) === JSON.stringify(inManifest),
  `${vscodeTags.length} tags`,
)
check(
  'the JetBrains web-types covers every element',
  JSON.stringify(webTypeTags) === JSON.stringify(inManifest),
  `${webTypeTags.length} tags`,
)

// ── 3. Documented parts, slots and events exist in the source ────────────────
const claims = { cssParts: [], slots: [], events: [] }
for (const el of elements) {
  for (const p of el.cssParts ?? []) claims.cssParts.push([el.tagName, p.name])
  for (const s of el.slots ?? []) claims.slots.push([el.tagName, s.name])
  for (const e of el.events ?? []) claims.events.push([el.tagName, e.name])
}

// Each of these requires a non-zero count as well as no orphans: an empty
// manifest would otherwise sail through every one of them, which is exactly the
// state check 1 exists to catch.
const partOrphans = claims.cssParts.filter(([, name]) => !allSrc.includes(`part="${name}"`))
check(
  'every documented @csspart is rendered somewhere in the kit',
  claims.cssParts.length > 0 && partOrphans.length === 0,
  partOrphans.length
    ? partOrphans.map(([t, n]) => `${t}:${n}`).join(', ')
    : `${claims.cssParts.length} parts`,
)

// A named slot is `<slot name="x">`; the default slot's manifest name is ''.
const slotOrphans = claims.slots.filter(([, name]) =>
  name === '' ? !allSrc.includes('<slot>') : !allSrc.includes(`name="${name}"`),
)
check(
  'every documented @slot exists in a template',
  claims.slots.length > 0 && slotOrphans.length === 0,
  slotOrphans.length
    ? slotOrphans.map(([t, n]) => `${t}:${n || '(default)'}`).join(', ')
    : `${claims.slots.length} slots`,
)

const eventOrphans = claims.events.filter(([, name]) => !allSrc.includes(`'${name}'`))
check(
  'every documented @fires event is actually emitted',
  claims.events.length > 0 && eventOrphans.length === 0,
  eventOrphans.length
    ? eventOrphans.map(([t, n]) => `${t}:${n}`).join(', ')
    : `${claims.events.length} events`,
)

// ── 4. The manifest is not silently empty of detail ──────────────────────────
const withAttrs = elements.filter((e) => (e.attributes ?? []).length > 0).length
check(
  'elements carry their attributes (the litelement plugin is wired up)',
  elements.length > 0 && withAttrs >= elements.length / 2,
  `${withAttrs}/${elements.length} elements have attributes`,
)

// ── 5. @cssprop tags agree with the SPEC §3 token table ─────────────────────
//
// SPEC §3 is the single source of truth for theming, and the tags are generated
// from it, so the two drifting apart is the failure this catches — a token added
// to a component but never described, or a spec row for a token nothing reads.
//
// Two rules decide which component documents which token:
//
//   INTERNAL     never documented. Either controller-owned (the grid-snap
//                offsets, which SPEC says never to set by hand), a private
//                channel between two components (vf-button-group drives
//                vf-button's ring margin and flex through these), or geometry
//                a component sets on itself — vf-window's own comment calls
//                --vf-title-inset "not a theming knob".
//
//   KIT_WIDE_AT  a token this many components or more can style is a kit-wide
//                knob (the palette, the type stack, the focus rule), described
//                once in SPEC §3 and vintage.css rather than repeated on all 30
//                elements. The kit splits cleanly: the widest component-specific
//                token reaches 4, the narrowest kit-wide one 7.
const INTERNAL = new Set([
  '--vf-snap-dx',
  '--vf-snap-dy',
  '--vf-button-flex',
  '--vf-button-ring-margin',
  '--vf-title-inset',
  '--vf-window-active',
])
const KIT_WIDE_AT = 5

const tokensIn = (s) => new Set([...s.matchAll(/var\(\s*(--vf-[a-z0-9-]+)/g)].map((m) => m[1]))

const specTokens = new Set()
for (const line of read('SPEC.md').split('\n')) {
  const m = line.match(/^\| `(--vf-[a-z0-9-]+)` \|/)
  if (m) specTokens.add(m[1])
}

// A recipe exposes the tokens of every recipe it composes, so the sets have to
// be closed transitively — vfBase reaches --vf-font-family through body-face.
const recipeDir = join(ROOT, 'src/styles/recipes')
const modTokens = new Map()
const modDeps = new Map()
const modExports = new Map()
for (const f of readdirSync(recipeDir).filter((x) => x.endsWith('.ts'))) {
  const s = read(join('src/styles/recipes', f))
  const n = f.replace('.ts', '')
  modTokens.set(n, tokensIn(s))
  modDeps.set(n, [...s.matchAll(/from '\.\/([a-z-]+)\.js'/g)].map((m) => m[1]))
  modExports.set(n, [...s.matchAll(/export const (vf[A-Za-z]+)\s*=/g)].map((m) => m[1]))
}
const closure = (n, seen = new Set()) => {
  if (seen.has(n)) return new Set()
  seen.add(n)
  const out = new Set(modTokens.get(n) ?? [])
  for (const d of modDeps.get(n) ?? []) for (const t of closure(d, seen)) out.add(t)
  return out
}
const recipeTokens = new Map()
for (const [n, exps] of modExports) for (const e of exps) recipeTokens.set(e, closure(n))

const styleable = new Map() // tag → Set(token it can be styled with)
const spread = new Map() // token → how many components that is
for (const f of readdirSync(componentDir).filter((x) => x.endsWith('.ts'))) {
  const s = read(join('src/components', f))
  const tag = s.match(/@vfElement\('([^']+)'\)/)?.[1]
  if (!tag) continue
  const set = tokensIn(s)
  const imp = s.match(/import\s*\{([^{}]*?)\}\s*from\s*'\.\.\/styles\/base\.js'/)
  for (const n of imp?.[1].split(',').map((x) => x.trim()) ?? [])
    for (const t of recipeTokens.get(n) ?? []) set.add(t)
  styleable.set(tag, set)
  for (const t of set) spread.set(t, (spread.get(t) ?? 0) + 1)
}

const tagged = new Map(elements.map((e) => [e.tagName, new Set((e.cssProperties ?? []).map((p) => p.name))]))

const untagged = []
for (const [tag, set] of styleable) {
  for (const t of set) {
    if (INTERNAL.has(t) || spread.get(t) >= KIT_WIDE_AT) continue
    if (!tagged.get(tag)?.has(t)) untagged.push(`${tag}:${t}`)
  }
}
check(
  'every component-specific token carries an @cssprop tag',
  untagged.length === 0,
  untagged.length ? untagged.join(', ') : `${[...tagged.values()].reduce((n, s) => n + s.size, 0)} tags`,
)

const undescribed = []
for (const [tag, set] of tagged) for (const t of set) if (!specTokens.has(t)) undescribed.push(`${tag}:${t}`)
check(
  'every @cssprop tag has a SPEC §3 row describing it',
  undescribed.length === 0,
  undescribed.length ? undescribed.join(', ') : `${specTokens.size} tokens in the table`,
)

const readAnywhere = new Set([...styleable.values()].flatMap((s) => [...s]))
const deadRows = [...specTokens].filter((t) => !readAnywhere.has(t))
check(
  'every SPEC §3 row names a token the kit actually reads',
  deadRows.length === 0,
  deadRows.length ? deadRows.join(', ') : 'no dead rows',
)

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
