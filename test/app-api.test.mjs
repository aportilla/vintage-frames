// The app API's books: app-api.json, which `npm run analyze` writes
// (scripts/app-api.mjs), carries the levels the kit states and lists what a
// built application can use; the release check (scripts/check-app-api.mjs)
// stops a bump that removes or changes any of it at the same level, and
// passes additions, a raised level and a change let through.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { APP_API, APP_API_OLDEST } from '../scripts/.tmp/unit/shell/pure.js'
import { releaseCheck, surfaceChanges } from '../scripts/check-app-api.mjs'

const books = JSON.parse(readFileSync(new URL('../app-api.json', import.meta.url), 'utf8'))

test('app-api.json carries the levels src/shell/app-file.ts states', () => {
  assert.equal(books.api, APP_API)
  assert.equal(books.oldest, APP_API_OLDEST)
})

test('app-api.json lists the entries\' values, what an application gets and gives, the elements and the tokens', () => {
  const names = Object.keys(books.surface)
  assert.deepEqual(names, [...names].sort(), 'sorted')
  for (const name of [
    'vintage-frames applyScale',
    'vintage-frames/shell defineApp',
    'vintage-frames/shell/pure appRuns',
    'AppDefinition.init',
    'AppContext.ask',
    'WindowManager.open',
    'KindDefinition.open',
    'Item.name',
    'VfCloseDetail.reason',
    'VfWindow#show',
    '<vf-window> attribute header-height',
    '<vf-dialog> event vf-close',
    '<vf-window> slot header',
    '<vf-dialog> part title',
    '--vf-scale',
  ]) {
    assert.ok(names.includes(name), name)
  }
  const manifest = JSON.parse(readFileSync(new URL('../custom-elements.json', import.meta.url), 'utf8'))
  const tags = manifest.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.customElement && d.tagName).map((d) => `<${d.tagName}>`)
  assert.ok(tags.length > 0)
  for (const tag of tags) assert.ok(names.includes(tag), tag)
})

test('app-api.json lists no member Lit or the browser defines, nor a private one', () => {
  for (const name of Object.keys(books.surface)) {
    assert.doesNotMatch(name, /[#.](render|updated|firstUpdated|connectedCallback|formResetCallback|styles|shadowRootOptions|observedAttributes)$/, name)
    assert.doesNotMatch(name, /#[_#]|@#/, `${name}: a # private member`)
  }
  assert.ok(!Object.hasOwn(books.surface, 'VfWindow#scale'), 'a private member')
})

const BEFORE = {
  api: 1,
  oldest: 1,
  surface: {
    'AppContext.ask': '(dialog: VfModalDialog) => Promise<string | null>',
    'AppContext.hold': '<T extends Element>(dialog: T) => T',
  },
}
const { 'AppContext.hold': held, ...withoutHold } = BEFORE.surface
const NEXT = { ...BEFORE, surface: { ...withoutHold, 'AppContext.ask': '(name: string) => Promise<string | null>' } }

test('surfaceChanges: what was removed, what changed its type, and what was added', () => {
  const added = { ...NEXT.surface, 'AppContext.typing': '() => boolean' }
  assert.deepEqual(surfaceChanges(BEFORE.surface, added), {
    removed: ['AppContext.hold'],
    changed: ['AppContext.ask'],
    added: ['AppContext.typing'],
  })
})

test('the release check passes an unchanged surface, additions, and the first release with books', () => {
  assert.equal(releaseCheck(BEFORE, BEFORE).stop, false)
  assert.equal(releaseCheck(BEFORE, { ...BEFORE, surface: { ...BEFORE.surface, 'AppContext.typing': '() => boolean' } }).stop, false)
  assert.equal(releaseCheck(null, BEFORE).stop, false)
})

test('it stops a removal or a change at the same level, naming each with its types', () => {
  const { stop, message } = releaseCheck(BEFORE, NEXT, { since: 'v0.18.1' })
  assert.equal(stop, true)
  assert.match(message, /removed {2}AppContext\.hold/)
  assert.match(message, /changed {2}AppContext\.ask\n.*was \(dialog: VfModalDialog\).*\n.*now \(name: string\)/)
  assert.match(message, /APP_API_COMPATIBLE=1/)
  assert.equal(releaseCheck(BEFORE, { ...BEFORE, surface: withoutHold }).stop, true, 'a removal alone')
})

test('a raised APP_API, or APP_API_COMPATIBLE, lets them through', () => {
  assert.equal(releaseCheck(BEFORE, { ...NEXT, api: 2 }).stop, false)
  assert.equal(releaseCheck(BEFORE, { ...NEXT, api: 2, oldest: 2 }).stop, false)
  assert.equal(releaseCheck(BEFORE, NEXT, { compatible: true }).stop, false)
  assert.equal(releaseCheck(BEFORE, { ...NEXT, oldest: 2 }).stop, true, 'APP_API_OLDEST past APP_API')
})

test('neither level goes down', () => {
  assert.equal(releaseCheck({ ...BEFORE, api: 2 }, BEFORE).stop, true)
  assert.equal(releaseCheck({ ...BEFORE, api: 2, oldest: 2 }, { ...BEFORE, api: 2 }).stop, true)
})
