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

The desktop needs a `vf-menu-bar`, and the bar's first `vf-menu` is the system menu: the page's own, with its own label and art. Its title is a `label`, or 16×16 art in the `label` slot, which the menu places as an icon title with no page CSS (SPEC § vf-menu). Its items are the page's own, About… and a rule say, and below them the shell lists what the System Folder's Apple Menu Items holds (§ The System Folder). The Finder uses the desktop's `vf-icon-field`, or adds one. A `bezel` gives the screen its rounded corners, the menu bar's included; without one, `rounded` on the bar rounds its top corners alone.

| Option | |
| --- | --- |
| `apps` | The applications. The first with a `catalog` is the Finder. |
| `defaultApp` | The application in front while no window is active. Default: the Finder. |
| `fit` | `'viewport'` sizes the desktop to the viewport, on every resize and scale change. |
| `state` | Where the session is saved (§ Saved state). Default `null`: a reload resets. |
| `services` | The site's own objects, passed to every application. |
| `clock` | The time in the bar's `end` slot. Default `true`. |
| `startup` | Open what Startup Items holds once the session is back. Default `true`; `false` skips it for this boot. |

The page around a `fit: 'viewport'` desktop is the page's own CSS; the shell writes none:

```css
html,
body {
  margin: 0;
  overflow: hidden;
}
```

`overflow: hidden` keeps a resize's passing overflow from showing a scrollbar, which would change the size the shell measures next.

Turning off pinch-zoom is the page's call too. It keeps the screen crisp, at the cost of the reader's own zoom:

```css
html {
  touch-action: pan-x pan-y;
}
```

```ts
// Safari's pinch, which can get past touch-action.
document.addEventListener('gesturestart', (e) => e.preventDefault())
```

Panning stays, so a finger still scrolls a window.

`createShell()` returns `{ desktop, windows, catalog, apps, ready, dispose() }`. `ready` settles once the desktop and its menu bar have rendered, the catalog is read, the seed stored, the last session's windows reopened and Startup Items opened. `dispose()` takes everything down, the applications' own setup and every window included, so a hot reload starts clean. The saved session stops before the windows go, so with `state` set the reload reopens them.

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
| `windows` | Its windows, each with a `data-window` name, kept inert until `ctx.window()` copies one. |
| `kinds` | The catalog kinds it opens (§ The catalog). |
| `init(ctx)` | Sets the application up and returns its actions, which other applications call. An application whose windows reopen after a reload, or that opens from an icon, returns `open({ item, from })`. |

An application can live in a repo of its own and ship as one PNG, its app file, which a site builds in ([APP-FILES.md](./APP-FILES.md)).

The bar holds the system menu, then the front application's menus, then the clock. The front application is the active window's, or the default application while no window is active. Each application's menus are parsed once and the same elements come back each time it is in front, so their state holds. Only the front application's key equivalents work, since the others' menus are off the bar. Browsers keep ⌘W, ⌘N and ⌘Q, so use ⌃W, ⌃N and ⌃Q.

No application adds to the system menu. An application in the Apple menu is one the visitor, or the site's seed, put in Apple Menu Items, usually as an alias (§ The System Folder).

What `init` gets:

| `ctx` | |
| --- | --- |
| `desktop`, `windows` | The `vf-desktop` and the window manager. |
| `menus`, `menu(name)`, `item(value)` | Its own menus and items. `menu()` and `item()` throw when the markup doesn't have them. |
| `onMenu(fn)` | Every pick from its menus. Picks are dropped while a modal dialog is open. |
| `gate(item, test)` | Keeps an item disabled while `test()` is false. Tests run again on every press, key, selection change and activation. |
| `typing()`, `modalOpen()` | Whether a text field has focus, read through shadow roots, and whether a modal dialog is open. |
| `dialog(name)` | One of its dialogs. Throws when the markup doesn't have it. |
| `window(name)` | A fresh copy of one of its windows on each call, upgraded and not yet appended, for `open({ create: () => ctx.window('viewer') })` or `adopt()`. Throws when the markup doesn't have it. |
| `hold(dialog)`, `release(dialog)` | Hold a dialog it made in code, and let one go. `hold()` appends it to the desktop and returns it; `release()` removes it. |
| `ask(dialog)` | Shows one of its held dialogs and resolves its `returnValue`, or `null` when it closed without one. Throws for a dialog it doesn't hold. |
| `onFront(fn)` | Whether the application is in front, now and on every change. For keys and page furniture that belong to one application. |
| `apps`, `app(id)` | Every application's actions, read at the call, and the definitions. |
| `catalog`, `kinds`, `kind(name)` | The catalog, when a Finder runs, and the registered kinds, the shell's `app` and `alias` among them. |
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
- A dialog declares its whole box. Size copy that varies for its longest, or measure it on `vf-show` and set `height` then: a closed dialog lays out nothing. [LAYOUT.md](./LAYOUT.md#window-archetypes)'s alert recipe has the arithmetic. A message of unknown length goes in flow, and the dialog's body scrolls it.
- `vf-show` fires once a dialog `ask()` showed is open, placed and focused, with the focused element as `detail.focus`. It is where the application finishes composing the dialog. The kit selects no text itself; a dialog whose name field should open with its default name selected selects it there:

  ```ts
  const newFolder = ctx.dialog('new-folder')
  const name = newFolder.querySelector('vf-text-field')!
  ctx.on(newFolder, 'vf-show', () => name.select())
  name.value = 'untitled folder'
  const answer = await ctx.ask(newFolder)
  ```
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
- With `close` set, the close box and File → Close call it instead, and the application calls `windows.close(win)` once it decides. It gets the window and the modifier keys held on the close box's click (`{ altKey, shiftKey, metaKey, ctrlKey }`); `requestClose(win, keys)` passes them on, and a close from a menu passes none. A handler that decides later, after a Save prompt, returns its promise; `requestClose()` resolves whether the window closed once it settles.
- `closeAll(app)` asks each of an application's windows to close, front to back, palettes aside: a Quit is one line. It resolves `false` at the first window still open after its handler, a Cancel, and `true` once all have closed. An Option-click on a window's close box does the same for its application, and each handler still decides for its own window.
- `adopt(win, options)` takes a window the application made and appended itself. It takes the same options as `open()`, plus `palette` and `pin`. A window adopted before the desktop's first render, such as a palette made in `init`, is placed again once the menu bar has rendered, so its `place` measures the area below the bar.
- Set a window's `width` and `height` before `open()` or `adopt()`. Both read the declared size to place the window, and a saved place is worked out against it. A window sized from its content is appended and measured first, then adopted.
- A palette is shown while its application is in front and hidden otherwise. It is never closed. `palette` can be a function, for a palette the application hides for its own reasons; call `palettesChanged()` when its answer changes.
- Focus: opening a window moves the keyboard focus into it: to the first control marked `autofocus` or `autoselect`, else the first that takes the focus. Anything whose `tabindex` is negative is passed over, such as a roving cell off the tab order. When `open()` makes the window, a text field marked `autoselect` also has its whole text selected, so typing replaces a name set in `create`. Focus returning to a window that is already open selects nothing and leaves the caret where it was. Closing the active window moves the focus into the next active window, else to the closed window's icon. A title-bar press activates a window without moving the focus, so focus left in the previous window follows the active one.
- `zoom` on `open()` or `adopt()` gives a window its zoom box: `(area, box) => box`, its zoomed box on the window area, given its current box so it can keep its top-left. The window manager runs the box: a press takes the window to its zoomed box, clamped like every placement, and the next back to the box it had, kept as a pin so it lands right after a screen resize. A zoomed window stays zoomed across a resize. `windows.zoom(win)` runs the same toggle, for a menu command. A window without `zoom` leaves its `vf-zoom` to its application.
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

The catalog is the source of truth for what is where. It is pure: it runs under Node, from `vintage-frames/shell/pure` (§ Pieces on their own), and the shell's unit tests run it there.

- The Trash and a startup disk are volumes: containers with no record, listed first, each if the site wants one (`volumes: { trash: 'Trash', disk: 'Macintosh HD' }`). A volume can't be renamed, moved, copied or removed, and nothing is made in the Trash. Deleting is a move into the Trash. Only Empty Trash removes. The System Folder and its folders are kept the same way, listed after the volumes (§ The System Folder).
- A folder never goes into itself or a folder inside it. New folders are "untitled folder", then "untitled folder 2". Copies are "Name copy", then "Name copy 2". Aliases are "Name alias", then "Name alias 2".
- An item whose kind no application registers is kept in storage and left out of the listing.
- Storage is three calls: `list()`, `put(item)`, `remove(id)`. `memoryStorage()` forgets on reload and `indexedDbStorage(name)` keeps. A site can write its own. Without working storage the catalog lists the volumes and the System Folder alone, and the Finder says so when asked to save.
- A seed is stored once per storage. `seed: 'markup'` reads the `vf-icon[data-app]`, `template[data-folder]` and `template[data-system]` in the desktop's field (§ The Finder); a function stores the site's defaults through the catalog.
- Positions are on the items, so they persist wherever the catalog does. Position changes are written a moment after they settle.
- Selectors: `childrenOf`, `itemCount`, `isInside`, `enclosingFolders`, `isTrashed`, `isKept`, `descendantsOf`, `nextFolderName`, `copyName`, `aliasName`, `originalOf`, `resolve`, `canAlias`, `dropTargetOf`, `appleMenuItemsOf`, `appleMenuOf`, `startupItemsOf`. Operations: `create`, `rename`, `update`, `move`, `place`, `copy`, `emptyTrash`, `clear`, `import`, `dump`.
- `import(archive, { mode })` restores a `dump()`. `'replace'` clears the catalog first and keeps the archive's ids; `'merge'`, the default, adds the archive under fresh ids, nesting kept. It resolves a `Map` from each archive id to the item it stored, so a kind whose payload is keyed by item id can carry it over a merge. The listing is announced once, when the import is done, so a window whose item comes back stays open.

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

The shell registers two kinds itself. `app` is an application's icon, which opens the application. It takes its name and art from the application, keeps a name the markup gives it, and can't be renamed. Its `data` names the application, `{ app: id }`. A seed function stores one as `catalog.create({ kind: APP_KIND, name, parent, data: { app: id } })`, and `appIdOf(item)` reads the id back, or null. Both names come from either entry.

`alias` is an item standing for another: an application, a document, a folder or the startup disk. Its `data` names the original and the original's kind, `{ original: id, kind }`, and `originalOf(item)` reads the id back, or null. An alias with no `kind` is read as an application's or a document's, the only aliases there were before aliases kept one. `resolve(state, id)` is the item an id names, or the original an alias stands for, wherever it was moved and whatever it was renamed, through an alias of an alias too; null once the original is removed. The Finder draws an alias with its original's art and its name in italics, and opening it opens the original: an alias of a folder or the disk opens the original's window. Copying an alias makes another alias of the same original, trashing one leaves its original alone, and `import()` keeps an alias pointing at its original when the import gives items new ids.

`canAlias(state, id)` is Make Alias's rule: anything outside the Trash whose original is there, never the Trash itself. `dropTargetOf(state, id)` is what a drop onto an item files into. A container and an alias of one give `{ folder }`, the container's id, so filing judges the original, and a folder never goes into itself or a folder inside it through an alias either. An alias of a container whose original is gone gives `{ missing }`, the alias: it takes the drop, files nothing and says so. Anything else gives null.

### The System Folder

A site that names the System Folder has one:

```ts
finder({
  // …
  system: { folder: 'System Folder', appleMenu: 'Apple Menu Items', startup: 'Startup Items' },
})
```

The catalog keeps it on the startup disk, or on the desktop without one, with Apple Menu Items and Startup Items inside. Each has an id (`SYSTEM_FOLDER`, `APPLE_MENU_ITEMS`, `STARTUP_ITEMS`) and the site's name for it. Like a volume, each is never renamed, moved, copied or trashed, and a storage seeded before the setting has them at once. What they hold is anyone's, and it drives the desktop:

- **Apple Menu Items** is the Apple menu. Below the page's own items, the shell lists what the folder holds, by name, case aside and a leading space first, and follows the folder as it changes. A folder in it, or an alias of a folder or the disk, is a submenu of what that folder holds, in the same order, and a folder in that is a submenu in turn, five levels down (`appleMenuOf`). A folder already on the way down, an empty folder and one past the fifth level are entries. Choosing an entry opens its item as a double-click would: an alias opens its original, and a folder opens its window. A submenu's own entry is never chosen: it opens the submenu. Each entry's `value` is its item's id. Entries are dropped while a modal dialog is open.
- **Startup Items** opens at startup. Once the boot has reopened the session's windows, the shell opens what the folder holds, by name, each as a double-click would. One already open comes to the front. One that won't open, an alias whose original is gone say, says why, as opening it by hand would, and the rest open. `startup: false` on `createShell` skips them for a boot.

`appleMenuItemsOf(state)` and `startupItemsOf(state)` list each folder's contents in that order, and nothing without the System Folder. `appleMenuOf(state)` is Apple Menu Items as a tree of `{ item, entries? }`, the tree the shell builds the Apple menu from. A folder in it, or an alias of one, carries what the folder holds as `entries`, in the same order, and so on down to five levels. A folder already on the way down, an empty folder and one past the fifth level carry none, so the tree never loops. `item` is the entry's own: an alias stays the alias. A seed files into the folders as into any folder:

```ts
const notePad = await catalog.create({ kind: APP_KIND, name: 'Note Pad', data: { app: 'note-pad' } })
await catalog.create({ kind: ALIAS_KIND, name: 'Note Pad', parent: APPLE_MENU_ITEMS, data: { original: notePad!.id, kind: APP_KIND } })
```

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
| `art` | `folder`, `trash`, `trashFull` and `document` (32×32) are required; `disk`, `systemFolder`, `appleMenuItems`, `startupItems` and `caution` (32×32) and `trashMark` (12×12) are optional. The disk and the System Folder's three take the folder's art without their own; without `caution` the alerts have no art. |
| `volumes` | Default: the Trash alone. |
| `system` | The System Folder, named: `{ folder, appleMenu, startup }` (§ The System Folder). Default: none. |
| `seed` | `'markup'`, or a function. It runs once the desktop and its menu bar have rendered, so it can read `desktop.workArea`. |
| `lattice` | `{ desktop, folder }`: each a cell size, column and row pitch and insets. Default 64px cells, 80px columns, 72px rows, 16px insets. |
| `cleanUpAfterResize` | Clean Up the desktop once a resize settles with icons overlapping. Default `false`. |
| `commands` | Switch commands off: `{ 'empty-trash': false }`. |
| `dialogs` | The site's dialogs for the Finder, each with a `data-dialog` name, held by it (§ Dialogs). |
| `extend(finder, ctx)` | Add the site's own commands, and answer the Finder's alerts. |
| `window` | A folder window's size. Default 320 × 223: three columns and two rows of icons. |

- Icons are the catalog's: the desktop shows the desktop's items and each open folder window shows its folder's. An item without a position takes its container's next free cell. The desktop's cells run down from its top right, below the menu bar. A folder's run in rows from its top left. The Trash starts in the desktop's bottom-right corner.
- `seed: 'markup'` makes an application icon of each `vf-icon[data-app]` and a folder of each `template[data-folder="Name"]`, a folder's inside it, and files what a `template[data-system]` holds in that folder of the System Folder: `<template data-system="apple-menu-items"><vf-icon data-app="note-pad"></vf-icon></template>` puts Note Pad in the Apple menu. Its value is the folder's id, `system-folder`, `apple-menu-items` or `startup-items`, and without a `system` setting it files nothing.
- An alias is drawn with its original's art and its name in italics (`vf-icon`'s `alias`). Opening it opens its original, and a drop onto an alias of a folder or the disk files into the original. With the original removed, opening it says the original couldn't be found, and so does a drop onto an alias of a folder, which keeps the folder's art and files nothing.
- File → Make Alias makes an alias of each selected application, document, folder or disk, an alias's alias standing for the same original, named "Name alias", in the free cell nearest it. Never one of the Trash or anything in it. The new aliases are selected.
- Every move goes back onto the item: a drag, an arrow-key nudge, Clean Up, the resize rule.
- A press anywhere in the desktop's field, on an icon or not, brings the Finder forward. The selection survives a switch to another application and back.
- Folder windows are made on open and removed on close. Each shows its item count, with the trash mark when it is in the Trash, and its scrolled content grows to hold its icons.
- An icon is drawn open while its window is, until the window has closed into it. An application's icon is drawn open while the application has a window.
- Opening one of several selected icons opens them all.
- Filing: a drop onto a folder icon files into that folder at its next free cells, and a drop onto an alias of one into the original, judged there. A drop into a folder window lands where the icons were let go, and so does a drop out of a window onto the desktop. The folder under the pointer is highlighted. A drop over another application's window moves nothing.
- Renaming goes to the catalog. A name that is too long or empty gets an alert.
- A file dropped on the desktop or in a folder window brings the Finder forward, as a press does.
- Copy puts the selected items' names on the system clipboard, with a file from the first kind that exports one. Paste copies what the Finder copied, while the system clipboard still holds those names or can't be read. Otherwise it offers the clipboard's files to the kinds' `claim`. A file dropped on the desktop goes the same way, into the folder window under it.
- Clean Up moves each icon of the active window, or the desktop, to the free cell nearest it, one at a time. Icons past the last cell share it. The desktop's icons follow the screen's edges on a resize. With `cleanUpAfterResize`, overlapping icons are cleaned up once the resize settles.

| Menu | Commands |
| --- | --- |
| File | Open ⌘O, New Folder, Close ⌃W, Make Alias ⌘M |
| Edit | Copy ⌘C, Paste ⌘V, Select All ⌘A |
| View | Arrange Windows ⌘J |
| Special | Clean Up Desktop or Clean Up Window, Empty Trash… |

A command is disabled while it has nothing to act on: Open and Copy with nothing selected, Close with no folder window active, Make Alias with nothing selected it takes (only the Trash, what is in it, or aliases whose originals are gone), New Folder and Paste in the Trash, Empty Trash with the Trash empty, Arrange Windows with every window in place. Open, Copy, Paste, Select All and Make Alias are also disabled while a text field has focus, so the field keeps its own keys.

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
| `storageReady()` | Whether storage answers. When it doesn't, it raises Storage Unavailable, answered by the site's `alertWith` handler where there is one, and returns `false`. A site's own command that saves calls it first, so every save says the same thing. |

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
| `storage-unavailable` | New Folder, Paste, a dropped file or `storageReady()`, without storage | none | none |
| `name-too-long` | A rename past the limit | `{ limit }` | none |
| `name-rejected` | A rename to nothing | none | none |
| `move-failed` | A filing storage refused | `{ error }` | none |
| `original-missing` | Opening an alias whose original is gone, or a drop onto an alias of a folder whose original is gone | `{ alias }`, the alias's item | none |
| `failed` | New Folder, Empty Trash, Paste, Make Alias or a dropped file failed | `{ action, error }`: `'new-folder'`, `'empty-trash'`, `'paste'`, `'make-alias'` or `'add-file'` | none |

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
| `pinOf`, `pinTo`, `frameOf`, `cascadedBox`, `centeredBox`, `desktopLattice`, `folderLattice`, `trashCell`, `nextFreeCell`, `freeCellNear`, `cleanUp`, `fillOrder`, `fieldExtent`, `collisions` | The geometry, pure: boxes and positions in whole system px. |
| `localStorageState`, `readSession`, `mergeSession` | The saved session. |
| `startClock` | The clock. |
| `readAppFile`, `inspectAppFile`, `satisfies`, `compareVersions`, `appRuns`, `APP_FILE_FORMAT`, `APP_API`, `APP_API_OLDEST`, `BOX_SCALE` | An app file's manifest and code, or why it isn't one; a version checked against a range, and versions put in order; whether this kit runs an application, and the app API levels it runs; the scale every box is drawn at ([APP-FILES.md](./APP-FILES.md)). |
| `VERSION` | The kit's version. |

`vintage-frames/shell/pure` exports the catalog, the geometry, the saved session, the app file reader and `VERSION` alone. They import nothing of the kit and touch no DOM when imported, so a site's own pure modules, and their tests under Node, import them from there:

```ts
import { createCatalog, memoryStorage, childrenOf, isPin, cascadedBox } from 'vintage-frames/shell/pure'
```

`vintage-frames/shell` exports the same names.

## The reference page

`shell.html` runs the shell with the Finder and Note Pad, a small application with documents of its own kind, an Info palette, a close that asks about unsaved changes in an alert of its own, and a `claim` that makes a note of a dropped text file (`demo/shell.ts`). Its System Folder sits on the desktop, and its Apple Menu Items holds Note Pad. `?save=1` keeps the catalog and the session across reloads, `?cleanup=1` turns on Clean Up after a resize, and `?open=Projects&open=Archive` opens those items at load. `verify:shell-front`, `verify:shell-windows` and `verify:shell-finder` drive it, and `verify:shell-unit` tests the pure modules and the build entry under Node.
