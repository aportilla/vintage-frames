// The shell's ground rules, read from its sources (src/shell/): it reaches
// the kit only through the package's root exports, so whatever it needs is
// exported for every page; its pure modules, and the entry that exports
// them, reach nothing of the kit; it registers no elements, imports none for
// side effects, writes no styles and ships no art. That each name it imports
// from the root is exported there, TypeScript checks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const dir = new URL('../src/shell/', import.meta.url)
const files = readdirSync(dir)
const sources = files.filter((f) => f.endsWith('.ts')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')])
const modules = new Set(sources.map(([f]) => f.replace(/\.ts$/, '.js')))

/** Every module specifier a source imports or re-exports. */
const specifiers = (src) => [...src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

test('the shell reaches the kit only through the root exports', () => {
  for (const [file, src] of sources) {
    for (const spec of specifiers(src)) {
      const ok = spec === '../index.js' || (spec.startsWith('./') && modules.has(spec.slice(2)))
      assert.ok(ok, `${file} imports ${spec}`)
    }
  }
})

const PURE = ['./catalog.js', './geometry.js', './state.js']

test('the pure modules import nothing from the kit, so they run under Node', () => {
  for (const [file, src] of sources) {
    if (!['geometry.ts', 'catalog.ts', 'state.ts', 'pure.ts'].includes(file)) continue
    for (const spec of specifiers(src)) {
      assert.ok(PURE.includes(spec), `${file} imports ${spec}`)
    }
  }
})

test('vintage-frames/shell/pure re-exports the pure modules, and only them', () => {
  const src = sources.find(([file]) => file === 'pure.ts')[1]
  assert.deepEqual(specifiers(src).sort(), PURE)
})

test('the shell registers no elements and imports none for side effects', () => {
  for (const [file, src] of sources) {
    assert.ok(!/customElements\.define\b/.test(src), `${file} defines an element`)
    assert.ok(!/(?:^|\n)\s*import\s+['"]/.test(src), `${file} imports for side effects`)
  }
})

test('the shell writes no styles and ships no art', () => {
  for (const [file, src] of sources) {
    for (const pattern of [/\.style\b/, /adoptedStyleSheets/, /\bcss`/, /<style\b/, /data:image\//]) {
      assert.ok(!pattern.test(src), `${file} matches ${pattern}`)
    }
  }
  assert.deepEqual(
    files.filter((f) => !f.endsWith('.ts')),
    [],
    'src/shell/ holds modules alone'
  )
})

test('the package exports the shell at vintage-frames/shell, and its pure modules at vintage-frames/shell/pure', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.deepEqual(pkg.exports['./shell'], {
    types: './dist/shell/index.d.ts',
    import: './dist/shell/index.js',
  })
  assert.deepEqual(pkg.exports['./shell/pure'], {
    types: './dist/shell/pure.d.ts',
    import: './dist/shell/pure.js',
  })
  const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
  assert.match(vite, /'shell\/index':\s*'src\/shell\/index\.ts'/)
  assert.match(vite, /'shell\/pure':\s*'src\/shell\/pure\.ts'/)
})
