# Images and icons

Every mark the kit paints is geometry — a checkmark, a caret, the stepper arrows, a radio's ring — drawn as inline SVG on integer coordinates (`glyphs.ts`). The kit ships no raster content; the one raster it carries is the embedded cursor set, base64 inside the module like the fonts.

Pictures come from your own markup. Slot them through `vf-img` (or `vf-icon`'s and `vf-list-item`'s icon slots) and the graphic stays a real `<img>` in your own DOM — `alt`, `srcset`, loading behavior and asset URLs intact — magnified nearest-neighbor at one image pixel per system pixel.

## `vf-icon`

`vf-img` puts a picture on the grid; `vf-icon` makes it a control — a picture and a caption that select, move and rename together. A field of them sits in a [`vf-icon-field`](#vf-icon-field).

```html
<vf-icon label="Macintosh HD" width="64" selectable movable editable
         top="16" left="16">
  <vf-img slot="large"><img src="hd-32.png" alt=""></vf-img>
  <vf-img slot="small"><img src="hd-16.png" alt=""></vf-img>
</vf-icon>
```

- **Two slots.** `large` is the 32×32 `ICN#`, `small` the 16×16 `ics#`; `size` picks which one paints and the cell it paints in. The cell is held whether or not there is art for it, so a row of icons keeps one baseline. Both files are fetched even though only one paints — use data URIs, or slot only the size the view uses.
- **`selectable`** makes the icon focusable, so `movable` and `editable` require it. Clicking selects, Shift adds, a press anywhere else clears — single selection with no container. Inside a field, a press on an icon that is already selected keeps the whole selection, so a drag from it carries the set; a click released with no drag collapses the selection to that icon on the release. Selection inverts the art, since 1-bit icon art is ink and opaque white on a transparent surround.
- **Role follows the container.** Inside a `vf-icon-field` a `selectable` icon is `role="option"` with `aria-selected`; unowned, it is `role="img"` named from its `label`, because `option` is invalid without a `listbox` that owns it. An element of your own carrying `role="listbox"` owns it the same way.
- **`open`** redraws the art as the open-window ghost — outline held in solid black, interior re-filled with the scroll rails' 25% dither, transparent surround untouched. It is derived from the slotted art in the client by canvas compositing alone, with no readback, so cross-origin art that taints its canvas still works. Set it when you handle `vf-open`.
- **Opening.** `vf-open` fires on a double-click anywhere on the icon, the name included; on two taps of a finger or pen; and on ⌘O / ⌘↓ (Ctrl off the Mac). Return renames. The mouse opens on the platform's `dblclick`. A finger or a pen opens on a tap pair the icon classifies from its own pointer events: the second tap pressed within `TAP_PAIR_MS` (500) of the first and no further than `TAP_PAIR_SLOP_PX` (24 CSS px) from it, `vf-open` firing on the second release. A press that became a drag or was cancelled is not half of a pair, and a third tap starts the next pair. The frame sets `touch-action: manipulation` — no double-tap zoom over an icon; panning and pinching stay the page's.
- **`movable`, not `draggable`** — `draggable` is a global HTML attribute *and* an `HTMLElement` accessor, so declaring it would hand the element to the browser's drag-and-drop machinery. A focused movable icon also moves under the arrow keys: one system px, eight with Shift. A drag is reported as events, and the page decides what a drop means — see [Dragging](#dragging).
- **`target`** paints the destination highlight: the selected treatment of the art alone — inverted, or darkened under `color` — with none of `selected`'s semantics: no event, no outside-press listener, no `aria-selected`, the plate untouched. Set it on the folder under a drag; clear it when the pointer leaves or the drop lands.
- **`editable`** opens a rename box on a click on the plate of an already-selected icon; Return commits, Escape reverts, and the plate widens as you type. The box waits out the double-click window (`RENAME_DELAY_MS`, 800ms) so a double-click on the name, or a tap pair, opens the icon instead. Return opens the field at once.
- **`label` is a property**, because renaming means the component owns the string and hands it back on `vf-change`. Empty draws no plate — that is the "no label" setting.
- **Names are never abbreviated or folded** — one line, always, overflowing the cell centered. `maxlength` (31, the HFS limit) bounds the rename field, and going past it fires `vf-name-too-long` with `{ attempted, accepted, limit }`. A committed empty name is refused and fires `vf-name-rejected` with `{ attempted, kept, reason }` and no `vf-change`. A `label` set from your own data is displayed as given and fires nothing.
- **A declared `width` must be even.** The frame centers the art cell and the name over one axis, and a centered child lands on a whole pixel only when box and child share a parity. The component rounds its own plate to an even number of system px; it can't round a number you chose.

```sh
npm run verify:icon
```

## Dragging

A drag on a `movable` icon is a stream of events on the icon, all bubbling and composed, and a cancelable commit:

| Event | When | `detail` |
| --- | --- | --- |
| `vf-drag-start` | the first lattice step past the drag slop | `{ left, top, icons }` — the origin, in the icon's container, and the icons travelling |
| `vf-drag` | every step that changed the snapped proposal | `{ clientX, clientY, left, top, x, y, icons }` |
| `vf-drop` | the release; **cancelable** | the same shape, at the release |
| `vf-drag-cancel` | Escape, or a `pointercancel` | `{}` |

- `clientX`, `clientY` — the pointer, in viewport CSS px, for a hit test (`document.elementsFromPoint`).
- `left`, `top` — the proposed origin in the icon's own container, whole system px on the placement lattice.
- `x`, `y` — the outline's top-left in viewport CSS px: the icon's frame box translated by the delta, for a drop that lands in another container. The press offset is already inside it, so an icon placed at `container.placementAt(x, y)` lands exactly where the outline was.
- **The default action of an uncancelled `vf-drop` is the move:** the proposal written through `left`/`top`, clamped whole in the container measured at the press, or held at the origin only in a scrolling plane, whose rails reach the rest. `left`/`top` in the detail are the proposal *unclamped*; only the default action clamps. `preventDefault()` writes nothing — re-parent or place the icon yourself.
- **The drag slop.** A drag begins once the pointer has travelled from its press by `DRAG_SLOP_PX` (4 CSS px) for the mouse, or `DRAG_SLOP_COARSE_PX` (10) for a finger or pen. A press released inside it is a click or a tap: no drag event fires, the icon stays where it was, and a rename the press armed stays armed. The delta is measured from the press, so the outline begins under the pointer.
- **Escape mid-drag cancels**: nothing is written and `vf-drag-cancel` fires. A `pointercancel` does the same.
- **The selection travels.** A drag that begins on a selected icon carries every other selected, movable icon of its field, one outline each, and every event's detail carries the set as `icons`, the dragged icon first. The default action moves each member by the same delta, clamped once for the whole group, so the arrangement is kept and the group stops when its outermost icon meets the container's edge. A cancel takes every outline down. A press on an unselected icon makes it the selection first, so it drags alone; so does a Shift press that deselects the pressed icon. Each member's outline is its own box translated by the same delta, so a handler filing the set lands each where its outline was:

  ```ts
  const lead = e.target.getBoundingClientRect()
  for (const icon of e.detail.icons) {
    const r = icon.getBoundingClientRect()
    const { left, top } = win.placementAt(r.left + (e.detail.x - lead.left), r.top + (e.detail.y - lead.top))
    field.append(icon); icon.left = left; icon.top = top
  }
  ```
- **The drag is an outline; the icon stays put.** The gesture draws the classic dotted outline — the mask and the name's rectangle framed as one shape, so where they abut the outline wraps around both, derived from the slotted art the way the open ghost is — with the XOR pen over everything: a dotted black line over a white window body, and over the desktop dither a black line, the composition QuickDraw's pattern pen gave: its dots are phase-locked to the screen and fall on the pixels the dither leaves white. It draws on the desktop's own surface, over windows, palettes and the menu bar, clipped at the raster's edge; with no `vf-desktop` ancestor it draws in the icon's own box instead, clipped by whatever clips the icon. It is never a hit, so `elementsFromPoint` under it sees the page.

```ts
icon.addEventListener('vf-drag', (e) => {
  const { clientX, clientY } = e.detail
  folderUnder(clientX, clientY)?.toggleAttribute('target', true)
})
icon.addEventListener('vf-drop', (e) => {
  const win = folderWindowUnder(e.detail.clientX, e.detail.clientY)
  if (!win) return                              // the default action moves the icon
  e.preventDefault()                            // the kit writes nothing
  const { left, top } = win.placementAt(e.detail.x, e.detail.y)
  win.querySelector('vf-icon-field').append(icon)
  icon.left = left
  icon.top = top
})
```

`vf-window`, `vf-desktop` and `vf-scroll-area` convert a viewport point into their own placement coordinates with `placementAt(clientX, clientY)` — see [LAYOUT.md](LAYOUT.md). A window with `scrollbars` re-measures its rails under a moved child by itself. Re-parenting inside the `vf-drop` handler is safe: the event is dispatched with the drag state cleared and the pointer capture released, and a selected icon keeps its outside-press clearing after the move.

```sh
npm run verify:icon-drag
```

## `vf-icon-field`

The container a field of icons sits in — a desktop's icons, a folder window's contents:

```html
<vf-desktop width="512" height="342">
  <vf-icon-field label="Desktop">
    <vf-icon label="Macintosh HD" width="64" selectable movable editable left="16" top="24">…</vf-icon>
    <vf-icon label="Trash" width="64" selectable movable editable left="16" top="280">…</vf-icon>
  </vf-icon-field>
  <vf-window heading="Documents" width="320" height="201" scrollbars="both" top="40" left="120">
    <vf-icon-field label="Documents">
      <vf-icon label="Read Me" width="64" selectable movable editable left="16" top="16">…</vf-icon>
    </vf-icon-field>
  </vf-window>
</vf-desktop>
```

| Attribute | Values | Notes |
| --- | --- | --- |
| `label` | string | The listbox's accessible name |
| `size` | `large`, `small` | Written onto every icon in the field, on arrival and whenever it changes. Unset, each icon keeps its own |
| `top`, `left`, `width`, `height` | system px | Optional. Stated, the field is a box and the anchor its icons place against |
| `fill-width`, `fill-height` | bare attribute | Be as wide (tall) as the parent allows — the desktop's screen, a window body. The field stays static, so its icons keep their anchor; it gains a surface to press |

- **A listbox, always multi-select.** `role="listbox"` and `aria-multiselectable="true"` through internals, so a `role` or `aria-*` of your own on the tag wins. A `selectable` icon inside is an `option` with `aria-selected`, and stays one when moved between fields.
- **Layout-neutral until placed or filled.** An in-flow block with no size, no inset and no position of its own, painting nothing. A field whose icons are all placed is a zero-height block: the icons anchor to the desktop's raster or the window's plane, and a press on the bare desktop reaches the desktop. State `top`/`left` and `width`/`height` and it becomes the anchor; fill it and it has a box without becoming one.
- **The rubber band.** A press on a field's own background dragged across it draws the dotted selection rectangle from the press to the pointer, and the selection follows it live by one rule: **an icon is selected exactly when it was selected at the press XOR the rectangle touches it.** A plain press has already cleared the selection, as any press outside an icon does, so the rectangle selects what it touches and releases what it leaves. With Shift or ⌘ held the selection survives the press and the rectangle toggles against it: an already-selected icon deselects while the rectangle covers it and comes back when it leaves, one that was not selects. Each change fires `vf-select`. "Touches" means the icon's art cell or its name plate, not the empty cell beside them, so a rectangle through the gap between two icons selects neither. The release keeps the result; Escape or a `pointercancel` cancels and puts the selection back as the press found it. The rectangle is drawn at the field's own level, the way the Finder drew its marquee — under the windows on the desktop, inside the window in a window body — and reaches no further than the field inside its clips. Only a field with a box can be pressed: fill it (`fill-width fill-height` on a desktop or in a window body) or place and size it; an unfilled field of placed icons draws none. On a touch screen a drag on the background still pans a scrolling window; the band is a mouse and pen gesture.
- **The desktop renders none.** Its furniture is slotted light DOM; the page writes the field.

`vf-icon.setSelected(next)` is the route a container uses to select an icon as a press would, `vf-select` included; a `selected` write from code stays silent. `vf-icon.touches(box)` is the icon's own reading of whether a viewport box reaches its art or its plate.
