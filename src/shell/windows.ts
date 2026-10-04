/**
 * The window manager. Applications make their windows; the manager places
 * them, opens and closes them, follows the front application, carries them
 * through a raster resize and arranges them.
 *
 * - `adopt()` takes a window an application made and appended: its
 *   application, the item it shows, how to place it, its resize policy, and
 *   what its close box means. `open()` raises the window for an item if one
 *   is open, and otherwise makes, appends, adopts and places one, and shows
 *   it out of `from`. `close()` hides a window into `to` — by default its
 *   home box, which the Finder provides: the item's icon, or the
 *   application's — then releases and removes it.
 * - Placement, in order: this session's pin for the item, the saved pin,
 *   then the `place` policy — by default the first cascade slot no open
 *   window holds. The result is clamped into the desktop's window area.
 * - The front application is the active window's, or the default one while
 *   none is active. `beforeFront` runs before a change, `onFront` reports it.
 * - Palettes are an application's utility windows: shown while it is front
 *   and hidden otherwise, never closed or removed.
 * - Opening a window moves keyboard focus into it; closing the active one
 *   moves focus to the window that becomes active, else to the closed
 *   window's icon, else to the desktop's icons. Focus left behind in a
 *   window that is no longer active — a title-bar press moves none — goes
 *   to the active window too.
 * - `onWindows` reports a window opened or closed and a close's zoom rects
 *   landing, palettes aside; `isOpen()` and `hasWindows()` hold until they
 *   land, which is what the Finder's open ghost follows.
 * - The resize rule re-pins every window with the nine-slice pin, re-reads a
 *   resizable window's pin when its size changed, floors it at the window's
 *   own size limits and caps it to the window area, so growing back restores
 *   every place.
 * - Dialogs: `holdDialog()` holds an application's dialog under it, in the
 *   desktop. The manager follows each held dialog's `open` attribute, and
 *   `asking` is the application of the one opened last and still open.
 */

import { snapSys, systemPxQuantum, VfWindow } from '../index.js'
import type { VfDesktop, VfViewportBox } from '../index.js'
import {
  cascadedBox,
  cascadeFrom,
  frameOf,
  nearBox,
  pinOf,
  pinTo,
  windowOrigin,
} from './geometry.js'
import type { Bands, Box, Frame, Pin, Policy, Size } from './geometry.js'

/** A box to write, any edge optional. */
export interface BoxInput {
  left?: number
  top?: number
  width?: number
  height?: number
}

/** A placement: a position, and a size where one is stated. */
export interface Placed extends BoxInput {
  left: number
  top: number
}

/** How a window is placed: its box on the desktop's live window area. */
export type PlacePolicy = (area: Box) => BoxInput & Point

type Point = { left: number; top: number }

/** What adopting a window declares. */
export interface AdoptOptions {
  /** The application shown while the window is active. */
  app: string
  /** The item it shows: a catalog id, or an application's own key. */
  item?: string | null
  /** Its placement on the live window area; adopt() and arrange() apply it. Unset, the owner places it. */
  place?: PlacePolicy | null
  /** A saved pin to open at instead. */
  pin?: Pin | null
  /** Its resize policy for the re-pin. Default: a resizable window floored at its size limits, else fixed. */
  policy?: ((cur: Box) => Policy) | null
  /** A box held across a raster resize while the window is near it. */
  keep?: ((area: Box) => Box) | null
  /**
   * A palette: shown while its application is front — and while the
   * predicate holds, for one the application hides for its own reasons —
   * and hidden otherwise. Never closed by the manager.
   */
  palette?: boolean | (() => boolean)
  /**
   * What the close box means. Unset, it closes the window. Set, the close box
   * asks the application, which calls `close()` once it decides — after a
   * Save prompt, say — or never.
   */
  close?: ((win: VfWindow) => void) | null
}

/** What opening a window for an item declares. */
export interface OpenOptions extends Omit<AdoptOptions, 'pin' | 'palette'> {
  /** Makes the window, not yet appended. */
  create: () => VfWindow
  /** The box it opens out of, in viewport CSS px: an icon's `cellRect()`. */
  from?: VfViewportBox | null
}

/** An application's arrangement group, for windows it places itself. */
export interface ArrangeGroup {
  arrange(): void
  arranged(): boolean
}

interface Adoption {
  app: string
  item: string | null
  place: PlacePolicy | null
  policy: ((cur: Box) => Policy) | null
  keep: ((area: Box) => Box) | null
  palette: null | (() => boolean)
  close: ((win: VfWindow) => void) | null
}

/**
 * The box a closing window shrinks into, in viewport CSS px: `item` is the
 * window's item, or null, and `app` its application. The Finder answers with
 * the item's icon, the nearest open folder around it, or the application's
 * icon.
 */
export type HomeBox = (item: string | null, app: string) => VfViewportBox | null

/** Move the focus to the closed window's icon (`item` null: the desktop's first); resolves whether it moved. */
export type FocusHome = (item: string | null, app: string | null) => boolean

/** A count per key, for windows whose rects are still running. */
const countUp = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)
const countDown = (map: Map<string, number>, key: string) => {
  const n = map.get(key) ?? 1
  if (n > 1) map.set(key, n - 1)
  else map.delete(key)
}

export interface WindowManagerOptions {
  /** The application front while no window is active. */
  defaultApp: string
  /** A saved pin by item — the session the boot read. */
  savedPin?: (item: string) => Pin | null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** A window's live box, an undeclared edge read as 0. */
const boxOf = (win: VfWindow): Box => ({
  left: win.left ?? 0,
  top: win.top ?? 0,
  width: win.width ?? 0,
  height: win.height ?? 0,
})

/** The innermost focused element, through open shadow roots. */
export function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
  return el
}

/** Whether the focus is inside `el`, its own shadow tree included. */
const focusIsIn = (el: Element): boolean => {
  const active = document.activeElement
  return !!active && (active === el || el.contains(active))
}

/**
 * Move keyboard focus into `win`'s content once that content has rendered —
 * and then only if `when`, read at that point, still holds: to a descendant
 * marked `autofocus`, else to the first thing that takes the focus. An
 * element whose `tabindex` is negative is passed over: a roving cell parked
 * off the tab order, a disabled control. A kit host with no `tabindex` goes
 * through, since it hands the focus on inside itself. Resolves whether the
 * focus moved: a window with nothing focusable in its content keeps the
 * focus where it was.
 */
export async function focusInto(win: Element, { when }: { when?: () => boolean } = {}): Promise<boolean> {
  const all = [...win.querySelectorAll<HTMLElement>('*')]
  await Promise.all(
    [win, ...all].map((el) => (el as unknown as { updateComplete?: Promise<unknown> }).updateComplete)
  )
  if (!win.isConnected || (when && !when())) return false
  const shown = (el: HTMLElement) => !el.closest('[hidden]') && el.checkVisibility()
  const stated = all.find((el) => el.hasAttribute('autofocus') && shown(el))
  if (stated) {
    stated.focus({ preventScroll: true })
    if (focusIsIn(win)) return true
  }
  for (const el of all) {
    if (!shown(el) || Number(el.getAttribute('tabindex')) < 0) continue
    if (el.tabIndex < 0 && !el.localName.startsWith('vf-')) continue
    el.focus({ preventScroll: true })
    if (focusIsIn(win)) return true
  }
  return false
}

/** The window manager over a desktop. */
export function createWindowManager(desktop: VfDesktop, options: WindowManagerOptions) {
  const { defaultApp, savedPin = () => null } = options
  const teardown: (() => void)[] = []
  const on = (target: EventTarget, type: string, fn: (e: Event) => void) => {
    target.addEventListener(type, fn)
    teardown.push(() => target.removeEventListener(type, fn))
  }
  const raster = (): Size => ({ width: desktop.width, height: desktop.height })
  const area = (): Box => desktop.windowArea

  const adopted = new Map<VfWindow, Adoption>()
  const groups = new Map<string, ArrangeGroup>()
  /** This session's box for each item whose window closed, and the application it was. */
  const remembered = new Map<string, { app: string; pin: Pin }>()
  /** Items whose windows are closing, by the count of their rects still running. */
  const closing = new Map<string, number>()
  /** Applications whose windows are closing, the same way. */
  const closingApps = new Map<string, number>()
  /**
   * Each window's unrounded pin and the box the re-pin last wrote, re-read
   * only when the box no longer matches: re-reading from snapped geometry
   * every time ratchets windows down the screen.
   */
  let pins = new WeakMap<VfWindow, { pin: Pin } & Box>()
  let bands: Partial<Bands> = {}
  /** The frame every window's pin is read in: below the window area's top. */
  const frame = (): Frame => frameOf(area().top, bands)

  // Signals.
  const layoutListeners = new Set<() => void>()
  let holding = false
  const notifyLayout = () => {
    if (holding) return
    for (const fn of [...layoutListeners]) fn()
  }
  const windowListeners = new Set<() => void>()
  const notifyWindows = () => {
    for (const fn of [...windowListeners]) fn()
  }
  const rasterListeners = new Set<(before: Size, after: Size) => void>()
  const beforeFrontListeners = new Set<(win: HTMLElement | null) => void>()
  const frontListeners = new Set<(app: string) => void>()
  const dialogListeners = new Set<() => void>()

  // Dialogs.

  /** Each held dialog's application, and the observer that follows its `open`. */
  const held = new Map<Element, { app: string; observer: MutationObserver }>()
  /** The held dialogs open now, in the order they opened. */
  let openDialogs: Element[] = []

  /** The held dialog `el` is, or sits in, or null. */
  const heldOf = (el: Element | null): Element | null => {
    for (let at = el; at; at = at.parentElement) if (held.has(at)) return at
    return null
  }

  /** Whether a held dialog is open: it, or the `vf-dialog` it renders inside itself. */
  const dialogIsOpen = (el: Element): boolean =>
    el.isConnected && (el.matches('vf-dialog[open]') || !!el.querySelector('vf-dialog[open]'))

  /** Re-read which held dialogs are open, keeping the order they opened in. */
  const syncDialogs = () => {
    const next = openDialogs.filter((el) => held.has(el) && dialogIsOpen(el))
    for (const el of held.keys()) if (!next.includes(el) && dialogIsOpen(el)) next.push(el)
    if (next.length === openDialogs.length && next.every((el, i) => el === openDialogs[i])) return
    openDialogs = next
    for (const fn of [...dialogListeners]) fn()
  }

  /** Where a window closes into, and where the focus goes after it: the Finder's. */
  let homeBox: HomeBox = () => null
  let focusHome: FocusHome = () => false

  // Placement.

  /**
   * The box a placement writes for `g` on `win`: snapped to the window's
   * placement lattice and clamped onto the window area. A resizable window's
   * size is first capped to the area, so its grow box stays in reach.
   */
  function clampedBox(win: VfWindow, g: BoxInput): Placed {
    const a = area()
    const k = systemPxQuantum(win)
    const down = (v: number) => Math.floor(v / k) * k
    const minTop = Math.ceil(a.top / k) * k
    const right = a.left + a.width
    const bottom = a.top + a.height
    let { width, height } = g
    if (win.resizable) {
      if (width != null && Number.isFinite(width)) width = Math.min(width, down(a.width))
      if (height != null && Number.isFinite(height)) height = Math.min(height, down(Math.max(0, bottom - minTop)))
    }
    const w = width ?? win.width ?? 0
    const h = height ?? win.height ?? 0
    return {
      left: clamp(snapSys(g.left ?? a.left, win), a.left, Math.max(a.left, down(right - w))),
      top: clamp(snapSys(g.top ?? minTop, win), minTop, Math.max(minTop, down(bottom - h))),
      width,
      height,
    }
  }

  /** Write a placement; the next resize re-reads the pin. */
  const writeBox = (win: VfWindow, g: Placed) => {
    win.left = snapSys(g.left, win)
    win.top = snapSys(g.top, win)
    if (g.width != null && Number.isFinite(g.width)) win.width = g.width
    if (g.height != null && Number.isFinite(g.height)) win.height = g.height
    pins.delete(win)
  }

  /** A window's `place` on the live area, clamped, or null. */
  const placedBox = (win: VfWindow): Placed | null => {
    const place = adopted.get(win)?.place
    return place ? clampedBox(win, place(area())) : null
  }

  /** The resize policy for `win` at its box `cur`. */
  const policyOf = (win: VfWindow, cur: Box): Policy => {
    const declared = adopted.get(win)?.policy
    if (declared) return declared(cur)
    if (!win.resizable) return { size: { width: cur.width, height: cur.height } }
    const { minWidth, minHeight } = win.sizeLimits
    return { min: { width: minWidth, height: minHeight } }
  }

  /** A pin on the live raster, clamped. */
  const pinnedBox = (win: VfWindow, pin: Pin, policy = policyOf(win, boxOf(win))) =>
    clampedBox(win, pinTo(pin, raster(), frame(), policy))

  /** Whether `win` sits at every edge `g` states. */
  const at = (win: VfWindow, g: BoxInput) => {
    const live = boxOf(win)
    return (['left', 'top', 'width', 'height'] as const).every((k) => {
      const v = g[k]
      return v == null || !Number.isFinite(v) || live[k] === v
    })
  }

  /** The first cascade slot from the area's origin that no shown window holds. */
  const freeSlot = (except?: VfWindow): number => {
    const occupied = [...adopted]
      .filter(([w, a]) => w !== except && !w.hidden && !a.palette)
      .map(([w]) => boxOf(w))
    return cascadeFrom(windowOrigin(area()), occupied).slot
  }

  // The front application.

  let front = defaultApp
  const appOf = (win: HTMLElement | null): string =>
    (win instanceof VfWindow && adopted.get(win)?.app) || defaultApp

  /** Show each palette while its application is front and its predicate holds. */
  function syncPalettes(): void {
    let changed = false
    for (const [win, a] of adopted) {
      if (!a.palette) continue
      const shown = a.app === front && a.palette()
      if (win.hidden === !shown) continue
      win.hidden = !shown
      if (shown) desktop.bringToFront(win)
      changed = true
    }
    if (changed) notifyLayout()
  }

  /**
   * The keyboard follows the active window. A press on a title bar activates
   * a window without moving the focus, which would leave keys going to the
   * window it left: focus still in a document window the manager holds that
   * is no longer active moves into the new one, or, with none active, to the
   * Finder's icons.
   */
  const followFocus = (win: HTMLElement | null) => {
    const left = document.activeElement?.closest('vf-window')
    if (!(left instanceof VfWindow) || left === win || !adopted.has(left) || adopted.get(left)!.palette) return
    if (win) focusActive(win)
    else focusHome(null, null)
  }

  /**
   * Focus into a window once its content has rendered, if it is still the
   * active one then: windows opened in one go — a boot reopening a session,
   * Open on several icons — would each take the focus, and with it the
   * front, from the one opened after it.
   */
  const focusActive = (win: HTMLElement) => void focusInto(win, { when: () => desktop.activeWindow === win })

  const applyActive = (win: HTMLElement | null) => {
    followFocus(win)
    for (const fn of [...beforeFrontListeners]) fn(win)
    const next = appOf(win)
    if (next !== front) {
      front = next
      syncPalettes()
      for (const fn of [...frontListeners]) fn(front)
    }
  }
  on(desktop, 'vf-activate', (e) => applyActive((e as CustomEvent<{ window: HTMLElement | null }>).detail.window))

  // The close box asks the window's application.
  on(desktop, 'vf-close', (e) => {
    const win = e.target
    if (win instanceof VfWindow && adopted.has(win)) api.requestClose(win)
  })

  // A window moved or grown: the layout signal. A placement write announces
  // itself, a drag's release included; a grow ends with a commit.
  let layoutSoon = 0
  const onPlacement = (e: Event) => {
    if (!(e.target instanceof VfWindow) || !adopted.has(e.target) || layoutSoon) return
    layoutSoon = window.setTimeout(() => {
      layoutSoon = 0
      notifyLayout()
    }, 0)
  }
  desktop.addEventListener('vf-placement-change', onPlacement)
  teardown.push(() => desktop.removeEventListener('vf-placement-change', onPlacement))
  on(desktop, 'vf-resize', (e) => {
    if ((e as CustomEvent<{ commit?: boolean }>).detail?.commit) notifyLayout()
  })

  /** Drop a window from the manager. */
  const release = (win: VfWindow) => {
    const a = adopted.get(win)
    if (!a) return
    adopted.delete(win)
    pins.delete(win)
    if (!a.palette) notifyWindows()
    notifyLayout()
  }

  /** Re-pin one window from the `before` raster to `after`. */
  const repin = (win: VfWindow, before: Size, after: Size, beforeArea: Box) => {
    const cur = boxOf(win)
    const a = adopted.get(win)
    if (a?.keep && nearBox(cur, a.keep(beforeArea))) {
      writeBox(win, clampedBox(win, a.keep(area())))
      return
    }
    const rec = pins.get(win)
    // A resizable window whose size changed is re-read too, or its far edge would jump.
    const sized = !!rec && win.resizable && (rec.width !== cur.width || rec.height !== cur.height)
    const moved = !rec || rec.left !== cur.left || rec.top !== cur.top || sized
    const pin = moved || !rec ? pinOf(cur, before, frame()) : rec.pin
    const g = pinTo(pin, after, frame(), policyOf(win, cur))
    win.left = snapSys(g.left, win)
    win.top = snapSys(g.top, win)
    if (win.resizable) {
      // Capped to the area, floor-snapped, so the grow box stays in reach. The pin is untouched.
      const k = systemPxQuantum(win)
      const ar = area()
      const minTop = Math.ceil(ar.top / k) * k
      const maxW = Math.floor(ar.width / k) * k
      const maxH = Math.floor(Math.max(0, ar.top + ar.height - minTop) / k) * k
      win.width = Math.min(snapSys(g.width, win), maxW)
      win.height = Math.min(snapSys(g.height, win), maxH)
    }
    pins.set(win, { pin, ...boxOf(win) })
  }

  const api = {
    /** The desktop's window area, system px. */
    get area(): Box {
      return area()
    },

    /** The front application's id. */
    get front(): string {
      return front
    },

    /**
     * Take a window an application made and appended (a slotted child of the
     * desktop: the clamp reads its lattice). It opens at the saved `pin`, or
     * at its `place`; without either the owner placed it.
     */
    adopt(win: VfWindow, opts: AdoptOptions): void {
      const palette = opts.palette
      adopted.set(win, {
        app: opts.app,
        item: opts.item ?? null,
        place: opts.place ?? null,
        policy: opts.policy ?? null,
        keep: opts.keep ?? null,
        palette: !palette ? null : palette === true ? () => true : palette,
        close: opts.close ?? null,
      })
      if (opts.pin) writeBox(win, pinnedBox(win, opts.pin))
      else {
        const g = placedBox(win)
        if (g) writeBox(win, g)
      }
      if (palette) {
        const a = adopted.get(win)!
        win.hidden = !(a.app === front && a.palette!())
      }
      if (desktop.activeWindow === win) applyActive(win)
      if (!palette) notifyWindows()
      notifyLayout()
    },

    /**
     * Open the window for `item`: raise it if one is open, else make it,
     * append it, adopt it and place it — this session's pin, then the saved
     * one, then `place`, by default the first free cascade slot — and show it
     * out of `from`. Keyboard focus moves into it. Returns the window.
     */
    open(opts: OpenOptions): VfWindow {
      const existing = opts.item != null ? api.windowFor(opts.item) : null
      if (existing) {
        desktop.bringToFront(existing)
        focusActive(existing)
        return existing
      }
      const win = opts.create()
      const size: Size = { width: win.width ?? 0, height: win.height ?? 0 }
      const n = freeSlot()
      desktop.append(win)
      const item = opts.item ?? null
      api.adopt(win, {
        app: opts.app,
        item,
        place: opts.place ?? ((a) => cascadedBox(a, size, windowOrigin(a), n)),
        pin: item != null ? (remembered.get(item)?.pin ?? savedPin(item)) : null,
        policy: opts.policy ?? null,
        keep: opts.keep ?? null,
        close: opts.close ?? null,
      })
      if (item != null) remembered.delete(item)
      desktop.bringToFront(win)
      if (opts.from) void win.show({ from: opts.from })
      focusActive(win)
      return win
    },

    /**
     * Close a window into `to` — by default its home box, the Finder's icon
     * for it — then release and remove it. The item's box is remembered for
     * the session. Resolves when the zoom rects have landed.
     */
    close(win: VfWindow, { to }: { to?: VfViewportBox | null } = {}): Promise<boolean> {
      const a = adopted.get(win)
      const item = a?.item ?? null
      const app = a?.app ?? null
      const into = to !== undefined ? to : app != null ? homeBox(item, app) : null
      const wasActive = desktop.activeWindow === win || focusIsIn(win)
      if (item != null && app != null) remembered.set(item, { app, pin: pinOf(boxOf(win), raster(), frame()) })
      const landed = win.hide({ to: into })
      if (item != null) countUp(closing, item)
      if (app != null && !a?.palette) countUp(closingApps, app)
      const done = () => {
        if (item != null) countDown(closing, item)
        if (app != null && !a?.palette) countDown(closingApps, app)
        notifyWindows()
      }
      landed.then(done, done)
      release(win)
      win.remove()
      if (wasActive) {
        // The desktop hands the active state on as the window leaves its
        // slot; the focus follows once it has.
        queueMicrotask(() => {
          const next = desktop.activeWindow
          if (next) focusActive(next)
          else if (!focusHome(item, app)) focusHome(null, null)
        })
      }
      return landed
    },

    /** The close box's route: the window's own close, or a plain close. */
    requestClose(win: VfWindow): void {
      const hook = adopted.get(win)?.close
      if (hook) hook(win)
      else void api.close(win)
    },

    /** The window showing `item`, or null. */
    windowFor(item: string): VfWindow | null {
      for (const [win, a] of adopted) if (a.item === item) return win
      return null
    },

    /** Every window of an application, back to front. */
    windowsOf(app: string): VfWindow[] {
      return desktop.stackingOrder.filter(
        (w): w is VfWindow => w instanceof VfWindow && adopted.get(w)?.app === app
      )
    },

    /** A window's item, or null. */
    itemOf(win: Element | null): string | null {
      return win instanceof VfWindow ? (adopted.get(win)?.item ?? null) : null
    },

    /** A window's or a held dialog's application, or null when the manager doesn't hold it. */
    appOf(el: Element | null): string | null {
      if (el instanceof VfWindow) return adopted.get(el)?.app ?? null
      const dialog = heldOf(el)
      return dialog ? held.get(dialog)!.app : null
    },

    /**
     * Hold an application's dialog: a `vf-dialog`, or an element that renders
     * one inside itself. It is appended to the desktop unless it is already
     * in it, and its `open` is followed from then on.
     */
    holdDialog(dialog: Element, { app }: { app: string }): void {
      const was = held.get(dialog)
      if (was) {
        was.app = app
      } else {
        const observer = new MutationObserver(syncDialogs)
        observer.observe(dialog, { attributes: true, attributeFilter: ['open'], subtree: true })
        held.set(dialog, { app, observer })
      }
      if (!desktop.contains(dialog)) desktop.append(dialog)
      syncDialogs()
    },

    /** Let a held dialog go. It stays where it is; the caller removes it. */
    releaseDialog(dialog: Element): void {
      const was = held.get(dialog)
      if (!was) return
      was.observer.disconnect()
      held.delete(dialog)
      syncDialogs()
    },

    /** An application's held dialogs. */
    dialogsOf(app: string): Element[] {
      return [...held].filter(([, h]) => h.app === app).map(([dialog]) => dialog)
    },

    /** The application of the held dialog opened last and still open, or null. */
    get asking(): string | null {
      const top = openDialogs[openDialogs.length - 1]
      return top ? held.get(top)!.app : null
    },

    /** Whether `win` is a palette. */
    isPalette(win: Element | null): boolean {
      return win instanceof VfWindow && !!adopted.get(win)?.palette
    },

    /** Change the item a window shows: an untitled document's first save, say. */
    setItem(win: VfWindow, item: string | null): void {
      const a = adopted.get(win)
      if (!a || a.item === item) return
      a.item = item
      notifyWindows()
    },

    /** Whether a window shows `item`, or is still closing into its icon. */
    isOpen(item: string): boolean {
      return closing.has(item) || api.windowFor(item) !== null
    },

    /** Whether an application has a window open, palettes aside, or one still closing. */
    hasWindows(app: string): boolean {
      if (closingApps.has(app)) return true
      for (const [, a] of adopted) if (a.app === app && !a.palette) return true
      return false
    },

    /** Re-read every palette's predicate: an application hid or showed one. */
    palettesChanged(): void {
      syncPalettes()
    },

    /** Write a box for a gesture the owner runs itself — a zoom, its group's arrange. */
    write(win: VfWindow, box: Placed): void {
      writeBox(win, box)
      notifyLayout()
    },

    /** The box a placement would write, not written. */
    clamped(win: VfWindow, box: BoxInput): Placed {
      return clampedBox(win, box)
    },

    /** A window's `place` on the live area, clamped, or null. */
    placed(win: VfWindow): Placed | null {
      return placedBox(win)
    },

    /** A window's pin on the current raster, for an owner that saves it. */
    pinOf(win: VfWindow): Pin {
      return pinOf(boxOf(win), raster(), frame())
    },

    /** A pin on the live raster, clamped, under the window's policy or `policy`. */
    fromPin(win: VfWindow, pin: Pin, policy?: Policy): Placed {
      return pinnedBox(win, pin, policy)
    },

    /** Widen the frame's bands, for an application whose windows dock along the edges. */
    setFrameBands(next: Partial<Bands>): void {
      bands = { ...next }
      pins = new WeakMap()
    },

    /** Register an application's arrangement group. Returns the unregister. */
    arrangeWith(app: string, group: ArrangeGroup): () => void {
      groups.set(app, group)
      notifyLayout()
      return () => {
        if (groups.get(app) === group) groups.delete(app)
        notifyLayout()
      }
    },

    /** View → Arrange Windows: every group's arrange, then every `place`. Nothing is raised. */
    arrange(): void {
      holding = true
      try {
        for (const group of groups.values()) group.arrange()
        for (const win of adopted.keys()) {
          const g = placedBox(win)
          if (g) writeBox(win, g)
        }
      } finally {
        holding = false
      }
      notifyLayout()
    },

    /** Whether every group is arranged and every shown window sits at its `place`. */
    arranged(): boolean {
      for (const group of groups.values()) if (!group.arranged()) return false
      for (const win of adopted.keys()) {
        const g = placedBox(win)
        if (g && !win.hidden && !at(win, g)) return false
      }
      return true
    },

    /**
     * Carry every window from the `before` raster to the live one with the
     * nine-slice pin, then tell the onRaster listeners. Nothing clamps a
     * window's position, so growing back restores it.
     */
    resized(before: Size): void {
      const after = raster()
      if (before.width === after.width && before.height === after.height) return
      // The area on the old raster: the bar's band is the same, the screen was not.
      const now = area()
      const beforeArea: Box = {
        left: now.left,
        top: now.top,
        width: before.width - now.left,
        height: Math.max(0, before.height - now.top),
      }
      for (const win of adopted.keys()) repin(win, before, after, beforeArea)
      for (const fn of [...rasterListeners]) fn(before, after)
      notifyLayout()
    },

    /** The windows' saved boxes: each open one with its depth, the palettes as boxes alone. */
    snapshot(): Record<string, { app: string; pin: Pin; z?: number }> {
      const out: Record<string, { app: string; pin: Pin; z?: number }> = {}
      for (const [item, saved] of remembered) out[item] = { ...saved }
      const order = desktop.stackingOrder
      for (const [win, a] of adopted) {
        if (a.item == null) continue
        const pin = pinOf(boxOf(win), raster(), frame())
        out[a.item] = a.palette ? { app: a.app, pin } : { app: a.app, pin, z: order.indexOf(win) }
      }
      return out
    },

    /** This session's pin for an item whose window closed, or null. */
    rememberedPin(item: string): Pin | null {
      return remembered.get(item)?.pin ?? null
    },

    /** Notify layout of a change the owner made itself. */
    layoutChanged(): void {
      notifyLayout()
    },

    /** Set where a window closes into and where focus goes after it: the Finder's. */
    setHome(box: HomeBox, focus: FocusHome): () => void {
      homeBox = box
      focusHome = focus
      return () => {
        homeBox = () => null
        focusHome = () => false
      }
    },

    /** The layout signal: any geometry write, drag, grow or arrange. Returns the unsubscribe. */
    onLayout(fn: () => void): () => void {
      layoutListeners.add(fn)
      return () => void layoutListeners.delete(fn)
    },
    /** A window opened or closed, or finished closing, palettes aside; a window's item changed. */
    onWindows(fn: () => void): () => void {
      windowListeners.add(fn)
      return () => void windowListeners.delete(fn)
    },
    /** A raster resize, after every window has re-pinned. */
    onRaster(fn: (before: Size, after: Size) => void): () => void {
      rasterListeners.add(fn)
      return () => void rasterListeners.delete(fn)
    },
    /** An activation, before the front application changes: `fn(win)`, the new active window or null. */
    beforeFront(fn: (win: HTMLElement | null) => void): () => void {
      beforeFrontListeners.add(fn)
      return () => void beforeFrontListeners.delete(fn)
    },
    /** The front application changed. */
    onFront(fn: (app: string) => void): () => void {
      frontListeners.add(fn)
      return () => void frontListeners.delete(fn)
    },
    /** A held dialog opened or closed, so `asking` may have changed. */
    onDialogs(fn: () => void): () => void {
      dialogListeners.add(fn)
      return () => void dialogListeners.delete(fn)
    },

    dispose(): void {
      clearTimeout(layoutSoon)
      for (const fn of teardown) fn()
      layoutListeners.clear()
      windowListeners.clear()
      rasterListeners.clear()
      beforeFrontListeners.clear()
      frontListeners.clear()
      dialogListeners.clear()
      for (const { observer } of held.values()) observer.disconnect()
      held.clear()
      openDialogs = []
      groups.clear()
      adopted.clear()
    },
  }

  // Start from the desktop's holder, which is set after a hot reload.
  front = appOf(desktop.activeWindow)
  return api
}

export type WindowManager = ReturnType<typeof createWindowManager>
