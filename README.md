# Vintage Frames

Lit web components that rebuild the Mac OS System 7 interface — racing-stripe
title bars, 1px black borders, hard offset shadows, bitmap type. 31 elements,
no stylesheet to load.

- **[Showcase](https://aportilla.github.io/vintage-frames/)** — a full faux
  desktop: menu bar, movable windows, dialogs, icons, every control, drawn
  cursor
- **[Component reference](https://aportilla.github.io/vintage-frames/examples.html)**
  — every element, its API, and a live specimen of each state
- **[Integration example](https://aportilla.github.io/vintage-frames/blog.html)**
  — an ordinary blog page (system-font copy, normal flow, no global CSS) using
  the controls in its header, sidebar and forms

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

## Components

| Element | What it is |
| --- | --- |
| `vf-desktop` | Gray dithered desktop raster. Declare `width`/`height` in system px, or derive them with `fitWithin(w, h)`. Stacks slotted windows, manages active state, floats `variant="utility"` windows on their own tier. `bezel` adds the CRT surround with rounded top screen corners |
| `vf-window` | Window shell: striped title bar, `closable`/`zoomable` boxes, `movable`, `resizable`, edge scroll rails (`scrollbars`), slim windoid chrome (`variant="utility"`). Declare `width`/`height` in system px |
| `vf-dialog` | Modal shell over a native `<dialog>`. Striped movable bar by default; `frame="plain"` is the double-rule modal frame. Declare `width`/`height`; unset `top`/`left` means centered |
| `vf-separator` | 1px rule, `vertical` or horizontal. Renders as the dimmed dotted rule inside a menu |
| `vf-button` | Push button with pixel-stepped corners. `variant="default"` draws the double ring. Form-associated: `type="submit"`/`"reset"`, `name`/`value` |
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
| `vf-scroll-area` | Container with System 7 scrollbars. Reserves the rail per `axis` — arrows always drawn, trough and thumb filling in on overflow |
| `vf-fieldset` | Group box with the legend punching through the border |
| `vf-grid` | Lattice of equal cells with 1px rules. `columns`/`rows`/`cell-width`/`cell-height`; `rules` picks the pen, `frameless` drops the perimeter, `collapse` lands a cell's border on the rule |
| `vf-stack` | Flexbox whose `gap`, `pad`, `width` and `height` are declared in system px. Content-governed; `fill-width`/`fill-height` on a child asks for more |
| `vf-container` | A plain box with a declared `width`/`height` and no paint of its own. The positioned ancestor for children placed with `top`/`left`; takes `top`/`left` itself and keeps its box (and everything placed in it) on the device-pixel grid |
| `vf-label` | Static caption in the chrome face. `for` focuses and names a control; `width` sets a whole-pixel caption column |
| `vf-paragraph` | Copy in the body face on a whole-pixel line box; `width`/`height` set the box the text wraps to |
| `vf-img` | Pixel art on the grid — sizes a slotted `<img>` to one system px per image px, magnified nearest-neighbor |
| `vf-icon` | Finder icon: art in a 32×32 or 16×16 cell with a name plate below. `selectable`, `open`, `movable`, `editable` |

The [component reference](https://aportilla.github.io/vintage-frames/examples.html)
shows each of these live, with its full API.

## Taking only what you use

The root import registers all 31 elements. Import by name to ship less — same
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
| `vf-separator.js` — sets no chrome type, so it carries no display face | 18.8 KB | 10.3 KB |
| `vf-button.js` | 40.3 KB | 20.0 KB |
| …plus `vf-checkbox.js` | 46.0 KB | 21.6 KB |
| the root import — all 31 elements | 299 KB | 91.0 KB |

The first component carries the shared code; each one after it adds a couple
of KB, so importing by name pays off up to roughly a third of the kit. Keep it
one copy of one package — the scaling, grid snapping, focus modality and font
registration are module-scoped singletons. If a second copy loads anyway,
elements register through `defineElement()`, which keeps the first
registration and warns rather than throwing.

## Sizing

Every component is authored in *system pixels* — the 1-bit art grid, where a
border is 1 and a push button 20 tall. On a Macintosh that pixel was 1/72 inch.
Each component reads the display density and renders one system pixel as the
whole number of device pixels nearest that size, so the art always lands on
the device-pixel grid. On by default, no setup, nested components never
double-scale, and page zoom is tracked and handled the same way.

So the CSS size follows the display: the same push button is 20px tall on a 1×
monitor and 30px on a 2× one, while the page's own 17px copy is 17px on both.
That suits a full-screen faux desktop; next to ordinary page text you may want
a fixed size. Pin it with the inherited `--vf-scale` custom property, declared
in a stylesheet the page loads *before* the components upgrade:

```css
:root { --vf-scale: 1; }  /* fixed authored size: a 20px button, 16px label */
```

A hand-picked factor must keep `--vf-scale × devicePixelRatio` a whole number
— `1`, `2`, `3` everywhere; `1.5` only on displays it multiplies out on — or
the 1-bit art rasterizes gray. Two helpers put the rest of the page on the
same grid:

```ts
import { applyScale, applyGridSnap } from 'vintage-frames'

applyScale()    // your own markup adopts the kit's scale via --vf-scale
applyGridSnap() // every component cancels a fractional offset your layout hands it
```

[docs/SIZING.md](https://github.com/aportilla/vintage-frames/blob/main/docs/SIZING.md)
covers the density ladder, zoom, and the three rules that keep a page on the
device-pixel grid.

## Layout

Two stylesheet-free ways to lay out a window's insides. `vf-stack` is a
flexbox whose `gap`, `pad`, `width` and `height` are declared in whole system
px — content-governed, with `fill-width`/`fill-height` on a child asking for
more. Or place each child by coordinate: nearly every component takes `top`
and `left` in whole system px, absolutely positioned within the nearest kit
container (a window's content region, a dialog, a stack, a `vf-container`).
Gestures write through the same properties — a title-bar drag, an icon nudge
and the grow box all state whole system px, so read positions off `win.left`,
not `style.left`.

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

There is no alert component — an alert is the plain modal frame plus your own
icon art in a `vf-img`.

## Fonts

Two bitmap faces ship inside the components and register themselves on
`document.fonts`, so they render inside every shadow root with no global CSS:
**VF Display**, the chrome face, and **VF Body**, the body face. Both are the
kit's own artwork — re-drawn strikes in the style of Chicago 12pt and Geneva
9pt, the classic Macintosh faces designed by Susan Kare for Apple — extended
in the same idiom (`€`, arrows, `⌘ ⇧ ⌥ ⌃`, fractions, accents) so modern copy
doesn't fall back mid-sentence. Set your own text in them with `vf-label` and
`vf-paragraph`, whose line boxes sit on whole system pixels; every strike
renders at its native size.

## The cursor

The chrome sets the classic cursors with ordinary CSS. A faux desktop can also
draw the pointer itself:

```ts
import { applyCursor } from 'vintage-frames'

applyCursor() // → returns a cleanup function that restores the native pointer
```

That replaces the native pointer with the embedded System 7 set — arrow,
I-beam, crosshair and wristwatch as pixel art locked to the system-pixel
lattice, the I-beam and crosshair drawn with the classic XOR pen. Each kind
accepts custom art.

## Accessibility

Keyboard focus is drawn in the 1-bit vocabulary — a dashed underline on the
pixel grid, keyboard-only. Forced-colors mode (Windows High Contrast)
re-declares the palette in system colors and keeps drawing the kit's artwork.
The platform's form vocabulary works, including into shadow roots: `<label
for>`, `aria-label`/`aria-labelledby`/`aria-describedby`, and `required` with
real constraint validation — `form.reportValidity()` blocks, `:invalid`
matches on the host, and `vf-button` submits like a native button.

## Editor support

The package ships a [custom elements manifest](https://github.com/webcomponents/custom-elements-manifest)
and the two editor formats derived from it. Point your editor at the matching
format and `<vf-` completes, with each attribute's doc comment on hover:

```jsonc
// VS Code — .vscode/settings.json
{ "html.customData": ["./node_modules/vintage-frames/editor/vscode.html-custom-data.json"] }
```

JetBrains IDEs read the `web-types` field in `package.json` on their own.

## Matching the kit

The toolkit the components are built from is exported from the package root —
the 1-bit CSS recipes (`vfPanel`, `vfTitleBar`, `vfFocusUnderline`, …), the
glyph sprites, the stepped-corner clip traces, the scale/zoom/snap machinery
and the form-control base classes — so a custom control can match the kit
pixel-for-pixel. [docs/TOOLKIT.md](https://github.com/aportilla/vintage-frames/blob/main/docs/TOOLKIT.md)
documents every export.

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/SPEC.md](https://github.com/aportilla/vintage-frames/blob/main/docs/SPEC.md) | The design spec — every token, slot, part and event. Ships in the package |
| [docs/DESIGN-TOKENS.md](https://github.com/aportilla/vintage-frames/blob/main/docs/DESIGN-TOKENS.md) | Every `--vf-*` theming token, its default and what reads it |
| [docs/SIZING.md](https://github.com/aportilla/vintage-frames/blob/main/docs/SIZING.md) | True-size rendering: the density ladder, zoom, the device-pixel grid rules, grid snapping, the tile grid |
| [docs/LAYOUT.md](https://github.com/aportilla/vintage-frames/blob/main/docs/LAYOUT.md) | `vf-stack`, coordinate placement, the window archetypes in full |
| [docs/FONTS.md](https://github.com/aportilla/vintage-frames/blob/main/docs/FONTS.md) | The bitmap faces: metrics, theming, design lineage |
| [docs/ICONS.md](https://github.com/aportilla/vintage-frames/blob/main/docs/ICONS.md) | `vf-img` and `vf-icon` in full |
| [docs/CURSOR.md](https://github.com/aportilla/vintage-frames/blob/main/docs/CURSOR.md) | The drawn cursor set and custom cursor art |
| [docs/ACCESSIBILITY.md](https://github.com/aportilla/vintage-frames/blob/main/docs/ACCESSIBILITY.md) | Focus, forced colors, and the form contract in full |
| [docs/TOOLKIT.md](https://github.com/aportilla/vintage-frames/blob/main/docs/TOOLKIT.md) | Every root export — recipes, controllers, base classes |
| [docs/DEVELOPING.md](https://github.com/aportilla/vintage-frames/blob/main/docs/DEVELOPING.md) | Working on the kit: demo pages, the verify suite, the generated editor data |

## License

[MIT](https://github.com/aportilla/vintage-frames/blob/main/LICENSE) © Adam
Portilla. The embedded faces are the kit's own re-drawn strikes; the designs
they re-draw — Chicago and Geneva — were created by Susan Kare for Apple.
