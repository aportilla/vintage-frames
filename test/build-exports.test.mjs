// The build entry's ground rules, read from its sources (src/build/): it runs
// under Node, so it reaches no element and nothing that touches the DOM at
// import: its own modules, the shell's app file reader and version, the
// strikes, Node's modules and Vite's types. The strike modules import
// nothing but their type.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const dir = new URL('../src/build/', import.meta.url)
const sources = readdirSync(dir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => [f, readFileSync(new URL(f, dir), 'utf8')])
const modules = new Set(sources.map(([f]) => f.replace(/\.ts$/, '.js')))

/** Every module specifier a source imports or re-exports. */
const specifiers = (src) => [...src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

const REACHES = [
  '../shell/app-file.js',
  '../shell/version.js',
  '../styles/strike.js',
  '../styles/display-strike.js',
  '../styles/body-strike.js',
  'vite',
]

test('the build entry reaches no element, only what runs under Node', () => {
  for (const [file, src] of sources) {
    for (const spec of specifiers(src)) {
      const ok = REACHES.includes(spec) || spec.startsWith('node:') || (spec.startsWith('./') && modules.has(spec.slice(2)))
      assert.ok(ok, `${file} imports ${spec}`)
    }
    assert.ok(!/import\s+(?!type\b)[^'"]*from\s+['"]vite['"]/.test(src), `${file} imports Vite at runtime`)
  }
})

test('the strike modules import nothing but their type', () => {
  const styles = new URL('../src/styles/', import.meta.url)
  for (const file of ['display-strike.ts', 'body-strike.ts']) {
    const src = readFileSync(new URL(file, styles), 'utf8')
    assert.deepEqual([...src.matchAll(/^import .*$/gm)].map((m) => m[0]), ["import type { Strike } from './strike.js'"])
  }
  assert.deepEqual(specifiers(readFileSync(new URL('strike.ts', styles), 'utf8')), [])
})

test('the package exports the build entry at vintage-frames/build, its ?app types at /build/client, and Vite is an optional peer', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.deepEqual(pkg.exports['./build'], { types: './dist/build/index.d.ts', import: './dist/build/index.js' })
  assert.deepEqual(pkg.exports['./build/client'], { types: './dist/build/client.d.ts' })
  assert.ok(pkg.peerDependencies.vite)
  assert.equal(pkg.peerDependenciesMeta.vite.optional, true)
  const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
  assert.match(vite, /'build\/index':\s*'src\/build\/index\.ts'/)
})
