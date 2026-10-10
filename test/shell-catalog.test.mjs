// The shell's catalog (src/shell/catalog.ts): the tree model, its selectors
// and operations over a memory storage — system-online's and
// sprite-machine's files tests, generalized over kinds.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ALIAS_KIND,
  APPLE_MENU_ITEMS,
  APP_KIND,
  DISK,
  STARTUP_ITEMS,
  SYSTEM_FOLDER,
  TRASH,
  UNTITLED_FOLDER,
  aliasName,
  appIdOf,
  appleMenuItemsOf,
  appleMenuOf,
  canAlias,
  childrenOf,
  copyName,
  createCatalog,
  descendantsOf,
  dropTargetOf,
  enclosingFolders,
  isInside,
  isKept,
  isTrashed,
  itemCount,
  memoryStorage,
  nextFolderName,
  originalOf,
  resolve,
  startupItemsOf,
} from '../scripts/.tmp/unit/shell/pure.js'

const names = (items) => items.map((i) => i.name)

/**
 * A catalog over a memory storage with a stepping clock and counting ids.
 * `text` and `font` are registered kinds with sizes and payload hooks that
 * log what they are asked, and aliases are listed, as the shell registers
 * them; `zapf` is a kind no one registers.
 */
async function library({ volumes = { trash: 'Trash', disk: 'Macintosh HD' }, system, storage = memoryStorage() } = {}) {
  const log = []
  let t = 1000
  let n = 0
  const catalog = createCatalog({
    storage,
    volumes,
    system,
    listed: (kind) => kind === 'text' || kind === 'font' || kind === ALIAS_KIND,
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

test('the app kind: its data names the application; appIdOf reads it, null without one', async () => {
  const { catalog } = await library()
  const icon = await catalog.create({ name: 'Meteors', kind: APP_KIND, data: { app: 'meteors' } })
  assert.equal(icon.kind, 'app')
  assert.equal(appIdOf(icon), 'meteors')
  assert.equal(appIdOf({ ...icon, data: undefined }), null)
  assert.equal(appIdOf({ ...icon, data: {} }), null)
  assert.equal(appIdOf({ ...icon, data: { app: 7 } }), null, 'an id that isn’t a string')
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
  const merged = await catalog.import(archive)
  assert.deepEqual([...merged.keys()], ['f1', 't1', 'z1'], 'every archive id maps to what it stored')
  const box = merged.get('f1')
  assert.notEqual(box.id, 'f1')
  assert.deepEqual([box.name, box.parent], ['Box', DISK])
  assert.equal(catalog.item(box.id)?.name, 'Box')
  assert.deepEqual([merged.get('t1').name, merged.get('t1').parent], ['Note', box.id], 'the nesting follows the new ids')
  await catalog.import(archive)
  assert.equal(catalog.get().items.filter((i) => i.name === 'Box').length, 2, 'added again, it lands twice')
  assert.equal((await catalog.import({ items: [] }, { mode: 'replace' })).size, 0)
  assert.ok(catalog.item(mine.id), 'an empty replace leaves the catalog alone')
  const replaced = await catalog.import(archive, { mode: 'replace' })
  assert.deepEqual([...replaced].map(([from, to]) => `${from}→${to.id}`), ['f1→f1', 't1→t1', 'z1→z1'], 'replace maps each id to itself')
  assert.equal(catalog.item(mine.id), null)
  assert.ok(catalog.item('f1') && catalog.item('t1'))
  assert.ok(storage.records.has('z1'), 'an unlisted kind is stored all the same')
})

test('import: a replace announces once, with the archive’s items in it; a failure partway lists what was stored', async () => {
  const archive = {
    items: [
      { id: 'f1', name: 'Box', kind: 'folder', parent: null, createdAt: 1, modifiedAt: 1 },
      { id: 't1', name: 'Note', kind: 'text', parent: 'f1', createdAt: 2, modifiedAt: 2 },
    ],
  }
  const { catalog } = await library()
  await catalog.import(archive, { mode: 'replace' })
  await catalog.create({ name: 'Mine', kind: 'text' })
  const heard = []
  const off = catalog.subscribe((st) => heard.push(st.items.map((i) => i.id)))
  await catalog.import(catalog.dump(), { mode: 'replace' })
  off()
  assert.equal(heard.length, 1, 'announced once')
  assert.ok(['f1', 't1'].every((id) => heard[0].includes(id)), 'never a listing without the archive’s items')

  // Storage refuses the second record: the listing still says what went in.
  const storage = memoryStorage()
  const put = storage.put
  let puts = 0
  storage.put = (r) => (++puts === 2 ? Promise.reject(new Error('quota')) : put(r))
  const { catalog: broken } = await library({ storage })
  const seen = []
  broken.subscribe((st) => seen.push(st.items.map((i) => i.id)))
  await assert.rejects(broken.import(archive, { mode: 'replace' }), /quota/)
  assert.equal(seen.length, 1)
  assert.ok(seen[0].includes('f1') && !seen[0].includes('t1'), JSON.stringify(seen))
})

const SYSTEM = { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items' }
const KEPT = [SYSTEM_FOLDER, APPLE_MENU_ITEMS, STARTUP_ITEMS]

test('the System Folder: on the disk with its two folders, kept like the volumes; what it holds is anyone’s', async () => {
  const storage = memoryStorage()
  const { catalog } = await library({ system: SYSTEM, storage })
  const st = catalog.get()
  assert.deepEqual(names(childrenOf(st, DISK)), ['System Folder'])
  assert.deepEqual(names(childrenOf(st, SYSTEM_FOLDER)), ['Apple Menu Items', 'Startup Items'])
  assert.deepEqual(enclosingFolders(st, APPLE_MENU_ITEMS), [APPLE_MENU_ITEMS, SYSTEM_FOLDER, DISK])
  const box = await catalog.create({ name: 'Box' })
  for (const id of KEPT) {
    assert.ok(isKept(id))
    assert.equal(await catalog.rename(id, 'Mine'), false, `${id} keeps its name`)
  }
  assert.deepEqual(await catalog.move(KEPT, box.id), [])
  assert.deepEqual(await catalog.move(KEPT, TRASH), [], 'nor goes in the Trash')
  assert.deepEqual(await catalog.copy(KEPT, null), [])
  const note = await catalog.create({ name: 'Note', kind: 'text', parent: APPLE_MENU_ITEMS })
  assert.equal(note.parent, APPLE_MENU_ITEMS)
  assert.deepEqual(await catalog.move([note.id], STARTUP_ITEMS), [note.id])
  assert.ok(!KEPT.some((id) => storage.records.has(id)), 'nothing of them is stored until placed')
  catalog.place(new Map([[SYSTEM_FOLDER, { left: 16, top: 16 }]]))
  await catalog.flush()
  const again = createCatalog({ storage, volumes: { disk: 'Macintosh HD' }, system: SYSTEM })
  await again.refresh()
  const folder = again.item(SYSTEM_FOLDER)
  assert.deepEqual([folder.name, folder.left, folder.top], ['System Folder', 16, 16], 'a place, stored on a record of its own id')
})

test('the System Folder: a storage from before has it at once; without a disk on the desktop; without the setting none', async () => {
  const storage = memoryStorage()
  const before = await library({ storage })
  await before.catalog.seed((c) => c.create({ name: 'Read Me', kind: 'text' }))
  const { catalog } = await library({ storage, system: SYSTEM })
  assert.ok(KEPT.every((id) => catalog.item(id)), 'seeded before the setting, it has them too')
  const { catalog: diskless } = await library({ volumes: { trash: 'Trash' }, system: SYSTEM })
  assert.deepEqual(names(childrenOf(diskless.get(), null)), ['Trash', 'System Folder'])
  const { catalog: none } = await library()
  assert.ok(!KEPT.some((id) => none.item(id)))
  await none.create({ name: 'On the desktop', kind: 'text' })
  assert.deepEqual(appleMenuItemsOf(none.get()), [], 'no folder, no entries: never the desktop’s items')
  assert.deepEqual(startupItemsOf(none.get()), [])
})

test('Apple Menu Items and Startup Items: what each holds, by name, case aside, a leading space first', async () => {
  const { catalog } = await library({ system: SYSTEM })
  for (const name of ['Zebra', 'apple', ' Zed', 'Banana']) await catalog.create({ name, kind: 'text', parent: APPLE_MENU_ITEMS })
  await catalog.create({ name: 'Later', kind: 'text', parent: STARTUP_ITEMS })
  await catalog.create({ name: 'Early', parent: STARTUP_ITEMS })
  await catalog.create({ name: 'Elsewhere', kind: 'text' })
  assert.deepEqual(names(appleMenuItemsOf(catalog.get())), [' Zed', 'apple', 'Banana', 'Zebra'])
  assert.deepEqual(names(startupItemsOf(catalog.get())), ['Early', 'Later'], 'a folder too')
})

test('aliases: resolve follows one to its original, moved or renamed, through an alias of an alias; null once it is gone', async () => {
  const { catalog } = await library()
  const box = await catalog.create({ name: 'Box' })
  const note = await catalog.create({ name: 'Note', kind: 'text' })
  const alias = await catalog.create({ name: 'Note alias', kind: ALIAS_KIND, data: { original: note.id } })
  assert.equal(originalOf(alias), note.id)
  assert.equal(originalOf(note), null, 'only an alias has one')
  assert.equal(originalOf({ ...alias, data: { original: 7 } }), null)
  assert.equal(resolve(catalog.get(), note.id).id, note.id, 'anything else resolves to itself')
  await catalog.move([note.id], box.id)
  await catalog.rename(note.id, 'Memo')
  assert.equal(resolve(catalog.get(), alias.id).name, 'Memo')
  const twice = await catalog.create({ name: 'twice', kind: ALIAS_KIND, data: { original: alias.id } })
  assert.equal(resolve(catalog.get(), twice.id).id, note.id)

  await catalog.move([alias.id, twice.id], TRASH)
  await catalog.emptyTrash()
  assert.ok(catalog.item(note.id), 'trashing an alias leaves its original')
  const again = await catalog.create({ name: 'Memo alias', kind: ALIAS_KIND, data: { original: note.id } })
  await catalog.move([note.id], TRASH)
  assert.equal(resolve(catalog.get(), again.id)?.id, note.id, 'an original in the Trash still resolves')
  await catalog.emptyTrash()
  assert.equal(resolve(catalog.get(), again.id), null, 'removed, it doesn’t')

  // A chain that loops resolves to nothing.
  const a = await catalog.create({ name: 'a', kind: ALIAS_KIND })
  const b = await catalog.create({ name: 'b', kind: ALIAS_KIND, data: { original: a.id } })
  await catalog.update(a.id, { original: b.id })
  assert.equal(resolve(catalog.get(), a.id), null)
})

test('aliases: "name alias", counted up in a container; a copied alias stands for the same original', async () => {
  const { catalog } = await library()
  const note = await catalog.create({ name: 'Note', kind: 'text' })
  assert.equal(aliasName(catalog.get(), null, 'Note'), 'Note alias')
  const alias = await catalog.create({ name: 'Note alias', kind: ALIAS_KIND, data: { original: note.id } })
  assert.equal(aliasName(catalog.get(), null, 'Note'), 'Note alias 2')
  await catalog.create({ name: 'Note alias 2', kind: ALIAS_KIND, data: { original: note.id } })
  assert.equal(aliasName(catalog.get(), null, 'Note'), 'Note alias 3')
  assert.equal(aliasName(catalog.get(), DISK, 'Note'), 'Note alias', 'per container')
  const [copy] = await catalog.copy([alias.id], DISK)
  assert.deepEqual([copy.kind, resolve(catalog.get(), copy.id).id], [ALIAS_KIND, note.id])
})

test('import: an alias follows its original to the original’s new id, and the System Folder’s items stay in it', async () => {
  const archive = {
    items: [
      { id: 'n1', name: 'Note', kind: 'text', parent: null, createdAt: 1, modifiedAt: 1 },
      { id: 'a1', name: 'Note alias', kind: ALIAS_KIND, parent: APPLE_MENU_ITEMS, createdAt: 2, modifiedAt: 2, data: { original: 'n1' } },
      { id: 'a2', name: 'Lost alias', kind: ALIAS_KIND, parent: null, createdAt: 3, modifiedAt: 3, data: { original: 'gone' } },
      { id: SYSTEM_FOLDER, name: '', kind: 'folder', parent: DISK, createdAt: 0, modifiedAt: 0, left: 16, top: 16 },
    ],
  }
  const { catalog } = await library({ system: SYSTEM })
  const stored = await catalog.import(archive)
  const note = stored.get('n1')
  assert.notEqual(note.id, 'n1')
  assert.equal(originalOf(stored.get('a1')), note.id)
  assert.equal(stored.get('a1').parent, APPLE_MENU_ITEMS)
  assert.equal(originalOf(stored.get('a2')), 'gone', 'an original outside the archive keeps its id')
  assert.ok(!stored.has(SYSTEM_FOLDER), 'a kept container’s record is not imported')
  assert.deepEqual(names(appleMenuItemsOf(catalog.get())), ['Note alias'])
  assert.equal(resolve(catalog.get(), stored.get('a1').id).id, note.id)
})

/** An alias of `original` as Make Alias makes one, naming the original's id and kind. */
const aliasOf = (catalog, original, fields = {}) =>
  catalog.create({ name: `${original.name} alias`, kind: ALIAS_KIND, data: { original: original.id, kind: original.kind }, ...fields })

test('Make Alias takes a document, a folder, the disk, the System Folder’s folders or an alias of one, outside the Trash', async () => {
  const { catalog } = await library({ system: SYSTEM })
  const box = await catalog.create({ name: 'Box' })
  const note = await catalog.create({ name: 'Note', kind: 'text', parent: box.id })
  const toBox = await aliasOf(catalog, box)
  const toTrash = await aliasOf(catalog, catalog.item(TRASH))
  const st = catalog.get()
  for (const id of [note.id, box.id, DISK, SYSTEM_FOLDER, APPLE_MENU_ITEMS, STARTUP_ITEMS, toBox.id]) {
    assert.equal(canAlias(st, id), true, id)
  }
  assert.equal(canAlias(st, TRASH), false, 'never the Trash')
  assert.equal(canAlias(st, toTrash.id), false, 'nor through an alias of it')
  assert.equal(canAlias(st, 'nothing'), false)
  assert.equal(canAlias(st, null), false)
  await catalog.move([box.id], TRASH)
  assert.equal(canAlias(catalog.get(), box.id), false, 'nothing in the Trash')
  assert.equal(canAlias(catalog.get(), note.id), false, 'nor inside a folder there')
  assert.equal(canAlias(catalog.get(), toBox.id), true, 'an alias outside it, of an original inside it')
  await catalog.emptyTrash()
  assert.equal(canAlias(catalog.get(), toBox.id), false, 'nor an alias whose original is gone')
})

test('folder aliases: a drop onto one files into its original, judged by the original', async () => {
  const { catalog } = await library()
  const outer = await catalog.create({ name: 'Outer' })
  const inner = await catalog.create({ name: 'Inner', parent: outer.id })
  const note = await catalog.create({ name: 'Note', kind: 'text' })
  const toOuter = await aliasOf(catalog, outer)
  const toInner = await aliasOf(catalog, inner)
  const toDisk = await aliasOf(catalog, catalog.item(DISK))
  const toNote = await aliasOf(catalog, note)
  let st = catalog.get()
  assert.deepEqual(dropTargetOf(st, outer.id), { folder: outer.id }, 'a folder takes its own drop')
  assert.deepEqual(dropTargetOf(st, TRASH), { folder: TRASH }, 'and the Trash')
  assert.deepEqual(dropTargetOf(st, toOuter.id), { folder: outer.id }, 'an alias passes it to its original')
  assert.deepEqual(dropTargetOf(st, toDisk.id), { folder: DISK }, 'the disk’s too')
  assert.equal(dropTargetOf(st, note.id), null, 'a document takes none')
  assert.equal(dropTargetOf(st, toNote.id), null, 'nor an alias of one')
  assert.equal(dropTargetOf(st, null), null)

  // Filed through an alias, an item lands in the original, wherever it moved.
  await catalog.move([outer.id], DISK)
  assert.deepEqual(await catalog.move([note.id], dropTargetOf(catalog.get(), toOuter.id).folder), [note.id])
  assert.equal(catalog.item(note.id).parent, outer.id)
  // A folder filed into itself, or a folder inside it, through an alias: refused.
  st = catalog.get()
  assert.deepEqual(await catalog.move([outer.id], dropTargetOf(st, toOuter.id).folder), [])
  assert.deepEqual(await catalog.move([outer.id], dropTargetOf(st, toInner.id).folder), [])
  assert.equal(catalog.item(outer.id).parent, DISK)
})

test('folder aliases: with the original gone, one still takes a drop and files nothing; one without a kind is a document’s', async () => {
  const { catalog } = await library()
  const box = await catalog.create({ name: 'Box' })
  const note = await catalog.create({ name: 'Note', kind: 'text' })
  const toBox = await aliasOf(catalog, box)
  const toNote = await aliasOf(catalog, note)
  const before = await catalog.create({ name: 'Before', kind: ALIAS_KIND, data: { original: box.id } })
  assert.deepEqual(dropTargetOf(catalog.get(), before.id), { folder: box.id }, 'with the original there, the original decides')
  await catalog.move([box.id, note.id], TRASH)
  assert.deepEqual(dropTargetOf(catalog.get(), toBox.id), { folder: box.id }, 'an original in the Trash still takes it')
  await catalog.emptyTrash()
  const st = catalog.get()
  assert.deepEqual(dropTargetOf(st, toBox.id), { missing: catalog.item(toBox.id) }, 'gone: the alias, which says so')
  assert.equal(dropTargetOf(st, toNote.id), null, 'an alias of a document takes none, gone or not')
  assert.equal(dropTargetOf(st, before.id), null, 'an alias with no kind stood for an application or a document')
})

/** The Apple menu by name: a folder's entries as `{ name: [...] }`. */
const menuTree = (entries) => entries.map(({ item, entries: inside }) => (inside ? { [item.name]: menuTree(inside) } : item.name))

test('appleMenuOf: a folder or a folder alias in Apple Menu Items holds what its original holds, by name, and follows it', async () => {
  const { catalog } = await library({ system: SYSTEM })
  const games = await catalog.create({ name: 'Games', parent: DISK })
  await catalog.create({ name: 'Puzzle', kind: 'text', parent: games.id })
  const arcade = await catalog.create({ name: 'arcade', parent: games.id })
  await catalog.create({ name: 'Pong', kind: 'text', parent: arcade.id })
  await aliasOf(catalog, games, { name: 'Games', parent: APPLE_MENU_ITEMS })
  const panels = await catalog.create({ name: 'Control Panels', parent: APPLE_MENU_ITEMS })
  await catalog.create({ name: 'Desktop Patterns', kind: 'text', parent: panels.id })
  await catalog.create({ name: 'Note Pad', kind: 'text', parent: APPLE_MENU_ITEMS })
  const menu = appleMenuOf(catalog.get())
  assert.deepEqual(menuTree(menu), [{ 'Control Panels': ['Desktop Patterns'] }, { Games: [{ arcade: ['Pong'] }, 'Puzzle'] }, 'Note Pad'])
  assert.equal(menu[1].item.kind, ALIAS_KIND, 'an alias’s entry is the alias')
  assert.deepEqual(names(menu.map((e) => e.item)), names(appleMenuItemsOf(catalog.get())), 'the same entries as appleMenuItemsOf')
  await catalog.create({ name: 'Meteors', kind: 'text', parent: games.id })
  assert.deepEqual(menuTree(appleMenuOf(catalog.get()))[1], { Games: [{ arcade: ['Pong'] }, 'Meteors', 'Puzzle'] }, 'a game added is in it at once')
  const { catalog: none } = await library()
  assert.deepEqual(appleMenuOf(none.get()), [], 'none without the System Folder')
})

test('appleMenuOf: a folder already on the way down, an empty folder, a lost original and a folder past five levels are entries', async () => {
  const { catalog } = await library({ system: SYSTEM })
  const games = await catalog.create({ name: 'Games', parent: APPLE_MENU_ITEMS })
  await aliasOf(catalog, games, { name: 'Back up', parent: games.id })
  await aliasOf(catalog, catalog.item(APPLE_MENU_ITEMS), { name: 'Apple Menu Items', parent: games.id })
  await aliasOf(catalog, catalog.item(SYSTEM_FOLDER), { name: 'System', parent: APPLE_MENU_ITEMS })
  const gone = await catalog.create({ name: 'Gone', parent: DISK })
  await aliasOf(catalog, gone, { name: 'Lost', parent: APPLE_MENU_ITEMS })
  await catalog.move([gone.id], TRASH)
  await catalog.emptyTrash()
  // L1 to L7, each inside the one before, from Apple Menu Items.
  let parent = APPLE_MENU_ITEMS
  for (let n = 1; n <= 7; n++) parent = (await catalog.create({ name: `L${n}`, parent })).id
  assert.deepEqual(menuTree(appleMenuOf(catalog.get())), [
    { Games: ['Apple Menu Items', 'Back up'] },
    { L1: [{ L2: [{ L3: [{ L4: [{ L5: ['L6'] }] }] }] }] },
    'Lost',
    { System: ['Apple Menu Items', 'Startup Items'] },
  ])
})
