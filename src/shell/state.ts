/**
 * The saved session: one versioned localStorage key holding each window's
 * box as a nine-slice pin and its depth, the active window's item, the
 * desktop pattern, and the site's own keys.
 *
 * - A window entry with a depth (`z`) was open at the write. One without is a
 *   box alone — a palette, or a window closed this session — which a reload
 *   never reopens and an open() still lands in.
 * - Writes wait a moment and are held until the boot has reopened the
 *   session: a write while windows are still reopening would drop the depth
 *   of the ones not reached yet. Hiding or leaving the page writes at once.
 * - `?fresh=1` neither reads nor writes.
 *
 * The parsing is pure, so it is tested under Node; the storage is the page's
 * localStorage, reached only when a state is made.
 */

import { isPin } from './geometry.js'
import type { Pin } from './geometry.js'

const VERSION = 1
const WRITE_DELAY_MS = 400

/** One saved window. */
export interface SavedWindow {
  /** The application that owns it, which reopens it. */
  app: string
  pin: Pin
  /** Its depth when saved, 0 the bottom; unset for a box alone. */
  z?: number
}

/** What the session holds. */
export interface SavedSession {
  v: number
  /** Windows by the item they show. */
  windows: Record<string, SavedWindow>
  /** The active window's item, or null. */
  active: string | null
  /** The desktop pattern, or null for the desktop's own. */
  pattern: string | null
  /** The site's own keys. */
  extra: Record<string, unknown>
}

/** One saved window, or null for anything that isn't one. */
function windowEntry(e: unknown): SavedWindow | null {
  const x = e as Partial<SavedWindow> | null
  if (!x || typeof x !== 'object' || typeof x.app !== 'string' || !x.app || !isPin(x.pin)) return null
  return Number.isInteger(x.z) ? { app: x.app, pin: x.pin, z: x.z } : { app: x.app, pin: x.pin }
}

/**
 * A parsed blob as a session, its bad entries dropped, or null for anything
 * that isn't one of this version.
 */
export function readSession(parsed: unknown): SavedSession | null {
  const p = parsed as Record<string, unknown> | null
  if (!p || typeof p !== 'object' || p.v !== VERSION) return null
  const windows: Record<string, SavedWindow> = {}
  if (p.windows && typeof p.windows === 'object') {
    for (const [item, e] of Object.entries(p.windows)) {
      const w = windowEntry(e)
      if (w) windows[item] = w
    }
  }
  return {
    v: VERSION,
    windows,
    active: typeof p.active === 'string' && p.active ? p.active : null,
    pattern: typeof p.pattern === 'string' && p.pattern.trim() ? p.pattern : null,
    extra: p.extra && typeof p.extra === 'object' && !Array.isArray(p.extra) ? { ...(p.extra as object) } : {},
  }
}

/** The windows that were open, deepest first: the order a boot reopens them in. */
export function openWindowsOf(session: SavedSession | null): { item: string; app: string; pin: Pin }[] {
  return Object.entries(session?.windows ?? {})
    .filter(([, w]) => w.z != null)
    .sort(([, a], [, b]) => a.z! - b.z!)
    .map(([item, w]) => ({ item, app: w.app, pin: w.pin }))
}

/** What the shell reports at a write: the windows it knows and the active one. */
export interface SessionSnapshot {
  windows: Record<string, SavedWindow>
  active: string | null
  pattern: string | null
}

/**
 * The session to write: every window known before keeps its box and loses
 * its depth, and the snapshot's windows — the open ones with theirs — go
 * over them.
 */
export function mergeSession(
  known: Record<string, SavedWindow>,
  snapshot: SessionSnapshot,
  extra: Record<string, unknown>
): SavedSession {
  const windows: Record<string, SavedWindow> = {}
  for (const [item, w] of Object.entries(known)) windows[item] = { app: w.app, pin: w.pin }
  for (const [item, w] of Object.entries(snapshot.windows)) {
    const entry = windowEntry(w)
    if (entry) windows[item] = entry
  }
  return { v: VERSION, windows, active: snapshot.active, pattern: snapshot.pattern, extra: { ...extra } }
}

/** A saved session the shell reads at boot and writes as the desktop changes. */
export interface ShellState {
  /** The session read at boot, or null. */
  readonly saved: SavedSession | null
  /** A saved window's pin, by item, or null. */
  pin(item: string): Pin | null
  /** A site key's saved value, else its default. */
  get<T = unknown>(key: string): T
  /** Set a site key and write at once, so an immediate reload still finds it. */
  set(key: string, value: unknown): void
  /** Hold every write until {@link release}. */
  hold(): void
  /** Release the hold and write what is on screen. */
  release(): void
  /**
   * Start writing: `snapshot` is read at each write, after `subscribe`'s
   * signal settles. Returns the stop function.
   */
  start(snapshot: () => SessionSnapshot, subscribe: (fn: () => void) => () => void): () => void
}

export interface LocalStorageStateOptions {
  /** The site's own keys and their defaults: `{ greet: true, seeded: false }`. */
  extra?: Record<string, unknown>
  /** Neither read nor write. Default: `?fresh=1` in the address. */
  fresh?: boolean
}

/** A session kept under one localStorage `key`. */
export function localStorageState(key: string, options: LocalStorageStateOptions = {}): ShellState {
  const fresh = options.fresh ?? new URLSearchParams(location.search).get('fresh') === '1'
  const defaults = options.extra ?? {}
  const saved = fresh ? null : load(key)
  const extra: Record<string, unknown> = { ...defaults, ...(saved?.extra ?? {}) }
  let known: Record<string, SavedWindow> = { ...(saved?.windows ?? {}) }
  let held = false
  let read: (() => SessionSnapshot) | null = null

  const write = () => {
    if (fresh || held || !read) return
    const session = mergeSession(known, read(), extra)
    known = session.windows
    try {
      localStorage.setItem(key, JSON.stringify(session))
    } catch {
      // Quota and private-mode failures leave the last write standing.
    }
  }

  return {
    saved,
    pin: (item) => saved?.windows[item]?.pin ?? null,
    get: <T>(k: string) => extra[k] as T,
    set(k, value) {
      extra[k] = value
      write()
    },
    hold() {
      held = true
    },
    release() {
      held = false
      write()
    },
    start(snapshot, subscribe) {
      if (fresh) return () => {}
      read = snapshot
      let timer = 0
      const soon = () => {
        clearTimeout(timer)
        timer = window.setTimeout(write, WRITE_DELAY_MS)
      }
      const onHide = () => {
        if (document.visibilityState === 'hidden') write()
      }
      const unsubscribe = subscribe(soon)
      document.addEventListener('visibilitychange', onHide)
      window.addEventListener('pagehide', write)
      return () => {
        clearTimeout(timer)
        unsubscribe()
        document.removeEventListener('visibilitychange', onHide)
        window.removeEventListener('pagehide', write)
        read = null
      }
    },
  }
}

function load(key: string): SavedSession | null {
  try {
    return readSession(JSON.parse(localStorage.getItem(key) ?? 'null'))
  } catch {
    return null
  }
}
