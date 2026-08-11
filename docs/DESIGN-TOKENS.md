# Design tokens

Every visual constant in Vintage Frames is a `--vf-*` custom property with an
inlined fallback, so a component on a blank page renders correctly with no
global CSS — and every one of them can be overridden at `:root`, on a subtree,
or on one element:

```css
:root { --vf-shadow-offset: 1px; }
vf-menu-bar::part(bar) { padding-inline: 24px; }
vf-button::part(button) { min-width: 96px; }
```

Every length below is a **system pixel** value — the kit multiplies it by
`--vf-scale` in `calc()` — so a re-themed metric stays crisp on any display.

> **Line boxes are lengths too.** Re-theme them with whole numbers, or you put
> the components below them off the device-pixel grid.

## Type

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-font-family` | VF Body, Geneva, … | Body face (list rows, page copy) |
| `--vf-font-family-display` | VF Display, Chicago, … | Chrome face (menus, buttons, titles, fields) |
| `--vf-font-size` | `16px` | Body face size |
| `--vf-font-size-display` | `16px` | Chrome face size |
| `--vf-font-weight` | `700` | All text — the display face is inherently bold |
| `--vf-font-smoothing-display` | `none` | Crisp 1-bit chrome edges; set `antialiased` if you point the display family at a vector face |
| `--vf-line-height` | `12px` | The body face's native line — the pitch wrapped body copy sits on; re-theme it alongside the body font tokens |
| `--vf-line-height-display` | `16px` | The display face's native line — wrapped chrome copy, captions, the text area and the window/dialog title patch |
| `--vf-label-line-height` | follows the face | `vf-label`'s own line box, overriding both face tokens for captions alone |
| `--vf-paragraph-line-height` | follows the face | `vf-paragraph`'s own line box, overriding both face tokens for paragraphs alone |

A swapped strike states its family, size and line together — the three tokens
travel as a set (see [FONTS.md](./FONTS.md)).

## Palette

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-black` | `#000000` | Borders, text, stripes, selection bg |
| `--vf-white` | `#ffffff` | Content wells, control faces |
| `--vf-surface` | set by containers | Backdrop behind legends and label patches |
| `--vf-disabled` | `#c0c0c0` | Dimmed text and glyphs |
| `--vf-highlight` / `-text` | `#000000` / `#ffffff` | Selection colors |

Under forced colors (Windows High Contrast) the kit remaps these to the system
pair (`CanvasText`/`Canvas`, `Highlight`/`HighlightText`) itself.

## Patterns

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-desktop` | `#808080` | Base color under the desktop dither |
| `--vf-desktop-pattern` | SVG tile | The desktop's 50% dither |
| `--vf-dots-pattern` | SVG tile | The windoid bar's dot-grid dither |
| `--vf-swatch-checker` | SVG tile | `vf-swatch`'s transparency checker |
| `--vf-progress-stripes` | SVG tile | Indeterminate barber stripes |

A pattern token renders as a placed tile grid rather than a CSS
`background-repeat`, so it stays 1-bit at every scale; a token swapped at
runtime without touching the component wants a `requestUpdate()`.

## Control metrics

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-control-height` | `22px` | Text fields, and the number field's well |
| `--vf-button-height` | `20px` | `vf-button` face |
| `--vf-button-ring-margin` | `4px` | Room reserved for the default ring (`vf-button-group` zeroes it) |
| `--vf-button-flex` | `0 1 auto` | The inner button's flex (the group sets `1 1 auto`) |
| `--vf-button-group-gap` | `12px` | Gap between grouped buttons |
| `--vf-field-width` | `180px` | Default width of the text field and area |
| `--vf-number-field-width` | `4em` | Width of the number field's well |
| `--vf-list-max-height` | `200px` | `vf-list` |
| `--vf-progress-fill` / `-track` | `#000000` / `#ffffff` | `vf-progress-bar` |

## Menus & popups

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-menubar-height` | `20px` | `vf-menu-bar` — 19 white system px over the 1px black rule |
| `--vf-menu-row-height` | `16px` | `vf-menu-item` row pitch |
| `--vf-menu-shortcut-column` | `23px` | The right-anchored ⌘-shortcut slot — ⌘'s 11px advance plus the face's widest letter; widen it to line up longer shortcuts ("⌘⇧S") |
| `--vf-select-gutter` | `16px` | The ✓ column, shared by select, option and menu item |
| `--vf-popup-height` | `18px` | `vf-select` pill |
| `--vf-popup-inset-top` / `-bottom` | `4px` | The screen-edge reserve a clipped popup panel keeps clear; declare once on `:root` (`24px` top clears a `vf-menu-bar`) |
| `--vf-separator-color` / `-style` | `--vf-black` / `solid` | Menus set the dimmed dotted rule |

## Windows & chrome

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-titlebar-height` | `18px` | Window / dialog title bars |
| `--vf-titlebar-height-utility` | `12px` | The windoid bar |
| `--vf-title-inset` | `16px` / `60px` | The centered title's clearance from the widgets |
| `--vf-shadow-offset` | `2px` | Window / menu hard shadow |
| `--vf-scrollbar-thumb` | `#ffffff` | The elevator |
| `--vf-scrollbar-track` | `#c0c0c0` | Firefox fallback only — the dither's flat average |
| `--vf-icon-gap` | `2px` | `vf-icon`, cell to plate |
| `--vf-icon-label-height` | `12px` | `vf-icon`'s plate line box |

## Focus

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-focus-outline` | `1px dotted #000` | The dotted ring, for the controls with no face to draw on |
| `--vf-focus-offset` | `2px` | Its `outline-offset` |
| `--vf-focus-underline-offset` | `4px` | Where the dashed focus rule sits, from the underlined element's padding-box bottom |

## The cursor

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-cursor` | unset — each spot keeps its classic pointer | Read wherever the kit states a cursor of its own (control hosts, title-bar widgets, scroll rails, editable wells, a modal's backdrop). `applyCursor()` sets it to `none` for you, paired with the page-side `* { cursor: none !important }` blanket |

## Reserved

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-snap-dx` / `-dy` | written by the kit | The grid-snap correction. Do not set these |

---

Per-component tokens are also documented as `@cssprop` entries in the
[custom elements manifest](../custom-elements.json) and the editor data derived
from it, so they show on hover in an editor pointed at the package.
[SPEC.md §3](./SPEC.md) is the design spec these defaults come from;
the [reference page](https://aportilla.github.io/vintage-frames/examples.html)
shows each component's tokens beside a live specimen.
