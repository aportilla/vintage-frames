// The shell's catalog (src/shell/catalog.ts): the tree model, its selectors
// and operations over a memory storage — system-online's and
// sprite-machine's files tests, generalized over kinds.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DISK,
  TRASH,
  UNTITLED_FOLDER,
  childrenOf,
  copyName,
  createCatalog,
  descendantsOf,
  enclosingFolders,
  isInside,
  isTrashed,
  itemCount,
  memoryStorage,
  nextFolderName,
} from '../scripts/.tmp/unit/shell/catalog.js'

const names = (items) => items.map((i) => i.name)

/**
 * A catalog over a memory storage with a stepping clock and counting ids.
 * `text` and `font` are registered kinds with sizes and payload hooks that
 * log what they are asked; `zapf` is a kind no one registers.
 */
async function library({ volumes = { trash: 'Trash', disk: 'Macintosh HD' }, storage = memoryStorage() } = {}) {
  const log = []
  let t = 1000
  let n = 0
  const catalog = createCatalog({
    storage,
    volumes,
    listed: (kind) => kind === 'text' || kind === 'font',
    hooks: (kind) =>
      kind === 'text' || kind === 'font'
        ? {
            size: (item) => (kind === 'text' ? 10 : 100) + (item.data?.extra ?? 0),
            copy: (from, to) => void log.push(`copy ${from.id}→${to.id}`),
            onRemove: (item) => void log.push(`remove ${item.id}`),
          }
        : undefined,
    now: () => t++,
    newId: () => `id${++n}`,
    placeDelay: 5,
  })
  await catalog.refresh()
  return { catalog, storage, log }
}

test('no storage: unavailable, the volumes alone; the disk leads the Trash', async () => {
  const catalog = createCatalog({ storage: null, volumes: { disk: 'Macintosh HD' } })
  await catalog.refresh()
  const st = catalog.get()
  assert.equal(st.available, false)
  assert.deepEqual(names(childrenOf(st, null)), ['Macintosh HD', 'Trash'])
  assert.deepEqual(childrenOf(st, null).map((i) => i.kind), [DISK, TRASH])
  // Neither volume wanted: an empty desktop.
  const none = createCatalog({ storage: null, volumes: { trash: false } })
  assert.equal(none.get().items.length, 0)
})

test('a broken storage reads as unavailable, a working one as available', async () => {
  const broken = createCatalog({ storage: { list: () => Promise.reject(new Error('private window')), put: async () => {}, remove: async () => {} } })
  const warn = console.warn
  console.warn = () => {}
  await broken.refresh()
  console.warn = warn
  assert.equal(broken.get().available, false)
  const { catalog } = await library()
  assert.equal(catalog.get().available, true)
})

test('folders: made where asked with untitled names counted up, never in the Trash or inside it', async () => {
  const { catalog } = await library()
  const a = await catalog.create()
  const b = await catalog.create()
  const onDisk = await catalog.create({ parent: DISK })
  assert.equal(a.name, UNTITLED_FOLDER)
  assert.equal(b.name, `${UNTITLED_FOLDER} 2`)
  assert.equal(onDisk.name, UNTITLED_FOLDER)
  assert.equal(nextFolderName(catalog.get(), a.id), UNTITLED_FOLDER)
  assert.equal(await catalog.create({ parent: TRASH }), null)
  await catalog.move([b.id], TRASH)
  assert.equal(await catalog.create({ parent: b.id }), null, 'nor inside a trashed folder')
  assert.deepEqual(names(childrenOf(catalog.get(), DISK)), [UNTITLED_FOLDER])
  assert.equal(itemCount(catalog.get(), null), 3) // the disk, the Trash and one folder
})

test('volumes are never renamed, moved, copied or removed', async () => {
  const { catalog, storage } = await library()
  const box = await catalog.create({ name: 'Box' })
  assert.equal(await catalog.rename(DISK, 'Disk'), false)
  assert.equal(await catalog.rename(TRASH, 'Bin'), false)
  assert.deepEqual(await catalog.move([DISK, TRASH], box.id), [])
  assert.deepEqual(await catalog.copy([DISK, TRASH], null), [])
  assert.deepEqual(names(childrenOf(catalog.get(), null)), ['Macintosh HD', 'Trash', 'Box'])
  assert.equal(storage.records.has(TRASH), false, 'nothing of a volume is stored until it is placed')
})

test('a folder never moves into itself or a folder inside it; the chain reads the result', async () => {
  const { catalog } = await library()
  const outer = await catalog.create({ name: 'Outer' })
  const inner = await catalog.create({ name: 'Inner', parent: outer.id })
  assert.deepEqual(await catalog.move([outer.id], outer.id), [])
  assert.deepEqual(await catalog.move([outer.id], inner.id), [])
  assert.deepEqual(await catalog.move([inner.id], DISK), [inner.id])
  assert.deepEqual(await catalog.move([inner.id], DISK), [], 'already there: nothing moves')
  const st = catalog.get()
  assert.deepEqual(enclosingFolders(st, inner.id), [inner.id, DISK])
  assert.equal(isInside(st, inner.id, DISK), true)
  assert.equal(isInside(st, DISK, DISK), false, 'a container is not inside itself')
})

test('enclosing folders: innermost first; the desktop, a missing record or a repeat ends the chain', () => {
  const row = (id, parent) => ({ id, name: id, kind: 'folder', parent, createdAt: 0, modifiedAt: 0 })
  const st = { available: true, items: [row('a', null), row('b', 'a'), row('c', 'b'), row('d', 'gone'), row('x', 'y'), row('y', 'x')] }
  assert.deepEqual(enclosingFolders(st, 'c'), ['c', 'b', 'a'])
  assert.deepEqual(enclosingFolders(st, null), [])
  assert.deepEqual(enclosingFolders(st, 'gone'), [], 'no record reads as the desktop')
  assert.deepEqual(enclosingFolders(st, 'd'), ['d'], 'a missing parent ends the chain')
  assert.deepEqual(enclosingFolders(st, 'x'), ['x', 'y'], 'a loop stops at its first repeat')
  assert.deepEqual(names(childrenOf(st, null)), ['a', 'd'], 'an orphan sits on the desktop')
})

test('the Trash: a folder files into it whole; Empty Trash removes its subtree alone, each kind dropping its payload', async () => {
  const { catalog, storage, log } = await library()
  const keep = await catalog.create({ name: 'Keep' })
  const kept = await catalog.create({ name: 'Kept', kind: 'text', parent: keep.id })
  const gone = await catalog.create({ name: 'Gone' })
  const nested = await catalog.create({ name: 'Nested', parent: gone.id })
  const deep = await catalog.create({ name: 'Deep', kind: 'font', parent: nested.id, data: { extra: 5 } })
  const loose = await catalog.create({ name: 'Loose', kind: 'text' })
  assert.deepEqual(await catalog.move([gone.id, loose.id], TRASH), [gone.id, loose.id])
  let st = catalog.get()
  assert.equal(isTrashed(st, nested.id), true, 'inside a trashed folder is trashed')
  assert.equal(isTrashed(st, deep.id), true)
  assert.equal(isTrashed(st, keep.id), false)
  assert.equal(isTrashed(st, null), false)
  assert.deepEqual(names(descendantsOf(st, TRASH)), ['Gone', 'Nested', 'Deep', 'Loose'], 'each folder before what it holds')
  assert.equal(catalog.trashSize(), 105 + 10)
  const removed = await catalog.emptyTrash()
  assert.deepEqual(removed.map((i) => i.id).sort(), [gone.id, nested.id, deep.id, loose.id].sort())
  assert.deepEqual(log.filter((l) => l.startsWith('remove')).sort(), [`remove ${deep.id}`, `remove ${loose.id}`].sort())
  st = catalog.get()
  assert.deepEqual([...storage.records.keys()].sort(), [keep.id, kept.id].sort())
  assert.equal(itemCount(st, TRASH), 0)
  assert.equal(st.items.some((i) => i.id === TRASH), true, 'the Trash stands, empty')
})

test('kinds: one no application registers is left out of the listing and kept in storage', async () => {
  const { catalog, storage } = await library()
  const z = await catalog.create({ name: 'Zapf', kind: 'zapf' })
  const t = await catalog.create({ name: 'Note', kind: 'text' })
  assert.deepEqual(names(childrenOf(catalog.get(), null)).slice(2), ['Note'])
  assert.ok(storage.records.has(z.id) && storage.records.has(t.id))
  // …and comes back with the rest in a dump.
  assert.ok(catalog.dump().items.some((i) => i.id === z.id))
})

test('items: rename and move with a landing; the landing is the item’s place, none the next free cell', async () => {
  const { catalog, storage } = await library()
  const box = await catalog.create({ name: 'Box' })
  const note = await catalog.create({ name: 'Note', kind: 'text', left: 300, top: 40 })
  assert.equal(await catalog.rename(note.id, 'Memo'), true)
  assert.equal(await catalog.rename(note.id, 'Memo'), false, 'the same name changes nothing')
  assert.equal(storage.records.get(note.id).name, 'Memo')
  await catalog.move([note.id], box.id, new Map([[note.id, { left: 16, top: 16 }]]))
  assert.deepEqual([catalog.item(note.id).left, catalog.item(note.id).top], [16, 16])
  await catalog.move([note.id], null)
  assert.equal('left' in catalog.item(note.id), false, 'moved with no landing: unplaced')
})

test('copy name: its own name when free, then copy and counted copies of the base, per kind', async () => {
  const { catalog } = await library()
  await catalog.create({ name: 'Note', kind: 'text' })
  await catalog.create({ name: 'Note copy', kind: 'text' })
  const st = catalog.get()
  assert.equal(copyName(st, null, 'Other', 'text'), 'Other')
  assert.equal(copyName(st, null, 'Note', 'text'), 'Note copy 2')
  assert.equal(copyName(st, null, 'Note copy', 'text'), 'Note copy 2')
  assert.equal(copyName(st, null, 'Note', 'folder'), 'Note')
})

test('copy: an item copies with the next copy name and its kind’s payload; never into the Trash', async () => {
  const { catalog, log } = await library()
  const font = await catalog.create({ name: 'Geneva', kind: 'font', data: { family: 'Geneva' }, left: 10, top: 20 })
  const [c1] = await catalog.copy([font.id], DISK)
  const [c2] = await catalog.copy([font.id], DISK)
  assert.deepEqual([c1.name, c2.name], ['Geneva', 'Geneva copy'])
  assert.deepEqual(c1.data, { family: 'Geneva' })
  assert.equal('left' in c1, false, 'a top copy takes the next free cell')
  assert.deepEqual(log, [`copy ${font.id}→${c1.id}`, `copy ${font.id}→${c2.id}`])
  assert.deepEqual(await catalog.copy([font.id], TRASH), [])
})

test('copy: a folder brings its subtree once, even into itself, names and places kept inside', async () => {
  const { catalog } = await library()
  const box = await catalog.create({ name: 'Box' })
  const sub = await catalog.create({ name: 'Sub', parent: box.id, left: 16, top: 16 })
  await catalog.create({ name: 'Note', kind: 'text', parent: sub.id, left: 96, top: 16 })
  await catalog.create({ name: 'Geneva', kind: 'font', parent: box.id })
  const [copy] = await catalog.copy([box.id], box.id)
  const st = catalog.get()
  assert.equal(copy.name, 'Box')
  const inside = descendantsOf(st, copy.id)
  assert.deepEqual(names(inside), ['Sub', 'Note', 'Geneva'], 'depth first, each folder before what it holds')
  const subCopy = inside.find((i) => i.name === 'Sub')
  assert.deepEqual([subCopy.left, subCopy.top], [16, 16])
  assert.equal(descendantsOf(st, box.id).filter((i) => i.kind === 'folder').length, 3, 'Sub, the copy and its Sub')
})

test('positions: the listing moves at once and storage after the delay; a move drops what waits', async () => {
  const { catalog, storage } = await library()
  const a = await catalog.create({ name: 'A', kind: 'text' })
  catalog.place(new Map([[a.id, { left: 40, top: 60 }]]))
  assert.deepEqual([catalog.item(a.id).left, catalog.item(a.id).top], [40, 60])
  assert.equal('left' in storage.records.get(a.id), false, 'not yet written')
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(storage.records.get(a.id).left, 40)
  // A rename keeps the position it carries.
  catalog.place(new Map([[a.id, { left: 50, top: 60 }]]))
  await catalog.rename(a.id, 'A2')
  assert.equal(storage.records.get(a.id).left, 50)
  // flush writes at once.
  catalog.place(new Map([[a.id, { left: 70, top: 60 }]]))
  await catalog.flush()
  assert.equal(storage.records.get(a.id).left, 70)
})

test('positions: a volume’s place is stored on a record of its own id, and read back', async () => {
  const storage = memoryStorage()
  const { catalog } = await library({ storage })
  catalog.place(new Map([[TRASH, { left: 900, top: 700 }]]))
  await catalog.flush()
  assert.equal(storage.records.get(TRASH).left, 900)
  const again = createCatalog({ storage, volumes: { trash: 'Trash' } })
  await again.refresh()
  const trash = again.item(TRASH)
  assert.deepEqual([trash.name, trash.left, trash.top], ['Trash', 900, 700])
})

test('seed: runs once per storage; the marker is never listed and survives a clear', async () => {
  const storage = memoryStorage()
  const { catalog } = await library({ storage })
  let runs = 0
  const seed = async (c) => {
    runs++
    await c.create({ name: 'Read Me', kind: 'text' })
  }
  assert.equal(await catalog.seed(seed), true)
  assert.equal(await catalog.seed(seed), false)
  const again = createCatalog({ storage })
  await again.refresh()
  assert.equal(await again.seed(seed), false, 'a stored marker: seeded')
  assert.equal(runs, 1)
  assert.ok(!again.get().items.some((i) => i.id.startsWith('#')))
  await again.clear()
  assert.equal(await again.seed(seed), false, 'cleared, still seeded')
  // A fresh memory storage seeds again.
  const { catalog: fresh } = await library()
  assert.equal(await fresh.seed(seed), true)
  assert.equal(runs, 2)
})

test('import: merge mints ids and keeps the nesting; replace clears and keeps the ids; an empty archive changes nothing', async () => {
  const archive = {
    items: [
      { id: 'f1', name: 'Box', kind: 'folder', parent: DISK, createdAt: 1, modifiedAt: 2 },
      { id: 't1', name: 'Note', kind: 'text', parent: 'f1', createdAt: 3, modifiedAt: 3, data: { text: 'x' } },
      { id: 'z1', name: 'Zapf', kind: 'zapf', parent: TRASH, createdAt: 4, modifiedAt: 4 },
    ],
  }
  const { catalog, storage } = await library()
  const mine = await catalog.create({ name: 'Mine', kind: 'text' })
  assert.equal(await catalog.import(archive), 3)
  const box = catalog.get().items.find((i) => i.name === 'Box')
  assert.notEqual(box.id, 'f1')
  assert.equal(box.parent, DISK)
  assert.equal(catalog.get().items.find((i) => i.name === 'Note').parent, box.id)
  await catalog.import(archive)
  assert.equal(catalog.get().items.filter((i) => i.name === 'Box').length, 2, 'added again, it lands twice')
  assert.equal(await catalog.import({ items: [] }, { mode: 'replace' }), 0)
  assert.ok(catalog.item(mine.id), 'an empty replace leaves the catalog alone')
  await catalog.import(archive, { mode: 'replace' })
  assert.equal(catalog.item(mine.id), null)
  assert.ok(catalog.item('f1') && catalog.item('t1'))
  assert.ok(storage.records.has('z1'), 'an unlisted kind is stored all the same')
})
