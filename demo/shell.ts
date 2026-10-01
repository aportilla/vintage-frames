/**
 * shell.html's script: the shell over the page's desktop. The Finder shows a
 * catalog seeded from the page's markup; Note Pad is a small application with
 * documents of its own kind, an Info palette shown while it is front, and a
 * close that asks about unsaved changes.
 *
 * `?save=1` keeps the catalog in IndexedDB and the session in localStorage;
 * `?cleanup=1` turns on the Finder's Clean Up after a resize; `?open=` opens
 * the items it names once the boot is done.
 */

import { VfWindow } from '../src/index.js'
import type { VfDesktop, VfLabel, VfTextArea, VfViewportBox } from '../src/index.js'
import {
  createShell,
  defineApp,
  finder,
  indexedDbStorage,
  localStorageState,
  memoryStorage,
} from '../src/shell/index.js'
import type { AppDefinition, Item } from '../src/shell/index.js'

const ICONS = '/demo/icons'

/** Note Pad's kind: a note, its text in the item's `data`. */
const NOTE = 'note'
const NOTE_PAD = 'note-pad'
const textOf = (item: Item | null) => (item?.data as { text?: string } | undefined)?.text ?? ''

const NOTE_PAD_MENUS = `
  <vf-menu data-menu="file" label="File">
    <vf-menu-item value="new" shortcut="⌃N">New</vf-menu-item>
    <vf-menu-item value="save" shortcut="⌘S">Save</vf-menu-item>
    <vf-separator></vf-separator>
    <vf-menu-item value="close" shortcut="⌃W">Close</vf-menu-item>
  </vf-menu>
  <vf-menu data-menu="window" label="Window">
    <vf-menu-item value="info">Hide Info</vf-menu-item>
  </vf-menu>`

interface NotePadActions {
  /** Open a note; with none named, bring the front document up or start a new one. */
  open(options?: { item?: string | null; from?: VfViewportBox | null }): void
}

function notePad(): AppDefinition<NotePadActions> {
  /** Open a note's window; the application's, from init. */
  let openNote = (_note: Item, _from: VfViewportBox | null): void => {}

  return defineApp<NotePadActions>({
    id: NOTE_PAD,
    name: 'Note Pad',
    icon: `${ICONS}/app-icon.png`,
    menus: NOTE_PAD_MENUS,
    kinds: {
      [NOTE]: {
        art: `${ICONS}/doc-icon.png`,
        open: (note, from) => openNote(note, from),
        size: (note) => new Blob([textOf(note)]).size,
      },
    },
    init(ctx) {
      const { desktop, windows } = ctx
      const catalog = ctx.catalog!
      /** Windows with changes not yet saved. */
      const unsaved = new WeakSet<VfWindow>()
      let untitled = 0

      const textArea = (win: Element) => win.querySelector('vf-text-area') as VfTextArea
      /** The active window when it is a Note Pad document. */
      const front = (): VfWindow | null => {
        const w = desktop.activeWindow
        return w instanceof VfWindow && windows.appOf(w) === NOTE_PAD && !windows.isPalette(w) ? w : null
      }

      /** A document window: 8 around a six-line text area, which shell.html sizes to the body. */
      function makeWindow(name: string, text: string): VfWindow {
        const win = document.createElement('vf-window')
        win.heading = name
        win.movable = true
        win.width = 260
        win.height = 140
        const area = document.createElement('vf-text-area')
        area.label = 'Text'
        area.value = text
        area.rows = 6
        area.left = 8
        area.top = 8
        area.addEventListener('vf-input', () => {
          unsaved.add(win)
          showInfo()
        })
        win.append(area)
        return win
      }

      async function save(win: VfWindow): Promise<void> {
        const text = textArea(win).value
        const id = windows.itemOf(win)
        if (id != null && catalog.item(id)) {
          await catalog.update(id, { text })
        } else {
          // An untitled document gets its item at its first save.
          const made = await catalog.create({ kind: NOTE, name: win.heading, data: { text } })
          if (made) windows.setItem(win, made.id)
        }
        unsaved.delete(win)
      }

      /** The close box: a document with unsaved changes asks first. */
      async function askToClose(win: VfWindow): Promise<void> {
        if (!unsaved.has(win)) {
          void windows.close(win)
          return
        }
        const answer = await ctx.alert(`Save changes to “${win.heading}” before closing?`, {
          label: 'Save Changes',
          buttons: [
            { label: 'Don’t Save', value: 'discard' },
            { label: 'Cancel', value: 'cancel' },
            { label: 'Save', value: 'save', default: true },
          ],
        })
        if (answer !== 'save' && answer !== 'discard') return
        if (answer === 'save') await save(win)
        void windows.close(win)
      }

      openNote = (note, from) => {
        windows.open({
          app: NOTE_PAD,
          item: note.id,
          from,
          create: () => makeWindow(note.name, textOf(note)),
          close: askToClose,
        })
      }

      function newNote(from: VfViewportBox | null = null): void {
        untitled++
        const name = untitled === 1 ? 'Untitled' : `Untitled ${untitled}`
        windows.open({ app: NOTE_PAD, item: null, from, create: () => makeWindow(name, ''), close: askToClose })
      }

      // The Info palette: shown while Note Pad is front, unless hidden.
      let infoShown = true
      const info = document.createElement('vf-window')
      info.variant = 'utility'
      info.heading = 'Info'
      info.movable = true
      info.width = 128
      info.height = 40
      const count = document.createElement('vf-label') as VfLabel
      count.face = 'body'
      count.left = 8
      count.top = 6
      info.append(count)
      desktop.append(info)
      windows.adopt(info, {
        app: NOTE_PAD,
        palette: () => infoShown,
        // The bottom-left corner, clear of the desktop's icons.
        place: (a) => ({ left: a.left + 16, top: a.top + a.height - 40 - 16 }),
        close: () => {
          infoShown = false
          windows.palettesChanged()
        },
      })
      ctx.onDispose(() => info.remove())

      /** The front document's length, in the palette. */
      function showInfo(): void {
        const win = front()
        const n = win ? textArea(win).value.length : null
        count.textContent = n == null ? 'No document' : `${n} character${n === 1 ? '' : 's'}`
      }
      ctx.on(desktop, 'vf-activate', showInfo)
      showInfo()

      // A desk accessory's way in: an item in the system menu.
      ctx.systemItem(NOTE_PAD, 'Note Pad', () => newNote())

      ctx.onMenu((value) => {
        const win = front()
        if (value === 'new') newNote()
        else if (value === 'save' && win) void save(win)
        else if (value === 'close' && win) windows.requestClose(win)
        else if (value === 'info') {
          infoShown = !infoShown
          windows.palettesChanged()
        }
      })
      ctx.gate(ctx.item('save'), () => {
        const win = front()
        return !!win && unsaved.has(win)
      })
      ctx.gate(ctx.item('close'), () => !!front())
      const infoItem = ctx.item('info')
      ctx.gate(infoItem, () => {
        const text = infoShown ? 'Hide Info' : 'Show Info'
        if (infoItem.textContent !== text) infoItem.textContent = text
        return true
      })

      return {
        open({ item, from = null } = {}) {
          const note = catalog.item(item)
          if (note?.kind === NOTE) {
            openNote(note, from)
            return
          }
          // A saved window of a note that is gone, or an unsaved one: nothing to reopen.
          if (item != null) return
          const docs = windows.windowsOf(NOTE_PAD).filter((w) => !windows.isPalette(w))
          const top = docs[docs.length - 1]
          if (top) desktop.bringToFront(top)
          else newNote(from)
        },
      }
    },
  })
}

const params = new URLSearchParams(location.search)
const keep = params.get('save') === '1'
const desktop = document.querySelector('vf-desktop') as VfDesktop

const shell = createShell(desktop, {
  apps: [
    finder({
      storage: keep ? indexedDbStorage('vf-shell-reference') : memoryStorage(),
      seed: 'markup',
      art: {
        folder: `${ICONS}/folder.png`,
        trash: `${ICONS}/trash.png`,
        trashFull: `${ICONS}/trash-full.png`,
        document: `${ICONS}/doc-icon.png`,
        trashMark: `${ICONS}/trash-indicator.png`,
      },
      cleanUpAfterResize: params.get('cleanup') === '1',
    }),
    notePad(),
  ],
  fit: 'viewport',
  state: keep ? localStorageState('vf-shell-reference') : null,
  caution: `${ICONS}/alert.png`,
})

// `?open=Projects&open=Archive` opens those items once the boot is done, as
// double-clicks would: the grid audits walk the page with windows open.
const toOpen = params.getAll('open')
void shell.ready.then(() => {
  for (const name of toOpen) {
    const item = shell.catalog?.get().items.find((i) => i.name === name)
    if (item) shell.apps.finder.open({ item: item.id })
  }
})

// For the console and the verify scripts.
Object.assign(window, { shell })
