# Images and icons

Every mark the kit paints is geometry — a checkmark, a caret, the stepper arrows, a radio's ring — drawn as inline SVG on integer coordinates (`glyphs.ts`). The kit ships no raster content; the one raster it carries is the embedded cursor set, base64 inside the module like the fonts.

Pictures come from your own markup. Slot them through `vf-img` (or `vf-icon`'s and `vf-list-item`'s icon slots) and the graphic stays a real `<img>` in your own DOM — `alt`, `srcset`, loading behavior and asset URLs intact — magnified nearest-neighbor at one image pixel per system pixel.

## `vf-icon`

`vf-img` puts a picture on the grid; `vf-icon` makes it a control — a picture and a caption that select, move and rename together.

```html
<vf-icon label="Macintosh HD" width="64" selectable movable editable
         top="16" left="16">
  <vf-img slot="large"><img src="hd-32.png" alt=""></vf-img>
  <vf-img slot="small"><img src="hd-16.png" alt=""></vf-img>
</vf-icon>
```

- **Two slots.** `large` is the 32×32 `ICN#`, `small` the 16×16 `ics#`; `size` picks which one paints and the cell it paints in. The cell is held whether or not there is art for it, so a row of icons keeps one baseline. Both files are fetched even though only one paints — use data URIs, or slot only the size the view uses.
- **`selectable`** makes the icon focusable, so `movable` and `editable` require it. Clicking selects, Shift adds, a press anywhere else clears — single selection with no container. Selection inverts the art, since 1-bit icon art is ink and opaque white on a transparent surround.
- **Role follows the container.** Unowned, a `selectable` icon is `role="img"` named from its `label`; `role="option"` is invalid without a `listbox` that owns it. Wrap a field of icons in `<div role="listbox" aria-multiselectable>` and the selection becomes announceable. The wrapper is layout-neutral.
- **`open`** redraws the art as the open-window ghost — outline held in solid black, interior re-filled with the scroll rails' 25% dither, transparent surround untouched. It is derived from the slotted art in the client by canvas compositing alone, with no readback, so cross-origin art that taints its canvas still works. Set it when you handle `vf-open`.
- **`movable`, not `draggable`** — `draggable` is a global HTML attribute *and* an `HTMLElement` accessor, so declaring it would hand the element to the browser's drag-and-drop machinery. A focused movable icon also moves under the arrow keys: one system px, eight with Shift.
- **`editable`** opens a rename box on a click on the plate of an already-selected icon; Return commits, Escape reverts, and the plate widens as you type. The box waits out the double-click window (`RENAME_DELAY_MS`, 800ms) so a double-click on the name opens the icon instead. Return opens the field at once.
- **`label` is a property**, because renaming means the component owns the string and hands it back on `vf-change`. Empty draws no plate — that is the "no label" setting.
- **Names are never abbreviated or folded** — one line, always, overflowing the cell centered. `maxlength` (31, the HFS limit) bounds the rename field, and going past it fires `vf-name-too-long` with `{ attempted, accepted, limit }`. A committed empty name is refused and fires `vf-name-rejected` with `{ attempted, kept, reason }` and no `vf-change`. A `label` set from your own data is displayed as given and fires nothing.
- **A declared `width` must be even.** The frame centers the art cell and the name over one axis, and a centered child lands on a whole pixel only when box and child share a parity. The component rounds its own plate to an even number of system px; it can't round a number you chose.

```sh
npm run verify:icon
```
