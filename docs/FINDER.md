# Building a Finder

How a page assembles a Finder-style experience — a desktop of icons, folder windows, filing by drag and drop, selection, renaming and opening — from the kit's elements. The kit draws and reports; the page owns the catalog and decides what every gesture means.

## The division of labor

| The kit | The page |
| --- | --- |
| `vf-desktop`: the raster, window stacking, the single active window, the drag surface | Which presses mean "the Finder" (`clearActive()`), the menu bar's commands |
| `vf-window`: the shell, the header and status strips, edge scroll rails, `placementAt()` | What a folder window is, when it opens and closes, what it shows |
| `vf-icon-field`: the listbox, `size`, the rubber band | Which icons are in which field, where each one sits |
| `vf-icon`: selection, the outline drag and its events, renaming, opening | What a drop means, filing, the names and positions in the model |

Every position is whole system px, stored on the model and written to `left`/`top`. Nothing in the kit re-snaps a stored coordinate, so a position saved today renders in the same place at any density.

## The model

Keep the catalog as plain data. Each item has an id, a name, a kind (folder or document), a parent (the desktop or a folder id), a position in its container, and the art for its two sizes:

```ts
interface Item {
  id: string
  name: string
  kind: 'folder' | 'document' | 'trash'
  parent: 'desktop' | string
  left: number   // whole system px, from the container's origin
  top: number
  large: string  // the 32×32 art's URL
  small: string  // the 16×16
}
```

Render an item as an icon; the icon carries the item's id:

```ts
function renderIcon(item: Item): VfIcon {
  const icon = document.createElement('vf-icon')
  icon.dataset.id = item.id
  icon.label = item.name
  icon.width = 64
  icon.selectable = icon.movable = icon.editable = true
  icon.left = item.left
  icon.top = item.top
  icon.innerHTML = `
    <vf-img slot="large"><img src="${item.large}" alt=""></vf-img>
    <vf-img slot="small"><img src="${item.small}" alt=""></vf-img>`
  if (item.kind === 'folder' || item.kind === 'trash') icon.dataset.folder = item.id
  return icon
}
```

`width` is the grid pitch and must be even. The two files both fetch; slot only the size a view uses if that matters.

## The page

One desktop filling the viewport, a menu bar, a field for the desktop's icons, and folder windows as they open:

```html
<vf-desktop id="desktop">
  <vf-menu-bar shortcuts>
    <vf-menu label="File">
      <vf-menu-item value="new-folder" shortcut="⌘N">New Folder</vf-menu-item>
      <vf-menu-item value="open" shortcut="⌘O">Open</vf-menu-item>
      <vf-menu-item value="close" shortcut="⌘W">Close</vf-menu-item>
    </vf-menu>
    <vf-menu label="Edit">
      <vf-menu-item value="select-all" shortcut="⌘A">Select All</vf-menu-item>
    </vf-menu>
    <vf-menu label="View">
      <vf-menu-item value="by-icon" checked>by Icon</vf-menu-item>
      <vf-menu-item value="by-small-icon">by Small Icon</vf-menu-item>
    </vf-menu>
  </vf-menu-bar>
  <vf-icon-field id="desktop-field" label="Desktop" fill-width fill-height></vf-icon-field>
</vf-desktop>
```

Size the desktop from the viewport and keep it sized:

```ts
const desktop = document.getElementById('desktop') as VfDesktop
const fit = () => desktop.fitWithin(window.innerWidth, window.innerHeight)
fit()
window.addEventListener('resize', fit)
onScaleChange(fit)
```

The desktop field is filled, not placed: it stays static, so its icons anchor to the raster and their positions are screen coordinates, and it has a surface to press, which is what the rubber band needs. It sits before the windows in the DOM; placed windows are out of flow and unaffected by it.

A folder window is a `vf-window` holding a field. The header strip carries the item count; the field takes the folder's extent so the window scrolls over it:

```ts
function openFolder(folder: Item): VfWindow {
  let win = document.getElementById(`win-${folder.id}`) as VfWindow | null
  if (win) {
    win.hidden = false
    desktop.bringToFront(win)
    return win
  }
  win = document.createElement('vf-window')
  win.id = `win-${folder.id}`
  win.heading = folder.name
  win.width = 320
  win.height = 201
  win.closable = win.movable = win.resizable = win.zoomable = true
  win.scrollbars = 'both'
  win.left = 60 + 20 * openCount
  win.top = 40 + 20 * openCount
  win.innerHTML = `
    <vf-stack slot="header" fill-width pad="2 8">
      <vf-label data-count></vf-label>
    </vf-stack>
    <vf-icon-field label="${folder.name}" top="0" left="0" width="600" height="400"></vf-icon-field>`
  const field = win.querySelector('vf-icon-field')!
  for (const item of children(folder.id)) field.append(renderIcon(item))
  updateCount(win)
  win.addEventListener('vf-close', () => closeFolder(folder, win!))
  desktop.append(win)
  return win
}
```

Placed at `top="0" left="0"`, the folder's field is the anchor its icons place against, at the plane's own origin, so the window's `placementAt()` and the field's coordinates agree. A field larger than the viewport extends the scroll range; the rails follow a moved icon by themselves.

Closing hides the window rather than removing it, so its state and positions survive; the icon's `open` ghost tracks it:

```ts
function closeFolder(folder: Item, win: VfWindow): void {
  win.hidden = true
  iconFor(folder.id)?.removeAttribute('open')
}
```

## Opening

`vf-open` fires on a double-click anywhere on the icon, on two taps of a finger or pen, or ⌘O / ⌘↓ from the keyboard. Open the folder's window and mark the icon:

```ts
document.addEventListener('vf-open', (e) => {
  const icon = e.target as VfIcon
  const item = itemFor(icon)
  if (item.kind === 'document') return openDocument(item)
  openFolder(item)
  icon.open = true
})
```

The File menu's Open command does the same for the current selection:

```ts
document.addEventListener('vf-menu-select', (e) => {
  const { value } = (e as CustomEvent<{ value: string }>).detail
  switch (value) {
    case 'open':
      for (const icon of selectedIcons()) icon.dispatchEvent(new CustomEvent('vf-open', { bubbles: true, composed: true }))
      break
    case 'close':
      desktop.activeWindow?.dispatchEvent(new CustomEvent('vf-close', { bubbles: true, composed: true, detail: { reason: 'close' } }))
      break
    case 'select-all':
      for (const icon of activeField().querySelectorAll('vf-icon')) icon.setSelected(true)
      break
    case 'by-icon':
    case 'by-small-icon':
      setView(value === 'by-icon' ? 'large' : 'small')
      break
    case 'new-folder':
      newFolder()
      break
  }
})
```

With `shortcuts` on the bar, ⌘N, ⌘O, ⌘W and ⌘A activate the items from anywhere on the page, menu closed or open, and a closed menu flashes its title. A disabled item claims nothing, so a grayed Undo leaves ⌘Z to a field's native undo.

## Selection

The kit's model, per icon, is enough for a Finder:

- A click selects an icon and clears every other selected icon. Shift or ⌘ toggles the clicked icon and leaves the rest.
- A press anywhere outside an icon clears the selection. The desktop field's background and a window body's background are outside every icon.
- Inside a field, a press on an icon that is already selected keeps the whole selection, so a drag from it carries the set. A click on it released with no drag collapses the selection to that icon.
- A drag on a field's background is the rubber band: an icon is selected exactly when it was selected at the press XOR the rectangle touches its art or its name. Shift toggles what the rectangle covers.

Every change fires `vf-select` on the icon, whichever gesture made it. A page that keeps a selection in its own state listens for that:

```ts
document.addEventListener('vf-select', (e) => {
  const icon = e.target as VfIcon
  const { selected } = (e as CustomEvent<{ selected: boolean }>).detail
  if (selected) selection.add(itemFor(icon).id)
  else selection.delete(itemFor(icon).id)
})
```

The page's own writes go through `icon.setSelected(next)` when they should fire the event, and through `icon.selected = next` when they should not.

## The Finder's deactivation

On a real System 7 machine a press on the desktop clicked the Finder, and the frontmost application's windows lost their stripes. The desktop never takes that decision; the page routes the presses it considers "the Finder" through `clearActive()`. With a filled desktop field, those presses have the field as their target:

```ts
desktop.addEventListener('pointerdown', (e) => {
  const path = e.composedPath()
  if (path.includes(desktopField) && !path.some((n) => n instanceof HTMLElement && n.localName === 'vf-icon')) {
    desktop.clearActive()
  }
})
```

Zero active windows is a legal state. A press in a document window, keyboard focus entering one, or a newly slotted window reactivates. `vf-activate` reports every change of holder.

## Dragging and filing

A drag on a movable icon draws the classic dotted outline over the desktop; the icon stays put until the drop. The kit reports the gesture on the dragged icon and the page decides what the drop means:

| Event | `detail` |
| --- | --- |
| `vf-drag-start` | `{ left, top, icons }` |
| `vf-drag` | `{ clientX, clientY, left, top, x, y, icons }` |
| `vf-drop` (cancelable) | the same, at the release |
| `vf-drag-cancel` | `{}` |

`icons` is every icon travelling, the dragged one first. `x`/`y` is the dragged icon's outline in viewport CSS px; each follower's outline is its own box translated by the same delta. The default action of an uncancelled `vf-drop` moves the set within its own container, clamped whole, or held at the origin only in a scrolling plane, whose rails reach the rest. The page cancels that when it files the icons itself.

Hit-test with `elementsFromPoint`, skipping the travelling icons themselves — the outline is never a hit, so what is under the pointer is what the page sees:

```ts
function under(clientX: number, clientY: number, skip: Element[]) {
  const stack = document.elementsFromPoint(clientX, clientY).filter((el) => !skip.includes(el))
  return {
    folder: stack.find((el): el is VfIcon => el.localName === 'vf-icon' && (el as VfIcon).dataset.folder !== undefined) ?? null,
    window: stack.find((el): el is VfWindow => el.localName === 'vf-window' && el.querySelector('vf-icon-field') !== null) ?? null,
    desktop: stack.includes(desktop),
  }
}
```

Under a drag, the folder icon under the pointer wears `target` — the Finder's inverted destination — with no selection semantics:

```ts
let target: VfIcon | null = null
const highlight = (next: VfIcon | null) => {
  if (target === next) return
  if (target) target.target = false
  target = next
  if (target) target.target = true
}
document.addEventListener('vf-drag', (e) => {
  const { clientX, clientY, icons } = (e as CustomEvent<VfIconDragDetail>).detail
  highlight(under(clientX, clientY, icons).folder)
})
document.addEventListener('vf-drag-cancel', () => highlight(null))
```

At the drop, three destinations, each converting a viewport point into the destination's own placement coordinates with `placementAt()`:

```ts
document.addEventListener('vf-drop', (e) => {
  const leader = e.target as VfIcon
  const { clientX, clientY, x, y, icons } = (e as CustomEvent<VfIconDragDetail>).detail
  const hit = under(clientX, clientY, icons)
  highlight(null)
  const from = leader.closest('vf-window')

  // Where each member's outline was: its own box, translated by the delta
  // the leader's x/y carry. Measured before anything moves.
  const lead = leader.getBoundingClientRect()
  const landings = icons.map((icon) => {
    const r = icon.getBoundingClientRect()
    return { icon, x: r.left + (x - lead.left), y: r.top + (y - lead.top) }
  })

  if (hit.folder && !icons.includes(hit.folder)) {
    // Onto a folder icon: into that folder, at the next free cells.
    e.preventDefault()
    const folder = itemFor(hit.folder)
    landings.forEach(({ icon }, i) => file(icon, folder.id, freeCell(folder.id, i)))
    return
  }
  if (hit.window && hit.window !== from) {
    // Into a folder window, where each outline was let go.
    e.preventDefault()
    const win = hit.window
    const folder = folderFor(win)
    for (const { icon, x, y } of landings) file(icon, folder.id, win.placementAt(x, y))
    return
  }
  if (!hit.window && hit.desktop && from) {
    // Out onto the desktop, where each outline was let go.
    e.preventDefault()
    for (const { icon, x, y } of landings) file(icon, 'desktop', desktop.placementAt(x, y))
  }
  // Otherwise the drop is in the container the icons came from: the kit's
  // default action moves them, and the positions are read back below.
})
```

`file()` moves the icon in the DOM and the item in the model, in that order, and refreshes the counts:

```ts
function file(icon: VfIcon, parent: string, at: { left: number; top: number }): void {
  const item = itemFor(icon)
  const fromWin = icon.closest('vf-window')
  const field = parent === 'desktop' ? desktopField : windowFor(parent).querySelector('vf-icon-field')!
  field.append(icon)
  icon.left = Math.max(0, at.left)
  icon.top = Math.max(0, at.top)
  item.parent = parent
  item.left = icon.left
  item.top = icon.top
  if (fromWin) updateCount(fromWin)
  if (parent !== 'desktop') updateCount(windowFor(parent))
}
```

Re-parenting inside the handler is safe: the event is dispatched with the outlines gone, the drag state cleared and the pointer capture released, and a selected icon keeps its outside-press clearing across the move. The Trash is a folder icon whose window is the Trash's; Empty Trash is a menu command over that folder's children.

When the default action moves the icons, read the positions back into the model after the event:

```ts
document.addEventListener('vf-drop', (e) => {
  if (e.defaultPrevented) return
  const { icons } = (e as CustomEvent<VfIconDragDetail>).detail
  queueMicrotask(() => {
    for (const icon of icons) {
      const item = itemFor(icon)
      item.left = icon.left ?? 0
      item.top = icon.top ?? 0
    }
  })
})
```

Read `icon.left`, never `style.left`: the inline value is a live `calc()`.

## Clean Up

Special → Clean Up moves every icon of the front container onto its lattice one at a time, each icon's outline travelling to its cell and the icon landing when the outline arrives. The cells are the page's; the walk is the kit's:

```ts
async function cleanUp(field: VfIconField, cells: Map<VfIcon, { left: number; top: number }>): Promise<void> {
  const moves = [...cells].map(([icon, at]) => ({ icon, ...at }))
  await field.dragIcons(moves)
}
```

`dragIcons` walks the array in the order given, so sort it in the container's own fill order first. Each icon lands through the drop's write — clamped whole in its container, or held at the origin only in a scrolling plane, snapped to the lattice, one `vf-placement-change` — so a folder window's lattice may run as many rows as it takes, and its scroll range re-measures per icon. A floor of the page's own, such as the desktop's menu bar, is the page's clamp: apply it to the cells before handing them over. The promise resolves when the last icon has landed; refit a folder window's field and persist positions after it, since a snapshot taken mid-walk reads half-moved positions. A press anywhere, or Escape, finishes the walk at once with every remaining icon at its cell. Under `prefers-reduced-motion` every icon lands at once.

One icon alone is `icon.dragTo(left, top)`. `icon.moveTo(left, top)` is the same landing with no outline — the write a drop makes — where `icon.left = …` is the authored pair, unclamped.

## Renaming

`editable` opens the rename box on a click on the name of an already-selected icon, or on Return. Commit the name to the model on `vf-change`; the two refusals are the page's alerts:

```ts
document.addEventListener('vf-change', (e) => {
  const icon = e.target as VfIcon
  if (icon.localName !== 'vf-icon') return
  itemFor(icon).name = (e as CustomEvent<{ label: string }>).detail.label
})
document.addEventListener('vf-name-too-long', () => alert('That name is too long. Names can have up to 31 characters.'))
document.addEventListener('vf-name-rejected', () => alert('An item must have a name.'))
```

`alert()` here is a `vf-dialog frame="plain"` with the page's own 32×32 caution art, shown with `show()`; the kit ships no alert component.

## Views

View → by Small Icon is one attribute per field:

```ts
function setView(size: 'large' | 'small'): void {
  for (const field of document.querySelectorAll('vf-icon-field')) field.size = size
  byIconItem.checked = size === 'large'
  bySmallIconItem.checked = size === 'small'
}
```

Icons added to a field later take the field's size on arrival.

## Keyboard

The kit's routes, which need nothing from the page: Tab reaches each selectable icon; Space toggles it; the arrow keys nudge a movable icon one system px, eight with Shift; ⌘O and ⌘↓ open; Return renames; Escape cancels a drag, a rubber band or a rename. Menu commands with `shortcuts` cover the rest.

## Things to get right

- **The movable contract.** Every movable icon states `left`/`top`, and its positioning parent has a box. A window body, a scroll area's plane and the desktop's raster are boxes; a placed field is one when sized. The kit warns once per element when the contract is not met.
- **Fields need a box for the rubber band.** Fill the desktop's field; place and size a folder window's. An unfilled field of placed icons is zero-height and takes no press.
- **Keep a placed field at its container's origin** (`top="0" left="0"`), so the container's `placementAt()` and the field's coordinates agree. A field placed elsewhere needs its own conversion: `toSysExact(clientX - fieldRect.left, field)`.
- **Group drops land each member where its own outline was.** Convert each icon's own rect plus the leader's delta, as above; converting only `x`/`y` stacks the group on one spot.
- **Hold landings at the origin.** A member let go partly past a plane's edge would land under it; `Math.max(0, …)` keeps it on the plane. That is the kit's own rule in a scrolling plane, where the default action holds only the origin and the rails reach the rest; in any other box it clamps the group whole. The page's writes are its own.
- **Skip the travelling icons in the hit test.** A follower can be under the pointer; it is never a destination.
- **`open` is the page's to set and clear**, on the icon whose window is on screen.
- **Touch.** A movable icon sets `touch-action: none`, so a touch drag on an icon is the drag. A touch drag on a field's background pans a scrolling window; the rubber band is a mouse and pen gesture. Two taps of a finger or pen open an icon — the icon classifies the pair from pointer events, so `vf-open` needs no `dblclick` from the platform and the page adds nothing. A finger's or pen's drag begins 10 CSS px from the press and the mouse's 4, so a tap selects and leaves the icon on its cell.
- **Positions persist as they are.** Save `left`/`top` off the properties; write them back as they were. Whole system px is whole device px at every density, and nothing re-snaps.

The reference page's filing specimen (`index.html`, the `vf-icon` section) runs this recipe on two fields and one folder window; `demo/examples.ts` is its script.
