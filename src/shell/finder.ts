/**
 * The Finder: the stock application that shows the catalog as icons on the
 * desktop and in folder windows.
 *
 * - Icons are reconciled from the catalog into each container's field: the
 *   desktop's, and that of every open folder window. An icon that changes
 *   container moves with its item and keeps its selection.
 * - Positions are the items'. An icon is placed where its item says, and an
 *   item with none takes its container's next free cell — the Trash the
 *   desktop's bottom-right corner. Every move (a drag, a nudge, a Clean Up
 *   landing, the resize rule) goes back onto the item. The desktop's lattice
 *   runs down its right edge below the menu bar; a folder's runs in rows. On
 *   a raster resize the desktop's icons re-pin by the nine-slice rule.
 * - A press anywhere in the desktop's field, on an icon or the bare desktop,
 *   brings the Finder forward. The selection survives an application switch.
 * - Folder windows are made on open and removed on close, each with its item
 *   count in the header and a field sized to the scroll range.
 * - A window closes into its item's icon, else the nearest open folder
 *   around it. An application's icon stands for the application: it is drawn
 *   open while the application has a window open, and the application's own
 *   windows close into it.
 * - Menus: File (Open, New Folder, Close), Edit (Copy, Paste, Select All),
 *   View (Arrange Windows), Special (Clean Up, Empty Trash…), each disabled
 *   while it has nothing to act on. A site switches commands off and adds
 *   its own.
 */

import {
  WINDOW_RECT_STEP_MS,
  WINDOW_RECT_STEPS,
  WINDOW_RECTS_VISIBLE,
  prefersReducedMotion,
  snapSys,
  systemPxQuantum,
  windowChrome,
  VfWindow,
} from '../index.js'
import type { VfIcon, VfIconField, VfImg, VfLabel, VfMenu, VfMenuItem, VfViewportBox } from '../index.js'
import {
  DISK,
  FOLDER,
  TRASH,
  childrenOf,
  enclosingFolders,
  isContainerKind,
  isInside,
  isTrashed,
  isVolume,
  itemCount,
} from './catalog.js'
import type { Catalog, CatalogStorage, Item, Volumes } from './catalog.js'
import {
  ICON_CELL,
  cleanUp,
  collisions,
  desktopLattice,
  fieldExtent,
  fillOrder,
  folderLattice,
  frameOf,
  nextFreeCell,
  pinOf,
  pinTo,
  trashCell,
} from './geometry.js'
import type { Lattice, LatticeOptions, Pin, Point, Size } from './geometry.js'
import { fileByDrag } from './filing.js'
import { APP_KIND, appIdOf, defineApp } from './shell.js'
import type { AppContext, AppDefinition } from './shell.js'
import type { FocusHome, HomeBox } from './windows.js'

/** The Finder's application id. */
export const FINDER = 'finder'

/** The Finder's art: the kit ships none. */
export interface FinderArt {
  /** 32×32, as each of these. */
  folder: string
  /** The Trash, empty and full. */
  trash: string
  trashFull: string
  /** An item whose kind has no art of its own. */
  document: string
  /** The startup disk; the folder's art without it. */
  disk?: string
  /** 12×12: the mark before the item count in the Trash's window and trashed folders. */
  trashMark?: string
}

/** The Finder's own commands, each of which a site can switch off. */
export type FinderCommand =
  | 'open'
  | 'new-folder'
  | 'close'
  | 'copy'
  | 'paste'
  | 'select-all'
  | 'arrange'
  | 'clean-up'
  | 'empty-trash'

/** The Finder's menus, by `data-menu`. */
export type FinderMenu = 'file' | 'edit' | 'view' | 'special'

/** A command a site adds to the Finder's menus. */
export interface FinderCommandSpec {
  menu: FinderMenu
  /** The item's `value`, unique among the Finder's. */
  value: string
  label: string
  shortcut?: string
  /** Put a separator before it. */
  separator?: boolean
  run(): void
  /** Whether it has anything to act on; disabled while false. */
  enabled?(): boolean
}

/** What the Finder's `open` action takes: the item to open, and the box it opens out of. */
export interface FinderOpen {
  item?: string | null
  from?: VfViewportBox | null
}

/** The Finder's actions, for a site's extension and other applications. */
export interface FinderApi {
  readonly catalog: Catalog
  /** The selected items, volumes included, in listing order. */
  selection(): Item[]
  /** Make `ids` the selection. */
  select(ids: readonly string[]): void
  /** The folder whose window is active, or null for the desktop. */
  activeFolder(): string | null
  /** Open an item as a double-click would: a folder's window, or the item's kind. The boot reopens folder windows through it. */
  open(target?: FinderOpen): void
  /** Select an item's icon and open its rename box. */
  rename(id: string): Promise<void>
  /** Clean Up a container (null: the desktop). */
  cleanUp(folder: string | null): Promise<void>
  /** An item's icon, where one is rendered. */
  iconFor(id: string): VfIcon | null
  /** Add a command to the Finder's menus. Call it from `extend`, before the menus first reach the bar. */
  addCommand(spec: FinderCommandSpec): VfMenuItem
}

export interface FinderOptions {
  /** Where the catalog is kept: `memoryStorage()`, `indexedDbStorage(name)`, the site's own, or null for nothing. */
  storage: CatalogStorage | null
  art: FinderArt
  /** The volumes: the Trash by default, and a startup disk when named. */
  volumes?: Volumes
  /**
   * What the catalog starts with, stored once per storage: `'markup'` reads
   * the `<vf-icon data-app>` and `<template data-folder="Name">` the page
   * put in the desktop's field; a function stores the site's defaults.
   */
  seed?: 'markup' | ((catalog: Catalog) => void | Promise<void>)
  /** The lattices' cells, pitches and insets (default: 64px cells, 80px columns, 72px rows, 16px insets). */
  lattice?: { desktop?: LatticeOptions; folder?: LatticeOptions }
  /** Clean Up the desktop once a resize settles with icons overlapping. Default false. */
  cleanUpAfterResize?: boolean
  /** Switch commands off: `{ 'empty-trash': false }`. */
  commands?: Partial<Record<FinderCommand, boolean>>
  /** Add the site's own commands. */
  extend?(finder: FinderApi, ctx: AppContext): void
  /** A folder window's size, system px. Default 320 × 223: three columns and two rows of icons. */
  window?: Size
}

/** The beat between opens when one command opens several icons: one run of zoom rects. */
const OPEN_BEAT_MS = (WINDOW_RECT_STEPS + WINDOW_RECTS_VISIBLE) * WINDOW_RECT_STEP_MS

/** How long the raster holds still after a resize before Clean Up looks. */
const SETTLE_MS = 300

/** A folder window's header: its count line, a white row and the header's rule. */
const HEADER_HEIGHT = 20
/** The count line: 17 rows of paper and its bottom rule. */
const COUNT_LINE = 18
/** A top of 2 puts the body face's digits on rows 5–11. */
const COUNT_AT: Point = { left: 8, top: 2 }
/** The trash mark, its ink from column 1, so it sits 1px left of the count's inset. */
const MARK: Size = { width: 12, height: 12 }
const MARK_AT: Point = { left: COUNT_AT.left - 1, top: COUNT_AT.top }
const COUNT_AT_TRASHED: Point = { left: MARK_AT.left + MARK.width + 3, top: COUNT_AT.top }

const MENUS: { menu: FinderMenu; label: string; items: [FinderCommand, string, string?][] }[] = [
  {
    menu: 'file',
    label: 'File',
    items: [
      ['open', 'Open', '⌘O'],
      ['new-folder', 'New Folder'],
      // ⌃W: the browser takes ⌘W before the page sees it.
      ['close', 'Close', '⌃W'],
    ],
  },
  {
    menu: 'edit',
    label: 'Edit',
    items: [
      ['copy', 'Copy', '⌘C'],
      ['paste', 'Paste', '⌘V'],
      ['select-all', 'Select All', '⌘A'],
    ],
  },
  { menu: 'view', label: 'View', items: [['arrange', 'Arrange Windows', '⌘J']] },
  {
    menu: 'special',
    label: 'Special',
    items: [
      ['clean-up', 'Clean Up Desktop'],
      ['empty-trash', 'Empty Trash…'],
    ],
  },
]

/** The Finder's menus, less the commands switched off; a menu left empty is left out. */
function menusFor(on: (cmd: FinderCommand) => boolean): string {
  return MENUS.map(({ menu, label, items }) => {
    const rows = items
      .filter(([cmd]) => on(cmd))
      .map(([cmd, text, shortcut], i) => {
        // Close sits apart from Open and New Folder.
        const sep = cmd === 'close' && i > 0 ? '<vf-separator></vf-separator>' : ''
        return `${sep}<vf-menu-item value="${cmd}"${shortcut ? ` shortcut="${shortcut}"` : ''}>${text}</vf-menu-item>`
      })
    return rows.length ? `<vf-menu data-menu="${menu}" label="${label}">${rows.join('')}</vf-menu>` : ''
  }).join('')
}

/** A folder or application icon the page's markup declares. */
interface Declared {
  kind: typeof FOLDER | typeof APP_KIND
  name: string | null
  app?: string
  at?: Point
  children: Declared[]
}

/** Whether `el` is a declaration the markup seed reads. */
const isDeclaration = (el: Element): boolean =>
  (el.localName === 'vf-icon' && (el as HTMLElement).dataset.app != null) ||
  (el instanceof HTMLTemplateElement && el.dataset.folder != null)

/** The declarations in `root`: `vf-icon[data-app]` and `template[data-folder]`, a folder's inside it. */
function declarations(root: Element | DocumentFragment): Declared[] {
  const at = (left: string | null | undefined, top: string | null | undefined): Point | undefined =>
    left != null && top != null && Number.isFinite(+left) && Number.isFinite(+top) ? { left: +left, top: +top } : undefined
  const out: Declared[] = []
  for (const el of [...root.children].filter(isDeclaration)) {
    if (el instanceof HTMLTemplateElement) {
      out.push({
        kind: FOLDER,
        name: el.dataset.folder ?? null,
        at: at(el.dataset.left, el.dataset.top),
        children: declarations(el.content),
      })
    } else {
      out.push({
        kind: APP_KIND,
        name: el.getAttribute('label'),
        app: (el as HTMLElement).dataset.app,
        at: at(el.getAttribute('left'), el.getAttribute('top')),
        children: [],
      })
    }
  }
  return out
}

/** The Finder, as an application of the shell. */
export function finder(options: FinderOptions): AppDefinition<FinderApi> {
  const hasTrash = options.volumes?.trash !== false
  const on = (cmd: FinderCommand): boolean =>
    options.commands?.[cmd] !== false && (cmd !== 'empty-trash' || hasTrash)

  // The page's declarations and the applications' names, read at init for the markup seed.
  let declared: Declared[] = []
  let appName = (id: string): string => id
  const seed =
    options.seed === 'markup'
      ? async (catalog: Catalog) => {
          // Made a millisecond apart, so the listing keeps the markup's order.
          let at = Date.now()
          const store = async (list: Declared[], parent: string | null) => {
            for (const d of list) {
              const made = await catalog.create({
                kind: d.kind,
                name: d.name ?? (d.app != null ? appName(d.app) : undefined),
                parent,
                ...d.at,
                ...(d.app != null ? { data: { app: d.app } } : {}),
                at: at++,
              })
              if (made && d.children.length) await store(d.children, made.id)
            }
          }
          await store(declared, null)
        }
      : options.seed

  return defineApp<FinderApi>({
    id: FINDER,
    name: 'Finder',
    menus: menusFor(on),
    catalog: { storage: options.storage, volumes: options.volumes, seed },
    init(ctx) {
      const { desktop, windows } = ctx
      const catalog = ctx.catalog!
      const art = options.art
      appName = (id) => ctx.app(id)?.name ?? id
      const cell = options.lattice?.desktop?.cell ?? ICON_CELL
      const folderCell = options.lattice?.folder?.cell ?? ICON_CELL
      const windowSize = options.window ?? { width: 320, height: 223 }
      const chrome = windowChrome({ scrollbars: 'both', headerHeight: HEADER_HEIGHT })
      const failed = (what: string) => (err: unknown) => void ctx.alert(`${what} failed: ${(err as Error).message}.`)

      // The desktop's field: the page's, or one made for it. The page's
      // declarations become the seed, and the field is the catalog's from
      // here on; a dispose puts them back.
      let field = desktop.querySelector<VfIconField>(':scope > vf-icon-field')
      const made = !field
      if (!field) {
        field = document.createElement('vf-icon-field')
        field.label = 'Desktop'
        field.toggleAttribute('fill-width', true)
        field.toggleAttribute('fill-height', true)
        const bar = desktop.querySelector(':scope > vf-menu-bar')
        if (bar) bar.after(field)
        else desktop.prepend(field)
      }
      const desk = field
      const consumed = [...desk.children].filter(isDeclaration)
      declared = declarations(desk)
      for (const el of consumed) el.remove()

      /* ── Containers ────────────────────────────────────────────────── */

      /** Each open folder window, with its folder, back to front. */
      const folderWindows = (): [string, VfWindow][] =>
        windows
          .windowsOf(FINDER)
          .map((w): [string | null, VfWindow] => [windows.itemOf(w), w])
          .filter((p): p is [string, VfWindow] => p[0] != null)
      const fieldOfWindow = (win: Element) => win.querySelector<VfIconField>(':scope > vf-icon-field')
      /** Every rendered container: the desktop (null), then each open folder. */
      const roots = (): [string | null, VfIconField][] => [
        [null, desk],
        ...folderWindows().flatMap(([id, w]): [string, VfIconField][] => {
          const f = fieldOfWindow(w)
          return f ? [[id, f]] : []
        }),
      ]
      const fieldOf = (folder: string | null): VfIconField | null =>
        roots().find(([id]) => id === folder)?.[1] ?? null
      const iconsIn = (root: Element) => [...root.querySelectorAll<VfIcon>(':scope > vf-icon[data-id]')]
      const allIcons = () => roots().flatMap(([, f]) => iconsIn(f))
      const idOf = (icon: VfIcon) => icon.dataset.id as string
      const iconFor = (id: string): VfIcon | null => allIcons().find((i) => idOf(i) === id) ?? null
      const posOf = (icon: VfIcon): Point => ({ left: icon.left ?? 0, top: icon.top ?? 0 })
      /** The container an icon sits in: its folder window's folder, or null for the desktop. */
      const containerOfIcon = (icon: Element): string | null => windows.itemOf(icon.closest('vf-window'))
      /** A folder window's viewport: the scrolled plane's visible box. */
      const viewportOf = (win: VfWindow): Size => ({
        width: Math.max(0, (win.width ?? 0) - chrome.left - chrome.right),
        height: Math.max(0, (win.height ?? 0) - chrome.top - chrome.bottom),
      })
      const gridFor = (folder: string | null): Lattice => {
        if (folder == null) return desktopLattice(desktop.workArea, options.lattice?.desktop)
        const win = windows.windowFor(folder)
        return folderLattice(win ? viewportOf(win).width : 0, options.lattice?.folder)
      }

      /** Size a folder window's field to its viewport, grown to hold every icon: the scroll range. */
      const fit = (folder: string) => {
        const win = windows.windowFor(folder)
        const f = win && fieldOfWindow(win)
        if (!win || !f) return
        const ext = fieldExtent(iconsIn(f).map(posOf), viewportOf(win), { cell: folderCell })
        if (f.width !== ext.width) f.width = ext.width
        if (f.height !== ext.height) f.height = ext.height
      }

      /**
       * Write a position onto an icon: on the desktop snapped and clamped into
       * the work area, so a position saved on a larger screen stays in reach;
       * in a folder held at or past the plane's origin.
       */
      const place = (icon: VfIcon, folder: string | null, pos: Point) => {
        if (folder == null) {
          const a = desktop.workArea
          const k = systemPxQuantum(icon)
          const down = (v: number) => Math.floor(v / k) * k
          const minTop = Math.ceil(a.top / k) * k
          const maxLeft = Math.max(a.left, down(a.left + a.width - cell))
          const maxTop = Math.max(minTop, down(a.top + a.height - cell))
          icon.left = Math.min(Math.max(snapSys(pos.left, icon), a.left), maxLeft)
          icon.top = Math.min(Math.max(snapSys(pos.top, icon), minTop), maxTop)
        } else {
          icon.left = snapSys(Math.max(0, pos.left), icon)
          icon.top = snapSys(Math.max(0, pos.top), icon)
        }
      }

      /* ── Icons ─────────────────────────────────────────────────────── */

      const artOf = (item: Item): string => {
        if (item.kind === FOLDER) return art.folder
        if (item.kind === TRASH) return itemCount(catalog.get(), TRASH) ? art.trashFull : art.trash
        if (item.kind === DISK) return art.disk ?? art.folder
        const kind = ctx.kind(item.kind)
        const own = typeof kind?.art === 'function' ? kind.art(item) : kind?.art
        return own || art.document
      }

      /** Install or swap an icon's 32×32 art. */
      function setArt(icon: VfIcon, src: string): void {
        let img = icon.querySelector<HTMLImageElement>(':scope > vf-img > img')
        if (!img) {
          const wrap = document.createElement('vf-img')
          wrap.slot = 'large'
          wrap.width = 32
          wrap.height = 32
          img = document.createElement('img')
          img.alt = ''
          wrap.append(img)
          icon.append(wrap)
        }
        if (img.getAttribute('src') !== src) img.src = src
      }

      function makeIcon(item: Item): VfIcon {
        const icon = document.createElement('vf-icon')
        icon.dataset.id = item.id
        icon.label = item.name
        icon.width = cell
        icon.selectable = true
        icon.movable = true
        // A drop target: folders and the volumes.
        if (isContainerKind(item.kind)) icon.dataset.folder = item.id
        return icon
      }

      /** Icons whose positions are still to go onto their items. */
      const unsaved = new Set<VfIcon>()
      /**
       * The item position each icon was last placed from. An icon is placed
       * again only when its item's position changes, so one a gesture just
       * moved holds until its own position reaches the item.
       */
      const placedFrom = new WeakMap<VfIcon, string>()

      /** Pin an icon where its item says, or at its container's next free cell, which goes back onto the item. */
      function position(icon: VfIcon, item: Item, folder: string | null, root: VfIconField): void {
        if (item.left != null && item.top != null) {
          const key = `${item.left},${item.top}`
          if (placedFrom.get(icon) === key) return
          placedFrom.set(icon, key)
          if (icon.left !== item.left || icon.top !== item.top) place(icon, folder, { left: item.left, top: item.top })
          return
        }
        const taken = iconsIn(root)
          .filter((i) => i !== icon && i.left != null && i.top != null)
          .map(posOf)
        const at =
          folder == null && item.id === TRASH
            ? trashCell(desktop.workArea, options.lattice?.desktop)
            : nextFreeCell(gridFor(folder), taken, folder == null ? cell : folderCell)
        place(icon, folder, at)
        unsaved.add(icon)
      }

      let syncing = false
      function sync(): void {
        if (syncing) return
        syncing = true
        try {
          const st = catalog.get()
          // Every icon rendered, by item, so one whose item changed container moves.
          const existing = new Map(allIcons().map((i) => [idOf(i), i]))
          const kept = new Set<VfIcon>()
          const placed: (() => void)[] = []
          const unplaced: (() => void)[] = []
          for (const [folder, root] of roots()) {
            for (const item of childrenOf(st, folder)) {
              const icon = existing.get(item.id) ?? makeIcon(item)
              if (icon.parentElement !== root) {
                root.append(icon) // before placing: the snap reads the live scale
                icon.left = undefined
                icon.top = undefined
                placedFrom.delete(icon)
              }
              kept.add(icon)
              if (icon.label !== item.name) icon.label = item.name
              icon.editable = !isVolume(item.id) && ctx.kind(item.kind)?.editable !== false
              setArt(icon, artOf(item))
              const open =
                item.kind === APP_KIND ? windows.hasWindows(appIdOf(item) ?? '') : windows.isOpen(item.id)
              if (icon.open !== open) icon.open = open
              const job = () => position(icon, item, folder, root)
              if (item.left != null && item.top != null) placed.push(job)
              else unplaced.push(job)
            }
          }
          for (const icon of existing.values()) if (!kept.has(icon)) icon.remove()
          // Stored positions first, so the next free cells skip them.
          for (const job of [...placed, ...unplaced]) job()
          for (const [id, win] of folderWindows()) {
            const f = fieldOfWindow(win)
            const name = catalog.item(id)?.name
            if (f && name != null && f.label !== name) f.label = name
            count(id)
            fit(id)
          }
        } finally {
          syncing = false
        }
        flushPlaces()
      }

      let flushQueued = false
      function flushPlaces(): void {
        flushQueued = false
        if (!unsaved.size) return
        const positions = new Map<string, Point>()
        for (const icon of unsaved) {
          if (icon.isConnected && icon.left != null && icon.top != null) positions.set(idOf(icon), posOf(icon))
        }
        unsaved.clear()
        catalog.place(positions)
      }
      // Every placement write an icon makes goes back onto its item.
      ctx.on(desktop, 'vf-placement-change', (e) => {
        const icon = e.target as VfIcon
        if (icon.localName !== 'vf-icon' || icon.dataset.id == null) return
        unsaved.add(icon)
        if (flushQueued) return
        flushQueued = true
        // The kit announces from inside an update: read the icons once the task's updates are done.
        queueMicrotask(flushPlaces)
      })

      ctx.onDispose(catalog.subscribe(sync))
      ctx.onDispose(windows.onWindows(sync))

      /* ── Folder windows ────────────────────────────────────────────── */

      function makeMark(): VfImg {
        const mark = document.createElement('vf-img')
        mark.dataset.trashMark = ''
        mark.width = MARK.width
        mark.height = MARK.height
        mark.left = MARK_AT.left
        mark.top = MARK_AT.top
        const img = document.createElement('img')
        img.alt = 'in the Trash'
        img.src = art.trashMark!
        mark.append(img)
        return mark
      }

      /** The header's item count, and the trash mark while the folder is trashed. */
      function count(id: string): void {
        const win = windows.windowFor(id)
        const header = win?.querySelector(':scope > [slot="header"]')
        const label = header?.querySelector<VfLabel>(':scope > vf-label[data-count]')
        if (!header || !label) return
        const st = catalog.get()
        const n = itemCount(st, id)
        const text = `${n} item${n === 1 ? '' : 's'}`
        if (label.textContent !== text) label.textContent = text
        const trashed = !!art.trashMark && isTrashed(st, id)
        const mark = header.querySelector(':scope > vf-img[data-trash-mark]')
        if (trashed && !mark) header.prepend(makeMark())
        else if (!trashed && mark) mark.remove()
        const at = trashed ? COUNT_AT_TRASHED : COUNT_AT
        if (label.left !== at.left) label.left = at.left
      }

      function makeFolderWindow(id: string): VfWindow {
        const name = catalog.item(id)?.name ?? ''
        const win = document.createElement('vf-window')
        win.heading = name
        win.movable = true
        win.outlineDrag = true
        win.resizable = true
        win.scrollbars = 'both'
        win.headerHeight = HEADER_HEIGHT
        win.width = windowSize.width
        win.height = windowSize.height
        const header = document.createElement('vf-container')
        header.slot = 'header'
        header.toggleAttribute('fill-width', true)
        header.height = COUNT_LINE
        header.rule = 'bottom'
        const label = document.createElement('vf-label')
        label.face = 'body'
        label.dataset.count = ''
        label.left = COUNT_AT.left
        label.top = COUNT_AT.top
        header.append(label)
        // At the plane's origin, so its coordinates are placementAt()'s.
        const plane = document.createElement('vf-icon-field')
        plane.label = name
        plane.left = 0
        plane.top = 0
        win.append(header, plane)
        return win
      }

      // A grow commit changes the viewport: the field refits.
      ctx.on(desktop, 'vf-resize', (e) => {
        if (!(e as CustomEvent<{ commit?: boolean }>).detail?.commit) return
        if (windows.appOf(e.target as Element) !== FINDER) return
        const id = windows.itemOf(e.target as Element)
        if (id != null) fit(id)
      })

      /* ── Opening and closing ───────────────────────────────────────── */

      function openItem(id: string, from: VfViewportBox | null): void {
        const item = catalog.item(id)
        if (!item) return
        if (isContainerKind(item.kind)) {
          windows.open({ app: FINDER, item: id, from, create: () => makeFolderWindow(id) })
        } else {
          ctx.kind(item.kind)?.open(item, from)
        }
      }
      ctx.on(desktop, 'vf-open', (e) => {
        const icon = e.target as VfIcon
        if (icon.localName !== 'vf-icon' || icon.dataset.id == null) return
        // Opening one of several selected icons opens them all, as File → Open does.
        if (icon.selected && selection().length > 1) void openSelection()
        else openItem(idOf(icon), icon.cellRect())
      })

      /** An application's icon: the first of its items with an icon rendered, else its first item. */
      const appItem = (app: string): Item | null => {
        const items = catalog.get().items.filter((i) => i.kind === APP_KIND && appIdOf(i) === app)
        return items.find((i) => iconFor(i.id)) ?? items[0] ?? null
      }
      /** The item a window stands for: its own, else its application's icon. */
      const standsFor = (item: string | null, app: string | null): Item | null =>
        catalog.item(item) ?? (app != null ? appItem(app) : null)

      const homeBox: HomeBox = (item, app) => {
        const it = standsFor(item, app)
        if (!it) return null
        const own = iconFor(it.id)?.cellRect()
        if (own) return own
        for (const folder of enclosingFolders(catalog.get(), it.parent)) {
          const box = iconFor(folder)?.cellRect()
          if (box) return box
        }
        return null
      }
      /** The focus after a close: the window's icon; with none named, the desktop's selected icon, else its first. */
      const focusHome: FocusHome = (item, app) => {
        const it = item == null && app == null ? null : standsFor(item, app)
        const icons = iconsIn(desk)
        const icon = it ? iconFor(it.id) : (icons.find((i) => i.selected) ?? icons[0] ?? null)
        if (!icon?.checkVisibility()) return false
        icon.focus({ preventScroll: true })
        return true
      }
      ctx.onDispose(windows.setHome(homeBox, focusHome))

      // The desktop brings the Finder forward: any press in its field, on an icon or not.
      ctx.on(desk, 'pointerdown', () => desktop.clearActive())

      /* ── Renaming ──────────────────────────────────────────────────── */

      const isFinders = (e: Event) => {
        const icon = e.target as HTMLElement
        return icon.localName === 'vf-icon' && icon.dataset.id != null
      }
      ctx.on(desktop, 'vf-change', (e) => {
        if (!isFinders(e)) return
        const icon = e.target as VfIcon
        const { label, previous } = (e as CustomEvent<{ label: string; previous: string }>).detail
        // A rename storage refused puts the old name back.
        catalog.rename(idOf(icon), label).catch(() => {
          icon.label = previous
        })
      })
      // One alert at a time: a held key reports every press it repeats.
      let warning = false
      ctx.on(desktop, 'vf-name-too-long', (e) => {
        if (!isFinders(e) || warning) return
        warning = true
        const { limit } = (e as CustomEvent<{ limit: number }>).detail
        void ctx.alert(`That name is too long. A name can have up to ${limit} characters.`).finally(() => {
          warning = false
        })
      })
      ctx.on(desktop, 'vf-name-rejected', (e) => {
        if (isFinders(e)) void ctx.alert('An item needs a name.')
      })

      /* ── Filing ────────────────────────────────────────────────────── */

      ctx.onDispose(
        fileByDrag(desktop, {
          folderOfWindow: (win) => (windows.appOf(win) === FINDER ? (windows.itemOf(win) ?? undefined) : undefined),
          folderOfIcon: (icon) => icon.dataset.folder,
          // Another application's icons are its own to move.
          containerOf: (icon) => (icon.dataset.id == null ? undefined : containerOfIcon(icon)),
          canFile: (icons, folder) => {
            const st = catalog.get()
            return icons.every((icon) => {
              const id = icon.dataset.id
              if (id == null || isVolume(id)) return false
              if (folder == null || icon.dataset.folder == null) return true
              return id !== folder && !isInside(st, folder, id)
            })
          },
          file: (icons, folder, landings) => {
            const at = new Map([...landings].map(([icon, p]) => [idOf(icon), p]))
            catalog.move(icons.map(idOf), folder, at).catch((err: Error) => {
              void ctx.alert(`The items couldn’t be moved: ${err.message}.`)
            })
          },
        })
      )

      /* ── The resize rule ───────────────────────────────────────────── */

      /**
       * Each desktop icon's pin, with the position the rule last wrote. A
       * mismatch means the icon moved since, so its pin is read again;
       * reading it from snapped positions on every resize would drift.
       */
      const pins = new WeakMap<VfIcon, { pin: Pin } & Point>()
      let settle = 0
      ctx.onDispose(
        windows.onRaster((before, after) => {
          // Land a Clean Up still walking, so the pins read where it was headed.
          void desk.dragIcons([])
          const size = { width: cell, height: cell }
          const frame = frameOf(desktop.workArea.top)
          for (const icon of iconsIn(desk)) {
            const cur = { ...posOf(icon), ...size }
            const rec = pins.get(icon)
            const pin = !rec || rec.left !== cur.left || rec.top !== cur.top ? pinOf(cur, before, frame) : rec.pin
            const to = pinTo(pin, after, frame, { size })
            icon.left = snapSys(to.left, icon)
            icon.top = snapSys(to.top, icon)
            pins.set(icon, { pin, left: icon.left, top: icon.top })
          }
          if (!options.cleanUpAfterResize) return
          window.clearTimeout(settle)
          settle = window.setTimeout(() => {
            settle = 0
            if (collisions(iconsIn(desk).map((icon) => ({ ...posOf(icon), ...size }))).size) void cleanUpIn(null)
          }, SETTLE_MS)
        })
      )
      ctx.onDispose(() => window.clearTimeout(settle))

      /* ── Selection, opening, Clean Up ──────────────────────────────── */

      const selection = (): Item[] => {
        const lit = new Set(allIcons().filter((i) => i.selected).map(idOf))
        return catalog.get().items.filter((i) => lit.has(i.id))
      }
      const select = (ids: readonly string[]) => {
        const want = new Set(ids)
        for (const icon of allIcons()) icon.setSelected(want.has(idOf(icon)))
      }
      const activeFolder = (): string | null => {
        const w = desktop.activeWindow
        return w && windows.appOf(w) === FINDER ? windows.itemOf(w) : null
      }

      async function cleanUpIn(folder: string | null): Promise<void> {
        const root = fieldOf(folder)
        if (!root) return
        const grid = gridFor(folder)
        const icons = iconsIn(root)
        const cells = cleanUp(grid, icons.map(posOf))
        const moves = icons.map((icon, i) => ({ icon, ...cells[i]! })).sort((a, b) => fillOrder(grid, a, b))
        await root.dragIcons(moves)
      }

      /**
       * Open every selected item, the route a double-click takes. Several
       * open a beat apart, so each window's zoom rects finish before the next
       * begin; under reduced motion they open at once.
       */
      async function openSelection(): Promise<void> {
        const beat = prefersReducedMotion() ? 0 : OPEN_BEAT_MS
        for (const [i, item] of selection().entries()) {
          if (i && beat) await new Promise((done) => setTimeout(done, beat))
          openItem(item.id, iconFor(item.id)?.cellRect() ?? null)
        }
      }

      async function rename(id: string): Promise<void> {
        const icon = iconFor(id)
        if (!icon) return
        select([id])
        await icon.updateComplete
        icon.startEditing()
      }

      /** Whether storage answers; an alert says when it doesn't. */
      const storageReady = (): boolean => {
        if (catalog.get().available) return true
        void ctx.alert('Files can’t be saved in this browser session. A private window, perhaps.', {
          label: 'Storage Unavailable',
        })
        return false
      }

      async function newFolder(): Promise<void> {
        if (!storageReady()) return
        // create() also refuses a parent in the Trash.
        const made = await catalog.create({ parent: activeFolder() }).catch(failed('New Folder'))
        if (made) await rename(made.id)
      }

      async function emptyTrash(): Promise<void> {
        const n = itemCount(catalog.get(), TRASH)
        if (!hasTrash || !n) return
        const k = Math.ceil(catalog.trashSize() / 1024)
        const message =
          n === 1
            ? `The Trash contains 1 item, which uses ${k}K of disk space. Are you sure you want to permanently remove it?`
            : `The Trash contains ${n} items, which use ${k}K of disk space. Are you sure you want to permanently remove these items?`
        const answer = await ctx.alert(message, {
          label: 'Empty Trash',
          buttons: [
            { label: 'Cancel', value: 'cancel' },
            { label: 'OK', value: 'ok', default: true },
          ],
        })
        if (answer === 'ok') await catalog.emptyTrash().catch(failed('Empty Trash'))
      }

      /* ── Copy and Paste ────────────────────────────────────────────── */

      /** The items the Finder copied, and the text it put on the system clipboard for them. */
      let copied: { ids: string[]; text: string } = { ids: [], text: '' }
      /** Line endings and trailing space, which a clipboard round trip may change. */
      const norm = (s: string) => s.replace(/\r\n?/g, '\n').trimEnd()

      /** The selected items' names on the system clipboard, with the first file a kind exports for its item. */
      async function copySelection(): Promise<void> {
        const items = selection().filter((i) => !isVolume(i.id))
        if (!items.length) return
        const text = items.map((i) => i.name).join('\n')
        copied = { ids: items.map((i) => i.id), text }
        const exporter = items.find((i) => ctx.kind(i.kind)?.export)
        try {
          const file = exporter ? await ctx.kind(exporter.kind)!.export!(exporter) : null
          if (file?.type && file.type !== 'text/plain' && typeof ClipboardItem !== 'undefined') {
            await navigator.clipboard.write([
              new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), [file.type]: file }),
            ])
            return
          }
        } catch {
          // The names alone, below.
        }
        try {
          await navigator.clipboard?.writeText(text)
        } catch {
          // The Finder still holds the copy.
        }
      }

      /** Offer a file to every kind that makes items of files, in order; resolves whether one did. */
      async function claim(file: Blob, parent: string | null): Promise<boolean> {
        for (const kind of ctx.kinds.values()) {
          if (kind.claim && (await kind.claim(file, parent))) return true
        }
        return false
      }
      const claims = () => [...ctx.kinds.values()].some((k) => k.claim)

      /** What the system clipboard holds, or null where it can't be read. */
      async function readClipboard(): Promise<{ text: string | null; files: Blob[] } | null> {
        try {
          if (navigator.clipboard?.read) {
            let text: string | null = null
            const files: Blob[] = []
            for (const entry of await navigator.clipboard.read()) {
              for (const type of entry.types) {
                const blob = await entry.getType(type)
                if (type === 'text/plain') text ??= await blob.text()
                else files.push(blob)
              }
            }
            return { text, files }
          }
          if (navigator.clipboard?.readText) return { text: await navigator.clipboard.readText(), files: [] }
        } catch {
          // Refused or unsupported.
        }
        return null
      }

      /**
       * Paste into the active folder (or the desktop): a copy of what the
       * Finder copied while the system clipboard still holds the names it
       * wrote — or can't be read — and otherwise the clipboard's files,
       * offered to the kinds.
       */
      async function paste(system?: { text: string | null; files: Blob[] } | null): Promise<void> {
        if (!storageReady()) return
        const target = activeFolder()
        if (isTrashed(catalog.get(), target)) return
        const read = system === undefined ? await readClipboard() : system
        const ours = copied.ids.length > 0 && (read == null || (read.text != null && norm(read.text) === norm(copied.text)))
        try {
          if (ours) {
            const made = await catalog.copy(copied.ids, target)
            if (made.length) select(made.map((i) => i.id))
          } else {
            for (const file of read?.files ?? []) await claim(file, target)
          }
        } catch (err) {
          failed('Paste')(err)
        }
      }

      // The browser's own Edit → Paste fires a paste event with no key
      // equivalent; its clipboardData is readable only during the event.
      ctx.on(document, 'paste', (e) => {
        if (!on('paste') || windows.front !== FINDER || ctx.modalOpen() || ctx.typing()) return
        const data = (e as ClipboardEvent).clipboardData
        if (!data) return
        e.preventDefault()
        void paste({ text: data.getData('text/plain') || null, files: [...data.files] })
      })

      // A file dropped on the desktop goes the same way, into the folder window under it.
      const hasFiles = (e: Event) => [...((e as DragEvent).dataTransfer?.types ?? [])].includes('Files')
      ctx.on(desktop, 'dragover', (e) => {
        if (hasFiles(e) && claims()) e.preventDefault()
      })
      ctx.on(desktop, 'drop', (e) => {
        if (!hasFiles(e) || !claims()) return
        e.preventDefault()
        const drop = e as DragEvent
        const files = [...(drop.dataTransfer?.files ?? [])]
        const win = document.elementsFromPoint(drop.clientX, drop.clientY).find((el) => el.localName === 'vf-window')
        // Over another application's window, nothing is made.
        if (win && windows.appOf(win) !== FINDER) return
        // The Finder comes forward, as a press brings it: a drop from outside the page presses nothing.
        if (win) desktop.bringToFront(win as HTMLElement)
        else desktop.clearActive()
        if (!storageReady()) return
        const folder = win ? windows.itemOf(win) : null
        if (isTrashed(catalog.get(), folder)) return
        void (async () => {
          for (const file of files) await claim(file, folder)
        })().catch(failed('Adding the file'))
      })

      /* ── Menus ─────────────────────────────────────────────────────── */

      const run: Record<string, () => void> = {
        open: () => void openSelection(),
        'new-folder': () => void newFolder(),
        close: () => {
          // Folder windows are the only windows the Finder closes.
          const id = activeFolder()
          const win = id != null ? windows.windowFor(id) : null
          if (win) windows.requestClose(win)
        },
        copy: () => void copySelection(),
        paste: () => void paste(),
        'select-all': () => {
          const root = fieldOf(activeFolder())
          if (root) select(iconsIn(root).map(idOf))
        },
        arrange: () => windows.arrange(),
        'clean-up': () => void cleanUpIn(activeFolder()),
        'empty-trash': () => void emptyTrash(),
      }

      // Copy, Paste, Select All and Open are disabled while a text field has
      // focus, so the field keeps its own ⌘C, ⌘V, ⌘A and the rest.
      const gate = (cmd: FinderCommand, test: () => boolean) => {
        if (on(cmd)) ctx.gate(ctx.item(cmd), test)
      }
      gate('open', () => !ctx.typing() && selection().length > 0)
      gate('new-folder', () => !isTrashed(catalog.get(), activeFolder()))
      gate('close', () => activeFolder() != null)
      gate('copy', () => !ctx.typing() && selection().some((i) => !isVolume(i.id)))
      gate('paste', () => !ctx.typing() && !isTrashed(catalog.get(), activeFolder()))
      gate('select-all', () => !ctx.typing())
      gate('arrange', () => !windows.arranged())
      gate('empty-trash', () => itemCount(catalog.get(), TRASH) > 0)
      if (on('clean-up')) {
        // Never disabled: it names what it tidies.
        const item = ctx.item('clean-up')
        ctx.gate(item, () => {
          const text = activeFolder() != null ? 'Clean Up Window' : 'Clean Up Desktop'
          if (item.textContent !== text) item.textContent = text
          return true
        })
      }

      /**
       * One of the Finder's menus, made where every command in it was
       * switched off. Only while `extend` runs: the bar takes the menus the
       * Finder has when its menus are first shown.
       */
      let extending = true
      const menuFor = (name: FinderMenu): VfMenu => {
        const found = ctx.menus.find((m) => m.dataset.menu === name)
        if (found) return found
        if (!extending) throw new Error(`vintage-frames/shell (finder): no ${name} menu; add to it from extend`)
        const menu = document.createElement('vf-menu')
        menu.dataset.menu = name
        menu.label = MENUS.find((m) => m.menu === name)!.label
        const order = MENUS.map((m) => m.menu)
        const after = ctx.menus.findIndex((m) => order.indexOf(m.dataset.menu as FinderMenu) > order.indexOf(name))
        ctx.menus.splice(after < 0 ? ctx.menus.length : after, 0, menu)
        return menu
      }

      const api: FinderApi = {
        catalog,
        selection,
        select,
        activeFolder,
        open: ({ item, from = null } = {}) => {
          if (item != null) openItem(item, from)
        },
        rename,
        cleanUp: cleanUpIn,
        iconFor,
        addCommand(spec) {
          const menu = menuFor(spec.menu)
          if (spec.separator) menu.append(document.createElement('vf-separator'))
          const item = document.createElement('vf-menu-item')
          item.setAttribute('value', spec.value)
          if (spec.shortcut) item.setAttribute('shortcut', spec.shortcut)
          item.textContent = spec.label
          menu.append(item)
          run[spec.value] = spec.run
          if (spec.enabled) ctx.gate(item, spec.enabled)
          return item
        },
      }
      options.extend?.(api, ctx)
      extending = false
      // After extend, so the menus it made take their picks too.
      ctx.onMenu((value) => run[value]?.())

      ctx.onDispose(() => {
        for (const [, win] of folderWindows()) win.remove()
        for (const icon of iconsIn(desk)) icon.remove()
        if (made) desk.remove()
        else desk.append(...consumed)
      })
      sync()
      return api
    },
  })
}
