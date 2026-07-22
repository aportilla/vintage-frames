# Vintage Frames

Lit web components that emulate the look and feel of **classic Mac OS
System 7** — racing-stripe title bars, 1px black borders, hard offset shadows,
Chicago-style bold type.

## Quick start

```sh
npm install
npm run dev      # demo/showcase at http://localhost:5173
npm run build    # library build to dist/
npm run typecheck
```

## Usage in your project

```ts
import 'vintage-frames'            // registers every <vf-*> element
import 'vintage-frames/vintage.css' // optional page defaults (desktop bg, font)
```

```html
<vf-desktop>
  <vf-menu-bar>
    <vf-menu label="File">
      <vf-menu-item shortcut="⌘N">New Window</vf-menu-item>
      <vf-separator></vf-separator>
      <vf-menu-item shortcut="⌘Q">Quit</vf-menu-item>
    </vf-menu>
  </vf-menu-bar>

  <vf-window heading="My Installer" movable>
    <p>Welcome!</p>
    <vf-fieldset legend="Install Location">
      <vf-select value="hd">
        <vf-option value="hd">Macintosh HD</vf-option>
      </vf-select>
    </vf-fieldset>
    <vf-button>Quit</vf-button>
    <vf-button variant="default">Install</vf-button>
  </vf-window>
</vf-desktop>
```

## Components

| Element | Purpose |
| --- | --- |
| `vf-desktop` | Gray desktop container; manages window stacking + active state |
| `vf-window` | Document window with striped title bar, close/zoom boxes, movable/resizable |
| `vf-dialog` | Movable-modal dialog (native `<dialog>` under the hood) |
| `vf-alert` | Classic double-framed modal alert |
| `vf-separator` | 1px rule (horizontal/vertical; dims inside menus) |
| `vf-button` | Push button; `variant="default"` renders the double-ring default button |
| `vf-checkbox` | Checkbox with the classic ✕ mark |
| `vf-radio`, `vf-radio-group` | Radio buttons with form-associated group |
| `vf-text-field`, `vf-text-area` | Bordered text inputs |
| `vf-number-field` | Numeric field with the classic "little arrows" stepper |
| `vf-select`, `vf-option` | Popup menu control ("Macintosh HD ▼") |
| `vf-progress-bar` | Determinate fill or indeterminate barber stripes |
| `vf-slider` | Horizontal 1-bit slider: solid-black fill up to a shield-shaped drag handle |
| `vf-menu-bar`, `vf-menu`, `vf-menu-item` | Pull-down menus with ⌘ shortcuts and selection blink |
| `vf-list`, `vf-list-item` | List box with inverted selection |
| `vf-scroll-area` | Container with System 7 scrollbars |
| `vf-fieldset` | Group box with legend punching through the border |

All visual constants are CSS custom properties (`--vf-*`) with inlined
fallbacks — components need **no global CSS**, and everything is themeable.
See [SPEC.md](./SPEC.md) for the full design spec, tokens, events, slots, and
parts.

## Display scaling — true classic size, crisp on any screen

Every component is authored in *system pixels* (the 1-bit art grid) and renders
each one as exactly **3 device pixels**, so the UI reads at its original ~72 dpi
physical size and stays pixel-crisp at any `devicePixelRatio`:

| Display | CSS scale (`3 / dpr`) |
| --- | --- |
| 1× standard | 3.0 |
| 2× retina | 1.5 |
| 3× hi-dpi | 1.0 |

This is **on by default** — a lone `<vf-button>` renders at true size with no
wrapper or setup, it re-adapts when the window moves to a different-density
monitor, and nested components compose without ever double-scaling.

Override it with the inherited `--vf-scale` custom property — set it on `:root`,
a subtree, or a single element:

```css
:root { --vf-scale: 1; }     /* pin to the fixed authored size (no scaling) */
.dense { --vf-scale: 1.25; } /* …or any factor */
```

Every metric multiplies by `--vf-scale` in `calc()`, so borders, type, glyphs,
the desktop dither and spacing all scale together and stay 1-bit crisp.

## Fonts

Two System 7 bitmap faces ship inside the components and register themselves on
`document.fonts`, so they render inside every shadow root with no global CSS:

- **ChiKareGo** — the Chicago-style *chrome* face: menu bar, menus, window and
  dialog titles, buttons, checkboxes, radios, popup menus, fieldset legends, and
  editable text/number fields (System 7 typed its dialog fields in Chicago).
- **FindersKeepers** — the *body* face: list rows and page copy.

Both render on their native 1024-upm pixel grid (one design pixel = one system
pixel) and scale with `--vf-scale` (see [Display scaling](#display-scaling--true-classic-size-crisp-on-any-screen)),
staying pixel-crisp. Retheme with `--vf-font-family-display` (chrome) and
`--vf-font-family` (body), plus the matching `--vf-font-size-display` /
`--vf-font-smoothing-display` tokens.
