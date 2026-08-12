# Layout

Two stylesheet-free ways to lay out a window's insides: stack them, or place each child by coordinate.

## `vf-stack`

A flexbox whose `gap`, `pad`, `width` and `height` are declared in whole system px, so a window's insides need no `calc(var(--vf-scale, 1) * …)` in your stylesheet. That matters because scaling is per component — each element sets `--vf-scale` on *itself*, never on the document — so `var(--vf-scale, 1)` in page CSS silently falls back to `1` outside a `vf-*` ancestor.

```html
<vf-window heading="New" width="470" height="338">
  <vf-stack fill-width gap="12">
    <vf-stack fill-width direction="row" gap="8">
      <vf-label width="80" for="name">Name:</vf-label>
      <vf-text-field fill-width id="name"></vf-text-field>
    </vf-stack>
    <vf-stack fill-width place="end">
      <vf-button-group>
        <vf-button>Cancel</vf-button>
        <vf-button variant="default">OK</vf-button>
      </vf-button-group>
    </vf-stack>
  </vf-stack>
</vf-window>
```

| Attribute | Values | Notes |
| --- | --- | --- |
| `direction` | `column` (default), `row` | |
| `gap` | system px | Between children; `0` by default |
| `pad` | system px, 1–4 values | CSS shorthand order. A `vf-window` body carries its own 12px inset |
| `place` | `start`, `center`, `end` | Where children sit across the stack. Unset resolves to `start` down a column, `center` across a row. There is no `justify` — a right-aligned action row is a filled column whose one child sits at the end |
| `width`, `height` | system px | Optional. Declaring one on a panel's outermost stack puts it on the device-pixel grid by construction |
| `fill-width`, `fill-height` | bare attribute on a **child** | Be as wide (tall) as the stack allows |

The content governs the box: a column is as wide as its widest child, a row as tall as its tallest, and children keep the size they were drawn at. The stack distributes, never resizes, and shrink-wraps. It paints nothing, takes no role, and returns `font`, smoothing, `color`, `user-select` and `text-align` to `inherit`.

`fill-width`/`fill-height` name the outcome, not an axis, so the stack compiles each to the main or cross axis depending on which way it runs. **The cross axis always has a size; the main axis only has slack if you declared one** — so `fill-width` always works in a column and needs a declared `width` in a row, and `fill-height` is the other way round. A fill with nothing to take is inert, not an error, and two children filling the main axis come out equal. A stack reads both attributes about *itself* too, for parents that aren't stacks. Three components have no width of their own (`vf-separator`, `vf-progress-bar`, `vf-slider`), so they need a fill to take a width; for a cross-axis fill a direction doesn't offer, `align-self: stretch` in your own stylesheet wins.

Centering halves the free space, so an odd count of system px would land a child on a half pixel (a 16px caption centered against the 25-system-px `vf-number-field` sits at 4.5). The stack measures that and steps the child back onto whole system px, the exact half going toward the start — its whole footprint on your DOM is `data-vf-tie` and `--vf-stack-dx` / `--vf-stack-dy` on a corrected child, and anything you declare yourself beats it. `place="start"` still means no centering at all.

The one thing it can't fix: a flex container doesn't collapse margins, so `vf-fieldset`'s 8px of legend room is genuinely reserved inside a stack.

```sh
npm run verify:stack
```

## `top` and `left`

Every component takes `top` and `left` in whole system px. Set either and the element is absolutely positioned within its parent, the coordinate you left out defaulting to 0. Set neither and it renders in flow:

```html
<vf-window heading="Rename" width="300" height="140">
  <vf-label left="12" top="30" for="nm">New name:</vf-label>
  <vf-text-field left="92" top="26" id="nm"></vf-text-field>
  <vf-button-group left="120" top="96">
    <vf-button>Cancel</vf-button>
    <vf-button variant="default">OK</vf-button>
  </vf-button-group>
</vf-window>
```

The coordinates are written as a live `calc(var(--vf-scale, 1) * Npx)`, so a placed layout scales with the display and sits on the device-pixel grid. `right`/`bottom` are released and `margin` zeroed while placed; removing both attributes returns the element to flow with every inline declaration unwound.

**(0,0)** is CSS's nearest positioned ancestor, and every kit container is one: the desktop's raster, a window's content region, a dialog's content area, a stack's box, a fieldset just inside its border, a scroll area's scrolled plane. In a parent of your own, add `position: relative`, or slot the children into a `vf-container` — a plain sized box made for this.

- **No exceptions, including the rows.** `vf-option`, `vf-menu-item`, `vf-list-item` and `vf-menu` take the pair too. These are web components; where you put one is your call, not the kit's. What *does* change is what the managing parent stops doing for a placed child, since the child has left its flow: a `vf-select` panel and a `vf-menu` panel are each as wide as their widest row and no longer count a placed one, the popup's scroll clamp stops counting it, a `vf-list`'s rows below it close the gap, and a placed `vf-menu` lifts off its bar. That is the placement working, not failing — but it isn't how a popup, a pulldown or a list box is laid out, so reach for it when the row is genuinely standing on its own.
- **`vf-dialog` takes it in viewport coordinates** — `showModal()` puts a modal in the top layer, whose containing block is the viewport, so this one origin is the screen's rather than the parent's. Everything else about the pair is identical: same unit, same live `calc()`, same drag-writes-through. Leave the pair off and the modal is centered, recomputed whenever its box or the viewport changes. Setting either coordinate back to `null` returns it to centering.
- **Gestures write through the same properties.** A title-bar drag on a `vf-window` or `vf-dialog`, a drag or arrow-key nudge on a `vf-icon`, and `vf-window`'s grow box all state whole system px, so activating a window never snaps it back and a zoom leaves it where it was dropped. Setting a property yourself re-places it.
- **A movable element needs a coordinate system**, and its parent needs a declared size for the clamp to work in. Without one, the first move pulls the element out of flow and reflows the page under it; the kit warns once per element and keeps the gesture working. `position: absolute` in your own stylesheet satisfies the requirement too.
- **Read a moved element's position off the properties** (`win.left`), not `style.left` — the inline value is a live `calc()`, so `parseFloat` gives `NaN`. Coordinates land on the lattice a drag step uses: 1 system px on a 1× display, 2 on a 2× one. Nothing re-snaps a dropped coordinate afterwards.
- **Non-movable costs nothing:** an element nobody asked to move takes no position, no tab stop and no role, and lays out in your flex row or grid like any other element.

`width` and `height`, also in whole system px, are the other half of the rectangle: `vf-window`, `vf-stack`, `vf-container`, `vf-label` and `vf-paragraph` take them as the `VfSized` mixin, and `vf-desktop`, `vf-dialog`, `vf-img`, `vf-swatch` and `vf-icon` declare their own size the same way. Everything else keeps the size it draws itself at.

```sh
npm run verify:position
```

## Window archetypes

The 1992 *Macintosh Human Interface Guidelines* names five standard windows. The kit ships two parameterized shells; each archetype is a one-line recipe:

| Archetype | Recipe |
| --- | --- |
| Document window | `<vf-window closable zoomable movable resizable scrollbars="both">` |
| Movable modal dialog box | `<vf-dialog heading="…">` |
| Modal dialog box | `<vf-dialog frame="plain">` |
| Modeless dialog box | `<vf-window closable movable>` |
| Utility (floating) window | `<vf-window variant="utility" movable>` |

Every recipe also declares `width` and `height` in system px; the three `movable` ones declare `top` and `left` as well. A window is a fixed box in both axes — content taller than the declared box is clipped at the frame, and `scrollbars` is how the user reaches the rest. A control's drop-open list still escapes the clip.

`frame="plain"` is the modal double frame (1px outer rule, 2px gap, 2px inner band, no shadow). `variant="utility"` is the windoid: a 12px bar with a dot-grid dither and 7×7 widgets, floating above every document window inside a `vf-desktop` and standing outside the single-active rule. `scrollbars` puts the rails on the window edge with the grow box in the corner cell.

There is no alert component. An alert is the plain frame plus your own icon art:

```html
<vf-dialog id="alert" frame="plain" label="Caution" width="340" height="126">
  <vf-stack fill-width direction="row" gap="16">
    <vf-img width="32" height="32"><img src="alert-32.png" alt="" /></vf-img>
    <vf-paragraph fill-width face="display"
      >Completely erase the disk named “Macintosh HD”?</vf-paragraph
    >
  </vf-stack>
  <vf-button slot="buttons">Cancel</vf-button>
  <vf-button slot="buttons" variant="default">Erase</vf-button>
</vf-dialog>
```

`label` is set because the plain frame has no title bar to take a name from; the copy uses the chrome face, as System 7 alerts did.
