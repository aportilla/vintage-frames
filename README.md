# Vintage Frames

Lit web components that rebuild the Mac OS System 7 interface — racing-stripe
title bars, 1px black borders, hard offset shadows, bitmap type. 30 elements,
no stylesheet to load.

```sh
npm install vintage-frames
```

```ts
import 'vintage-frames'   // registers every <vf-*> element
```

Every visual constant is a `--vf-*` custom property with an inlined fallback,
the two bitmap faces register themselves on `document.fonts`, and each
component scales itself — so a component on a blank page renders correctly with
no global CSS at all.

```html
<vf-desktop width="512" height="342">
  <vf-menu-bar>
    <vf-menu label="File">
      <vf-menu-item shortcut="⌘N">New Window</vf-menu-item>
      <vf-separator></vf-separator>
      <vf-menu-item shortcut="⌘Q">Quit</vf-menu-item>
    </vf-menu>
  </vf-menu-bar>

  <vf-window heading="My Installer" movable width="360" height="220"
             top="40" left="76">
    <vf-stack fill-width gap="12">
      <vf-paragraph>Welcome!</vf-paragraph>
      <vf-fieldset fill-width legend="Install Location">
        <vf-select value="hd">
          <vf-option value="hd">Macintosh HD</vf-option>
        </vf-select>
      </vf-fieldset>
      <vf-stack fill-width place="end">
        <vf-button-group>
          <vf-button>Quit</vf-button>
          <vf-button variant="default">Install</vf-button>
        </vf-button-group>
      </vf-stack>
    </vf-stack>
  </vf-window>
</vf-desktop>
```

## Demo pages

```sh
npm run dev        # http://localhost:5173
npm run build      # library build to dist/
npm run typecheck
npm test           # the whole verify suite (starts its own dev server)
```

The same three pages are published at
**[aportilla.github.io/vintage-frames](https://aportilla.github.io/vintage-frames/)**,
deployed by `.github/workflows/pages.yml` on every push to `main`.
`npm run build:pages` builds that site locally (`vite.pages.config.ts`, a
separate config because `vite.config.ts` is lib mode) and `npm run preview:pages`
serves the built copy under the same base path the deploy uses.

| Page | What it is |
| --- | --- |
| [`/examples.html`](http://localhost:5173/examples.html) | **Component reference** — every element, its API, and a live specimen of each state. Each code sample is the demo's own source, so it can't drift |
| [`/`](http://localhost:5173/) | Showcase — a full `vf-desktop`: menu bar, movable windows, dialogs, icons, every control, drawn cursor |
| [`/blog.html`](http://localhost:5173/blog.html) | Integration example — an ordinary blog page (system-font copy, normal flow, no global CSS) using the controls in its header, sidebar and forms |

`blog.html` sets no `--vf-scale`, so its components self-scale to true ~72dpi
size. `npm run shot:blog` captures it at 1× / 2× / 3×. Two query flags show
grid snapping working: `?offgrid` knocks all 45 measured components off the
device-pixel grid and snapping recovers them; `?offgrid&nosnap` is the same
page with snapping off, for comparison.

## Components

| Element | What it is |
| --- | --- |
| `vf-desktop` | Gray dithered desktop raster. Declare `width`/`height` in system px, or derive them with `fitWithin(w, h)`. Stacks slotted windows, manages active state, floats `variant="utility"` windows on their own tier. `bezel` adds the CRT surround with rounded top screen corners |
| `vf-window` | Window shell: striped title bar, `closable`/`zoomable` boxes, `movable`, `resizable`, edge scroll rails (`scrollbars`), slim windoid chrome (`variant="utility"`). Declare `width`/`height` in system px |
| `vf-dialog` | Modal shell over a native `<dialog>`. Striped movable bar by default; `frame="plain"` is the double-rule modal frame. Declare `width`/`height`; unset `top`/`left` means centered |
| `vf-separator` | 1px rule, `vertical` or horizontal. Renders as the dimmed dotted rule inside a menu |
| `vf-button` | Push button with pixel-stepped corners. `variant="default"` draws the double ring, `size="small"` the compact 16px button. Form-associated: `type="submit"`/`"reset"`, `name`/`value` |
| `vf-button-group` | Row (or `vertical` column) of buttons sized to the widest, faces aligned so a `variant="default"` button lines up with its neighbors. `natural` keeps each button's own width |
| `vf-swatch` | Color-swatch button — a white-inset color well sized in system px, showing a transparency checker with no `color`. `shadow` opts into the hard drop shadow |
| `vf-checkbox` | Checkbox with the classic ✕ mark |
| `vf-radio`, `vf-radio-group` | Radio buttons; the group is the form-associated surface and owns `value` |
| `vf-text-field`, `vf-text-area` | Bordered text inputs. `vf-text-area` reserves a permanent scroll rail |
| `vf-number-field` | Numeric field with the "little arrows" stepper; `min`/`max`/`step` |
| `vf-select`, `vf-option` | Popup menu. Press-drag-release or click-to-open. A list taller than the screen is clipped, not scrolled, with a scroll arrow in the edge row |
| `vf-progress-bar` | Determinate fill or `indeterminate` barber stripes |
| `vf-slider` | Horizontal 1-bit slider: solid fill up to a shield-shaped handle |
| `vf-menu-bar`, `vf-menu`, `vf-menu-item` | Pull-down menus with ⌘ shortcuts, selection blink, press-drag-release. `rounded` masks the bar's top corners |
| `vf-list`, `vf-list-item` | List box: inverted selection, permanent scroll rail, first-letter type-ahead, `multiple`. Each row takes a leading graphic in its `icon` slot |
| `vf-scroll-area` | Container with System 7 scrollbars. Reserves the rail per `axis`, filling it in only on overflow |
| `vf-fieldset` | Group box with the legend punching through the border |
| `vf-grid` | Lattice of equal cells with 1px rules. `columns`/`rows`/`cell-width`/`cell-height`; `rules` picks the pen, `frameless` drops the perimeter, `collapse` lands a cell's border on the rule |
| `vf-stack` | Flexbox whose `gap`, `pad`, `width` and `height` are declared in system px. Content-governed; `fill-width`/`fill-height` on a child asks for more |
| `vf-label` | Static caption in the chrome face. `for` focuses and names a control; `width` gives a caption column one whole-pixel x |
| `vf-paragraph` | Copy in the body face on a whole-pixel line box; `width`/`height` state the box a placed paragraph wraps to |
| `vf-img` | Pixel art on the grid — sizes a slotted `<img>` to one system px per image px, magnified nearest-neighbor |
| `vf-icon` | Finder icon: art in a 32×32 or 16×16 cell with a name plate below. `selectable`, `open`, `movable`, `editable` |

[SPEC.md](./SPEC.md) has the full design spec, every token, slot, part and
event. [DESIGN-TOKENS.md](./DESIGN-TOKENS.md) lists every `--vf-*` theming
token with its default and what reads it. The
[reference page](http://localhost:5173/examples.html) has the same material as
live specimens.

### Taking only what you use

The root import registers all 30 elements. Import by name to ship less — same
elements, same self-registration, one module each:

```ts
import 'vintage-frames/vf-button.js'
import 'vintage-frames/vf-checkbox.js'
```

Those subpaths and the root are the whole export surface; a deeper path fails
at resolve time rather than as a 404 in production. Bundled and minified with
`lit` external:

| Imported | min | gzip |
| --- | --- | --- |
| `vf-separator.js` — sets no chrome type, so it carries no display face | 16.5 KB | 8.6 KB |
| `vf-button.js` | 35.9 KB | 17.2 KB |
| …plus `vf-checkbox.js` | 41.5 KB | 18.9 KB |
| the root import — all 30 elements | 293 KB | 90.4 KB |

The first component pays for the shared floor; each one after it costs a couple
of KB. Cherry-picking is worth it up to roughly a third of the kit.

It stays one npm package: the scaling, grid snapping, focus modality and font
registration are module-scoped singletons, so one package is what guarantees
one copy. If a second copy does get in, elements register through
`defineElement()`, which keeps the incumbent and warns rather than throwing —
an uncaught `customElements.define()` throw mid-module-graph would blank the
page. `npm run verify:define` asserts that path.

## Sizing

Every component is authored in *system pixels* — the 1-bit art grid, where a
border is 1 and a push button 20 tall. On a Macintosh that pixel was 1/72 inch,
and reproducing it is the whole job: each component asks the display how dense
it is and renders one system pixel as the **whole** number of device pixels
nearest that size, `round(96/72 × devicePixelRatio)`, 96 being CSS's reference
dpi — the only density anchor a browser exposes. On by default, no setup, and
nested components never double-scale.

| Display | true 1/72″ wants | device px per system px | `--vf-scale` |
| --- | --- | --- | --- |
| 1× standard | 1.33 | 1 | 1 |
| 1.25× (Windows 125%) | 1.67 | 2 | 1.6 |
| 1.5× (Windows 150%) | 2.0 | 2 | 1.333 |
| 2× retina | 2.67 | 3 | 1.5 |
| 3× | 4.0 | 4 | 1.333 |

The count is whole because the art has to land on the device-pixel grid, and
rounding to the nearest costs at most half a device pixel per system pixel: a
1× monitor renders 25% small, a 2× display 12% large, a 1.5× or 3× one exactly
right. Some displays derive a scale the browser's layout engine cannot store
exactly (1.25×, 1.5×, 2.5× and a native 3×) — paint snaps every box back onto
the grid, and the tiled fills are placed rather than CSS-repeated (see *The
tile grid* below), so what is left is a hairline one device pixel thin. See
[docs/THREE-X-DISPLAYS.md](./docs/THREE-X-DISPLAYS.md); it is a platform limit
rather than a setting.

So the CSS size follows the display: the same push button is 20px tall on a 1×
monitor and 30px on a 2× one, while the page's own 17px copy is 17px on both.
That is right for a full-screen faux desktop and can be wrong beside prose. Pin
it with the inherited `--vf-scale` custom property, declared in a stylesheet
the page loads *before* the components upgrade:

```css
:root { --vf-scale: 1; }  /* fixed authored size: a 20px button, 16px label */
.dense { --vf-scale: 2; } /* any factor that keeps scale × trueDpr whole */
```

Every metric multiplies by `--vf-scale` in `calc()`. To put your own markup on
the same grid, call `applyScale()` — it sets `--vf-scale` on the document root
(or an element you pass) and keeps it synced:

```ts
import { applyScale } from 'vintage-frames'

applyScale() // → returns a cleanup function
```

### Zoom

Zoom needs no rule of its own. Zooming multiplies device pixels per CSS pixel —
that is what zoom *is* — so it arrives as a denser display and walks the same
table. Chrome and Firefox report it through `devicePixelRatio`; Safari pins its
dpr to the hardware and moves `innerWidth` instead; the kit tracks both and
`truePixelRatio()` is the number that folds them together (`src/zoom.ts`).

A 2× display, through the ladder:

| zoom | trueDpr | true 1/72″ wants | device px / system px |
| --- | --- | --- | --- |
| 50% | 1.0 | 1.33 | 1 |
| 75% | 1.5 | 2.0 | 2 |
| 100% | 2.0 | 2.67 | 3 |
| 110% | 2.2 | 2.93 | 3 |
| 125% | 2.5 | 3.33 | 3 |
| 150% | 3.0 | 4.0 | 4 |
| 200% | 4.0 | 5.33 | 5 |
| 300% | 6.0 | 8.0 | 8 |

The target is a step function, so **zoom sometimes changes nothing** — 100%,
110% and 125% all round to 3, and the art holds still while the copy around it
grows. That is the nearest whole count being the same count; bending it to feel
more responsive would put the art off the grid. It is monotonic by
construction: a deeper zoom never renders the art smaller.

Resizing the window is never read as zoom; a viewport change counts only when
both axes rescale together to a real zoom level. Page load is the baseline: a
page that loads already-zoomed reads that as its 100%, and `resetZoomBaseline()`
declares the current state to be 100% again. Pinch-to-zoom is not followed (it
changes no rasterization density), and a pinned `--vf-scale` opts out entirely.

```sh
npm run verify:zoom
```

## The device-pixel grid

A component is built from whole system pixels, so every edge inside it sits on
the grid — but only relative to its own origin. Land that origin or its size on
a fractional device pixel and the 1-bit interior rasterizes wrong: stepped
corners staircase asymmetrically, hairline borders and glyph stems smear across
two device rows and go gray.

Three rules. One call covers the second:

**1. Keep `--vf-scale × trueDpr` a whole number.** `trueDpr` is device px per
CSS px *including* zoom (`truePixelRatio()` reads it correctly in every
engine). The derived scale is `devicePxPerSystemPx(trueDpr) / trueDpr`, whole
by construction. A hand-picked scale is your responsibility:

| `--vf-scale` | 1× display | 2× retina | 3× hi-dpi |
| --- | --- | --- | --- |
| `1`, `2`, `3` … | ✓ | ✓ | ✓ |
| `1.5` | ✗ 1.5 | ✓ 3 | ✗ 4.5 |
| `1.25` | ✗ 1.25 | ✗ 2.5 | ✗ 3.75 |

**2. State every `line-height` in whole pixels, and keep `padding`, `margin`
and `gap` on integers.** Line boxes are the biggest offender — `1.65 × 17px` is
`28.05px`, and every line of prose nudges everything after it further off.

```css
/* ✗ */ p { font-size: 17px; line-height: 1.65; }  /* → 28.05px */
/* ✓ */ p { font-size: 17px; line-height: 28px; }
```

**3. Position a box that contains components from its start edge, or give it a
whole-pixel size.** Anything right-aligned, centered or sharing
`space-between` computes its origin as `edge − width`, so a width derived from
a text run lands it off the grid.

```css
/* ✗ */ .toolbar__label { /* width from its text */ }
/* ✓ */ .toolbar__label { width: 84px; }
```

`vf-paragraph`, `vf-label` and `vf-stack` state their line box and their size
in whole system px themselves, so text and containers set in the kit's own
components satisfy rules 2 and 3 by construction.

### Grid snapping

`applyGridSnap()` has every component measure its own position and cancel the
fractional remainder itself, which covers rule 2 and the origin half of rule 3:

```ts
import { applyGridSnap, requestGridSnap } from 'vintage-frames'

applyGridSnap()   // → returns a cleanup function
requestGridSnap() // re-run after moving components in a way that resizes nothing
```

The correction is applied inside each component's shadow root — the host's
`position`, `left`/`top` and `margin` are never touched, so it cannot collide
with your layout. Its whole footprint on your DOM is `--vf-snap-dx` /
`--vf-snap-dy` on each corrected host, and a corrected component's painted box
can sit up to half a device pixel outside its layout box. Corrections re-apply
on resize, scroll, webfont load and density change. Opt one element out with
`nosnap`. It stays opt-in for now.

```sh
npm run verify:grid   # every vf-* host, at dpr 1 / 2 / 3 — reports ORIGIN or SIZE
npm run verify:snap   # …and that applyGridSnap() recovers a page knocked off it
```

Point both at your own pages with `VF_GRID_PAGES` / `VF_SNAP_PAGES` (and
`VF_ORIGIN` / `VF_SNAP_DPR`). Both need a page that doesn't call
`applyGridSnap()` itself.

### The tile grid

A repeating fill was the one surface paint snapping couldn't save: CSS
`background-repeat` places every copy at `k × tileSize` from ONE stored
length, the engine quantizes that length to its layout grid (1/64 CSS px in
Chromium), and the error compounds with `k` until the 1-bit art smears gray.
The kit's tile spans (`lcm(motif, 15)` system px) make that length exact for
every density the ladder derives — but zoom mints scales with arbitrary prime
denominators (20/17 at Safari's 85%, 30/23 at its 115%), and no finite span
can hold those.

So the four tiled surfaces (desktop dither, windoid dots, swatch checker,
barber stripes) no longer repeat in CSS. The kit's own art renders as **one
whole-surface raster** at one image pixel per system pixel, magnified
nearest-neighbor — the same mechanism as `vf-img`, and 1-bit at every scale:
nearest-neighbor sampling can only produce source colors, and one box has no
interior seams to drift. A consumer pattern token (`--vf-desktop-pattern` and
friends) renders instead as a **flat grid of placed tiles** at the token's
documented 30- or 60-px tile geometry, each tile positioned by a single
`calc()` quantized once, so nothing accumulates; raster token art magnifies
nearest-neighbor too. The token contract is unchanged, with one nudge: a
token swapped at runtime without touching the component wants a
`requestUpdate()`.

The scroll trough converted with the rest when the kit took over drawing its
scroll rails: once the one holdout (a `::-webkit-scrollbar` pseudo-element can
host no children), it is ordinary DOM now and renders through the same
whole-surface raster as the desktop dither — 1-bit at every scale, Safari's
zoom-minted ones included. `npm run verify:tile` holds the four converted
surfaces to zero gray pixels at eight densities — the ladder plus 1.7 and 2.3,
the emulated stand-ins for Safari's broken zoom rungs — and
`npm run verify:scrollbars` holds the trough to the same bar.

## Layout

Two stylesheet-free ways to lay out a window's insides: stack them, or place
each child by coordinate.

### `vf-stack`

A flexbox whose `gap`, `pad`, `width` and `height` are declared in whole system
px, so a window's insides need no `calc(var(--vf-scale, 1) * …)` in your
stylesheet. That matters because scaling is per component — each element sets
`--vf-scale` on *itself*, never on the document — so `var(--vf-scale, 1)` in
page CSS silently falls back to `1` outside a `vf-*` ancestor.

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

The content governs the box: a column is as wide as its widest child, a row as
tall as its tallest, and children keep the size they were drawn at. The stack
distributes, never resizes, and shrink-wraps. It paints nothing, takes no role,
and returns `font`, smoothing, `color`, `user-select` and `text-align` to
`inherit`.

`fill-width`/`fill-height` name the outcome, not an axis, so the stack compiles
each to the main or cross axis depending on which way it runs. **The cross axis
always has a size; the main axis only has slack if you declared one** — so
`fill-width` always works in a column and needs a declared `width` in a row,
and `fill-height` is the other way round. A fill with nothing to take is inert,
not an error, and two children filling the main axis come out equal. A stack
reads both attributes about *itself* too, for parents that aren't stacks.
Three components have no width of their own (`vf-separator`,
`vf-progress-bar`, `vf-slider`), so those read wrong until filled; for a
cross-axis fill a direction doesn't offer, `align-self: stretch` in your own
stylesheet wins.

Two things it can't fix: centering can't land on a whole pixel by itself (a
16px caption centered against the 25-system-px `vf-number-field` sits at 4.5 —
use `place="start"`), and a flex container doesn't collapse margins, so
`vf-fieldset`'s 8px of legend room is genuinely reserved inside a stack.

```sh
npm run verify:stack
```

### `top` and `left`

Nearly every component takes `top` and `left` in whole system px. Set either
and the element is absolutely positioned within its parent, the coordinate you
left out defaulting to 0. Set neither and it renders in flow:

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

The coordinates are written as a live `calc(var(--vf-scale, 1) * Npx)`, so a
placed layout scales with the display and sits on the device-pixel grid.
`right`/`bottom` are released and `margin` zeroed while placed; removing both
attributes returns the element to flow with every inline declaration unwound.

**Where (0,0) is** is CSS's nearest positioned ancestor, and every kit
container is one: the desktop's raster, a window's content region, a dialog's
content area, a stack's box, a fieldset just inside its border, a scroll area's
scrolled plane. In a parent of your own, add `position: relative` — the one
line of CSS this feature can't write for you.

- **Four elements don't take the pair:** `vf-option`, `vf-menu-item`,
  `vf-list-item` and `vf-menu` are owned rows of a managing container.
- **`vf-dialog` takes it in viewport coordinates** — `showModal()` puts a modal
  in the top layer, whose containing block is the viewport. Leave the pair off
  and the modal is centered, recomputed whenever its box or the viewport
  changes. Setting either coordinate back to `null` returns it to centering.
- **Gestures write through the same properties.** A title-bar drag on a
  `vf-window` or `vf-dialog`, a drag or arrow-key nudge on a `vf-icon`, and
  `vf-window`'s grow box all state whole system px, so activating a window
  never snaps it back and a zoom leaves it where it was dropped. Setting a
  property yourself re-places it.
- **A movable element needs a coordinate system**, and its parent needs a
  declared size for the clamp to work in. Without one, the first move pulls the
  element out of flow and reflows the page under it; the kit warns once per
  element and keeps the gesture working. `position: absolute` in your own
  stylesheet satisfies the requirement too.
- **Read a moved element's position off the properties** (`win.left`), not
  `style.left` — the inline value is a live `calc()`, so `parseFloat` gives
  `NaN`. Coordinates land on the lattice a drag step uses: 1 system px on a 1×
  display, 2 on a 2× one. Nothing re-snaps a dropped coordinate afterwards.
- **Non-movable costs nothing:** an element nobody asked to move takes no
  position, no tab stop and no role, and lays out in your flex row or grid like
  any other element.

`width` and `height`, also in whole system px, are the other half of the
rectangle: `vf-window`, `vf-stack`, `vf-label` and `vf-paragraph` take them as
the `VfSized` mixin, and `vf-desktop`, `vf-dialog`, `vf-img`, `vf-swatch` and
`vf-icon` declare their own size the same way. Everything else keeps the size
it draws itself at.

```sh
npm run verify:position
```

## Window archetypes

The 1992 *Macintosh Human Interface Guidelines* names five standard windows.
The kit ships two parameterized shells; each archetype is a one-line recipe:

| Archetype | Recipe |
| --- | --- |
| Document window | `<vf-window closable zoomable movable resizable scrollbars="both">` |
| Movable modal dialog box | `<vf-dialog heading="…">` |
| Modal dialog box | `<vf-dialog frame="plain">` |
| Modeless dialog box | `<vf-window closable movable>` |
| Utility (floating) window | `<vf-window variant="utility" movable>` |

Every recipe also declares `width` and `height` in system px; the three
`movable` ones declare `top` and `left` as well. A window is a fixed box in
both axes — content taller than the declared box is clipped at the frame, and
`scrollbars` is how the user reaches the rest. A control's drop-open list still
escapes the clip.

`frame="plain"` is the modal double frame (1px outer rule, 2px gap, 2px inner
band, no shadow). `variant="utility"` is the windoid: a 12px bar with a
dot-grid dither and 7×7 widgets, floating above every document window inside a
`vf-desktop` and standing outside the single-active rule. `scrollbars` puts the
rails on the window edge with the grow box in the corner cell.

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

`label` is stated because the plain frame has no title bar to take a name from,
and the copy takes the chrome face because an alert speaks in chrome type.

## Fonts

Two bitmap faces ship inside the components and register themselves on
`document.fonts`, so they render inside every shadow root with no global CSS:

- **`VF Display`** — the chrome face: menu bar, menus, window and dialog
  titles, buttons, checkboxes, radios, popup menus, fieldset legends, and
  editable text/number fields. Converted from the genuine Chicago 12pt strike.
- **`VF Body`** — the body face: list rows and page copy. The genuine Geneva
  9pt strike.

They ship under the kit's names rather than the strikes', since a family name
goes into the font binary and every consumer's `font-family` stack.
[fonts/README.md](./fonts/README.md) has the pipeline and provenance. The
*fallbacks* after each family still name `Chicago`, `Charcoal` and `Geneva`,
which select faces the reader may already have installed.

Both render on their native 1024-upm pixel grid (one design pixel = one system
pixel), scale with `--vf-scale`, and are registered with `ascent-override: 75%`
/ `descent-override: 25%` / `line-gap-override: 0%` so baselines land on whole
pixels. Re-theme with `--vf-font-family-display` / `--vf-font-family`, plus the
matching `--vf-font-size-display` / `--vf-font-smoothing-display` and
`--vf-line-height-display` / `--vf-line-height` — a swapped strike states its
family, size and line together.

Every strike renders at its native size, so there is no size knob: a different
size is a different strike. Fine print is the body face at its own size
(`face="body" dim`).

**Your own text goes on the same faces with `vf-label` and `vf-paragraph`**,
which state their line box in whole system pixels — 16px for the chrome face,
12px for the body face — so a column of copy accumulates whole offsets:

```html
<vf-label for="disk">Install Location:</vf-label>
<vf-select id="disk">…</vf-select>

<vf-paragraph>Click Install to place DragThing on your hard disk.</vf-paragraph>
<vf-paragraph dim>Approximate disk space needed: 4,584K</vf-paragraph>
```

`face="body"` / `face="display"` swaps either, the line box following the face;
`dim` greys the text. `for` does what a native `<label for>` does — click to
focus, plus the accessible name, which lands on the control's `label` property
without overwriting one you set.

```sh
npm run verify:text
npm run verify:baseline
```

## Images and icons

Every mark the kit paints is geometry — a checkmark, a caret, the stepper
arrows, a radio's ring — drawn as inline SVG on integer coordinates
(`glyphs.ts`). The kit ships no raster content; the one raster it carries is
the embedded cursor set, base64 inside the module like the fonts.

Pictures are yours. Slot them through `vf-img` (or `vf-icon`'s and
`vf-list-item`'s icon slots) and the graphic stays a real `<img>` in your own
DOM — `alt`, `srcset`, loading behavior and asset URLs intact — magnified
nearest-neighbor at one image pixel per system pixel.

### `vf-icon`

`vf-img` puts a picture on the grid; `vf-icon` makes it a control — a picture
and a caption that select, move and rename together.

```html
<vf-icon label="Macintosh HD" width="64" selectable movable editable
         top="16" left="16">
  <vf-img slot="large"><img src="hd-32.png" alt=""></vf-img>
  <vf-img slot="small"><img src="hd-16.png" alt=""></vf-img>
</vf-icon>
```

- **Two slots.** `large` is the 32×32 `ICN#`, `small` the 16×16 `ics#`; `size`
  picks which one paints and the cell it paints in. The cell is held whether or
  not there is art for it, so a row of icons keeps one baseline. Both files
  fetch even though one paints — pay it with data URIs, or slot only the size
  that view uses.
- **`selectable`** makes the icon focusable, so `movable` and `editable`
  presuppose it. Clicking selects, Shift adds, a press anywhere else clears —
  single selection with no container. Selection inverts the art, since 1-bit
  icon art is ink and opaque white on a transparent surround.
- **Role follows the container.** Unowned, a `selectable` icon is `role="img"`
  named from its `label`; `role="option"` is invalid without a `listbox` that
  owns it. Wrap a field of icons in `<div role="listbox" aria-multiselectable>`
  and the selection becomes announceable. The wrapper is layout-neutral.
- **`open`** redraws the art as the open-window ghost — outline held in solid
  black, interior re-filled with the scroll rails' 25% dither, transparent
  surround untouched. It is derived from the slotted art in the client by
  canvas compositing alone, with no readback, so cross-origin art that taints
  its canvas still works. Set it when you handle `vf-open`.
- **`movable`, not `draggable`** — `draggable` is a global HTML attribute *and*
  an `HTMLElement` accessor, so declaring it would hand the element to the
  browser's drag-and-drop machinery. A focused movable icon also moves under
  the arrow keys: one system px, eight with Shift.
- **`editable`** opens a rename box on a click on the plate of an
  already-selected icon; Return commits, Escape reverts, and the plate widens
  as you type. The box waits out the double-click window (`RENAME_DELAY_MS`,
  800ms) so a double-click on the name opens the icon instead. Return opens the
  field at once.
- **`label` is a property**, because renaming means the component owns the
  string and hands it back on `vf-change`. Empty draws no plate — that is the
  "no label" setting.
- **Names are never abbreviated or folded** — one line, always, overflowing the
  cell centered. `maxlength` (31, the HFS limit) bounds the rename field, and
  going past it fires `vf-name-too-long` with `{ attempted, accepted, limit }`.
  A committed empty name is refused and fires `vf-name-rejected` with
  `{ attempted, kept, reason }` and no `vf-change`. A `label` set from your own
  data is displayed as given and fires nothing.
- **A declared `width` must be even.** The frame centers the art cell and the
  name over one axis, and a centered child lands on a whole pixel only when box
  and child share a parity. The component rounds its own plate to an even
  number of system px; it can't round a number you chose.

```sh
npm run verify:icon
```

## The cursor

The kit's chrome states the classic cursors as ordinary CSS — the arrow on
controls, the I-beam in an editable well — so a page that does nothing gets
System 7's pointer behavior at the OS's own crispness.

A faux desktop can draw the pointer itself:

```ts
import { applyCursor } from 'vintage-frames'

applyCursor() // → returns a cleanup function that restores the native pointer
```

That replaces the native pointer with the embedded System 7 set — arrow,
I-beam, crosshair and wristwatch as pixel art locked to the system-pixel
lattice, anchored to the page's `vf-desktop` (else the document root, or an
`anchor` you pass) so the cursor shares the raster's grid phase. It rides the
top layer above windows, menus and modals, and hides the native pointer with
two declarations, both applied for you: `* { cursor: none !important }` for the
light DOM including UA rules, and `:root { --vf-cursor: none }` for the shadow
trees and top layer.

Which art shows is read from state, not declared per control: `aria-busy="true"`
anywhere over the pointer is the wristwatch, an enabled text well takes the
I-beam, `data-vf-cursor="crosshair"` claims a region explicitly, anything else
is the arrow. The I-beam and crosshair draw with the classic XOR pen
(`filter: invert(1)` plus `mix-blend-mode: difference`). The wristwatch turns
its hand over 8 frames and holds still under `prefers-reduced-motion`.

Stable Safari's top layer refuses to blend against the page, and no feature
query can see the difference, so on Apple engines each XOR cursor draws its
`staticSrc` variant instead — same box, same hotspot, ink under a one-pixel
white halo. Give your own `invert` art a `staticSrc` too.

Every kind takes your own art: a `VfCursorArt` is frame URLs at one image px
per system px, the size, the hotspot, and whether it draws with the XOR pen.

```ts
applyCursor({
  crosshair: { src: '/my/pencil.png', width: 16, height: 16, hotspotY: 15 },
  wait: null, // never show the watch; busy surfaces keep the arrow
})
```

The pointer hides only once the arrow art has decoded, and a kind whose art
fails to load falls back to the arrow. The art ships inside the module as
base64 data URIs; `npm run embed:cursors` regenerates `src/cursor-art.ts` from
`cursors/*.png`.

## Accessibility

**Keyboard focus** is drawn in the 1-bit vocabulary rather than left to the
browser's ring. Where a control can carry the mark itself it does, as a 1px
dashed rule on the system-pixel grid (`vfFocusUnderline`) — inside the control
under the ink it marks (`vf-button` its label, `vf-checkbox` its box, `vf-radio`
its circle, the three fields their well, `vf-menu` its bar title), or below the
whole box where there is no interior to give (`vf-select` clear of its shadow,
`vf-swatch` clear of whatever it casts, `vf-slider` under the full rail so the
mark stays put as the handle travels). Only the controls with no face to draw
on — a window's close and zoom boxes, a list row, a scroll viewport — keep the
dotted ring. `vf-menu` and `vf-select` mark only while closed.

Either way it is **keyboard-only**: a mouse click never draws it. The four
controls where `:focus-visible` is true after a pointer — the three fields, and
`vf-select`/`vf-menu`/`vf-slider`, which suppress mouse focus to run a
press-drag gesture — gate on the page's last input modality
(`FocusRuleController`, `src/focus-modality.ts`).

**Forced-colors mode** (Windows High Contrast) re-declares the palette in
system colors — black ink becomes `CanvasText`, white faces `Canvas`, the
selection inversion the `Highlight` pair — and keeps drawing the kit's own
artwork: stepped silhouettes, the dashed focus rule, racing stripes, windoid
dither and barber stripes all survive on the user's palette (SPEC §1).

**The platform's form vocabulary works**, including on controls whose focusable
element lives inside a shadow root: `<label for>`, `aria-label` /
`aria-labelledby` / `aria-describedby`, and `required` with real constraint
validation — `form.reportValidity()` blocks, `:invalid` matches on the host,
`setCustomValidity()` works, and Enter can't submit past a failing constraint.

The host-to-shadow name bridge covers only the controls that need one — the
three fields, `vf-select`, `vf-swatch` and `vf-button`. Those six also take a
`description` property, which reaches assistive tech alongside the name and
carries the validation error while there is one. The controls whose role sits
on the host (`vf-checkbox`, `vf-radio-group`, `vf-slider`) have neither: your
own `aria-describedby` reaches them natively.

`vf-button` is a full form citizen: `type="submit"`/`"reset"` (with
`formaction`, `formmethod`, `formtarget`, `formenctype`, `formnovalidate`),
`name`/`value` in the submission, and a submission that runs at the *end* of
the click's propagation so `preventDefault()` cancels it. One platform limit: a
form-associated custom element can never be a form's `event.submitter`. The
submitter is an internal proxy parented to the button, so read the submitting
control as `event.submitter.closest('vf-button')` and tell buttons apart by
`submitter.name`/`.value`.

```sh
npm run verify:focus
npm run verify:forced-colors
npm run verify:names
npm run verify:button
```

## Editor support

The package ships a [custom elements manifest](https://github.com/webcomponents/custom-elements-manifest)
(`custom-elements.json`, generated by `npm run analyze`) and the two editor
formats derived from it. Point your editor at the one it speaks and `<vf-`
completes, with each attribute's doc comment on hover:

```jsonc
// VS Code — .vscode/settings.json
{ "html.customData": ["./node_modules/vintage-frames/editor/vscode.html-custom-data.json"] }
```

JetBrains IDEs read the `web-types` field in `package.json` on their own.

`npm run verify:manifest` holds the manifest to the source: that every
registered element reached it, that every documented `@csspart`, `@slot` and
`@fires` is real, and that a member a component *inherits* is actually wired up
(inheritance alone puts a property in your editor's autocomplete, so a control
that inherits `description` without rendering it looks normal from outside
while dropping every description you hand it).

Theming tokens are split by reach. A token only a few components read is
documented on each of them as an `@cssprop`, generated from the SPEC §3 table —
45 tags across 22 components. The 18 kit-wide knobs (`--vf-scale`, the palette,
both type stacks, the focus rule, the cursor) are described once in
[SPEC.md](./SPEC.md), and the whole set is listed with defaults in
[DESIGN-TOKENS.md](./DESIGN-TOKENS.md). Three kinds of token are deliberately undocumented: the
controller-owned grid-snap offsets, the private channels `vf-button-group` uses
to drive `vf-button`, and geometry a component sets on itself.

## Tests

```sh
npm test                   # all 34 verify scripts, in parallel
npm test -- focus button   # only the ones whose name matches
npm test -- --bail         # stop at the first failing script
npm run verify:focus       # one script, against a dev server you started
```

The `verify:*` scripts are the test suite: Playwright drivers where Node
reaches into a real page and asserts what the browser computed — rendered
pixels, resolved `calc()`, the accessibility tree, the device-pixel grid at
three densities. jsdom can resolve none of that, and an in-page runner can't
produce the **trusted** input `:focus-visible` and the focus-modality rule
require.

`npm test` starts a dev server on the port it will poll, runs every script in
parallel, prints one table and exits nonzero if any fail. A server already
listening is reused and left running. Shared code (the page builder, `check()`,
the tally, a PNG decoder, the accessibility-tree walker) lives in
[`scripts/harness.mjs`](./scripts/harness.mjs); each script keeps its own
header explaining what it defends.

## Utilities & style toolkit

The toolkit the components are built from is exported from the package root, so
a custom control can match the kit pixel-for-pixel:

```ts
import { vfBase, vfPanel, sys, glyphSvg, CHECKMARK } from 'vintage-frames'
```

| Export | What it's for |
| --- | --- |
| `applyScale`, `ScaleController`, `onScaleChange` | Opt a subtree, or your own component, into true-size rendering |
| `getZoom`, `truePixelRatio`, `onZoomChange`, `devicePxPerSystemPx`, `resetZoomBaseline` | The zoom half of scaling: tracked page zoom; device px per CSS px *including* zoom (what `devicePixelRatio` stops being in Safari under zoom); a zoom subscription; the density→target derivation; and the "current state is 100%" escape hatch |
| `applyGridSnap`, `requestGridSnap`, `GridSnapController` | Automatic device-pixel-grid snapping; add it to your own component with one controller line plus the `vf-snap` class on its painted root |
| `applyCursor`, `CURSOR_ARROW`, `CURSOR_I_BEAM`, `CURSOR_CROSSHAIR`, `CURSOR_WAIT` | Replace the native pointer with the embedded System 7 set; the constants are that art, exported for remixing |
| `sys`, `toSys`, `toSysExact`, `sysLength`, `sysLengths`, `effectiveScale`, `getScale`, `snapSys`, `systemPxQuantum`, `snapToSystemPx`, `snapToDevicePx`| Convert between system (art) px and CSS px against the effective `--vf-scale`. `sysLength`/`sysLengths` emit a live system-px length (or 1–4 value shorthand) for a position or size written onto an element; `snapSys` puts a system-px coordinate on the placement lattice, `snapToSystemPx`/`snapToDevicePx` are its CSS-px twins. `CLASSIC_DPI` / `CSS_REFERENCE_DPI` / `SYSTEM_PX_IN_CSS_PX` are the constants the target is derived from |
| `VfPositioned`, `VfSized`, `PlacementController` | The `top`/`left` and `width`/`height` mixins, plus the gesture half that states a drag's result in those same properties |
| `vfBase`, `vfDisplay`, `vfDisplayDecls`, `vfBodyDecls`, `vfStaticText`, `vfPanel`, `vfChromeFrame`, `vfModalFrame`, `vfTitleBar`, `vfWindowWidgets`, `vfHardShadowDecls`, `vfStripes`, `vfDots`, `vfFocus`, `vfFocusRing`, `vfFocusUnderline`, `vfToggle`, `vfField`, `vfScrollRail` | The 1-bit CSS recipes — compose into `static styles` |
| `ScrollRailController`, `renderScrollRail` | The kit-drawn System 7 scroll rails: the template helper renders the rail subtree (arrows, dither trough, the fixed 16px thumb) as a sibling of your scrolling element, and the controller syncs it to the native scrolling — which stays the platform's; only the native bar is hidden — while driving thumb drag, trough paging and arrow auto-repeat |
| `vfTileSize`, `vfTileMaskSize`, `tileImage`, `tileSpan`, `TILE_LATTICE` | A CSS-repeating fill's span and its art. State the motif in system px; the tile spans `lcm(motif, 15)`, the smallest whole number of motifs whose CSS length every derived scale can hold exactly. Still load-bearing for the underlays and the forced-colors masks; the converted surfaces (the scroll trough among them) render through the tile grid below |
| `vfTileGrid`, `tileGrid`, `tileRaster`, `tileRects`, `patternOverride`, `TileRasterCache` | The exact tiled fill (see "The tile grid"): a motif stated as rect data (`TileRect[]`) renders as one whole-surface raster (`tileRaster`, kit art) or a flat grid of placed tiles (`tileGrid`, consumer pattern tokens) — 1-bit at every scale, zoom-minted ones included |
| `glyphSvg` + the glyph constants (`CHECKMARK`, `CARET_DOWN`, `STEPPER`, …) | The 1-bit sprite set, rendered inline as SVG |
| `steppedRectClip`, `steppedRingClip`, `steppedCornerClip`, `BUTTON_FRAME`, `BUTTON_FACE`, `RING_FRAME`, `RING_HOLE`, `RING_INSET`, `SCREEN_CORNER` | Pixel-stepped corner profiles and their `clip-path` traces, plus the screen-corner mask |
| `DragController`, `ScrollStateController`, `TrackWidthController`, `DocumentListenersController` | Pointer-drag wiring; per-axis overflow and inactive-window reporting for the scrollbars; a track's measured width; document-level listeners scoped to an open panel or in-flight gesture |
| `focusModality`, `trackFocusModality`, `FocusRuleController` | Whether the keyboard or a pointer last drove the page, resolved against a host's own focus as one reactive flag |
| `emit`, `prefersReducedMotion`, `runSelectionBlink`, `BLINK_INTERVAL_MS`, `BLINK_FLIPS`, `PRESS_HOLD_MS`, `RENAME_DELAY_MS` | The `bubbles`+`composed` event convention; the ~250ms selection blink; the tap-vs-hold threshold; the rename delay |
| `defineElement`, `vfElement` | Register a custom element without the duplicate-copy footgun — both skip with a warning rather than throwing when the tag is taken |
| `VfFormControl`, `VfTextControlBase`, `VfToggleControl`, `VfModalDialog`, `modalDialogStyles` | Base classes: form association, the text-field recipe, the toggle interaction skeleton (a mixin), the native-`<dialog>` lifecycle |
| `registerEmbeddedFont`, `registerDisplayFace`, `registerBodyFace`, `VF_DISPLAY_FAMILY`, `VF_BODY_FAMILY` | Register the bitmap faces on `document.fonts` yourself; the constants are the family names (`'VF Display'`, `'VF Body'`) |

`VfToggleControl` is a mixin rather than a base class, because the kit's two
toggles sit on different bases: `vf-checkbox` extends `VfFormControl` (it
submits a value under a name), while `vf-radio` is not form-associated — its
`vf-radio-group` is the form surface. Apply it over whichever base your control
needs, and supply `checked`, the control's `ElementInternals`, its effective
disabled rule, and what a click or Space should do:

```ts
class MyToggle extends VfToggleControl(VfFormControl) {
  @property({ type: Boolean, reflect: true }) override checked = false
  protected override get toggleInternals() { return this.internals }
  protected override get toggleDisabled() { return this.isDisabled }
  protected override activate() {
    this.checked = !this.checked
    this.focus()
    emit(this, 'vf-change', { checked: this.checked })
  }
}
```

You get the click/Space wiring (including the held-Space auto-repeat guard),
one disabled gate every activation passes through,
`aria-checked`/`aria-disabled` mirroring, and a self-managed host tabindex that
never clobbers a consumer's own.
