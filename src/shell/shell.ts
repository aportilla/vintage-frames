/**
 * The shell: applications over one desktop.
 *
 * - The menu bar holds the system menu — the page's own first menu, the
 *   Apple menu — then the front application's menus, then the clock in the
 *   bar's `end` slot. Each application's menus are parsed once and the same
 *   nodes come back each time it is front, so items keep their state. A menu
 *   off the bar has no key equivalents, so only the front application's fire.
 *   The bar's label is the front application's name.
 * - While an application's held dialog is open, the bar shows that
 *   application's name and menus instead; nothing else changes.
 * - Each application's `init(ctx)` gets the desktop, the window manager, its
 *   own menus, dialogs and window markup, the system menu, the other applications' actions
 *   (read at the call), the catalog when a Finder runs, the site's services,
 *   `ask()`, `gate()`, `onFront()` and `onDispose()`. Everything it sets up
 *   comes down through `onDispose()`, and its dialogs with it, so a hot
 *   reload starts clean. The shell composes no UI of its own.
 * - A window showing a catalog item follows it: its title follows a rename,
 *   and it closes when the item is removed.
 * - The boot waits for the desktop and its menu bar to render, reads the
 *   catalog, seeds it once, reopens the last session's windows deepest
 *   first and the active one last, then starts saving.
 */

import { onScaleChange, VfWindow } from '../index.js'
import type {
  VfCloseDetail,
  VfDesktop,
  VfDialog,
  VfMenu,
  VfMenuBar,
  VfMenuItem,
  VfModalDialog,
  VfViewportBox,
} from '../index.js'
import { APP_KIND, appIdOf, createCatalog } from './catalog.js'
import type { Catalog, CatalogStorage, Item, Volumes } from './catalog.js'
import { createWindowManager, deepActiveElement, desktopRendered } from './windows.js'
import type { WindowManager } from './windows.js'
import { openWindowsOf } from './state.js'
import type { ShellState } from './state.js'
import { startClock } from './clock.js'

/** A kind of catalog item an application registers: how it looks and opens. */
export interface KindDefinition {
  /** Its 32×32 art: one URL, or one per item. */
  art: string | ((item: Item) => string)
  /** Open the item, its window out of `from` (its icon's box). */
  open(item: Item, from: VfViewportBox | null): void
  /** Renameable in place. Default true. */
  editable?: boolean
  /** Bytes, for Empty Trash's alert. */
  size?(item: Item): number
  /** Copy `from`'s payload to `to` when the Finder copies the item. */
  copy?(from: Item, to: Item): void | Promise<void>
  /** Empty Trash removed the item: drop its payload. */
  onRemove?(item: Item): void | Promise<void>
  /** Make an item of a pasted or dropped file in `parent`; resolves whether it did. */
  claim?(file: Blob, parent: string | null): Promise<boolean>
  /** The item on the system clipboard, as a file. */
  export?(item: Item): Promise<Blob | null>
}

/** The catalog a Finder brings: where it is stored, its volumes and its seed. */
export interface CatalogSetup {
  storage: CatalogStorage | null
  volumes?: Volumes
  /** Run once per storage, to store the site's defaults. */
  seed?: (catalog: Catalog) => void | Promise<void>
}

/** One application. */
export interface AppDefinition<Actions = unknown> {
  id: string
  /** The bar's accessible name while it is front. */
  name: string
  /** Its 32×32 art, for the Finder's icon of it. */
  icon?: string
  /** A fragment of `vf-menu` elements, each with a `data-menu` name. */
  menus?: string
  /**
   * A fragment of dialogs, each with a `data-dialog` name: a `vf-dialog`, or
   * an element that renders one inside itself. Held under the application.
   */
  dialogs?: string
  /**
   * A fragment of windows, each with a `data-window` name, kept inert:
   * `ctx.window(name)` makes a fresh copy of one on each call.
   */
  windows?: string
  /** The catalog kinds it opens. */
  kinds?: Record<string, KindDefinition>
  /** The Finder's: the catalog every application shares. */
  catalog?: CatalogSetup
  /**
   * Set everything up and return what other applications may call. An
   * application that reopens windows across a reload — or opens from an
   * icon — provides `open({ item, from })`.
   */
  init(ctx: AppContext): Actions | void
}

/** What an application's `init` gets. */
export interface AppContext {
  readonly desktop: VfDesktop
  readonly windows: WindowManager
  /** Its own menus, parsed from `menus`. */
  readonly menus: VfMenu[]
  /** The page's system menu, for the items applications install. */
  readonly systemMenu: VfMenu
  /** Every application's actions by id, read at the call. */
  readonly apps: Record<string, any>
  /** The catalog, when a Finder runs; read before the boot has refreshed it, it lists the volumes alone. */
  readonly catalog: Catalog | null
  /** The site's own services. */
  readonly services: Record<string, any>
  /** The saved session, or null. */
  readonly state: ShellState | null
  /** Every kind the applications register, the shell's `app` kind included, in registration order. */
  readonly kinds: ReadonlyMap<string, KindDefinition>
  /** A kind's definition, or undefined. */
  kind(kind: string): KindDefinition | undefined
  /** The application definition with `id`. */
  app(id: string): AppDefinition | undefined
  /** One of its menus by `data-menu`; throws when the markup drifts. */
  menu(name: string): VfMenu
  /** One of its menu items by `value`; throws when the markup drifts. */
  item(value: string): VfMenuItem
  /** Every pick from its menus — never while a modal is open. */
  onMenu(fn: (value: string, item: VfMenuItem) => void): void
  /** Put an item in the system menu, which runs `fn` when picked. */
  systemItem(value: string, label: string, fn: () => void): VfMenuItem
  /** One of its dialogs by `data-dialog`; throws when the markup drifts. */
  dialog<T extends HTMLElement = VfDialog>(name: string): T
  /**
   * A fresh copy of one of its windows by `data-window`, upgraded and not yet
   * appended: `open({ create: () => ctx.window('viewer') })`. Throws when the
   * markup drifts.
   */
  window<T extends HTMLElement = VfWindow>(name: string): T
  /** Hold a dialog it made in code: appended to the desktop, held under it, removed with it. Returns it. */
  hold<T extends Element>(dialog: T): T
  /** Let a dialog it holds go, and remove it. */
  release(dialog: Element): void
  /**
   * Show a dialog it holds, and resolve its `returnValue`: the value of the
   * button that submitted it, or null when it closed without one. Throws for
   * a dialog it doesn't hold.
   */
  ask(dialog: VfModalDialog): Promise<string | null>
  /** Keep `item` disabled while `test` is false: re-run on every press, key, selection change and activation. */
  gate(item: VfMenuItem, test: () => boolean): void
  /** Whether a text field has keyboard focus, read through shadow roots at the call. */
  typing(): boolean
  /** Whether a modal dialog is open. */
  modalOpen(): boolean
  /** Follow whether this application is front; called at once with the current state. */
  onFront(fn: (front: boolean) => void): void
  /** A listener torn down with the application. */
  on(target: EventTarget, type: string, fn: (e: Event) => void, options?: boolean | AddEventListenerOptions): void
  /** Run `fn` when the shell is disposed. */
  onDispose(fn: () => void): void
}

/** Declare an application, with its actions' type. */
export function defineApp<Actions>(definition: AppDefinition<Actions>): AppDefinition<Actions> {
  return definition
}

export interface ShellOptions {
  /** The applications; the first with a `catalog` is the Finder. */
  apps: AppDefinition<any>[]
  /** The application front while no window is active. Default the Finder, else the first. */
  defaultApp?: string
  /** `'viewport'` sizes the desktop to the viewport on every resize and scale change. */
  fit?: 'viewport' | false
  /** Where the session is saved; null keeps nothing, so a reload resets. */
  state?: ShellState | null
  /** The site's own services, handed to every application. */
  services?: Record<string, unknown>
  /** The clock in the menu bar's `end` slot. Default true. */
  clock?: boolean
}

/** A running shell. */
export interface Shell {
  readonly desktop: VfDesktop
  readonly windows: WindowManager
  readonly catalog: Catalog | null
  readonly apps: Record<string, any>
  /** Settles once the boot has read the catalog and reopened the session. */
  readonly ready: Promise<void>
  dispose(): void
}

/** Whether an element is a text field, by its own tag. */
const isTextField = (el: Element | null): boolean =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable === true

/** Start the shell over `desktop`. The page has imported `vintage-frames` first. */
export function createShell(desktop: VfDesktop, options: ShellOptions): Shell {
  const definitions = options.apps
  const finderDef = definitions.find((d) => d.catalog)
  const defaultApp = options.defaultApp ?? finderDef?.id ?? definitions[0]?.id ?? ''
  const state = options.state ?? null
  const services = options.services ?? {}
  const teardown: (() => void)[] = []

  const bar = desktop.querySelector<VfMenuBar>(':scope > vf-menu-bar')
  if (!bar) throw new Error('vintage-frames/shell: the desktop has no vf-menu-bar')
  const systemMenu = bar.querySelector<VfMenu>(':scope > vf-menu')
  if (!systemMenu) throw new Error('vintage-frames/shell: the menu bar has no system menu')
  bar.shortcuts = true

  // The desktop's pattern, as the last session left it, before the first paint.
  const savedPattern = state?.saved?.pattern
  if (savedPattern) desktop.pattern = savedPattern

  // The raster, fit to the viewport.
  let windows: WindowManager | null = null
  if (options.fit === 'viewport') {
    const fit = () => {
      const before = { width: desktop.width, height: desktop.height }
      desktop.fitWithin(document.documentElement.clientWidth, document.documentElement.clientHeight)
      windows?.resized(before)
    }
    fit()
    window.addEventListener('resize', fit)
    const offScale = onScaleChange(fit)
    teardown.push(() => {
      window.removeEventListener('resize', fit)
      offScale()
    })
  }

  const wm = createWindowManager(desktop, { defaultApp, savedPin: (item) => state?.pin(item) ?? null })
  windows = wm

  // A press on the desktop itself — its bezel — brings the default application forward.
  const onDesktopPress = (e: Event) => {
    if (e.target === desktop) desktop.clearActive()
  }
  desktop.addEventListener('pointerdown', onDesktopPress)
  teardown.push(() => desktop.removeEventListener('pointerdown', onDesktopPress))

  // Kinds: every application's, and the shell's own app kind.
  const actions: Record<string, any> = {}
  const kinds = new Map<string, KindDefinition>()
  kinds.set(APP_KIND, {
    art: (item) => definitions.find((d) => d.id === appIdOf(item))?.icon ?? '',
    open: (item, from) => void actions[appIdOf(item) ?? '']?.open?.({ from }),
    editable: false,
  })
  for (const def of definitions) for (const [kind, k] of Object.entries(def.kinds ?? {})) kinds.set(kind, k)

  const catalog = finderDef?.catalog
    ? createCatalog({
        storage: finderDef.catalog.storage,
        volumes: finderDef.catalog.volumes,
        listed: (kind) => kinds.has(kind),
        hooks: (kind) => kinds.get(kind),
      })
    : null

  // Modals, typing and gates.
  const modalOpen = () => !!document.querySelector('vf-dialog[open]')
  const typing = () => isTextField(deepActiveElement())
  const gates = new Map<VfMenuItem, () => boolean>()
  const syncGates = () => {
    for (const [item, test] of gates) {
      const off = !test()
      if (item.disabled !== off) item.disabled = off
    }
  }
  // Capture phase on the document: a press or key syncs the gates before
  // any item can take it, its key equivalent included.
  document.addEventListener('pointerdown', syncGates, true)
  document.addEventListener('keydown', syncGates, true)
  desktop.addEventListener('vf-select', syncGates)
  desktop.addEventListener('vf-activate', syncGates)
  teardown.push(
    () => document.removeEventListener('pointerdown', syncGates, true),
    () => document.removeEventListener('keydown', syncGates, true),
    () => desktop.removeEventListener('vf-select', syncGates),
    () => desktop.removeEventListener('vf-activate', syncGates),
    wm.onWindows(syncGates),
    wm.onLayout(syncGates)
  )
  if (catalog) teardown.push(catalog.subscribe(syncGates))

  // Menus and dialogs: each application's parsed once into detached nodes of this document.
  const parse = (html: string | undefined): HTMLElement[] => {
    if (!html) return []
    const host = document.createElement('div')
    host.innerHTML = html
    customElements.upgrade(host)
    const nodes = [...host.children].filter((el): el is HTMLElement => el instanceof HTMLElement)
    for (const node of nodes) node.remove()
    return nodes
  }
  const entries = definitions.map((def) => ({
    def,
    menus: parse(def.menus).filter((el): el is VfMenu => el.localName === 'vf-menu'),
    dialogs: parse(def.dialogs).filter((el) => el.dataset.dialog != null),
    // Windows stay inert in a template, copied on each ask.
    windows: (() => {
      const template = document.createElement('template')
      template.innerHTML = def.windows ?? ''
      return template.content
    })(),
  }))

  // Applications.
  const disposers: (() => void)[] = []
  for (const { def, menus, dialogs, windows: windowMarkup } of entries) {
    const own: (() => void)[] = []
    const where = `vintage-frames/shell (${def.id})`
    // Its dialogs, held under it from the start and removed with it last.
    const held = new Set<Element>()
    for (const dialog of dialogs) {
      wm.holdDialog(dialog, { app: def.id })
      held.add(dialog)
    }
    own.push(() => {
      for (const dialog of held) {
        wm.releaseDialog(dialog)
        dialog.remove()
      }
      held.clear()
    })
    const ctx: AppContext = {
      desktop,
      windows: wm,
      menus,
      systemMenu,
      apps: actions,
      catalog,
      services,
      state,
      kinds,
      kind: (kind) => kinds.get(kind),
      app: (id) => definitions.find((d) => d.id === id),
      menu(name) {
        const menu = menus.find((m) => m.dataset.menu === name)
        if (!menu) throw new Error(`${where}: missing menu ${name}`)
        return menu
      },
      item(value) {
        for (const menu of menus) {
          const item = menu.querySelector<VfMenuItem>(`vf-menu-item[value="${CSS.escape(value)}"]`)
          if (item) return item
        }
        throw new Error(`${where}: missing menu item ${value}`)
      },
      onMenu(fn) {
        for (const menu of menus) {
          ctx.on(menu, 'vf-menu-select', (e) => {
            if (modalOpen()) return
            const { value, item } = (e as CustomEvent<{ value: string; item: VfMenuItem }>).detail
            fn(value, item)
          })
        }
      },
      systemItem(value, label, fn) {
        const item = document.createElement('vf-menu-item')
        item.setAttribute('value', value)
        item.textContent = label
        systemMenu.append(item)
        ctx.on(systemMenu, 'vf-menu-select', (e) => {
          if (!modalOpen() && (e as CustomEvent<{ value: string }>).detail.value === value) fn()
        })
        own.push(() => item.remove())
        return item
      },
      dialog<T extends HTMLElement = VfDialog>(name: string): T {
        const dialog = dialogs.find((d) => d.dataset.dialog === name)
        if (!dialog) throw new Error(`${where}: missing dialog ${name}`)
        return dialog as T
      },
      window<T extends HTMLElement = VfWindow>(name: string): T {
        const source = [...windowMarkup.children].find((el) => (el as HTMLElement).dataset.window === name)
        if (!source) throw new Error(`${where}: missing window ${name}`)
        const win = document.importNode(source, true) as T
        customElements.upgrade(win)
        return win
      },
      hold(dialog) {
        wm.holdDialog(dialog, { app: def.id })
        held.add(dialog)
        return dialog
      },
      release(dialog) {
        if (!held.delete(dialog)) return
        wm.releaseDialog(dialog)
        dialog.remove()
      },
      ask(dialog) {
        if (wm.appOf(dialog) !== def.id) throw new Error(`${where}: ask() takes a dialog the application holds`)
        return new Promise((resolve) => {
          const closed = (e: Event) => {
            if (e.target !== dialog) return
            dialog.removeEventListener('vf-close', closed)
            resolve((e as CustomEvent<VfCloseDetail>).detail.returnValue)
          }
          dialog.addEventListener('vf-close', closed)
          dialog.show()
        })
      },
      gate(item, test) {
        gates.set(item, test)
        own.push(() => gates.delete(item))
        const off = !test()
        if (item.disabled !== off) item.disabled = off
      },
      typing,
      modalOpen,
      onFront(fn) {
        fn(wm.front === def.id)
        own.push(wm.onFront((app) => fn(app === def.id)))
      },
      on(target, type, fn, opts) {
        target.addEventListener(type, fn, opts)
        own.push(() => target.removeEventListener(type, fn, opts))
      },
      onDispose(fn) {
        own.push(fn)
      },
    }
    const result = def.init(ctx)
    if (result) actions[def.id] = result
    disposers.push(() => {
      for (const fn of own.splice(0).reverse()) fn()
    })
  }

  // The menu swap: the front application's menus after the system menu, or,
  // while one of its held dialogs is open, the asking application's.
  let slotted: (typeof entries)[number] | null = null
  const sync = () => {
    const app = wm.asking ?? wm.front
    const entry = entries.find((e) => e.def.id === app) ?? entries.find((e) => e.def.id === defaultApp) ?? null
    if (!entry || entry === slotted) return
    if (slotted) for (const menu of slotted.menus) menu.remove()
    systemMenu.after(...entry.menus)
    bar.label = entry.def.name
    slotted = entry
    syncGates()
  }
  teardown.push(wm.onFront(sync), wm.onDialogs(sync))
  sync()

  // The clock, in the bar's end slot.
  if (options.clock !== false) {
    let label = bar.querySelector<HTMLElement>(':scope > [slot="end"]')
    const made = !label
    if (!label) {
      label = document.createElement('vf-label')
      label.slot = 'end'
      bar.append(label)
    }
    const stop = startClock(label)
    teardown.push(() => {
      stop()
      if (made) label!.remove()
    })
  }

  // A window showing a catalog item follows it.
  const backed = new WeakSet<Element>()
  const follow = () => {
    if (!catalog) return
    for (const win of desktop.stackingOrder) {
      if (!(win instanceof VfWindow)) continue
      const item = wm.itemOf(win)
      if (item == null) continue
      const it = catalog.item(item)
      if (it) {
        backed.add(win)
        if (win.heading !== it.name) win.heading = it.name
      } else if (backed.has(win) && catalog.get().available) {
        void wm.close(win, { to: null })
      }
    }
  }
  if (catalog) teardown.push(catalog.subscribe(follow), wm.onWindows(follow))

  // The boot.
  state?.hold()
  const ready = (async () => {
    try {
      // The menu bar renders first, so the work area, the seed and the
      // session's windows all measure it.
      await desktopRendered(desktop)
      if (catalog) {
        await catalog.refresh()
        if (finderDef?.catalog?.seed) await catalog.seed(finderDef.catalog.seed)
      }
      for (const { item, app } of openWindowsOf(state?.saved ?? null)) {
        await actions[app]?.open?.({ item })
      }
      const active = state?.saved?.active
      if (active) {
        const win = wm.windowFor(active)
        if (win) desktop.bringToFront(win)
      }
    } finally {
      if (state) {
        const stop = state.start(
          () => ({
            windows: wm.snapshot(),
            active: wm.itemOf(desktop.activeWindow),
            pattern: desktop.pattern ?? null,
          }),
          (fn) => {
            const offs = [wm.onLayout(fn), wm.onWindows(fn), ...(catalog ? [catalog.subscribe(fn)] : [])]
            desktop.addEventListener('vf-activate', fn)
            // `pattern` reflects: a new desktop pattern is saved on its own.
            const pattern = new MutationObserver(fn)
            pattern.observe(desktop, { attributes: true, attributeFilter: ['pattern'] })
            return () => {
              for (const off of offs) off()
              desktop.removeEventListener('vf-activate', fn)
              pattern.disconnect()
            }
          }
        )
        teardown.push(stop)
        // Writes what the boot left on screen.
        state.release()
      }
    }
  })()

  return {
    desktop,
    windows: wm,
    catalog,
    apps: actions,
    ready,
    dispose(): void {
      for (const dispose of disposers.splice(0).reverse()) dispose()
      if (slotted) for (const menu of slotted.menus) menu.remove()
      slotted = null
      for (const fn of teardown.splice(0)) fn()
      wm.dispose()
      void catalog?.dispose()
    },
  }
}
