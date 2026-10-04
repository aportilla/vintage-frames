# The shell

`vintage-frames/shell` runs applications over one desktop: a window manager, a menu bar that shows the front application's menus, a catalog of what is where, and a stock Finder that shows the catalog as icons. It is plain modules over the kit's elements. It registers no elements, writes no styles, ships no art and composes no UI: every window and dialog on screen is an application's or the page's. It reaches the kit only through the package's root exports, so the page imports `vintage-frames` first.

The shell is experimental. Its API may change in any minor release until sprite-machine runs on all of it.

## Setup

```html
<vf-desktop bezel="10">
  <vf-menu-bar label="Finder">
    <vf-menu label="Apple">
      <vf-img slot="label" width="16" height="16"><img src="/art/apple.png" alt="" /></vf-img>
    </vf-menu>
  </vf-menu-bar>
  <vf-icon-field label="Desktop" fill-width fill-height>
    <vf-icon data-app="note-pad"></vf-icon>
    <template data-folder="Projects">
      <template data-folder="Archive"></template>
    </template>
  </vf-icon-field>
</vf-desktop>
```

```ts
import 'vintage-frames'
import { createShell, finder, memoryStorage } from 'vintage-frames/shell'

const shell = createShell(document.querySelector('vf-desktop')!, {
  apps: [
    finder({
      storage: memoryStorage(),
      seed: 'markup',
      art: {
        folder: '/art/folder.png',
        trash: '/art/trash.png',
        trashFull: '/art/trash-full.png',
        document: '/art/document.png',
        caution: '/art/caution.png',
      },
    }),
    notePad,
  ],
  fit: 'viewport',
})
await shell.ready
```

The desktop needs a `vf-menu-bar`, and the bar's first `vf-menu` is the system menu: the page's own, with its own label and art. Applications add items to it. The Finder uses the desktop's `vf-icon-field`, or adds one. A `bezel` gives the screen its rounded corners, the menu bar's included; without one, `rounded` on the bar rounds its top corners alone.

| Option | |
| --- | --- |
| `apps` | The applications. The first with a `catalog` is the Finder. |
| `defaultApp` | The application in front while no window is active. Default: the Finder. |
| `fit` | `'viewport'` sizes the desktop to the viewport, on every resize and scale change. |
| `state` | Where the session is saved (§ Saved state). Default `null`: a reload resets. |
| `services` | The site's own objects, passed to every application. |
| `clock` | The time in the bar's `end` slot. Default `true`. |

`createShell()` returns `{ desktop, windows, catalog, apps, ready, dispose() }`. `ready` settles once the desktop and its menu bar have rendered, the catalog is read, the seed stored and the last session's windows reopened. `dispose()` takes everything down, the applications' own setup included, so a hot reload starts clean.

## Applications

```ts
import { defineApp } from 'vintage-frames/shell'

export const notePad = defineApp({
  id: 'note-pad',
  name: 'Note Pad',
  icon: '/art/note-pad.png',
  menus: `
    <vf-menu data-menu="file" label="File">
      <vf-menu-item value="new" shortcut="⌃N">New</vf-menu-item>
      <vf-menu-item value="close" shortcut="⌃W">Close</vf-menu-item>
    </vf-menu>`,
  kinds: { note: { art: '/art/note.png', open: (item, from) => openNote(item, from) } },
  init(ctx) {
    ctx.onMenu((value) => {
      if (value === 'new') newNote()
    })
    return { open: ({ item, from }) => openNote(item, from) }
  },
})
```

| Field | |
| --- | --- |
| `id`, `name` | `name` is the bar's accessible name while the application is in front. |
| `icon` | Its 32×32 art, for its icon in the Finder. |
| `menus` | `vf-menu` elements, each with a `data-menu` name. |
| `dialogs` | Its dialogs, each with a `data-dialog` name (§ Dialogs). |
| `kinds` | The catalog kinds it opens (§ The catalog). |
| `init(ctx)` | Sets the application up and returns its actions, which other applications call. An application whose windows reopen after a reload, or that opens from an icon, returns `open({ item, from })`. |

The bar holds the system menu, then the front application's menus, then the clock. The front application is the active window's, or the default application while no window is active. Each application's menus are parsed once and the same elements come back each time it is in front, so their state holds. Only the front application's key equivalents work, since the others' menus are off the bar. Browsers keep ⌘W, ⌘N and ⌘Q, so use ⌃W, ⌃N and ⌃Q.

What `init` gets:

| `ctx` | |
| --- | --- |
| `desktop`, `windows` | The `vf-desktop` and the window manager. |
| `menus`, `menu(name)`, `item(value)` | Its own menus and items. `menu()` and `item()` throw when the markup doesn't have them. |
| `onMenu(fn)` | Every pick from its menus. Picks are dropped while a modal dialog is open. |
| `systemMenu`, `systemItem(value, label, fn)` | The system menu, and an item added to it. |
| `gate(item, test)` | Keeps an item disabled while `test()` is false. Tests run again on every press, key, selection change and activation. |
| `typing()`, `modalOpen()` | Whether a text field has focus, read through shadow roots, and whether a modal dialog is open. |
| `dialog(name)` | One of its dialogs. Throws when the markup doesn't have it. |
| `hold(dialog)`, `release(dialog)` | Hold a dialog it made in code, and let one go. `hold()` appends it to the desktop and returns it; `release()` removes it. |
| `ask(dialog)` | Shows one of its held dialogs and resolves its `returnValue`, or `null` when it closed without one. Throws for a dialog it doesn't hold. |
| `onFront(fn)` | Whether the application is in front, now and on every change. For keys and page furniture that belong to one application. |
| `apps`, `app(id)` | Every application's actions, read at the call, and the definitions. |
| `catalog`, `kinds`, `kind(name)` | The catalog, when a Finder runs, and the registered kinds. |
| `services`, `state` | The site's objects and the saved session. |
| `on(target, type, fn)`, `onDispose(fn)` | A listener and a teardown, both undone by `dispose()`. |

## Dialogs

An application's dialogs are its own, like its windows. It authors them, the window manager holds them under it, and they are removed with it.

```ts
export const notePad = defineApp({
  id: 'note-pad',
  name: 'Note Pad',
  dialogs: `
    <vf-dialog data-dialog="save-changes" frame="plain" label="Save Changes" width="360" height="118">
      <form method="dialog" novalidate>
        <vf-img width="32" height="32" left="16" top="16"><img src="/art/caution.png" alt="" /></vf-img>
        <vf-paragraph face="display" width="270" left="64" top="16" data-message></vf-paragraph>
        <vf-button-group origin="bottom right" left="334" top="92">
          <vf-button type="submit" value="discard">Don’t Save</vf-button>
          <vf-button type="submit" value="cancel">Cancel</vf-button>
          <vf-button type="submit" value="save" variant="default">Save</vf-button>
        </vf-button-group>
      </form>
    </vf-dialog>`,
  init(ctx) {
    const saveChanges = ctx.dialog('save-changes')
    async function askToClose(win) {
      saveChanges.querySelector('[data-message]').textContent = `Save changes to “${win.heading}” before closing?`
      const answer = await ctx.ask(saveChanges) // 'save', 'discard', 'cancel', or null for Escape
      // …
    }
  },
})
```

- `dialogs` are parsed once, appended to the desktop and held under the application. Hold a dialog made in code with `ctx.hold()`, and let it go with `ctx.release()`.
- A `<form method="dialog">` closes the dialog with the pressed submit button's `value`, its `returnValue`, and `ask()` resolves it. A dialog with fields answers the same way, and the application reads its fields after. Keep OK disabled until the dialog can answer. `novalidate` keeps the browser's own validation message from showing.
- A dialog declares its whole box. Size copy that varies for its longest, or measure it after `show()` and set `height` then: a closed dialog lays out nothing. A message of unknown length goes in flow, and the dialog's body scrolls it.
- A held dialog can be an element that renders a `vf-dialog` inside itself. `ask()` takes the `vf-dialog`; show a wrapper through its own API.
- While a held dialog is open, the bar shows its application's name and menus, even when another application is in front. With several open, it shows the one opened last. Nothing else changes: the front application, the active window and the palettes stay as they were. An application that wants to come forward raises a window before it asks.
- `dispose()` removes every application's dialogs. An open one closes, and its `ask()` resolves `null`.
- A dialog of the page's own, an About box say, stays the page's.

## Windows

Every window has an application and, optionally, an item: a catalog id, or a key of the application's own. A window's item can change: `setItem()` gives an untitled document its item at its first save.

```ts
windows.open({
  app: 'note-pad',
  item: note.id,
  from, // the icon's cellRect()
  create: () => makeNoteWindow(note),
  close: (win) => askToSave(win), // the close box asks; call windows.close(win) to close
})
```

- `open()` brings the item's window forward if one is open. Otherwise it makes the window, appends it to the desktop, places it, and opens it out of `from`.
- Placement, in order: this session's place for the item, the saved one, then `place`. The default `place` is the first cascade step no open window holds, 40 right and 20 down from the top left of the area below the menu bar. Every placement is held inside that area.
- `close(win)` closes the window into its home box and removes it. The home box is the item's icon, else the nearest open folder around it. A window of an application's own closes into the application's icon. The window's box is kept for the session.
- With `close` set, the close box and File → Close call it instead, and the application calls `windows.close(win)` once it decides.
- `adopt(win, options)` takes a window the application made and appended itself. It takes the same options as `open()`, plus `palette` and `pin`.
- A palette is shown while its application is in front and hidden otherwise. It is never closed. `palette` can be a function, for a palette the application hides for its own reasons; call `palettesChanged()` when its answer changes.
- Focus: opening a window moves the keyboard focus into it: to a control marked `autofocus`, else the first that takes the focus. Anything whose `tabindex` is negative is passed over, such as a roving cell off the tab order. Closing the active window moves the focus into the next active window, else to the closed window's icon. A title-bar press activates a window without moving the focus, so focus left in the previous window follows the active one.
- On a screen resize every window keeps its place relative to the screen's nearest edges, or its share of the middle. A resizable window keeps its size limits (`vf-window.sizeLimits`) and fits inside the area below the bar. Growing the screen back restores every window exactly. `policy` and `keep` change this for one window, and `setFrameBands()` for all of them, for windows that dock along the edges.
- View → Arrange Windows puts every window back at its `place`. It is disabled while every window is there. `arrangeWith(app, group)` lets an application arrange its own windows its own way.
- `window-top` on the `vf-desktop` moves the windows' area down, for a strip of the page's under the menu bar. Icons still stop at the bar.

| Read | |
| --- | --- |
| `front` | The front application's id. |
| `asking` | The application whose held dialog opened last and is still open, or `null`. The bar shows it while it is set. |
| `windowFor(item)`, `itemOf(win)`, `appOf(el)`, `windowsOf(app)`, `dialogsOf(app)` | Lookups. `appOf()` takes a window or a held dialog. `windowsOf()` lists back to front. |
| `isOpen(item)`, `hasWindows(app)` | Whether a window is open, or still closing into its icon. |
| `holdDialog(dialog, { app })`, `releaseDialog(dialog)` | What `ctx.hold()` and `ctx.release()` call. |
| `onWindows(fn)`, `onLayout(fn)`, `onRaster(fn)`, `onFront(fn)`, `beforeFront(fn)`, `onDialogs(fn)` | A window opened or closed; any move, resize or arrangement; a screen resize; the front application changed, and just before it does; a held dialog opened or closed. Each returns its unsubscribe. |

## The catalog

```ts
interface Item {
  id: string
  name: string
  kind: string // 'folder', or a kind an application registers
  parent: string | null // a folder's id; null is the desktop
  left?: number // its place in its container, whole system px
  top?: number // unset: the container's next free cell
  createdAt: number
  modifiedAt: number
  data?: unknown // the kind's own, small and serializable
}
```

The catalog is the source of truth for what is where. It is pure: it runs under Node, and the shell's unit tests run it there.

- The Trash and a startup disk are volumes: containers with no record, listed first, each if the site wants one (`volumes: { trash: 'Trash', disk: 'Macintosh HD' }`). A volume can't be renamed, moved, copied or removed, and nothing is made in the Trash. Deleting is a move into the Trash. Only Empty Trash removes.
- A folder never goes into itself or a folder inside it. New folders are "untitled folder", then "untitled folder 2". Copies are "Name copy", then "Name copy 2".
- An item whose kind no application registers is kept in storage and left out of the listing.
- Storage is three calls: `list()`, `put(item)`, `remove(id)`. `memoryStorage()` forgets on reload and `indexedDbStorage(name)` keeps. A site can write its own. Without working storage the catalog lists the volumes alone, and the Finder says so when asked to save.
- A seed is stored once per storage. `seed: 'markup'` reads the `vf-icon[data-app]` and `template[data-folder]` in the desktop's field; a function stores the site's defaults through the catalog.
- Positions are on the items, so they persist wherever the catalog does. Position changes are written a moment after they settle.
- Selectors: `childrenOf`, `itemCount`, `isInside`, `enclosingFolders`, `isTrashed`, `descendantsOf`, `nextFolderName`, `copyName`. Operations: `create`, `rename`, `update`, `move`, `place`, `copy`, `emptyTrash`, `clear`, `import`, `dump`.

A kind tells the Finder how its items look and open:

| `KindDefinition` | |
| --- | --- |
| `art` | Its 32×32 art: one URL, or a function of the item. |
| `open(item, from)` | Opens the item, out of `from`. |
| `editable` | Renamed in place. Default `true`. |
| `size(item)` | Bytes, for Empty Trash's alert. |
| `copy(from, to)` | Copies the item's payload when the Finder copies it. |
| `onRemove(item)` | Drops the payload when Empty Trash removes the item. |
| `claim(file, parent)` | Makes an item of a pasted or dropped file. Resolves whether it did. |
| `export(item)` | The item as a file, for the system clipboard. |

Small data goes in `data`. A large payload stays in the application's own store, under the item's id, and `copy` and `onRemove` keep that store in step.

The shell registers one kind itself, `app`: an application's icon, which opens the application. It takes its name and art from the application, keeps a name the markup gives it, and can't be renamed.

## The Finder

```ts
finder({
  storage: indexedDbStorage('my-site'),
  art: { folder, trash, trashFull, document, trashMark },
  seed: async (catalog) => {
    const docs = await catalog.create({ name: 'Documents' })
    await catalog.create({ kind: 'note', name: 'Read Me', parent: docs!.id, data: { text: '…' } })
  },
})
```

| Option | |
| --- | --- |
| `storage` | Where the catalog is kept. `null` keeps nothing. |
| `art` | `folder`, `trash`, `trashFull` and `document` (32×32) are required; `disk` and `caution` (32×32) and `trashMark` (12×12) are optional. Without `caution` the alerts have no art. |
| `volumes` | Default: the Trash alone. |
| `seed` | `'markup'`, or a function. It runs once the desktop and its menu bar have rendered, so it can read `desktop.workArea`. |
| `lattice` | `{ desktop, folder }`: each a cell size, column and row pitch and insets. Default 64px cells, 80px columns, 72px rows, 16px insets. |
| `cleanUpAfterResize` | Clean Up the desktop once a resize settles with icons overlapping. Default `false`. |
| `commands` | Switch commands off: `{ 'empty-trash': false }`. |
| `dialogs` | The site's dialogs for the Finder, each with a `data-dialog` name, held by it (§ Dialogs). |
| `extend(finder, ctx)` | Add the site's own commands, and answer the Finder's alerts. |
| `window` | A folder window's size. Default 320 × 223: three columns and two rows of icons. |

- Icons are the catalog's: the desktop shows the desktop's items and each open folder window shows its folder's. An item without a position takes its container's next free cell. The desktop's cells run down from its top right, below the menu bar. A folder's run in rows from its top left. The Trash starts in the desktop's bottom-right corner.
- Every move goes back onto the item: a drag, an arrow-key nudge, Clean Up, the resize rule.
- A press anywhere in the desktop's field, on an icon or not, brings the Finder forward. The selection survives a switch to another application and back.
- Folder windows are made on open and removed on close. Each shows its item count, with the trash mark when it is in the Trash, and its scrolled content grows to hold its icons.
- An icon is drawn open while its window is, until the window has closed into it. An application's icon is drawn open while the application has a window.
- Opening one of several selected icons opens them all.
- Filing: a drop onto a folder icon files into that folder at its next free cells. A drop into a folder window lands where the icons were let go, and so does a drop out of a window onto the desktop. The folder under the pointer is highlighted. A drop over another application's window moves nothing.
- Renaming goes to the catalog. A name that is too long or empty gets an alert.
- A file dropped on the desktop or in a folder window brings the Finder forward, as a press does.
- Copy puts the selected items' names on the system clipboard, with a file from the first kind that exports one. Paste copies what the Finder copied, while the system clipboard still holds those names or can't be read. Otherwise it offers the clipboard's files to the kinds' `claim`. A file dropped on the desktop goes the same way, into the folder window under it.
- Clean Up moves each icon of the active window, or the desktop, to the free cell nearest it, one at a time. Icons past the last cell share it. The desktop's icons follow the screen's edges on a resize. With `cleanUpAfterResize`, overlapping icons are cleaned up once the resize settles.

| Menu | Commands |
| --- | --- |
| File | Open ⌘O, New Folder, Close ⌃W |
| Edit | Copy ⌘C, Paste ⌘V, Select All ⌘A |
| View | Arrange Windows ⌘J |
| Special | Clean Up Desktop or Clean Up Window, Empty Trash… |

A command is disabled while it has nothing to act on: Open and Copy with nothing selected, Close with no folder window active, New Folder and Paste in the Trash, Empty Trash with the Trash empty, Arrange Windows with every window in place. Open, Copy, Paste and Select All are also disabled while a text field has focus, so the field keeps its own keys.

`extend` gets the Finder's actions and the context:

```ts
finder({
  // …
  extend(finder, ctx) {
    finder.addCommand({
      menu: 'special',
      value: 'back-up',
      label: 'Back Up All Files…',
      separator: true,
      run: () => downloadBackup(finder.catalog.dump()),
      enabled: () => finder.catalog.get().items.length > 1,
    })
  },
})
```

| Finder action | |
| --- | --- |
| `catalog` | The catalog. |
| `selection()`, `select(ids)` | The selected items, and a new selection. |
| `activeFolder()` | The active folder window's folder, or `null` for the desktop. |
| `open({ item, from })` | Opens an item as a double-click would. |
| `rename(id)` | Selects the item's icon and opens its rename box. |
| `cleanUp(folder)` | Clean Up for a folder, or `null` for the desktop. |
| `iconFor(id)` | The item's icon, where one is shown. |
| `addCommand(spec)` | A command in one of the Finder's menus. Call it from `extend`. |
| `alertWith(id, handler)` | Answers one of the Finder's alerts in its place. Call it from `extend`. |

### The Finder's alerts

The Finder's alerts are its own: a plain-framed dialog with the `caution` art, sized to its message and held by the Finder while it is up. A site answers any of them with its own dialog instead. The handler gets the alert's details and resolves its answer:

```ts
finder({
  // …
  dialogs: emptyTrashHtml, // a vf-dialog with data-dialog="empty-trash"
  extend(finder, ctx) {
    const dialog = ctx.dialog('empty-trash')
    finder.alertWith('empty-trash', ({ count, bytes }) => {
      dialog.querySelector('[data-message]')!.textContent = trashMessage(count, bytes)
      return ctx.ask(dialog)
    })
  },
})
```

| Alert | When | Details | Answer it acts on |
| --- | --- | --- | --- |
| `empty-trash` | Special → Empty Trash… | `{ count, bytes }` | `'ok'` empties the Trash |
| `storage-unavailable` | New Folder, Paste or a dropped file, without storage | none | none |
| `name-too-long` | A rename past the limit | `{ limit }` | none |
| `name-rejected` | A rename to nothing | none | none |
| `move-failed` | A filing storage refused | `{ error }` | none |
| `failed` | New Folder, Empty Trash, Paste or a dropped file failed | `{ action, error }`: `'new-folder'`, `'empty-trash'`, `'paste'` or `'add-file'` | none |

An alert with no handler is the Finder's own.

## Saved state

```ts
createShell(desktop, { apps, state: localStorageState('my-site', { extra: { greet: true } }) })
```

`localStorageState(key, { extra })` keeps one versioned key:

- each window's place and its depth,
- the active window's item,
- the desktop pattern,
- the site's own keys: `state.get('greet')`, `state.set('greet', false)`.

The boot reopens the windows that were open, deepest first, then activates the one that was active. A palette's box is kept but never reopened as a window. Writes wait a moment after a change, and nothing is written until the boot has reopened the session. Hiding or leaving the page writes at once. `?fresh=1` in the address neither reads nor writes. With `state: null` nothing is saved.

The catalog's storage and the saved session are separate: a site can keep either, or both.

## Pieces on their own

Each module also works alone, on a page built from the elements ([FINDER.md](./FINDER.md)):

| Export | |
| --- | --- |
| `fileByDrag(desktop, options)` | Filing by drag over the page's own model. The options say what a container is, what may be filed where, and what filing does. Returns the teardown. |
| `createCatalog(options)` | The catalog over any storage. |
| `createWindowManager(desktop, options)` | The window manager without the menu bar. |
| `pinOf`, `pinTo`, `frameOf`, `cascadedBox`, `centeredBox`, `desktopLattice`, `folderLattice`, `trashCell`, `nextFreeCell`, `cleanUp`, `fillOrder`, `fieldExtent`, `collisions` | The geometry, pure: boxes and positions in whole system px. |
| `localStorageState`, `readSession`, `mergeSession` | The saved session. |
| `startClock` | The clock. |

## The reference page

`shell.html` runs the shell with the Finder and Note Pad, a small application with documents of its own kind, an Info palette, a close that asks about unsaved changes in an alert of its own, and a `claim` that makes a note of a dropped text file (`demo/shell.ts`). `?save=1` keeps the catalog and the session across reloads, `?cleanup=1` turns on Clean Up after a resize, and `?open=Projects&open=Archive` opens those items at load. `verify:shell-front`, `verify:shell-windows` and `verify:shell-finder` drive it, and `verify:shell-unit` tests the pure modules under Node.
