# Vintage Frames — System 7 Component Specification

Lit 3 web components that faithfully emulate the look and feel of classic Mac OS
System 7 (1991–1997). This document is the single source of truth for visual
design and public APIs. Every component MUST follow it.

> **Reference images:** the `Classic Macintosh UI Kit Reference/` folder at the
> repo root contains authoritative pixel references (`Windows.png`,
> `Controls.png`, `Menus.png`, `Icons & symbols.png`, example screens). When
> this spec is ambiguous, the reference images win.
>
> **Glyph sprites:** `Classic Macintosh UI Kit Reference/ui-sprites/` holds the
> individual 1-bit control glyphs (checkbox ✕, radio ring/dot, menu ✓, popup ▼,
> scroll arrows). Each is reconstructed pixel-for-pixel as an inline-SVG fill
> path in `src/glyphs.ts` (shared, `currentColor`-themeable, zero raster assets)
> and consumed by the components below — the authoritative source for these
> marks.

## 1. Design principles

The System 7 look, distilled:

- **1px solid black borders** on everything — even when disabled. Dimming a
  control greys its label/text only; the border, box and glyph stay solid black
  (System 7 dims the label, not the control).
- **Hard offset shadows** — `2px 2px 0 0 #000` for windows/menus/panels,
  `1px 1px 0 0 #000` for small popup controls. Never blurred, never rgba.
- **Racing-stripe title bars** — 6 horizontal 1px black pinstripes on the white
  title bar; the title text and window widgets sit on solid white patches that
  interrupt the stripes.
- **Chicago-style type** — bold, dark, tight. One size for almost everything.
- **1-bit monochrome palette** — black and white only, plus mid gray (`#808080`)
  for dimmed/disabled and as the base tone under the 50% dither patterns
  (desktop, scroll troughs). Surfaces are flat solid white — no bevels.
- **No gradients, no border-radius except buttons, no CSS transitions** —
  interactions are instant. The single sanctioned animation is the classic
  menu-item "blink" on selection and the indeterminate progress stripes.
- **Selection inverts** — selected/active states are white-on-black inversion,
  not tinted highlights.

Modern requirements that we deliberately keep (accessibility over purity):

- `:focus-visible` gets `outline: var(--vf-focus-outline, 1px dotted #000); outline-offset: 2px;`
  (text inputs instead thicken their border on focus, see §5).
- Full ARIA roles + keyboard support per component.
- Form-associated custom elements where noted (`static formAssociated = true`
  + `ElementInternals`).

## 2. Code conventions (mandatory)

- Tag names: `vf-*`. Class names: PascalCase (`vf-radio-group` → `VfRadioGroup`).
- One component per file: `src/components/vf-<name>.ts`.
- Lit 3 + TypeScript strict, experimental decorators: `@customElement`,
  `@property`, `@state`, `@query`, `@queryAssignedElements`.
- Relative imports use the `.js` extension (e.g. `../styles/base.js`).
- Shared styles: `import { vfBase, vfStripes, vfPanel } from '../styles/base.js'`
  and compose: `static override styles = [vfBase, css\`...\`]`.
- Every component file ends with:
  ```ts
  declare global {
    interface HTMLElementTagNameMap { 'vf-button': VfButton }
  }
  ```
- All colors/metrics via `var(--vf-*, <default>)` **with the default inlined**
  so components work with zero global CSS. Never hardcode a color without a var.
- Boolean public props reflect: `@property({ type: Boolean, reflect: true })`.
- Events: `CustomEvent` with `{ bubbles: true, composed: true }` and an object
  `detail`. Names are listed per component (`vf-change`, `vf-close`, …).
- Disabled pattern: reflected `disabled` attr; the **label/text** dims to
  `--vf-disabled` gray while borders, boxes and glyphs stay black; interaction
  handlers early-return; set `aria-disabled`/`disabled` on internals.
- Components must render nothing surprising outside their box: no margins on
  `:host` by default.
- Do NOT run repo-wide `tsc` while building an individual component group —
  sibling files may not exist yet. A later phase compiles everything.

## 3. Design tokens

Use with inline fallback: `var(--vf-white, #ffffff)`. `src/styles/vintage.css`
documents the same set for consumers to override at `:root`.

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-font-family` | `'Chicago', 'ChicagoFLF', 'Charcoal', 'Geneva', 'Helvetica Neue', Helvetica, Arial, sans-serif` | all text |
| `--vf-font-size` | `15px` | all text (menus, buttons, labels) |
| `--vf-font-size-small` | `12px` | fine print (e.g. disk-space captions) |
| `--vf-font-weight` | `700` | all text (Chicago is inherently bold) |
| `--vf-black` | `#000000` | borders, text, stripes, selection bg |
| `--vf-white` | `#ffffff` | content wells, control faces |
| `--vf-surface` | *(set by containers)* | bg behind legends/label patches; `vf-window` and `vf-dialog` both set it to white |
| `--vf-disabled` | `#808080` | dimmed text, borders, glyphs |
| `--vf-desktop` | `#808080` | desktop base gray under the 1-bit dither |
| `--vf-shadow-offset` | `2px` | window/menu hard shadow offset |
| `--vf-radius` | `6px` | button corner radius (buttons ONLY) |
| `--vf-control-height` | `22px` | buttons, selects, text fields |
| `--vf-titlebar-height` | `22px` | window/dialog title bars |
| `--vf-menubar-height` | `24px` | `vf-menu-bar` |
| `--vf-focus-outline` | `1px dotted #000` | focus-visible outline |
| `--vf-progress-fill` | `#000000` | determinate progress fill (solid black) |
| `--vf-progress-track` | `#ffffff` | progress track (white) |
| `--vf-scrollbar-thumb` | `#ffffff` | scrollbar thumb/elevator (white) |
| `--vf-highlight` | `#000000` | selection background |
| `--vf-highlight-text` | `#ffffff` | selection foreground |

## 4. Shared recipes (in `src/styles/base.ts`)

- `vfBase` — host font, `box-sizing: border-box` everywhere, `user-select: none`
  (text inputs re-enable), `:host([hidden]) { display: none !important }`.
- `vfStripes` — a `.vf-stripes` class:
  `background: repeating-linear-gradient(to bottom, var(--vf-black, #000) 0 1px, transparent 1px 2px);`
  Position it absolutely inside the title bar, inset `5px 2px` (top/bottom 5px,
  left/right 2px) so ~6 stripes show at a 22px bar height.
- `vfPanel` — a `.vf-panel` class for menus/popups:
  white bg, `border: 1px solid var(--vf-black, #000)`,
  `box-shadow: var(--vf-shadow-offset, 2px) var(--vf-shadow-offset, 2px) 0 0 var(--vf-black, #000)`.
- **Window frame recipe** (windows/dialogs use inline, not a class) — identical
  to `vfPanel`: solid white, 1px black border, hard offset shadow, no bevels:
  ```css
  background: var(--vf-white, #fff);
  border: 1px solid var(--vf-black, #000);
  box-shadow:
    var(--vf-shadow-offset, 2px) var(--vf-shadow-offset, 2px) 0 0 var(--vf-black, #000);
  ```

## 5. Component specifications

Files live in `src/components/`. "Parts" = CSS shadow parts via `part=`.

### Group A — chrome & shells

#### `vf-desktop` (`VfDesktop`, vf-desktop.ts)
Full-bleed classic desktop container.
- **Visual:** `display: block; position: relative; overflow: hidden;`
  background = classic 50% dither: base `var(--vf-desktop, #808080)` under a
  black/white 1px checker (e.g. `repeating-conic-gradient(var(--vf-black,#000) 0% 25%, var(--vf-white,#fff) 0% 50%)`,
  `background-size: 2px 2px`), overridable via `--vf-desktop-pattern`.
- **Slots:** default (menu bar, windows, anything).
- **Behavior:** manages stacking of slotted `vf-window` children: `pointerdown`
  on a window brings it to front (incrementing z-index counter) and sets its
  `active` attribute, clearing `active` on the others. Listens via a delegated
  pointerdown listener + `slotchange`.
- **Parts:** `desktop`.

#### `vf-window` (`VfWindow`, vf-window.ts)
The classic document window (see DragThing screenshot).
- **Attributes/props:** `heading: string` (title text), `active: boolean`
  (default **true**; reflect), `closable: boolean` (default true),
  `zoomable: boolean` (default false), `movable: boolean` (default false),
  `resizable: boolean` (default false), `flush: boolean` (default false —
  removes body padding).
- **Visual:** window frame recipe (§4). `display: block`. Sets
  `--vf-surface: var(--vf-white, #fff)` on itself.
  - Title bar: height `var(--vf-titlebar-height, 22px)`, white bg, bottom
    `1px solid black`, contains `.vf-stripes` layer (only when `active`).
  - Title: centered, bold, on a white patch (`padding: 0 8px`) above the
    stripes. Inactive: no stripes, title color `var(--vf-disabled, #808080)`,
    widgets hidden.
  - Close box: LEFT side, 13×13px, `1px solid black`, white bg, no bevel,
    surrounded by a 2px white patch interrupting the stripes. `:active` →
    inverts to black.
  - Zoom box: RIGHT side, same box, plus an inner 7×7 square outline anchored
    top-left inside it.
  - Body: `padding: 12px` (0 if `flush`).
  - Grow box (if `resizable`): 15×15 at bottom-right corner, white bg, 1px black
    top/left borders, containing two overlapping small square outlines.
- **Behavior:** close box click → `vf-close` (does NOT remove itself; consumer
  decides). Zoom box click → `vf-zoom`. If `movable`: dragging the title bar
  moves the window — on drag start, ensure `position: absolute` seeded from
  current offset position, then update `left/top` via pointer capture. If
  `resizable`: dragging grow box adjusts inline `width`/`height`.
- **Slots:** default (body content).
- **Parts:** `frame`, `title-bar`, `title`, `close-box`, `zoom-box`, `body`, `grow-box`.
- **Events:** `vf-close`, `vf-zoom` (detail `{}`).

#### `vf-dialog` (`VfDialog`, vf-dialog.ts)
Movable-modal dialog (see "Format" screenshot): striped title bar, NO window
widgets, white body.
- **Attributes/props:** `open: boolean` (reflect), `heading: string`.
- **Implementation:** wraps a native `<dialog>` (for top-layer + focus trap).
  `show()` → `showModal()`; `close()` closes. Keep `open` attr in sync both
  directions. Escape → close + `vf-close` detail `{ reason: 'escape' }`;
  programmatic/close() → `{ reason: 'close' }`. No backdrop dimming:
  `::backdrop { background: transparent; }`.
- **Visual:** frame recipe (§4); title bar identical to `vf-window` (stripes +
  centered title, no boxes); body is WHITE (`--vf-surface: #fff`), separated
  from title bar by 1px black line, `padding: 16px`.
- **Slots:** default. **Parts:** `frame`, `title-bar`, `title`, `body`.
- **Events:** `vf-close`.

#### `vf-alert` (`VfAlert`, vf-alert.ts)
Classic fixed modal alert: double black frame, no title bar.
- **Attributes/props:** `open: boolean`, `variant?: 'caution'` (renders the
  classic black/white triangle-with-! icon as inline SVG; omit for none/slot).
- **Implementation:** native `<dialog>` like vf-dialog. `show()`/`close()`.
- **Visual:** outer `border: 2px solid black`; inner frame: a wrapper with
  `margin: 2px; border: 1px solid black;` (classic double-rule). Body white,
  `padding: 16px 20px`, drop shadow `2px 2px 0 0 black`. Layout: icon column
  (32px) left, message right; buttons row bottom-right with 12px gap.
- **Slots:** `icon`, default (message), `buttons`.
- **Parts:** `frame`, `icon`, `message`, `buttons`.
- **Events:** `vf-close` (detail `{ reason }`).

#### `vf-separator` (`VfSeparator`, vf-separator.ts)
- 1px black rule. `vertical: boolean` attr → 1px wide, auto height.
  Horizontal default: `display: block; height: 1px; background: var(--vf-black, #000);`
  When used inside menus it should render as the classic dimmed **dotted**
  rule spanning the full panel width (see Menus.png) — implement via
  `--vf-separator-color` + `--vf-separator-style` custom props (menu panel sets
  them to `#808080` / `dotted`, with 3px vertical margins). `role="separator"`.

### Group B — buttons & toggles

#### `vf-button` (`VfButton`, vf-button.ts)
- **Attributes/props:** `variant?: 'default'` (the double-ring default button,
  e.g. "Install"), `disabled`, `type: 'button' | 'submit' | 'reset'` (default
  `'button'`).
- **Visual:** inner `<button>`: height `var(--vf-control-height, 22px)`,
  `min-width: 64px`, `padding: 0 14px`, white bg, `1px solid black` border,
  `border-radius: var(--vf-radius, 6px)`, bold black text, font per tokens.
  - `:active` (pressed, not disabled): invert — black bg, white text.
  - `disabled`: only the label dims to `var(--vf-disabled, #808080)`; the 1px
    black border stays black. (For `variant="default"`, the fat outer ring
    dims to `var(--vf-disabled)` while the inner black border stays.)
  - `variant="default"`: an additional ring drawn via absolutely-positioned
    `::before`: `inset: -5px; border: 3px solid var(--vf-black,#000); border-radius: calc(var(--vf-radius, 6px) + 4px);`
    (host needs `position: relative` and 5px of breathing room via margin).
- **Behavior:** form-associated. `type="submit"` → `this.internals.form?.requestSubmit()`;
  `reset` → `form?.reset()`. Enter/Space work natively via inner button.
- **Slots:** default (label). **Parts:** `button`.
- **Events:** none custom (native `click` suffices).

#### `vf-checkbox` (`VfCheckbox`, vf-checkbox.ts)
- **Attributes/props:** `checked`, `disabled`, `name`, `value` (default `'on'`).
- **Visual:** 13×13 white box, `1px solid black`, no radius; checked = classic
  ✕: the pixel-exact corner-to-corner cross from the sprite sheet, rendered as
  the `CHECKBOX_X` inline-SVG fill path (`shape-rendering: crispEdges`,
  `fill: currentColor`) — no anti-aliased strokes. Label (slot) sits right with
  6px gap, bold. Disabled: only the label dims to `var(--vf-disabled, #808080)`;
  the box border and ✕ glyph stay black. Pressed (`:active` on box): border
  thickens to 2px (classic press feedback).
- **Behavior:** form-associated; toggles on click and Space; `role="checkbox"`,
  `aria-checked`; focusable (tabindex 0 on host or inner wrapper w/ focus ring
  around the box only).
- **Slots:** default (label). **Parts:** `box`, `label`.
- **Events:** `vf-change` detail `{ checked: boolean }`.

#### `vf-radio` (`VfRadio`, vf-radio.ts)
- **Attributes/props:** `checked`, `disabled`, `value: string`.
- **Visual:** 13×13 pixel circle drawn as inline SVG — the hand-tuned 1-bit
  `RADIO_RING` outline over a white `RADIO_FACE` disc (not `border-radius`, which
  anti-aliases); checked = the centered `RADIO_DOT` pixel disc. Pressed
  (`:active`): the ring swaps to `RADIO_RING_PRESSED` (2px-thick). Label right,
  6px gap. Disabled dims like checkbox (label only; ring + dot stay black).
- **Behavior:** `role="radio"`, `aria-checked`. Click → asks parent group to
  select it (dispatch internal event or parent listens). NOT itself
  form-associated — the group is. Focus managed by group (roving tabindex).
- **Slots:** default (label). **Parts:** `circle`, `label`.
- **Events:** `vf-change` detail `{ value }` (fired by user interaction only).

#### `vf-radio-group` (`VfRadioGroup`, vf-radio-group.ts)
- **Attributes/props:** `value: string`, `name`, `disabled`.
- **Visual:** `display: block`; slotted radios stack with 6px vertical gap
  (consumer can override with own layout). No chrome of its own.
- **Behavior:** form-associated (form value = `value`). `role="radiogroup"`.
  Keeps children in sync: sets `checked` on the child whose `value` matches.
  Roving tabindex; ArrowUp/ArrowLeft & ArrowDown/ArrowRight move selection AND
  select (classic Mac behavior). Child click updates group `value`.
- **Slots:** default (vf-radio elements, or arbitrary markup containing them).
- **Events:** `vf-change` detail `{ value }`.

### Group C — text & value inputs

#### `vf-text-field` (`VfTextField`, vf-text-field.ts)
- **Attributes/props:** `value`, `placeholder`, `disabled`, `readonly`,
  `type: string` (default `'text'`; pass through to input), `name`.
- **Visual:** inner `<input>`: white bg, `1px solid black`, NO radius,
  height `var(--vf-control-height, 22px)`, `padding: 0 6px`, font tokens but
  `font-weight: var(--vf-font-weight, 700)`. `user-select: text`. Focus: border
  thickens via `box-shadow: 0 0 0 1px var(--vf-black, #000)` (no dotted
  outline). Disabled: the text dims to gray; the black border stays.
- **Behavior:** form-associated; syncs `value` on input; `formResetCallback`
  restores default.
- **Parts:** `input`.
- **Events:** `vf-input` detail `{ value }` on every keystroke; `vf-change`
  detail `{ value }` on commit (native change).

#### `vf-text-area` (`VfTextArea`, vf-text-area.ts)
Same as vf-text-field but wrapping `<textarea>`; extra prop `rows: number`
(default 4). No resize grip (`resize: none`) — System 7 fields don't resize.
Parts: `textarea`. Events: `vf-input`, `vf-change`.

#### `vf-number-field` (`VfNumberField`, vf-number-field.ts)
A numeric text field paired with the classic "little arrows" stepper.
- **Attributes/props:** `value: string`, `min?: number`, `max?: number`,
  `step: number` (default 1; also sets the value's decimal precision),
  `placeholder`, `disabled`, `readonly`, `name`, `label`.
- **Visual:** a form-associated `<input>` (white well, 1px black border, focus
  thickens the border like `vf-text-field`, value right-aligned) with a 3px gap
  to the little-arrows stepper. The stepper is the `STEPPER` glyph (rounded
  1-bit frame + hollow up/down arrows from `Little arrows.png`), rendered inline
  at its **native 15×25** so it stays pixel-crisp — the field takes the
  stepper's height. Holding an arrow overlays its solid fill (`STEPPER_UP_FILL`
  / `STEPPER_DOWN_FILL`, synthesized to match the kit's hollow→filled press
  convention). Disabled: the value dims to gray; the box and stepper stay black.
- **Behavior:** `role="spinbutton"` on the input with `aria-valuenow/min/max`.
  Clicking an arrow steps by `step`, clamped to `min`/`max`, rounded to `step`'s
  precision; press-and-hold autorepeats (300ms delay, then ~60ms). Keyboard:
  ArrowUp/ArrowDown step, Home/End jump to min/max. Typing is free-form; the
  value normalizes (clamp + round) on commit (native `change`). Form-associated
  (submits `value`; `formResetCallback` restores the default). `readonly` blocks
  stepping and editing.
- **Parts:** `input`, `stepper`.
- **Events:** `vf-input` detail `{ value, valueAsNumber }` on every keystroke;
  `vf-change` detail `{ value, valueAsNumber }` on commit or step.

#### `vf-select` (`VfSelect`, vf-option.ts children) (vf-select.ts)
The classic popup menu control ("Macintosh HD ▼").
- **Attributes/props:** `value: string`, `disabled`, `name`.
- **Children:** `<vf-option value="...">Label</vf-option>` elements (default
  slot). `vf-option` (`VfOption`, vf-option.ts): props `value`, `disabled`,
  `selected` (managed by parent); renders its slot; `role="option"`.
- **Visual (closed control):** height `var(--vf-control-height, 22px)`, white
  bg, `1px solid black`, NO radius, `box-shadow: 1px 1px 0 0 var(--vf-black, #000)`
  (the small hard shadow visible in the screenshot), `padding: 0 8px`, bold
  label left, the black `CARET_DOWN` ▼ pixel glyph (inline SVG) right with
  8px gap, min-width 120px. The ▼ stays black even when the control is disabled
  (only the label dims).
- **Visual (open):** panel uses `.vf-panel` recipe; items height 22px,
  `padding: 0 20px 0 22px`; the currently-selected item shows a ✓ checkmark in
  the left 22px gutter; hovered/active item inverts (black bg, white text);
  disabled options gray.
- **Behavior:** form-associated. Opens on click/Space/Enter/ArrowDown. Panel is
  positioned `position: fixed` from `getBoundingClientRect()` so it escapes
  clipping containers; closes on outside pointerdown, Escape, blur, scroll.
  Keyboard while open: arrows move active item, Enter/Space select, Escape
  cancels, Home/End jump. On select: classic blink (invert toggles ~3 times in
  ~250ms) then close + `vf-change`.
- **Parts:** `control`, `label`, `arrow`, `panel`.
- **Events:** `vf-change` detail `{ value }`.

#### `vf-progress-bar` (`VfProgressBar`, vf-progress-bar.ts)
- **Attributes/props:** `value: number` (0–100), `max: number` (default 100),
  `indeterminate: boolean`.
- **Visual:** `display: block; height: 14px;` track
  `var(--vf-progress-track, #ffffff)` (white), `1px solid black`, no radius.
  Determinate fill: `var(--vf-progress-fill, #000000)` (solid black) from left,
  with a 1px black leading edge
  line. Indeterminate: full-width animated
  diagonal black/white barber stripes (45°, 8px pitch, `background-position`
  keyframes, ~0.4s linear infinite — chunky and steppy, not smooth: use
  `steps()` timing).
- **Behavior:** `role="progressbar"` + `aria-valuenow/min/max` (omit valuenow
  when indeterminate).
- **Parts:** `track`, `fill`.

### Group D — menus, lists, containers

#### `vf-menu-bar` (`VfMenuBar`, vf-menu-bar.ts)
- **Visual:** `display: block/flex`, height `var(--vf-menubar-height, 24px)`,
  white bg, `border-bottom: 1px solid var(--vf-black, #000)`, children laid out
  horizontally from left with `padding: 0 10px` per label.
- **Behavior:** container/controller for slotted `vf-menu` children. Click a
  menu label → opens it (label inverts while open). While any menu is open,
  hovering another label switches to it (classic behavior). Escape / outside
  click / item selection closes. `role="menubar"`. ArrowLeft/Right move between
  menus when open.
- **Slots:** default (vf-menu elements). **Parts:** `bar`.

#### `vf-menu` (`VfMenu`, vf-menu.ts)
- **Attributes/props:** `label: string` (the menu title in the bar; may contain
  e.g. an apple glyph), `open: boolean` (reflect, managed by menu-bar or self).
- **Visual:** label: bold, height of menubar, `padding: 0 10px`; open → inverted
  (black bg / white text). Panel: `.vf-panel`, `position: absolute` below the
  label (`top: 100%; left: 0;`), `min-width: 180px`, `padding: 2px 0`;
  `role="menu"`.
- **Behavior:** clicking the label toggles; delegates open-state coordination
  to parent `vf-menu-bar` when present (only one open at a time). Sets
  `--vf-separator-color: var(--vf-disabled, #808080)` on its panel so slotted
  `vf-separator`s render dimmed with 2px vertical margin.
- **Slots:** default (vf-menu-item / vf-separator). **Parts:** `label`, `panel`.

#### `vf-menu-item` (`VfMenuItem`, vf-menu-item.ts)
- **Attributes/props:** `disabled`, `checked` (shows ✓ in left gutter),
  `shortcut: string` (e.g. `"⌘H"`, right-aligned), `value?: string` (defaults
  to text content).
- **Visual:** height 22px, `padding: 0 12px 0 22px` (left gutter for ✓),
  shortcut right-aligned with 24px min gap, `color: var(--vf-disabled)` when
  disabled. Hover (not disabled): full-width inversion.
- **Behavior:** `role="menuitem"`. On click: classic **blink** (invert toggles
  3 times over ~250ms via timer), then dispatch `vf-select` detail
  `{ value, item }` and signal ancestors to close the menu.
- **Slots:** default (label). **Parts:** `item`, `check`, `label`, `shortcut`.
- **Events:** `vf-select`.

#### `vf-list` (`VfList`, vf-list-item children) (vf-list.ts)
Classic list box.
- **Attributes/props:** `multiple: boolean`, `value: string` /
  `values: string[]` (multiple), `disabled`.
- **Children:** `<vf-list-item value="...">` (`VfListItem`, vf-list-item.ts):
  props `value`, `selected` (reflect), `disabled`; height 20px,
  `padding: 0 6px`; selected = inverted row (full width).
- **Visual (list):** white bg, `1px solid black`, `overflow-y: auto` with the
  scrollbar styling from vf-scroll-area's recipe (duplicate the CSS — small),
  default `max-height: 200px` overridable via `--vf-list-max-height`.
- **Behavior:** `role="listbox"` (+`aria-multiselectable`), items
  `role="option"`. Click selects (Shift/Cmd extend when `multiple`). Roving
  tabindex, Arrow keys move selection, Space toggles in multiple mode.
- **Parts:** `list`. **Events:** `vf-change` detail `{ value, values }`.

#### `vf-scroll-area` (`VfScrollArea`, vf-scroll-area.ts)
A container whose scrollbars look like System 7.
- **Visual:** `display: block`, white bg, `1px solid black`, inner viewport
  `overflow: auto`, `padding: 8px`. Consumer sets width/height on host.
  Scrollbars (WebKit pseudo-elements; add `scrollbar-width/scrollbar-color`
  fallback for Firefox):
  - width/height 16px; trough: black/white 1-bit 50% dither
    (`repeating-conic-gradient(var(--vf-black,#000) 0% 25%, var(--vf-white,#fff) 0% 50%)` at `2px 2px`) with
    `border-left: 1px solid black` (vertical) etc.;
  - thumb (elevator): `var(--vf-scrollbar-thumb, #ffffff)` bg (white), `1px solid black`;
  - arrow buttons: 16×16 white boxes, 1px black border, the authentic System 7
    scroll-arrow glyph (triangle head + rectangular stem, from the sprite sheet)
    via inline SVG data-URI backgrounds (`::-webkit-scrollbar-button` with
    `:vertical:decrement` etc.) — hollow outline at rest, filled solid black on
    `:active` (pressed).
- **Slots:** default. **Parts:** `viewport`.

#### `vf-fieldset` (`VfFieldset`, vf-fieldset.ts)
The "Install Location" group box.
- **Attributes/props:** `legend: string`.
- **Visual:** `border: 1px solid var(--vf-black, #000)`, no radius,
  `padding: 14px 12px 10px`, `margin-top: 8px` (room for legend). Legend: bold,
  positioned overlapping the top border (absolute, `top: -0.7em; left: 8px;`),
  `padding: 0 5px`, `background: var(--vf-surface, var(--vf-white, #fff))` so
  it punches out the border to match its surface.
- **Slots:** default, plus named slot `legend` (overrides attr).
- **Parts:** `fieldset`, `legend`.

## 6. Exports

`src/index.ts` (already written — do not change without reason) exports every
component class. Importing the package registers all elements.

## 7. Demo page (built last)

`index.html` + `demo/demo.ts` + `demo/demo.css`, served by `vite` from repo
root. It is both showcase and fidelity test — it recreates the reference
screenshots:

1. Full-viewport `vf-desktop` with a `vf-menu-bar` on top: apple glyph menu
   (about item), File (New Window ⌘N, Open… ⌘O, sep, Close ⌘W, disabled Print,
   sep, Quit ⌘Q), Edit (Undo ⌘Z, sep, Cut/Copy/Paste), View (checked item
   "by Icon", "by Name"), Special (Restart, Shut Down, sep, "Show All
   Windows" — reopens closed demo windows).
2. **"DragThing 2.9 Installer" window** — faithful to the screenshot: white
   content well (bordered) with welcome copy + bullet list, "Disk space
   available: 58,616K / Approximate disk space needed: 4,584K" caption row
   (small font), `vf-fieldset legend="Install Location"` containing the folder
   text and a `vf-select` ("Macintosh HD"), and stacked `Quit` +
   `Install` (variant=default) buttons on the right. `movable zoomable`.
3. **"Format" dialog window** — faithful to the screenshot: Mode
   `vf-radio-group` (Hierarchical ⌘H … Don't Reorganize ⌘R, with "Source Format
   Profile" disabled; shortcut text right of labels), disabled "Selection Only"
   checkbox, Options checkboxes (3, all checked), Cancel ⌘. + Format
   (variant=default) buttons bottom-right. Rendered as an always-open movable
   `vf-window` with no close box (closable=false) to sit on the desktop.
4. **"Controls" kitchen-sink window** — text field, password field, textarea,
   determinate progress animating 0→100 on a timer, indeterminate progress,
   button variants (normal/default/disabled), separator, multi-select
   `vf-list`, `vf-scroll-area` with enough text to scroll, disabled control
   examples.
5. An alert: menu item Special → "Erase Disk…" opens a `vf-alert
   variant="caution"` — "Completely erase the disk named 'Macintosh HD'?" with
   Cancel / Erase buttons (Erase = default variant, closes alert).
6. All windows `movable`; desktop stacking/active management demonstrably
   works; closing a window hides it (listen for `vf-close`, set `hidden`);
   Special → Show All Windows un-hides.

Demo may use small amounts of layout CSS (positioning windows on the desktop)
but NO aesthetic CSS — looks must come from the components.

## 8. Definition of done

- `npm run typecheck` and `npm run build` pass.
- Every component in §5 implemented per spec, exported, registered.
- Demo showcases every component.
- Side-by-side with the reference screenshots, an unfamiliar reviewer should
  say "yes, that's System 7."
