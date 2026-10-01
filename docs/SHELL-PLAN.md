# Shell plan

**Status (2026-10-01):** every decision taken (Adam, 2026-10-01; § Decided).
Built in this repo, not yet released: step 0's ten kit fixes, the shell
(steps 1–3, 5 and 6) and the docs (step 8, [SHELL.md](SHELL.md)). Left:
the releases and moving the sites (steps 4 and 7), in the sites' repos once
a version is published. Delete this doc when the sites run on the shell, as
with the earlier plans.

The ask: _"i wonder whether we might consider creating a common utility -
perhaps an export of vintage-frames kit, that provides a robust desktop
environment, so that we can build things like this without having to
re-implement the well established interaction patterns that are not currently
formally codified in the kit components themselves..."_

The short version: the System 7 shell (applications, a window manager, a menu
bar that shows the front application's menus) and the Finder (icons, folders,
filing, Clean Up) become a second entry point of this package,
`vintage-frames/shell`. It merges the three sites' copies, which have drifted,
and takes most of its code from system-online's. sprite-machine's editor, the
most demanding application, checks the window manager's design from the
start. Fixes to the elements come first and remove the workarounds every copy
carries. The elements keep their contract: they draw and report, and gain no
policy.

## Where things stand

[FINDER.md](FINDER.md) sets the line: _the kit draws and reports; the page owns
the catalog and decides what every gesture means._ Three sites have each
written the deciding half:

| Site | Shell and Finder | Language | A closed window | Library | Saved state |
| --- | --- | --- | --- | --- | --- |
| sprite-machine | 3,350 lines (2,260 of code) | JS | removed; its palettes hide | IndexedDB: documents (PNG bytes in the record), folders, text files; the Trash | localStorage, version 4 |
| system-online | 3,030 (2,230) | TS | removed | IndexedDB: folders, text files, fonts; Macintosh HD, the Trash | localStorage, version 1 |
| portill.io | 1,630 (930) | JS | hidden | none: the DOM is the model, `index.html` the seed | none; a reload resets |

All three have the same application model (a registry, one directory per
application, the front application's menus swapped onto the bar) and the same
filing recipe. The rest has drifted:

- **Window managers.** system-online's is sprite-machine's in TypeScript. Its
  `policy`, `keep`, frame bands, arrange groups and `beforeFront` exist for
  sprite-machine's editor; system-online never calls them. portill.io's is
  smaller: closed windows hide, it repairs activation itself, and it uses
  sprite-machine's older nine-slice rule, with no top reserve and no size
  floor.
- **Lattices and Clean Up.** system-online and sprite-machine share one: 80 px
  columns, and Clean Up searches outward from each icon's cell. portill.io
  wrote its own: 96 px columns, insets on both sides, and the icon nearest a
  cell takes it first.
- **Gates.** system-online tracks text focus with `focusin` and `focusout`.
  portill.io reads it at each check, since a rename's field can leave the DOM
  without a `focusout`.
- **Behavior.** The sites disagreed on which presses bring the Finder forward,
  on whether an application switch clears the selection, and on Clean Up after
  a resize. All three are now decided (§ Decided).
- **Fixes stay where they're made.** system-online re-reads a window's pin
  after a grow, "or its far edge would jump"; portill.io doesn't.
  system-online's next free cell skips the icon being placed; sprite-machine's
  counts it.

system-online was ported from sprite-machine on 2026-09-27. portill.io took
its nine-slice rule from sprite-machine and wrote its own lattices on
2026-09-28; its window manager and menu bar came from system-online in
October.

Copying has costs:

- **The copies drift**, as above, and a fix in one copy reaches neither of the
  others.
- **Kit asks never reached the kit.** All three sites bridge the selection
  across a menu-bar press, restate the window's chrome to size a folder's
  scrolled content, and set `pattern="white"` to cover an inherited pattern.
  sprite-machine and system-online mirror the grow floor. system-online's plan
  recorded the bridge and the floor as asks of the kit.
- **Two stock applications exist twice.** Desktop Patterns and the Text Viewer
  are in both sprite-machine and system-online. They stay in each site for
  now (§ Decided).
- **The kit lost its hardest grid target.** KNOWN-BUGS #2: `verify:grid` and
  `verify:snap` stopped walking a full desktop when it moved out.

## The line between elements and shell

Elements draw and report. The shell decides, with defaults a page can change.
The test for any behavior: if System 7 did it whatever the application, it
belongs in the element. If it's a choice a page could reasonably make
differently, it belongs in the shell.

A page can use the elements alone, as today. It can take the shell's pieces à
la carte (the geometry, the filing controller), or run the whole shell.
FINDER.md stays as the from-scratch path.

## Kit fixes first

These don't depend on the shell, so step 0 can start now. Each one removes
code from the sites, and each ships as an ordinary kit change with its own
verify coverage.

1. **A press outside the Finder's surfaces keeps the selection.** `vf-icon`'s
   outside-press listener clears the selection on any press outside an icon:
   the menu bar, a menu, a dialog, another application's window. So File →
   Open finds nothing to open, and an application switch drops the selection,
   which should survive it (§ Decided). Every site notes the selection in a
   document capture listener and re-selects it later in the same dispatch.
   The new rule, for an icon in a field: only a press on an icon or on a field
   changes the selection. Any other press leaves it, though it still cancels a
   pending rename and a half-finished tap pair (`vf-icon.ts:2176`). An icon
   outside any field keeps today's rule. FINDER.md § Selection changes with
   it. `verify:icon`.
2. **A hidden window never holds the active state.** `vf-desktop` activates a
   newly slotted window even when it is hidden. It promotes the topmost
   survivor by z-index without looking at `hidden`, and a window that hides
   keeps the state. The kit's own recipe hides closed windows (FINDER.md
   § The page), and portill.io's two activation repairs work around exactly
   this. Watch the `hidden` attribute on slotted windows, since a page can set
   it directly; `hide()` telling the desktop isn't enough. Skip hidden windows
   when activating and promoting. Hiding the holder promotes the topmost
   visible window, or none. `verify:desktop-activate` gains a HIDDEN group.
3. **The work area below a menu bar.** No element knows the menu bar's height.
   A window drag is clamped to the screen, so a window dragged up ends with its
   title bar under the bar, where it can't be grabbed, and a desktop icon can
   be dropped there too. portill.io clamps after the drop; system-online and
   sprite-machine clamp only the placements they write. The desktop should
   expose its work area (the screen less a slotted `vf-menu-bar`) and clamp
   window drags and desktop-field drops to it. A page can deepen it for
   windows: sprite-machine keeps them 56 px down, clear of its options strip,
   which sits over the windows, while its icons stop at the bar. FINDER.md
   § Clean Up, which leaves the bar's floor to the page, changes with it.
   `verify:window`, `verify:icon-drag`.
4. **Report a window's size limits and chrome.** The grow floor (80 × 54)
   isn't exported, so system-online and sprite-machine mirror it for the
   resize rule, which then ignores a window's own `min-width` and
   `min-height`: sprite-machine's 3D View declares 185 × 160 and restates it as
   a resize policy. All three sites restate a window's chrome
   (`1 + 18 + 20 + 15 + 1`) to size a folder's scrolled content, with a comment
   to re-derive it if the kit's chrome changes, and sprite-machine sizes five
   utility windows from their content the same way. Export a read of a
   window's effective size limits, and one function that returns a window's
   chrome insets for its declared options (variant, scrollbars, header
   height, status strip), usable in both directions. TOOLKIT.md.
5. **A rename across a node move, if it reproduces.** A rename ends when the
   desktop's order sync moves its icon's window. The only trigger seen is
   portill.io's New Folder: it appends a hidden window, and the sync then
   moves the window holding the rename. With closed windows removed, New
   Folder appends no window, so reproduce it first. The cause: the field commits on blur
   (`vf-icon.ts:1828`), and the move can blur it even though the sync puts
   focus back afterwards (`vf-desktop.ts:849`). If it reproduces, fix it in
   `vf-icon` so a blur the same task undoes commits nothing, rather than by
   skipping the sync. `Element.moveBefore()`, where the browser has it, keeps
   focus through a move. `verify:icon`.
6. **An unpatterned box paints an inherited pattern** (system-online's plan,
   ask 3). The code confirms it: `.vf-pattern-fill` reads
   `--_vf-pattern-image` whether or not the box is `.vf-patterned`
   (`pattern-fill.ts:87`), an unpatterned box removes the property instead of
   resetting it (`tile-grid.ts:279`), and the property is unregistered, so a
   bare `vf-container` in a window paints the desktop's tile. Move
   `background-image` under `.vf-patterned`. Every site then drops its
   `pattern="white"`; sprite-machine has four. `verify:pattern`.
7. **`vf-placement-change` becomes public.** It fires on every placement
   write, a window drag's release included, and portill.io already listens for
   it to clamp below the bar. system-online and sprite-machine still infer a
   drag's end from `pointerup` plus a task, on the belief that a title-bar
   drag fires no event. SPEC and LAYOUT call it internal; document it as
   public. `verify:position`, `verify:window`.
8. **The desktop exposes its stacking order.** portill.io picks the next
   active window by DOM order, and system-online saves each window's depth by
   DOM order. The desktop doesn't re-sync DOM order after a raise by keyboard
   focus, so both can be wrong. Expose the windows in stacking order.
   `verify:desktop-activate`.
9. **A trailing slot on `vf-menu-bar`.** All three sites place the clock with
   the same page CSS: an auto start margin, a 9 px inset and a 20 px line
   height. A slot for the bar's right end does this in the kit, and the shell
   can put the clock there without writing styles.
10. **A focus mark for a page's own focusable kit elements** (system-online's
    plan, ask 4). system-online's Desktop Patterns cells are
    `vf-container role="radio"` and draw the browser's focus ring rather than
    the kit's. `verify:focus`.

## The shell

### Shape

`vintage-frames/shell` is plain modules and controllers, in the idiom of
`DragController` and `PlacementController`, with no new elements. The
application registry, the menus and the catalog are code, so an element
holding them would only wrap a function call.

```ts
import 'vintage-frames'
import { createShell, defineApp, finder, memoryStorage } from 'vintage-frames/shell'

createShell(document.querySelector('vf-desktop')!, {
  apps: [finder({ storage: memoryStorage(), seed: 'markup', art }), spriteMachine],
  fit: 'viewport', // fitWithin() on resize and onScaleChange
  state: null, // or localStorageState('system-online')
})

export const spriteMachine = defineApp({
  id: 'sprite-machine',
  name: 'Sprite Machine',
  icon: spriteMachineArt,
  menus: FILE_CLOSE_QUIT,
  init: ({ windows }) => ({
    open: ({ from }) =>
      windows.open({ item: 'app:sprite-machine', from, create: cloneAboutWindow }),
  }),
})
```

| Module | Holds | From |
| --- | --- | --- |
| `geometry` (pure) | the nine-slice pin and frame, the cascade, `centeredBox`, `nearBox`, the icon lattices, Clean Up, the first free cell | system-online `shell/layout.ts` and `apps/finder/layout.ts`, the lattice's pitches and insets made options |
| `windows` | adopt, open and close, palettes, the close hook, placement, saved and remembered pins, the front application, the active-state handoff, focus, Arrange Windows, the resize rule | system-online `shell/windows.ts`, whose `policy`, `keep`, frame bands and arrange groups serve sprite-machine's editor; portill.io's `isOpen` |
| `apps`, `menu-bar` | `defineApp`, the registry, the menu swap, the system menu, gates, the alert, the clock | system-online `shell/menu-bar.ts`, `shell/clock.ts`; portill.io's gates and its single-window application (`promoApp`) |
| `catalog` (pure core) | the tree model, its selectors and operations, the kind registry, storage adapters, seeding | the tree algorithms system-online and sprite-machine share in `state/files`; portill.io's markup seed |
| `finder` | the stock Finder application | system-online `apps/finder/`; portill.io's Clean Up after a resize, as an option |
| `state` | the saved session and reopening it | system-online `shell/desktop-state.ts`, `boot/restore.ts` |

### Applications

```ts
interface AppDefinition<Actions> {
  id: string
  name: string // the bar's accessible name while the application is front
  icon?: string // its art, for the Finder's icon of it
  menus?: string // a fragment of vf-menu elements
  kinds?: Record<string, KindDefinition> // the catalog kinds it opens
  init(ctx: AppContext): Actions // what other applications may call
}
```

- The bar holds the system menu, the front application's menus, then the
  clock in the bar's trailing slot (fix 9). The system menu is the page's
  markup, with the page's label and art: the Apple menu in system-online and
  portill.io, "Sprite Machine" in sprite-machine. Applications install their
  items in it.
- Each application's menus are parsed once. The front application's go on the
  bar after the system menu, and the same nodes come back each time, so items
  keep their state. A menu off the bar has no key equivalents, so only the
  front application's fire. The bar's label is the front application's name.
- `ctx` holds the desktop, the window manager, the application's own menus,
  the system menu, other applications' actions (read at the call), the
  catalog when a Finder runs, the site's own services (sprite-machine passes
  its ring renderer and model exporter), `alert()`, `gate()`, `onFront()` and
  `onDispose()`. Everything an application sets up comes down through
  `onDispose()`, so a hot reload starts clean.
- `gate(item, test)` keeps an item disabled while it has nothing to act on.
  The test runs again on every press, key, selection change and activation.
  Text focus is read through shadow roots at the time of the check, since a
  rename's field leaves the DOM without a `focusout` (portill.io's model).
- Keys outside the menus, and page chrome that belongs to one application,
  follow it with `onFront()`: sprite-machine's tool keys and its options
  strip.
- Key-equivalent conventions: ⌃W, ⌃Q and ⌃N where the browser keeps ⌘W, ⌘Q
  and ⌘N.

### Windows

- Every window has an application and, optionally, an item: a catalog id, or
  an application's own key. A window's item can change: an untitled document
  gets one at its first save and loses it when Empty Trash removes it.
- `adopt(win, { app, item, place, pin, policy, keep })` takes a window the
  application made and appended. It is public: sprite-machine's editor builds
  its windows from its own store and needs it.
- `open({ app, item, create, from, place })` raises the window for that item
  if one is open. Otherwise it creates, appends, adopts and places one, and
  shows it out of `from`. `close(win, { to })` hides the window into `to`,
  then releases and removes it (decided). `to` defaults to the item's home
  box, which the Finder provides: its icon, or the nearest open folder around
  it. So no application calls the Finder to close.
- **An item window follows its item.** Its title follows a rename, and it
  closes when the item is removed. The Finder, the Text Viewer and the Font
  Viewer each do both by hand today.
- **The close box asks the application.** `vf-close` goes to the window's
  application, which may refuse or wait: sprite-machine asks to save changes,
  then for a name. `close()` is what it calls once it decides. Quit closes the
  application's windows the same way.
- **Palettes** are an application's utility windows, shown while it is front
  and hidden otherwise, never closed or removed. An application can also hide
  one for its own reasons (sprite-machine's Atlas has a preference). Their
  boxes are saved without a depth (§ Saved state).
- **Placement**, in order: this session's pin, then the saved pin, then the
  `place` policy. The default policy is the first cascade slot no open window
  holds, from an origin below the bar (system-online's). An application can
  pass its own: sprite-machine's documents cascade among themselves from their
  own box. The result is clamped into the work area (fix 3), deepened for
  windows when the site asks.
- The front application is the active window's, or the default application
  while none is active. `beforeFront` runs before a change, and `onFront`
  reports it. Closing the active window hands the state to the frontmost
  window left, or to none.
- **Focus.** Opening a window moves keyboard focus into it. Closing the active
  window moves focus to the window that becomes active, else to the closed
  item's icon, else to the desktop's field. No site does this today, and a
  keyboard user who closes the front window with ⌃W ends up on `<body>`.
- **The resize rule** re-pins every window with the nine-slice pin, re-reads a
  resizable window's pin when its size changed, floors it at the window's own
  size limits (fix 4) and caps it to the work area, so growing back restores
  every place. `onRaster` passes the change on to the Finder's icons.
- **Arrange Windows** (View, ⌘J) is optional: it re-applies each window's
  placement and is greyed while every window is at its own. An application's
  arrange group can say what counts as arranged and what ⌘J does next
  (sprite-machine's editor then zooms the front document).
- `isOpen(item)` holds until a closing window's zoom rects land (portill.io's),
  and `onWindows` reports changes. That's what the Finder's open ghost
  follows.

### Catalog

The formal model: pure, testable under Node, and the source of truth for what
is where.

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

interface KindDefinition {
  art: string | ((item: Item) => string)
  open(item: Item, from: VfViewportBox | null): void
  editable?: boolean // renameable in place; true by default
  size?(item: Item): number // bytes, for Empty Trash's alert
  copy?(from: Item, to: Item): Promise<void> // its payload, when the Finder copies an item
  onRemove?(item: Item): void | Promise<void> // Empty Trash
  claim?(file: Blob, parent: string | null): Promise<boolean> // makes an item of a pasted or dropped file
  export?(item: Item): Promise<Blob | null> // the item on the system clipboard
}
```

- **Volumes** are containers with no record, listed first: the Trash and a
  startup disk, each if the page wants one (portill.io has neither). Neither
  can be renamed, moved, copied or removed, and nothing is made in the Trash.
  Deleting is a move into the Trash; only Empty Trash removes.
- **Rules:** a folder never goes into itself or a folder inside it. New folders
  are named "untitled folder", then "untitled folder 2", and copies "Name
  copy", then "Name copy 2". An item whose kind no application registers is
  left out of the listing but kept in storage.
- **Selectors and operations:** `childrenOf`, `itemCount`, `isInside`,
  `enclosingFolders`, `isTrashed`, `descendantsOf`, `nextFolderName`,
  `copyName`; then create, rename, move (a set, with landings), place, copy,
  Empty Trash, clear and import.
- **Storage** is an adapter of three calls (list, put, remove) over item
  records, which stay small because payloads live in each application's own
  store. `memoryStorage()` forgets everything on reload (portill.io), and
  `indexedDbStorage(name)` keeps it. A site can write its own. Saving is
  always the site's choice (§ Decided): any seed works with any storage, and
  a persistent storage stores the seed once, so a site that starts in memory
  can start saving by switching its storage. Nothing is migrated (§ Decided):
  each site's catalog starts fresh.
- **Seeding:** `seed: 'markup'` reads `<vf-icon data-app>` and
  `<template data-folder>` from the desktop's field, as portill.io does today.
  A function seed stores a site's defaults once, as system-online's `seeded`
  does.
- **Payloads** (decided): a kind keeps small data in `data`. A large payload
  stays in the application's own store, keyed by item id. sprite-machine's PNG
  bytes move there, and the catalog's name becomes the document's name.
  `copy` and `onRemove` keep the store in step with the catalog.
- **Positions** are on the item (decided), so they persist with the catalog
  wherever it persists. The resize rule moves every desktop icon on each
  resize event, so position writes are debounced.
- **The `app` kind**, which the shell registers, is an application's icon: it
  takes its name and art from the application, and opening it calls that
  application's `open`. It isn't renameable, and it keeps a name the seed's
  markup gives it. portill.io's promos are this.

### The Finder

`finder(options)` returns an application.

- **Icons** are reconciled from the catalog into each container's field: the
  desktop's, and that of every open folder window. They cover one selection
  across fields, rename in place, opening, the open ghost, and the home box
  windows close into.
- **The desktop brings the Finder forward.** Any press in the desktop's field,
  on an icon or on the bare desktop, clears the active window (decided).
  FINDER.md's recipe, which leaves icon presses out, changes with it.
- **The selection survives an application switch** (decided). Fix 1 provides
  it; the shell adds no bridge.
- **The lattices** are system-online's, with the pitches and insets as options
  so portill.io keeps its 96 px columns (decided). The desktop's runs down
  from its top right below the bar, and a folder's runs in rows. New items
  take the next free cell. Clean Up searches outward from each icon's cell,
  and icons past the last cell share it. Desktop icons re-pin by the nine-slice rule on a resize.
  **Clean Up once a resize settles** with icons overlapping is an option,
  off unless the site turns it on (portill.io does).
- **Folder windows** are created on open and removed on close. Each has the
  item count in its header (with the Trash's mark), a field sized to the
  scroll range from the chrome insets (fix 4), and a remembered pin.
- **Filing by drag** is also exported alone. A drop onto a folder icon files
  into the folder; a drop into a folder window lands at the drop points; a
  drop out of a window lands on the desktop. The folder under the pointer
  wears `target`. A folder never goes into itself, and a drop over another
  application's window moves nothing.
- **Menus:**
  - File: Open ⌘O, New Folder, Close ⌃W
  - Edit: Copy ⌘C, Paste ⌘V, Select All ⌘A
  - View: Arrange Windows ⌘J
  - Special: Clean Up Desktop or Window, Empty Trash…

  Their gates cover system-online's: Open and Copy with nothing selected,
  Close with no folder window front, New Folder and Paste in the Trash, Select
  All while typing, Empty Trash with the Trash empty, and Arrange Windows. A
  site switches off the commands it doesn't want, and adds its own, with a
  handler and a gate, through an extension hook. system-online's Restore
  Default Files and Back Up All Files… would use it.
- **Copy and Paste:** Copy puts the selected items' names on the system
  clipboard, with whatever their kinds export. Paste copies items copied in
  the Finder, and offers a pasted file to the kinds' `claim`. A file dropped
  on the page goes the same way.
- **Art** is required in the options (decided): a folder, the Trash empty and
  full, and a generic document.
- **Alerts** go through `alert()` with the site's caution art: Empty Trash's
  count and the space it frees (from the kinds' `size`), and a name too long
  or empty (`vf-name-too-long`, `vf-name-rejected`, which no site answers
  today).

### Saved state

`localStorageState(key, { extra })` keeps one versioned key:

- each window's pin and its depth, from the desktop's stacking order (fix 8),
- the active window's item,
- the desktop pattern,
- the site's own keys, such as system-online's `greet` and `seeded`.

A palette's box is saved without a depth, so a reload never reopens it as a
window. Writes are debounced, and held until the boot has reopened the
session. Windows reopen deepest first, the active one last. `?fresh=1`
neither reads nor writes. With `state: null` nothing persists and a reload
resets (portill.io today); a site turns saving on by passing a state. Nothing
is migrated from a site's own blob (§ Decided).

### What stays in each site

- its applications: portill.io's promos, system-online's Font Viewer,
  sprite-machine's sprite editor
- its kinds and their payloads
- its services, such as sprite-machine's ring renderer and model exporter
- page chrome that belongs to one application, such as sprite-machine's
  options strip
- its art
- what its menus hold, and its extra commands
- its seed
- its startup curtain and About box
- its backup format

### Constraints carried from the kit

- **No global CSS ships.** The shell writes no styles: the clock goes in the
  bar's trailing slot (fix 9). The apple's nudge depends on the art, so it
  stays the page's.
- **No raster ships.** The shell never invents art; every icon's comes from an
  application or the Finder's options.
- **The shell registers no elements** and imports none for side effects. The
  page imports `vintage-frames` first.
- **The shell imports only what `src/index.ts` exports**, checked in the
  suite. Whatever it needs from the kit is exported for every page, which
  keeps FINDER.md's from-scratch path true. The desktop moved out of this
  repo so it would use the same API as everyone else (DEVELOPING.md); the
  shell keeps that.
- **Positions stay in whole system px**, written through `left`/`top` and
  `moveTo`/`dragTo`, never through styles.
- **TypeScript under `src/shell/`**, emitted one file per module like the rest
  of `dist/`. JS sites get the declarations.

## Packaging

- A second Vite lib entry, `src/shell/index.ts`; the build already preserves
  modules. Add `exports["./shell"]` with types from `tsconfig.build.json`. The
  shell's modules have no side effects, so `sideEffects` gains nothing.
- **Same version as the kit.** The shell depends on behavior that moves
  between releases, such as activation and the DOM-order sync, so the two
  release together. It still imports only the package's public exports
  (§ Constraints carried from the kit).
- A breaking change to the shell is a kit minor, and `^0.x` ranges don't take
  minors, so breaking shell changes go out together rather than one by one.
- No elements, so `custom-elements.json` and `editor/*` don't change.

## Tests

- **Pure modules** (the geometry, the catalog, parsing saved state) get unit
  tests, run by `npm test` beside the verify scripts. Port the union of
  system-online's and sprite-machine's tests; sprite-machine's files suite is
  the fuller one (34 tests to system-online's 12). portill.io's lattice tests
  are rewritten against the parametric lattice where they still apply: its
  96 px columns and its insets.
- The kit's sources import `./x.js`, which Node's type stripping doesn't map to
  `.ts`; system-online writes `.ts` specifiers for this reason. Compile the
  pure modules first, as `verify:zoom` does, or settle the specifier
  convention for `src/shell` before porting the tests.
- **Behavior** gets verify scripts in the harness, against a new reference
  page, `shell.html`: a desktop with the Finder, a seed of two folders, and a
  small application with a palette and a document window that asks before it
  closes.
  - `verify:shell-front`: the bar follows the active window; key equivalents
    fire only for the front application; a press on the desktop or a desktop
    icon brings the Finder forward; the selection survives an application
    switch; a palette shows only while its application is front.
  - `verify:shell-windows`: opening from and closing to an icon; the cascade;
    the work area; the resize rule with grow-back; a close the application
    refuses; focus moving into an opened window and on after a close.
  - `verify:shell-finder`: filing onto a folder icon, into a folder window and
    back out; never into itself; New Folder and rename; Clean Up, and after a
    resize when it's on; the ghost.
- **Grid coverage:** `verify:grid` and `verify:snap` walk `shell.html`, which
  closes KNOWN-BUGS #2.

## Steps

Each release is a published kit version. The sites install the kit from npm
and deploy from their repos, so a site moves only onto a published shell.
Publishing is Adam's.

0. **The kit fixes** in § Kit fixes first, released as patches. Each site
   upgrades and deletes its workaround. Fix 5 only if it reproduces.
1. **Scaffold:** `src/shell/`, the entry and export, the public-exports check,
   a stub `shell.html`, the unit-test runner, a stub `docs/SHELL.md`.
2. **Geometry**, from system-online with both sites' tests: the nine-slice
   rule, the cascade, and the lattice and Clean Up, with the lattice's pitches
   and insets made options.
3. **Windows and applications:** the window manager (adopt, open and close,
   palettes, the close hook, focus), the registry, the menu bar with the
   system menu, gates, the clock and the alert. sprite-machine's editor is the
   check: its palettes, document windows, close prompt, deeper work area and
   arrange group must fit before this step ends. `verify:shell-front`,
   `verify:shell-windows`.
4. **Release the core, experimental, and move system-online and
   sprite-machine onto it.** Their Finders, libraries and saved state stay
   theirs for now and run on the core's `adopt`. portill.io waits for step 7:
   its windows are built around hiding, and they change with its Finder.
5. **The catalog:** the tree model, selectors, operations, the kind registry
   and its hooks, memory and IndexedDB storage, and the markup seed, with both
   sites' files tests generalized over kinds.
6. **The Finder and saved state**, from system-online, with portill.io's
   pieces. `verify:shell-finder`.
7. **Release, then move the Finders over:**
   - system-online first, to prove parity: its Text Viewer, Font Viewer and
     Desktop Patterns as applications on the shell, `text` and `font` kinds,
     and `greet` and `seeded` as extras in saved state.
   - portill.io whole, to prove the shell generalizes: a memory catalog, the
     markup seed, no saved state, `app`-kind icons, and closed windows
     removed. Its strike pass runs once at boot and expects the About windows
     to exist, so it moves into their `create`.
   - sprite-machine: its documents as a kind, their PNG bytes in its own store,
     and the catalog's name written into a document's PNG when it's
     downloaded.
8. **Docs and release:**
   - `docs/SHELL.md`, the guide
   - FINDER.md recast as the from-scratch path beside the shell's Finder, with
     fix 1's selection rule and icon presses bringing the Finder forward
   - TOOLKIT, README's storefront section, DEVELOPING's page table
   - KNOWN-BUGS #2 closed

   The shell stays experimental until sprite-machine runs on all of it.

## Decided

By Adam, 2026-10-01:

- **A subpath of this package, `vintage-frames/shell`.** It releases with the
  kit and imports only the package's public exports.
- **Experimental until sprite-machine runs on the whole shell.** Its API may
  change in any minor until then.
- **Closed windows are removed**, and the catalog is the source of truth for
  what a folder holds. A palette hidden while its application is in the
  background isn't closed.
- **A press on a desktop icon brings the Finder forward**, as a press on the
  bare desktop does.
- **Selected icons stay selected when the application switches.** Fix 1
  provides it.
- **Positions are on the catalog item, and a site can always save.** The
  catalog, positions included, persists through its storage, and the session
  through saved state. A site switches either on without changing anything
  else.
- **The lattices and Clean Up are system-online's**, with the pitches and
  insets as options so portill.io keeps its 96 px columns.
- **Clean Up after a resize settles is an option** of the shell's Finder.
- **Finder art is required in the options**, since the kit ships no raster.
- **Stock applications stay in each site.** Desktop Patterns and the Text
  Viewer don't move into the shell. A way to load application packages at
  runtime may come later.
- **Nothing stored is migrated**, since there are no real users yet, and large
  payloads move into each application's own store.

The plan's own ground rules:

- **A layer over the elements, not more behavior in them.** The elements keep
  "draw and report" and gain only the fixes in § Kit fixes first.
- **No elements, no global CSS and no raster** in the shell.
- **The sources:** system-online for most of the shell and Finder, portill.io
  for the pieces § Shape names, and sprite-machine's editor as the check on
  the window manager's design.
