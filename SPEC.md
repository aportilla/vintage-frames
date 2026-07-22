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
- **1-bit monochrome palette** — black and white only, plus two grays: light
  gray (`#C0C0C0`, the kit's dim tone) for dimmed/disabled chrome, and mid gray
  (`#808080`) as the base tone under the desktop's 50% dither.
  Scroll troughs use a looser 25% black-on-white dot dither. Surfaces are flat
  solid white — no bevels.
- **No gradients, no border-radius, no CSS transitions** — interactions are
  instant. The single sanctioned animation is the classic menu-item "blink" on
  selection and the indeterminate progress stripes — both suppressed under
  `prefers-reduced-motion: reduce` (the blink selects immediately). Even the
  button's rounded
  corners are not `border-radius` arcs: they are stepped `clip-path`
  silhouettes traced pixel-for-pixel from the reference sheet
  (`src/pixel-frame.ts`), so the 1-bit staircase renders with no antialiasing.
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

Every length in this doc is a **system pixel** value; components multiply it by
`--vf-scale` in `calc()` (see the note after the table).

| Token | Default | Used for |
| --- | --- | --- |
| `--vf-scale` | *(display factor, `3 / dpr`)* | multiplies every length token below (see note) |
| `--vf-font-family` | `'FindersKeepers', 'Geneva', 'Helvetica Neue', Helvetica, Arial, sans-serif` | body text (list rows, page copy) |
| `--vf-font-family-display` | `'ChiKareGo', 'Chicago', 'ChicagoFLF', 'Charcoal', 'Geneva', 'Helvetica Neue', Helvetica, Arial, sans-serif` | chrome text (menus, buttons, titles, fields) |
| `--vf-font-size` | `16px` | body face size |
| `--vf-font-size-display` | `16px` | chrome face size |
| `--vf-font-size-small` | `12px` | fine print (e.g. disk-space captions) |
| `--vf-font-weight` | `700` | all text (Chicago is inherently bold) |
| `--vf-black` | `#000000` | borders, text, stripes, selection bg |
| `--vf-white` | `#ffffff` | content wells, control faces |
| `--vf-surface` | *(set by containers)* | bg behind legends/label patches; `vf-window` and `vf-dialog` both set it to white |
| `--vf-disabled` | `#C0C0C0` | dimmed text, borders, glyphs (the kit's dim gray) |
| `--vf-desktop` | `#808080` | desktop base gray under the 1-bit dither |
| `--vf-shadow-offset` | `2px` | window/menu hard shadow offset |
| `--vf-control-height` | `22px` | buttons, selects, text fields |
| `--vf-control-height-small` | `16px` | `size="small"` buttons |
| `--vf-field-width` | `180px` | default width of `vf-text-field` / `vf-text-area` |
| `--vf-titlebar-height` | `18px` | window/dialog title bars |
| `--vf-menubar-height` | `24px` | `vf-menu-bar` |
| `--vf-focus-outline` | `1px dotted #000` | focus-visible outline |
| `--vf-progress-fill` | `#000000` | determinate progress fill (solid black) |
| `--vf-progress-track` | `#ffffff` | progress track (white) |
| `--vf-scrollbar-thumb` | `#ffffff` | scrollbar thumb/elevator (white) |
| `--vf-highlight` | `#000000` | selection background |
| `--vf-highlight-text` | `#ffffff` | selection foreground |

**`--vf-scale` (display scaling).** Every length above is authored in *system
pixels* and multiplied by `--vf-scale`. It defaults to the true-size factor for
the current display — `3 / devicePixelRatio`, so one system pixel maps to exactly
3 device pixels and the 1-bit art stays crisp at any dpr — applied per component
by a `ScaleController` (`src/scale.ts`), which re-adapts on dpr changes. A
consumer or ancestor `--vf-scale` always wins (set it to `1` to pin the fixed
authored sizes), and because it is a plain inherited multiplier, nesting never
compounds. JS-driven geometry (slider rail/thumb, select panel, window resize)
converts between system and CSS px with the `sys()` / `toSys()` helpers.

## 4. Shared recipes (in `src/styles/base.ts`)

- `vfBase` — host font, `box-sizing: border-box` everywhere, `user-select: none`
  (text inputs re-enable), `:host([hidden]) { display: none !important }`.
- `vfStripes` — a `.vf-stripes` class:
  `background: repeating-linear-gradient(to bottom, var(--vf-black, #000) 0 1px, transparent 1px 2px);`
  Position it absolutely inside the title bar, inset `3px 2px` (top/bottom 3px,
  left/right 2px) so exactly six 1px stripes show at the 18px bar height, their
  top and bottom edges aligned with the close box's.
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
  background = classic 50% dither: base `var(--vf-desktop, #808080)` under a 1-bit
  black/white checker drawn as a crisp SVG tile (a 2×2 grid with two black
  pixels), `background-size: 2px 2px` scaled by `--vf-scale`, overridable via
  `--vf-desktop-pattern`. (A `repeating-conic-gradient` feathers its hard stops
  at scale; the SVG rects stay pixel-exact.)
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
  - Title bar: height `var(--vf-titlebar-height, 18px)`, white bg, bottom
    `1px solid black`, contains `.vf-stripes` layer (only when `active`).
  - Title: centered, bold, on a white patch (`padding: 0 8px`) above the
    stripes. Inactive: no stripes and widgets hidden, but the title text stays
    black (System 7 never grayed the window title).
  - Close box: LEFT side, 11×11px, 8px from the inner-left edge, with 3px of
    clear white above and below it, `1px solid black`, white bg, no bevel,
    surrounded by a 2px white patch interrupting the stripes. `:active` →
    inverts to black.
  - Zoom box: RIGHT side, same box, plus an inner 5×5 square outline centered
    inside it.
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
  directions. Drag the title bar to move it (shared `DragController` with
  `vf-window`), rewriting the grid-pinned centering margins. Escape → close +
  `vf-close` detail `{ reason: 'escape' }`;
  programmatic/close() → `{ reason: 'close' }`. No backdrop dimming:
  `::backdrop { background: transparent; }`.
- **Visual:** frame recipe (§4); title bar identical to `vf-window` (stripes +
  centered title, no boxes); body is WHITE (`--vf-surface: #fff`), separated
  from title bar by 1px black line, `padding: 16px`. An optional `buttons` slot
  renders a bottom-right `vf-button-group` footer that only takes space when
  populated (equal-width, faces aligned).
- **Slots:** default, `buttons`.
- **Parts:** `frame`, `title-bar`, `title`, `body`, `footer`, `buttons`.
- **Events:** `vf-close`.

#### `vf-alert` (`VfAlert`, vf-alert.ts)
Classic fixed modal alert: double black frame, no title bar.
- **Attributes/props:** `open: boolean`, `variant?: 'caution'` (renders the
  classic black/white triangle-with-! icon as inline SVG; omit for none/slot).
- **Implementation:** native `<dialog>` like vf-dialog. `show()`/`close()`.
- **Visual:** outer `border: 2px solid black`; inner frame: a wrapper with
  `margin: 2px; border: 1px solid black;` (classic double-rule). Body white,
  `padding: 16px 20px`, drop shadow `2px 2px 0 0 black`. Layout: icon column
  (32px) left, message right; the `buttons` slot is a bottom-right
  `vf-button-group` (equal-width, faces aligned; classic 12px gap).
- **Slots:** `icon`, default (message), `buttons`.
- **Parts:** `frame`, `icon`, `message`, `buttons`.
- **Events:** `vf-close` (detail `{ reason }`).

#### `vf-separator` (`VfSeparator`, vf-separator.ts)
- 1px black rule. `vertical: boolean` attr → 1px wide, auto height.
  Horizontal default: `display: block; height: 1px; background: var(--vf-black, #000);`
  When used inside menus it should render as the classic dimmed **dotted**
  rule spanning the full panel width (see Menus.png) — implement via
  `--vf-separator-color` + `--vf-separator-style` custom props (menu panel sets
  them to `#C0C0C0` / `dotted`, with 3px vertical margins). `role="separator"`.

### Group B — buttons & toggles

#### `vf-button` (`VfButton`, vf-button.ts)
- **Attributes/props:** `variant?: 'default'` (the double-ring default button,
  e.g. "Install"), `size?: 'small'` (the compact 16px button from the
  reference's third row: height `var(--vf-control-height-small, 16px)`,
  `min-width: 48px`, `padding: 0 10px`, label in the body face at
  `var(--vf-font-size, 16px)` — same traced corners), `disabled`,
  `type: 'button' | 'submit' | 'reset'` (default `'button'`).
- **Visual:** inner `<button>`: height `var(--vf-control-height, 22px)`,
  `min-width: 64px`, `padding: 0 14px`, bold black text, font per tokens.
  The rounded rect is NOT `border-radius` (which antialiases): the button
  paints no box of its own; two pseudo-element layers carry stepped
  `clip-path` silhouettes traced from the reference sheet (`src/pixel-frame.ts`,
  data from `Buttons Exact 1x pixel Refrence.png` via
  `scripts/extract-button-pixels.py`, machine-diffed by
  `npm run verify:buttons`): `::before` fills `var(--vf-black)` clipped to the
  outer silhouette (corner insets `[3,1,1]`, then straight), `::after` fills
  `var(--vf-white)` clipped to the face (row 1 corner insets `[3,2]`, then 1px
  inside) — the 1px frame, corner steps included, is the QuickDraw-style
  difference of the two. Clip-paths stay off the `<button>` so `:focus-visible`
  outlines aren't clipped. All coordinates are `calc(var(--vf-scale,1) * Npx)`
  system pixels, so edges land on whole device pixels and never antialias.
  - `:active` (pressed, not disabled): invert — the `::after` face flips to
    black, white text.
  - `disabled`: only the label dims to `var(--vf-disabled, #c0c0c0)`; the 1px
    black border stays black. (For `variant="default"`, the fat outer ring
    dims to `var(--vf-disabled)` while the inner black border stays.)
  - `variant="default"`: the ring is a host `::before` at
    `inset: -4px` — `background: var(--vf-black)` clipped by an `evenodd`
    donut polygon (outer corner insets `[5,3,2,1,1]`; hole opens at row 3 with
    insets `[6,4,4]`, then 3px inside). The band is 3px thick with a 1px
    fully transparent gap to the button, per the reference's alpha-0 gap
    pixels (host needs `position: relative` and 4px breathing room via margin,
    tokenized `--vf-button-ring-margin` so `vf-button-group` can zero it).
- **Group hooks:** the ring margin reads `--vf-button-ring-margin` (default
  `4px`) and the inner button's flex reads `--vf-button-flex` (default
  `0 1 auto`); `vf-button-group` sets these to `0` and `1 1 auto` so grouped
  faces align and stretch to a shared width. Standalone, both defaults are inert.
- **Behavior:** form-associated. `type="submit"` → `this.internals.form?.requestSubmit()`;
  `reset` → `form?.reset()`. Enter/Space work natively via inner button.
- **Slots:** default (label). **Parts:** `button`.
- **Events:** none custom (native `click` suffices).

#### `vf-button-group` (`VfButtonGroup`, vf-button-group.ts)
- **Attributes/props:** `vertical` (stack in a column instead of a row),
  `natural` (let each button keep its own content width; off by default, so
  grouped buttons are uniform width — the classic System 7 dialog behavior).
- **Visual:** `display: inline-grid`, shrink-wrapped to its buttons. Uniform
  (default): one auto column per button, all `grid-auto-columns: 1fr`, so under
  the shrink-wrapped grid they equalize to the widest button's intrinsic width;
  `align-items: center` puts every face on one baseline (a `size="small"` button
  still shares the row). Gap is `--vf-button-group-gap` (default 12px).
  `vertical` switches to `grid-auto-flow: row` (a single column sized to the
  widest, each button stretched to it). `natural` falls back to `inline-flex`
  so the columns don't equalize.
- **Face alignment (the point):** a `variant="default"` button reserves its ring
  with a 4px `--vf-button-ring-margin` margin, so an ad-hoc flex row lines up the
  *ring*, not the button. The group sets that margin to `0` and reserves the
  ring space itself as 4px (`RING_INSET`) padding, then centers the cross axis —
  so button *faces* align and equalize, not margin boxes. Buttons fill their
  column via the inherited `--vf-button-flex`. Pure CSS; no measurement.
- **Layout-neutral:** shrink-wraps to its buttons; the parent positions it (e.g.
  `justify-self: end` for a bottom-right action row). `vf-alert` and `vf-dialog`
  wrap their `buttons` slots in one.
- **Slots:** default (vf-button elements). **Parts:** none. **Events:** none.

#### `vf-checkbox` (`VfCheckbox`, vf-checkbox.ts)
- **Attributes/props:** `checked`, `disabled`, `name`, `value` (default `'on'`).
- **Visual:** 13×13 white box, `1px solid black`, no radius; checked = classic
  ✕: the pixel-exact corner-to-corner cross from the sprite sheet, rendered as
  the `CHECKBOX_X` inline-SVG fill path (`shape-rendering: crispEdges`,
  `fill: currentColor`) — no anti-aliased strokes. Label (slot) sits right with
  6px gap, bold. Disabled: only the label dims to `var(--vf-disabled, #c0c0c0)`;
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

#### `vf-slider` (`VfSlider`, vf-slider.ts)
- **Attributes/props:** `value: number`, `min: number` (default 0), `max: number`
  (default 100), `step: number` (default 1), `disabled: boolean`, `name: string`,
  `label: string`.
- **Visual:** not a historical System 7 control — a 1-bit reverse-adaptation of
  the later Mac OS slider. A 4px-tall rounded capsule rail (2px tapered caps)
  fills **solid black** from the left up to the shield-shaped drag handle (the
  11×12 `SLIDER_THUMB` sprite, three grip strokes, pointed bottom) and runs
  **hollow** (1px top/bottom edge) after it — the classic filled/unfilled track.
  The rail is a whole-pixel `<svg>` regenerated on resize (so it stays crisp at
  any width); the thumb snaps to integer pixels. Disabled dims the whole control
  to `var(--vf-disabled, #c0c0c0)` (the fill *is* the value — there is no label
  to dim instead). No hover/active state on the handle (static sprite).
- **Behavior:** form-associated; `role="slider"` with
  `aria-valuemin/max/now/valuetext` + `aria-orientation="horizontal"`. Click or
  drag the track to set the value (the thumb's travel is inset by half its width
  so its edges stay flush within the rail, never overhanging). Focusable
  (self-managed `tabindex`, dotted ring on the thumb): Arrow keys step by `step`,
  PageUp/PageDown by `max(step, range/10)`, Home/End jump to min/max.
  `formResetCallback` restores the initial value.
- **Events:** `vf-input` detail `{ value: number }` on every drag move / key
  change; `vf-change` detail `{ value: number }` on commit (pointer release or
  key change).
- **Parts:** `track`, `rail`, `thumb`.

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
  `--vf-separator-color: var(--vf-disabled, #c0c0c0)` on its panel so slotted
  `vf-separator`s render dimmed with 2px vertical margin.
- **Slots:** default (vf-menu-item / vf-separator). **Parts:** `label`, `panel`.

#### `vf-menu-item` (`VfMenuItem`, vf-menu-item.ts)
- **Attributes/props:** `disabled`, `checked` (shows ✓ in left gutter),
  `shortcut: string` (e.g. `"⌘H"`, right-aligned), `value?: string` (defaults
  to text content).
- **Visual:** height 22px, `padding: 0 12px 0 22px` (left gutter for ✓),
  shortcut right-aligned with 24px min gap, `color: var(--vf-disabled)` when
  disabled. Hover (not disabled): full-width inversion.
- **Behavior:** `role="menuitem"` — or `role="menuitemcheckbox"` with
  `aria-checked` once the item is (or has been) `checked`. On click: classic
  **blink** (invert toggles 3 times over ~250ms via timer; skipped under
  `prefers-reduced-motion`, selecting at once), then dispatch `vf-select` detail
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
  shared System 7 scrollbar recipe (`vfScrollbars` from base.ts — add the
  `vf-scroll` class to the scrolling element), default `max-height: 200px`
  overridable via `--vf-list-max-height`.
- **Behavior:** `role="listbox"` (+`aria-multiselectable`), items
  `role="option"`. Click selects (Shift/Cmd extend when `multiple`). Roving
  tabindex, Arrow keys move selection, Space toggles in multiple mode.
- **Parts:** `list`. **Events:** `vf-change` detail `{ value, values }`.

#### `vf-scroll-area` (`VfScrollArea`, vf-scroll-area.ts)
A container whose scrollbars look like System 7.
- **Visual:** `display: block`, white bg, `1px solid black`, inner viewport
  `overflow: auto`, `padding: 8px`. Consumer sets width/height on host.
  Scrollbars come from the shared `vfScrollbars` recipe in base.ts (add the
  `vf-scroll` class to the scrolling element; WebKit pseudo-elements, with a
  `scrollbar-width/scrollbar-color` fallback for Firefox):
  - width/height 16px; trough: looser 25%-density dot dither, a white base with
    black 1px dots traced from the UI kit's "Scroll bg" sprite (a 4×2 SVG tile
    with dots at (0,0) and (2,1) — dotted vertical lines two pixels apart, each
    column phase-shifted by a row); an interior rail (`border-left`/`border-top`)
    divides the content from the scrollbar channel;
  - thumb (elevator): `var(--vf-scrollbar-thumb, #ffffff)` bg (white), `1px solid black`;
  - arrow buttons: 16×16 white boxes, 1px black border, the authentic System 7
    scroll-arrow glyph (triangle head + rectangular stem, from the sprite sheet)
    via inline SVG data-URI backgrounds (`::-webkit-scrollbar-button` with
    `:vertical:decrement` etc.) — hollow outline at rest, filled solid black on
    `:active` (pressed);
  - **nested-border rule:** the scrollbar assumes it sits inside a 1px-bordered
    host. Every element (arrow boxes, thumb) omits its border on the edge that
    coincides with that host border so the two never stack into a 2px line; when
    both scrollbars show, the corner supplies the interior dividers the buttons
    drop.
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
