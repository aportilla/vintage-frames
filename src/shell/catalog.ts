/**
 * The catalog: what is where. Pure and DOM-free — it runs under Node — and
 * the source of truth for what a folder holds; the Finder renders it.
 *
 * - An item is a small record: a name, a kind, the container it sits in
 *   (`parent`, a folder's id, or null for the desktop) and, once placed, its
 *   position there in whole system px. A kind keeps small data of its own in
 *   `data`; a large payload stays in its application's own store, keyed by
 *   the item's id, and the kind's `copy` and `onRemove` keep that store in
 *   step.
 * - Volumes are containers no one made: the Trash and a startup disk, each
 *   if the page wants one. They lead the listing, keep their names, and are
 *   never renamed, moved, copied or removed; nothing is made in the Trash.
 *   Deleting is a move into the Trash, and only Empty Trash removes. A
 *   volume's position is stored on a record of its own id.
 * - A folder never goes into itself or a folder inside it. A parent with no
 *   record reads as the desktop.
 * - An item whose kind no application registers is left out of the listing
 *   and kept in storage.
 * - Storage is three calls over item records (list, put, remove). The
 *   catalog holds every record in memory, writes through to storage, and
 *   lists from memory; a position change writes after a short delay, since
 *   the resize rule moves every desktop icon on each resize event.
 * - A seed runs once per storage: a persistent one stores a marker record
 *   (`#seeded`), so a site that starts in memory and switches its storage
 *   seeds once there.
 */

import type { Point } from './geometry.js'

/** The Trash's id. */
export const TRASH = 'trash'
/** The startup disk's id. */
export const DISK = 'disk'
/** A folder's kind. */
export const FOLDER = 'folder'

/** The name a new folder takes, counted up where it is taken. */
export const UNTITLED_FOLDER = 'untitled folder'

/** The marker record a seeded storage holds. */
const SEEDED = '#seeded'

/** One item of the catalog. */
export interface Item {
  id: string
  name: string
  /** `folder`, a volume's (`trash`, `disk`), or a kind an application registers. */
  kind: string
  /** A folder's id, a volume's, or null for the desktop. */
  parent: string | null
  /** Its place in its container, whole system px; unset, the next free cell. */
  left?: number
  top?: number
  createdAt: number
  modifiedAt: number
  /** The kind's own, small and serializable. */
  data?: unknown
}

/** The listing: volumes first, then every listed item by creation. */
export interface CatalogState {
  /** Whether storage answers. Without it the catalog lists the volumes alone. */
  available: boolean
  items: readonly Item[]
}

/** Where item records live. Any object with these three calls will do. */
export interface CatalogStorage {
  list(): Promise<Item[]>
  put(item: Item): Promise<unknown>
  remove(id: string): Promise<unknown>
}

/** What a kind tells the catalog about its items' payloads. */
export interface KindHooks {
  /** Bytes, for Empty Trash's alert. */
  size?(item: Item): number
  /** Copy `from`'s payload to `to`, a fresh copy of it. */
  copy?(from: Item, to: Item): void | Promise<void>
  /** Empty Trash removed the item: drop its payload. */
  onRemove?(item: Item): void | Promise<void>
}

/** The volumes a page wants, by name; `false` or unset is none (the Trash defaults on). */
export interface Volumes {
  trash?: string | false
  disk?: string | false
}

export interface CatalogOptions {
  storage: CatalogStorage | null
  volumes?: Volumes
  /** Whether an application registers `kind`. Folders are always listed. Default: every kind. */
  listed?(kind: string): boolean
  /** A kind's payload hooks. */
  hooks?(kind: string): KindHooks | undefined
  now?(): number
  newId?(): string
  /** How long a position change waits before it is written, ms. Default 400. */
  placeDelay?: number
}

/** What an operation makes: the new item, or null where it was refused. */
export interface NewItem {
  name?: string
  kind?: string
  parent?: string | null
  left?: number
  top?: number
  data?: unknown
  /** The creation time, for a batch made in order. Default now. */
  at?: number
}

/** A catalog dumped or restored: its item records. */
export interface CatalogArchive {
  items: Item[]
}

/* ── Selectors ──────────────────────────────────────────────────────────── */

/** Whether `kind` holds other items: a folder or a volume. */
export const isContainerKind = (kind: string): boolean =>
  kind === FOLDER || kind === TRASH || kind === DISK

/** Whether `id` names a volume. */
export const isVolume = (id: string | null | undefined): boolean => id === TRASH || id === DISK

/** The item with `id`, or null. */
export function itemOf(state: CatalogState, id: string | null | undefined): Item | null {
  if (id == null) return null
  return state.items.find((i) => i.id === id) ?? null
}

/** The container `parent` resolves to: that container while it is listed, else the desktop (null). */
export function containerOf(state: CatalogState, parent: string | null | undefined): string | null {
  const item = itemOf(state, parent)
  return item && isContainerKind(item.kind) ? item.id : null
}

/** The items directly in a container (null: the desktop), in listing order. */
export function childrenOf(state: CatalogState, parent: string | null): Item[] {
  const target = containerOf(state, parent)
  return state.items.filter((i) => i.id !== target && containerOf(state, i.parent) === target)
}

/** How many items a container holds directly. */
export function itemCount(state: CatalogState, parent: string | null): number {
  return childrenOf(state, parent).length
}

/** The container an item sits in, through `containerOf`. */
const parentOf = (state: CatalogState, id: string): string | null =>
  containerOf(state, itemOf(state, id)?.parent ?? null)

/**
 * Whether `ancestor` is on `id`'s chain of containers. An item is not inside
 * itself; a looping chain stops at its first repeat.
 */
export function isInside(state: CatalogState, id: string, ancestor: string): boolean {
  const seen = new Set<string>()
  let cur = parentOf(state, id)
  while (cur != null && !seen.has(cur)) {
    if (cur === ancestor) return true
    seen.add(cur)
    cur = parentOf(state, cur)
  }
  return false
}

/**
 * Container `id` and the containers around it, innermost first. The desktop
 * ends the chain, and so does an id with no container; a loop stops at its
 * first repeat.
 */
export function enclosingFolders(state: CatalogState, id: string | null | undefined): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  let cur = containerOf(state, id ?? null)
  while (cur != null && !seen.has(cur)) {
    ids.push(cur)
    seen.add(cur)
    cur = parentOf(state, cur)
  }
  return ids
}

/** Whether `id` is the Trash or anything inside it. */
export function isTrashed(state: CatalogState, id: string | null | undefined): boolean {
  if (id == null) return false
  return id === TRASH || isInside(state, id, TRASH)
}

/** Everything under a container, each container before what it holds; a loop is walked once. */
export function descendantsOf(state: CatalogState, parent: string | null): Item[] {
  const out: Item[] = []
  const seen = new Set<string>()
  const walk = (id: string | null) => {
    for (const child of childrenOf(state, id)) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      out.push(child)
      if (isContainerKind(child.kind)) walk(child.id)
    }
  }
  walk(containerOf(state, parent))
  return out
}

/** The first free folder name in a container: "untitled folder", "untitled folder 2", … */
export function nextFolderName(state: CatalogState, parent: string | null): string {
  const used = new Set(
    childrenOf(state, parent)
      .filter((i) => i.kind === FOLDER)
      .map((i) => i.name)
  )
  if (!used.has(UNTITLED_FOLDER)) return UNTITLED_FOLDER
  for (let n = 2; ; n++) {
    const name = `${UNTITLED_FOLDER} ${n}`
    if (!used.has(name)) return name
  }
}

/** A name less a trailing " copy" or " copy N". */
const copyBase = (name: string) => name.replace(/ copy( \d+)?$/, '')

/**
 * The name for a copy in a container: `name` itself while no item of its
 * kind there has it, else its base (less " copy" and " copy N") plus " copy",
 * then " copy 2", " copy 3", …
 */
export function copyName(state: CatalogState, parent: string | null, name: string, kind: string): string {
  const used = new Set(
    childrenOf(state, parent)
      .filter((i) => i.kind === kind)
      .map((i) => i.name)
  )
  if (!used.has(name)) return name
  const base = copyBase(name)
  if (!used.has(`${base} copy`)) return `${base} copy`
  for (let n = 2; ; n++) {
    const next = `${base} copy ${n}`
    if (!used.has(next)) return next
  }
}

/* ── The catalog ────────────────────────────────────────────────────────── */

/** The catalog's operations, over its listing. */
export interface Catalog {
  get(): CatalogState
  subscribe(fn: (state: CatalogState) => void): () => void
  item(id: string | null | undefined): Item | null
  refresh(): Promise<void>
  seed(fn: (catalog: Catalog) => void | Promise<void>): Promise<boolean>
  create(input?: NewItem): Promise<Item | null>
  rename(id: string, name: string): Promise<boolean>
  update(id: string, data: unknown): Promise<boolean>
  move(ids: readonly string[], parent: string | null, landings?: ReadonlyMap<string, Point | null>): Promise<string[]>
  place(positions: ReadonlyMap<string, Point>): void
  flush(): Promise<void>
  copy(ids: readonly string[], parent: string | null): Promise<Item[]>
  emptyTrash(): Promise<Item[]>
  trashSize(): number
  dump(): CatalogArchive
  clear(): Promise<void>
  import(archive: CatalogArchive, options?: { mode?: 'merge' | 'replace' }): Promise<Map<string, Item>>
  dispose(): Promise<void>
}

const byCreation =(a: Item, b: Item) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)

/** A position's two fields off an item, or on it. */
function withPosition(item: Item, at: Point | null | undefined): Item {
  const next = { ...item }
  if (at) {
    next.left = at.left
    next.top = at.top
  } else {
    delete next.left
    delete next.top
  }
  return next
}

export function createCatalog(options: CatalogOptions): Catalog {
  const {
    storage,
    volumes = {},
    listed = () => true,
    hooks = () => undefined,
    placeDelay = 400,
  } = options
  const now = () => (options.now ?? Date.now)()
  const newId = () => (options.newId ? options.newId() : crypto.randomUUID())

  /** The volumes this catalog lists, in order. */
  const volumeRows: Item[] = []
  if (volumes.disk) {
    volumeRows.push({ id: DISK, name: volumes.disk, kind: DISK, parent: null, createdAt: 0, modifiedAt: 0 })
  }
  if (volumes.trash !== false) {
    volumeRows.push({
      id: TRASH,
      name: volumes.trash ?? 'Trash',
      kind: TRASH,
      parent: null,
      createdAt: 0,
      modifiedAt: 0,
    })
  }

  /** Every stored record, by id, the marker aside. */
  let records = new Map<string, Item>()
  let available = false
  let seeded = false
  let state: CatalogState = derive()
  const listeners = new Set<(s: CatalogState) => void>()

  function derive(): CatalogState {
    const vols = volumeRows.map((v) => {
      const stored = records.get(v.id)
      return stored?.left != null && stored.top != null
        ? { ...v, left: stored.left, top: stored.top }
        : v
    })
    const rows = [...records.values()]
      .filter((r) => !isVolume(r.id) && (r.kind === FOLDER || listed(r.kind)))
      .sort(byCreation)
    return { available, items: [...vols, ...rows] }
  }

  function changed(): void {
    state = derive()
    for (const fn of [...listeners]) fn(state)
  }

  const store = (): CatalogStorage => {
    if (!storage) throw new Error('storage is unavailable')
    return storage
  }

  /** Store a record, then hold it. */
  async function put(item: Item): Promise<void> {
    await store().put(item)
    records.set(item.id, item)
  }

  // Positions, written a moment after they settle.
  const pendingPlaces = new Set<string>()
  let placeTimer: ReturnType<typeof setTimeout> | null = null
  async function flush(): Promise<void> {
    if (placeTimer) clearTimeout(placeTimer)
    placeTimer = null
    const ids = [...pendingPlaces]
    pendingPlaces.clear()
    if (!storage || !available) return
    for (const id of ids) {
      const rec = records.get(id)
      if (rec) await storage.put(rec).catch(() => {})
    }
  }

  /** A volume's position record, made on its first placement. */
  const volumeRecord = (id: string): Item => {
    const row = volumeRows.find((v) => v.id === id)!
    return records.get(id) ?? { ...row, name: '' }
  }

  /** Remove every stored record but the marker, unannounced. */
  async function wipe(): Promise<void> {
    pendingPlaces.clear()
    for (const r of await store().list()) {
      if (r.id === SEEDED) continue
      await store().remove(r.id)
      records.delete(r.id)
    }
    records = new Map()
  }

  const api: Catalog = {
    get: (): CatalogState => state,
    subscribe(fn: (s: CatalogState) => void): () => void {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },

    /** The listed item with `id`, or null. */
    item: (id: string | null | undefined): Item | null => itemOf(state, id),

    /** Read every record from storage. Without storage, or when it fails, the volumes alone. */
    async refresh(): Promise<void> {
      if (!storage) {
        records = new Map()
        available = false
        changed()
        return
      }
      try {
        const list = await storage.list()
        records = new Map()
        seeded = false
        for (const r of list) {
          if (r.id === SEEDED) seeded = true
          else records.set(r.id, r)
        }
        available = true
      } catch (err) {
        console.warn('vintage-frames/shell: the catalog could not be read —', err)
        records = new Map()
        available = false
      }
      changed()
    },

    /**
     * Run `fn` once per storage — the defaults a site stores the first time,
     * or the items its markup declares — then mark the storage seeded. A
     * storage already seeded runs nothing. Resolves whether it ran.
     */
    async seed(fn: (catalog: Catalog) => void | Promise<void>): Promise<boolean> {
      if (!storage || !available || seeded) return false
      await fn(api)
      await storage.put({ id: SEEDED, name: '', kind: SEEDED, parent: null, createdAt: now(), modifiedAt: now() })
      seeded = true
      return true
    },

    /**
     * Make an item in a container (`parent` null: the desktop) — a folder
     * named the next "untitled folder" unless named. Refused (null) in the
     * Trash or inside it.
     */
    async create(input: NewItem = {}): Promise<Item | null> {
      const target = containerOf(state, input.parent ?? null)
      if (isTrashed(state, target)) return null
      const kind = input.kind ?? FOLDER
      const at = input.at ?? now()
      let item: Item = {
        id: newId(),
        name: input.name ?? (kind === FOLDER ? nextFolderName(state, target) : 'untitled'),
        kind,
        parent: target,
        createdAt: at,
        modifiedAt: at,
      }
      if (input.data !== undefined) item.data = input.data
      if (input.left != null && input.top != null) item = withPosition(item, { left: input.left, top: input.top })
      await put(item)
      changed()
      return item
    },

    /** Rename an item. A volume keeps its name. Resolves whether it changed. */
    async rename(id: string, name: string): Promise<boolean> {
      const rec = records.get(id)
      if (!rec || isVolume(id) || rec.name === name) return false
      await put({ ...rec, name, modifiedAt: now() })
      changed()
      return true
    },

    /** Replace an item's `data`, the kind's own. */
    async update(id: string, data: unknown): Promise<boolean> {
      const rec = records.get(id)
      if (!rec || isVolume(id)) return false
      await put({ ...rec, data, modifiedAt: now() })
      changed()
      return true
    },

    /**
     * Move items into a container (null: the desktop), each at its landing
     * there — a position, or none for the container's next free cell.
     * Refused for a volume, an item already there, and a folder into itself
     * or a folder inside it. Resolves the ids that moved.
     */
    async move(
      ids: readonly string[],
      parent: string | null,
      landings?: ReadonlyMap<string, Point | null>
    ): Promise<string[]> {
      const target = containerOf(state, parent)
      const moved: string[] = []
      for (const id of ids) {
        const rec = records.get(id)
        if (!rec || isVolume(id)) continue
        if (target === id || (target != null && isContainerKind(rec.kind) && isInside(state, target, id))) continue
        if (containerOf(state, rec.parent) === target) continue
        pendingPlaces.delete(id)
        await put(withPosition({ ...rec, parent: target }, landings?.get(id) ?? null))
        moved.push(id)
      }
      if (moved.length) changed()
      return moved
    },

    /**
     * Put items at positions in their own containers. The listing changes at
     * once; storage a moment later ({@link flush} writes now).
     */
    place(positions: ReadonlyMap<string, Point>): void {
      let any = false
      for (const [id, at] of positions) {
        const rec = isVolume(id) ? (volumeRows.some((v) => v.id === id) ? volumeRecord(id) : null) : records.get(id)
        if (!rec || (rec.left === at.left && rec.top === at.top)) continue
        records.set(id, withPosition(rec, at))
        pendingPlaces.add(id)
        any = true
      }
      if (!any) return
      changed()
      if (placeTimer) clearTimeout(placeTimer)
      placeTimer = setTimeout(() => void flush(), placeDelay)
    },

    /** Write the positions still waiting now. */
    flush,

    /**
     * Copy items into a container, a folder with everything inside it. Every
     * copy gets a fresh id and times; the top ones are named by `copyName`
     * and take the container's next free cells, the rest keep their names
     * and places. Each kind copies its own payload. Refused for a volume and
     * into the Trash. Resolves the top copies.
     */
    async copy(ids: readonly string[], parent: string | null): Promise<Item[]> {
      const target = containerOf(state, parent)
      if (isTrashed(state, target)) return []
      const tops: Item[] = []
      for (const id of ids) {
        const src = itemOf(state, id)
        if (!src || isVolume(id)) continue
        // Read before any write, so a folder copied into itself is copied once.
        const inside = isContainerKind(src.kind) ? descendantsOf(state, id) : []
        const map = new Map<string, string>()
        const make = async (from: Item, into: string | null, top: boolean): Promise<Item> => {
          const at = now()
          let to: Item = {
            ...from,
            id: newId(),
            name: top ? copyName(state, into, from.name, from.kind) : from.name,
            parent: into,
            createdAt: at,
            modifiedAt: at,
          }
          if (top) to = withPosition(to, null)
          map.set(from.id, to.id)
          await put(to)
          await hooks(from.kind)?.copy?.(from, to)
          return to
        }
        tops.push(await make(src, target, true))
        // descendantsOf lists each container before what it holds.
        for (const child of inside) await make(child, map.get(containerOf(state, child.parent) ?? '') ?? null, false)
        changed()
      }
      return tops
    },

    /** Remove everything in the Trash, each kind dropping its payload. Resolves what went. */
    async emptyTrash(): Promise<Item[]> {
      const gone = descendantsOf(state, TRASH)
      for (const item of gone) {
        await store().remove(item.id)
        records.delete(item.id)
        pendingPlaces.delete(item.id)
        await hooks(item.kind)?.onRemove?.(item)
      }
      if (gone.length) changed()
      return gone
    },

    /** Bytes in the Trash, by the kinds' `size`. */
    trashSize(): number {
      return descendantsOf(state, TRASH).reduce((sum, i) => sum + (hooks(i.kind)?.size?.(i) ?? 0), 0)
    },

    /** Every record, listed or not, for a backup. */
    dump(): CatalogArchive {
      return { items: [...records.values()] }
    },

    /** Remove every record, listed or not; the storage stays seeded. */
    async clear(): Promise<void> {
      if (!storage) return
      try {
        await wipe()
      } finally {
        changed()
      }
    },

    /**
     * Restore records. `replace` clears the catalog first and keeps the
     * archive's ids; `merge` mints fresh ids and remaps the containers, so
     * the same archive can be added twice. Both keep names, kinds, data and
     * times. An archive with nothing in it changes nothing. The listing is
     * announced once, when the import is done or has failed partway, so a
     * replace never lists the catalog empty between the two. Resolves each
     * archive id's stored item — under a fresh id after a merge, so a kind
     * whose payload is keyed by item id can carry it over.
     */
    async import(
      archive: CatalogArchive,
      { mode = 'merge' }: { mode?: 'merge' | 'replace' } = {}
    ): Promise<Map<string, Item>> {
      const stored = new Map<string, Item>()
      const rows = archive.items.filter((r) => r.id !== SEEDED && !isVolume(r.id))
      if (!rows.length || !storage) return stored
      const replace = mode === 'replace'
      const ids = new Map<string, string>()
      for (const r of rows) ids.set(r.id, replace ? r.id : newId())
      // Mapped in full first, so records out of order still nest. An unknown
      // container is the desktop.
      const into = (ref: string | null) => (ref == null || isVolume(ref) ? ref : (ids.get(ref) ?? null))
      try {
        if (replace) await wipe()
        for (const r of rows) {
          const item = { ...r, id: ids.get(r.id)!, parent: into(r.parent) }
          await put(item)
          stored.set(r.id, item)
        }
      } finally {
        changed()
      }
      return stored
    },

    /** Stop the pending write timer; positions not yet written are written now. */
    async dispose(): Promise<void> {
      await flush()
      listeners.clear()
    },
  }
  return api
}

/* ── Storage ────────────────────────────────────────────────────────────── */

/** Storage that forgets everything on a reload. Its map is exposed for tests. */
export function memoryStorage(initial: readonly Item[] = []): CatalogStorage & { records: Map<string, Item> } {
  const records = new Map(initial.map((r) => [r.id, r]))
  return {
    records,
    list: async () => [...records.values()],
    put: async (r) => records.set(r.id, r),
    remove: async (id) => records.delete(id),
  }
}
