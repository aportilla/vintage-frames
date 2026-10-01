/**
 * Catalog storage that keeps: IndexedDB, one object store of item records
 * keyed by `id`.
 *
 * The database opens at the profile's own version, and one version up when
 * the store is missing — opening at a fixed version throws `VersionError` on
 * a profile already past it. It opens on first use; a failed open is retried
 * on the next call. Every call rejects on failure (a private window), and the
 * catalog then reports itself unavailable. A connection closes itself when
 * another tab upgrades the database, and the next call reopens.
 */

import type { CatalogStorage, Item } from './catalog.js'

const STORE = 'items'

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })

function openAt(name: string, version: number | undefined, onVersionChange: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version == null ? indexedDB.open(name) : indexedDB.open(name, version)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        onVersionChange()
        db.close()
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    // Another tab holds the old version; the request completes when it lets go.
    req.onblocked = () => {
      console.warn(`vintage-frames/shell: waiting for another tab to let go of the "${name}" database`)
    }
  })
}

async function open(name: string, onVersionChange: () => void): Promise<IDBDatabase> {
  let db = await openAt(name, undefined, onVersionChange)
  if (!db.objectStoreNames.contains(STORE)) {
    const next = db.version + 1
    db.close()
    db = await openAt(name, next, onVersionChange)
  }
  return db
}

/** A catalog storage in the IndexedDB database `name`, which keeps it across reloads. */
export function indexedDbStorage(name: string): CatalogStorage {
  let pending: Promise<IDBDatabase> | null = null
  const db = (): Promise<IDBDatabase> => {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'))
    pending ??= open(name, () => {
      pending = null
    }).catch((err) => {
      pending = null
      throw err
    })
    return pending
  }
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    request(fn((await db()).transaction(STORE, mode).objectStore(STORE)))
  return {
    list: () => run('readonly', (s) => s.getAll() as IDBRequest<Item[]>),
    put: (item) => run('readwrite', (s) => s.put(item)),
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  }
}
