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
| `pad` | system px, 1–4 values | CSS shorthand order. The way to inset a window's, a dialog's or a scroll area's content, which carry none of their own |
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

**(0,0)** is CSS's nearest positioned ancestor, and every kit container is one: the desktop's raster, a window's or a dialog's content region, a stack's box, a fieldset just inside its border, a scroll area's scrolled plane. In a parent of your own, add `position: relative`, or slot the children into a `vf-container` — a plain sized box made for this.

- **No exceptions, including the rows.** `vf-option`, `vf-menu-item`, `vf-list-item` and `vf-menu` take the pair too. These are web components; where you put one is your call, not the kit's. What *does* change is what the managing parent stops doing for a placed child, since the child has left its flow: a `vf-select` panel and a `vf-menu` panel are each as wide as their widest row and no longer count a placed one, the popup's scroll clamp stops counting it, a `vf-list`'s rows below it close the gap, and a placed `vf-menu` lifts off its bar. That is the placement working, not failing — but it isn't how a popup, a pulldown or a list box is laid out, so reach for it when the row is genuinely standing on its own.
- **`vf-dialog` takes it in viewport coordinates** — `showModal()` puts a modal in the top layer, whose containing block is the viewport, so this one origin is the screen's rather than the parent's. Everything else about the pair is identical: same unit, same live `calc()`, same drag-writes-through. Leave the pair off and the modal is centered, recomputed whenever its box or the viewport changes. Setting either coordinate back to `null` returns it to centering.
- **Gestures write through the same properties.** A title-bar drag on a `vf-window` or `vf-dialog`, a drag or arrow-key nudge on a `vf-icon`, and `vf-window`'s grow box all state whole system px, so activating a window never snaps it back and a zoom leaves it where it was dropped. Setting a property yourself re-places it.
- **A movable element needs a coordinate system**, and its parent needs a declared size for the clamp to work in. Without one, the first move pulls the element out of flow and reflows the page under it; the kit warns once per element and keeps the gesture working. `position: absolute` in your own stylesheet satisfies the requirement too.
- **Read a moved element's position off the properties** (`win.left`), not `style.left` — the inline value is a live `calc()`, so `parseFloat` gives `NaN`. Coordinates land on the lattice a drag step uses: 1 system px on a 1× display, 2 on a 2× one. Nothing re-snaps a dropped coordinate afterwards.
- **A viewport point converts with `placementAt(clientX, clientY)`** on `vf-window`, `vf-desktop` and `vf-scroll-area` — the three containers whose anchor sits in shadow DOM. It returns `{ left, top }` in whole system px on the placement lattice, measured from the window's content region (under `scrollbars`, the scrolled plane, scroll offset included), the screen with the bezel excluded, or the plane — the pair a child dropped there is written with. Pass the child as a third argument and the pair carries that child's `origin` offset, so its box's corner lands on the point. Everywhere else the anchor is the element's own padding box, and `toSysExact(clientX - rect.left, el)` against `getBoundingClientRect()` is the conversion.
- **A scroll area re-measures under a moved child.** Every placement write is announced to its tree (`vf-placement-change`, an internal event), and `vf-scroll-area` — a window's built-in one included — re-measures its overflow on it, so a placed child dragged, nudged or set past the viewport brings the rail live with no call from the page. `measure()` on `vf-scroll-area` and `vf-window` covers a scroll range that changes with no placement write.
- **Non-movable costs nothing:** an element nobody asked to move takes no position, no tab stop and no role, and lays out in your flex row or grid like any other element.

### `fixed`

`fixed` holds a placement against the visible region of the nearest scrolling ancestor instead of its scrolled plane — a tool strip over a document, a header over rows. The element keeps its stated `top`/`left` while the content scrolls under it, and the flag alone places it at (0,0):

```html
<vf-window heading="Notes" width="300" height="200" scrollbars="vertical">
  <vf-button-group fixed top="4" left="4">
    <vf-button>Bold</vf-button>
    <vf-button>Italic</vf-button>
  </vf-button-group>
  <vf-stack fill-width pad="12">…</vf-stack>
</vf-window>
```

- **A fixed child comes before the flow content in its parent.** The engine underneath is `position: sticky`, which only ever pushes a box down from where the flow put it. The kit erases the box's footprint — blockified, shrink-wrapped, a 0×0 margin box — so the content after it lays out as if it weren't there. Placed siblings can come in any order.
- **It paints over the plane's placed children** (`z-index: 1`), and never over the rails, which sit outside the viewport.
- **Scrolling over it still scrolls the content.** The child is inside the viewport, not floating over it, so wheel, trackpad, touch and keyboard scrolling all pass through.
- **Where nothing scrolls it renders exactly as placed.** A plain window body is a scroll container that never scrolls; outside any kit scroller it holds against CSS's nearest scroll container, the page included.

### `origin`

`origin` names which point of the element's own box `left`/`top` place. Nine keywords, vertical then horizontal — `top left` (the default), `top center`, `top right`, `center left`, `center`, `center right`, `bottom left`, `bottom center`, `bottom right`:

```html
<!-- a 300-wide plain dialog: its body is 290 × 184 -->
<vf-label origin="top center" left="145" top="18">Page Setup</vf-label>
<vf-button-group origin="bottom right" left="274" top="168">
  <vf-button>Cancel</vf-button>
  <vf-button variant="default">OK</vf-button>
</vf-button-group>
```

The title stays centered on x = 145 whatever its text, and the button group keeps its bottom-right corner 16px in from the body's corner however long its labels run.

- **Measured, in whole system px.** The kit reads the element's border box, rounds it to whole system px, and writes the pair less the point's offset — never a transform. An odd width under a center origin puts the leftover half on the left; an odd height, on top. The box is the border box, margins excluded: a `vf-fieldset`'s includes the legend room above its frame line, and a group holding a default button includes its bold ring.
- **Kept current.** A relabel, a late font or a translated string re-measures and rewrites, and each rewrite is announced (`vf-placement-change`), so a scroll area re-measures under it. A zoom step changes CSS px, not system px, so the same offset comes back.
- **Gestures keep the point.** A drag or an arrow nudge writes the origin-point pair, and the clamp holds the box inside the container. A dragged title stays centered on wherever it was dropped; `el.left` reads the point, not the corner.
- **Drops add the offset.** `placementAt(clientX, clientY, child)` returns the pair to write to `child` so its box's corner lands there; without the child it is the corner's own pair.
- **`fixed` takes it too.** `vf-dialog` does not: its own pair is the viewport's, and unset already centers it.
- **On its own it places nothing.** It changes what the pair means and is inert on an element in flow. An unknown value places as `top left` and warns once per element.

`width` and `height`, also in whole system px, are the other half of the rectangle: `vf-window`, `vf-stack`, `vf-container`, `vf-icon-field`, `vf-label` and `vf-paragraph` take them as the `VfSized` mixin, and `vf-desktop`, `vf-dialog`, `vf-img`, `vf-swatch` and `vf-icon` declare their own size the same way. Everything else keeps the size it draws itself at.

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

`frame="plain"` is the modal double frame (1px outer rule, 2px gap, 2px inner band, no shadow). `variant="utility"` is the windoid: a 12px bar with a dot-grid dither and 7×7 widgets, floating above every document window inside a `vf-desktop` and standing outside the single-active rule. `scrollbars` puts the rails on the window edge with the grow box in the corner cell. A `header` slot is a strip between the title bar and the body across the whole window, a white band over a 1px rule with no inset of its own; `header-height` states its height in system px, rule included, and the vertical rail begins under it. A `resizable` window's `min-width`/`max-width` and `min-height`/`max-height` bound the grow box per axis, in system px; a min equal to its max locks that axis, which is how a strip that scrolls sideways keeps its height.

There is no alert component. An alert is the plain frame plus your own icon art:

```html
<vf-dialog id="alert" frame="plain" label="Caution" width="340" height="126">
  <vf-stack left="16" top="16" width="298" direction="row" gap="16">
    <vf-img width="32" height="32"><img src="alert-32.png" alt="" /></vf-img>
    <vf-paragraph fill-width face="display"
      >Completely erase the disk named “Macintosh HD”?</vf-paragraph
    >
  </vf-stack>
  <vf-button-group left="152" top="64">
    <vf-button>Cancel</vf-button>
    <vf-button variant="default">Erase</vf-button>
  </vf-button-group>
</vf-dialog>
```

`label` is set because the plain frame has no title bar to take a name from; the copy uses the chrome face, as System 7 alerts did.
