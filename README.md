# Vintage Frames

Lit web components that emulate the look and feel of **classic Mac OS
System 7** — racing-stripe title bars, 1px black borders, hard offset shadows,
Chicago-style bold type.

## Quick start

```sh
npm install
npm run dev      # dev server on http://localhost:5173
npm run build    # library build to dist/
npm run typecheck
```

`npm run dev` serves two demo pages:

| Page | What it is |
| --- | --- |
| [`/`](http://localhost:5173/) | **The showcase** — a full `vf-desktop` with menu bar, movable windows, dialogs, alerts and every control ([`index.html`](./index.html) + [`demo/`](./demo)) |
| [`/blog.html`](http://localhost:5173/blog.html) | **The integration example** — an ordinary blog page (system-font copy, normal document flow, no `vintage.css`) using the controls in its header, sidebar, dialogs and comment form ([`blog.html`](./blog.html) + [`demo/blog.*`](./demo)) |

The second one is the more useful reference if you're dropping these components
into an existing site. Everything on it is in its **default state** — the page
sets no `--vf-scale` at all, so each component self-scales to true ~72dpi size
the way a lone `<vf-button>` on a blank page would. `npm run shot:blog`
captures it at 1× / 2× / 3× so you can see what that default actually costs:

| Display | self-chosen `--vf-scale` | Subscribe button | body copy |
| --- | --- | --- | --- |
| 1× | 3 | **60px** tall | 17px |
| 2× retina | 1.5 | 30px tall | 17px |
| 3× | 1 | 20px tall | 17px |

Physically identical on all three, but the *relationship* to the page's own
type is not — the page's 17px never moves. That is the main thing a host page
has to decide about (see [Display scaling](#display-scaling--true-classic-size-crisp-on-any-screen)).

It also has `applyGridSnap()` switched on, which you can see working by breaking
the page on purpose:

| URL | What it shows |
| --- | --- |
| [`/blog.html`](http://localhost:5173/blog.html) | The page as authored — it already follows the layout contract, so snapping has nothing to correct |
| [`/blog.html?offgrid`](http://localhost:5173/blog.html?offgrid) | A ratio leading and a fractional document offset put every component off the grid; snapping recovers all 45 measured |
| [`/blog.html?offgrid&nosnap`](http://localhost:5173/blog.html?offgrid&nosnap) | The same broken page with snapping off — the comparison |

The harness line at the top of the page reports how many components are off the
grid right now — counting the 45 that carry their own correction; rows, options
and the two group kinds ride their containers — so the three read 0, 0 and 45.
A/B the last two at 100% zoom: the stepped button corners, hairline borders and
glyph stems are the tell.

The page also shows where a normal page must meet the kit halfway — the
[device-pixel grid rules](#staying-on-the-device-pixel-grid--the-layout-contract),
setting `--vf-surface` behind a `vf-fieldset` legend on a tinted background,
letting an `auto` grid column size a sidebar rather than fixing it in CSS px,
and styling `vf-menu-bar::part(bar)` to align a full-bleed nav with a centered
content column. Each is marked `vf hook` in [`demo/blog.css`](./demo/blog.css).

It draws the line between page type and kit type by **what the text belongs
to**. The article prose, headings and brand are the page's own voice and stay in
Georgia and system UI type — the size slider drives them from 15 to 22px, which
a bitmap face could not do. Text that captions a control or lives inside one is
chrome, and uses [`vf-label` and `vf-paragraph`](#fonts): the form and sidebar
captions, the readouts, and the dialog and alert copy. Buttons that share a row
go in a `vf-button-group` rather than a flex row, which is what keeps a
`variant="default"` button's face in line with its neighbour's instead of its
ring. Notably, `blog.css` never reads `--vf-scale`: where it has to relate to a
component's size it uses an `auto` grid track, `em` or `ch`, so the page stays
ordinary CSS and the components do the scaling.

```sh
npm run dev
npm run verify:blog   # the page's interactions, outside a vf-desktop
npm run verify:grid   # every vf-* host against the device-pixel grid
npm run verify:snap   # …and that applyGridSnap() recovers a page knocked off it
npm run shot:blog     # shots/blog-dpr{1,2,3}.png
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
| `vf-desktop` | Gray desktop container; manages window stacking + active state, with utility windows on a floating tier |
| `vf-window` | The desktop-window shell: striped title bar, close/zoom boxes, movable/resizable, edge scroll rails (`scrollbars`), slim windoid chrome (`variant="utility"`) — see [Window archetypes](#window-archetypes--enabling-the-1992-hig-not-enforcing-it) |
| `vf-dialog` | The modal-dialog shell (native `<dialog>` under the hood): movable-modal striped bar by default (`closable` opts into a close box), classic double-rule modal frame with `frame="plain"` |
| `vf-alert` | Classic double-framed modal alert |
| `vf-separator` | 1px rule (horizontal/vertical; dims inside menus) |
| `vf-button` | Push button with pixel-stepped corners (no antialiased `border-radius`); `variant="default"` renders the double-ring default button, `size="small"` the compact 16px one |
| `vf-button-group` | Arranges buttons in a row (or `vertical` column), sizing them all to the widest — the classic System 7 shared width — unless `natural`; aligns their faces so a `variant="default"` button lines up with its neighbors |
| `vf-swatch` | Color-swatch button: a hard-shadowed, white-inset color well sized in system px, showing the transparency checker when it has no color |
| `vf-checkbox` | Checkbox with the classic ✕ mark |
| `vf-radio`, `vf-radio-group` | Radio buttons with form-associated group |
| `vf-text-field`, `vf-text-area` | Bordered text inputs; `vf-text-area` keeps a permanent System 7 scroll rail |
| `vf-number-field` | Numeric field with the classic "little arrows" stepper |
| `vf-select`, `vf-option` | Popup menu control ("Macintosh HD ▼") |
| `vf-progress-bar` | Determinate fill or indeterminate barber stripes |
| `vf-slider` | Horizontal 1-bit slider: solid-black fill up to a shield-shaped drag handle |
| `vf-menu-bar`, `vf-menu`, `vf-menu-item` | Pull-down menus with ⌘ shortcuts, selection blink, and the classic press-drag-release: press a title, slide onto a command, release to run it |
| `vf-list`, `vf-list-item` | List box with inverted selection, a permanent scroll rail, and Finder first-letter type-ahead; each row takes a leading graphic (usually a 16×16 `vf-img`) in its `icon` slot |
| `vf-scroll-area` | Container with System 7 scrollbars; reserves the scroll rail as a placeholder (per-axis via `axis`), filling in only on overflow |
| `vf-fieldset` | Group box with legend punching through the border |
| `vf-label` | Static caption ("Name:", "Mode") in the chrome face; `for` focuses and names a control the way `<label for>` does |
| `vf-paragraph` | A paragraph of copy in the body face, on a whole-pixel line box |
| `vf-img` | Pixel art on the kit's grid — sizes a slotted `<img>` to one system pixel per image pixel and keeps the nearest-neighbor magnification on whole device pixels; `width`/`height` (system px) reserve the box before the file loads |

All visual constants are CSS custom properties (`--vf-*`) with inlined
fallbacks — components need **no global CSS**, and everything is themeable.
See [SPEC.md](./SPEC.md) for the full design spec, tokens, events, slots, and
parts.

Keyboard focus is an affordance System 7 never had — full keyboard access
postdates it — so the kit **adds** one and draws it in the 1-bit vocabulary
rather than leaving the browser's ring on top of the artwork. Where a control
can carry the mark itself it does: `vf-button` underlines its label,
`vf-checkbox` its box and `vf-radio` its circle with a 1px dashed rule on the
system-pixel grid (`vfFocusUnderline`); text fields thicken their border; and
everything else keeps the dotted ring. `npm run verify:focus` asserts the
rendered pixels.

## Window archetypes — enabling the 1992 HIG, not enforcing it

The 1992 *Macintosh Human Interface Guidelines* names five standard windows.
The kit doesn't ship five window components — it ships two parameterized
shells, and each archetype is a one-line recipe over them:

| Archetype (1992 HIG) | Recipe |
| --- | --- |
| Document window | `<vf-window closable zoomable movable resizable scrollbars="both">` |
| Movable modal dialog box | `<vf-dialog heading="…">` |
| Modal dialog box | `<vf-dialog frame="plain">` |
| Modeless dialog box | `<vf-window closable movable>` |
| Utility (floating) window | `<vf-window variant="utility" movable>` |

Why parameters instead of fixed anatomies: the HIG disagrees *with itself*
about the details. Figure 5-1 (Windows chapter) and Figure 6-1 (Dialogs
chapter) label the same two artworks opposite ways — the close box migrates
between the movable modal and the modeless dialog. The Chapter 6 body text
resolves it (a movable modal "has a title bar (without a close box)"; a
modeless dialog is dismissed "by clicking the close box"), and the recipes
above follow that reading — but the components stay neutral: it's not the
component enforcing HIG compliance, it's the component *enabling* it via
specific choice. `<vf-dialog closable>` builds the Figure 5-1 reading just as
easily.

The chrome itself is traced, not paraphrased (`npm run extract:windows`):
`frame="plain"` is the modal-dialog double frame — 1px outer rule, 2px gap,
2px inner band, no shadow, which is *not* the alert's frame (2px outer, 1px
inner, with shadow; System 7 drew them differently, so `vf-alert` keeps its
own) — and `variant="utility"` is the windoid: a 12px bar with a dot-grid
dither in place of racing stripes and 7×7 widgets. Inside a `vf-desktop`,
utility windows float above every document window and stand outside the
single-active rule, so clicking a tool palette never deactivates the document
you're working in. `scrollbars` puts the System 7 rails on the window edge
with the grow box in the corner cell — the TeachText composition, built in.

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
:root { --vf-scale: 1; }  /* pin to the fixed authored size (no scaling) */
.dense { --vf-scale: 2; } /* …or any factor that keeps scale × dpr whole */
```

**Decide early whether an embedded page wants this default.** Reproducing true
72dpi size means the CSS size changes with the display: the same push button is
60px tall on a 1× monitor and 20px on a 3× one, while the page's own 17px copy
is 17px on both. For a full-screen faux desktop that is exactly right — the
whole surface is the emulated machine and there is no competing typography. For
controls sitting next to prose it means the chrome-to-copy relationship is set
by whatever display the reader happens to have, and on a 1× monitor the chrome
dominates. [`blog.html`](./blog.html) is left on the default so you can judge
that for yourself; `npm run shot:blog` renders it at all three densities.

Pinning trades physical fidelity for a fixed relationship to the page.
`--vf-scale: 1` renders a 20px button with a 16px label, which sits naturally
beside 16–17px body text at any density. Declare it in a stylesheet the page
loads **before** the components upgrade — a value in scope always beats the
per-component default, but a component that has already claimed its own scale
keeps it — and keep it a whole number (see the grid contract below).

Every metric multiplies by `--vf-scale` in `calc()`, so borders, type, glyphs,
the desktop dither and spacing all scale together and stay 1-bit crisp.

To put *your own* markup on the same grid — page copy, custom controls, layout
gaps — call `applyScale()` once. It sets `--vf-scale` on the document root (or
any element you pass) and keeps it synced as the display changes:

```ts
import { applyScale } from 'vintage-frames'

applyScale() // → returns a cleanup function that stops watching
```

## Staying on the device-pixel grid — the layout contract

A component is built entirely from whole system pixels, so every edge inside it
sits on the grid — but only *relative to its own origin*. Land that origin, or
its size, on a fractional device pixel and the whole 1-bit interior rasterizes
wrong: pixel-stepped corners staircase asymmetrically, hairline borders and
bitmap glyph stems smear across two device rows and go gray. It is the usual
cause of an integration that looks almost right but muddy.

**One call takes the origin half of this off your hands.** `applyGridSnap()`
has every component measure its own position and cancel the fractional
remainder itself, so rule 2 below stops being your problem:

```ts
import { applyGridSnap } from 'vintage-frames'

applyGridSnap() // → returns a cleanup function that turns it back off
```

The correction is applied inside each component's shadow root — the host's own
`position`, `left`/`top` and `margin` are never touched, so it cannot collide
with your positioning (or `vf-window`'s drag coordinates). Its whole footprint
on your DOM is two reserved custom properties (`--vf-snap-dx`/`--vf-snap-dy`)
on each corrected host's inline style, and a component's painted box can sit up
to half a device pixel outside its layout box while corrected. It stays opt-in
for now while that behavior soaks on real integrations. Opt a single element
out with `nosnap`.

The corrections re-apply on their own when the viewport resizes or scrolls
(`position: sticky` contents sit at a different fractional position stuck than
in flow), a webfont lands, the host resizes or the display density changes.
Nothing in the platform reports a *pure* position change, though — if you move
components in a way that resizes nothing, call `requestGridSnap()`.

So: three rules, of which snapping covers the second.

**1. Keep `--vf-scale × devicePixelRatio` a whole number.** One system pixel
occupies exactly that many device pixels, and it has to be countable. This is
why the default is `3 / dpr` — the product is always 3. A hand-picked scale is
your responsibility:

| `--vf-scale` | 1× display | 2× retina | 3× hi-dpi |
| --- | --- | --- | --- |
| `1`, `2`, `3` … | ✓ | ✓ | ✓ |
| `1.5` | ✗ 1.5 | ✓ 3 | ✗ 4.5 |
| `1.25` | ✗ 1.25 | ✗ 2.5 | ✗ 3.75 |

Whole numbers are safe everywhere. Fractions are safe only where they happen to
divide into the density, so unless you are pinning a known display, use an
integer. Break this one and no amount of careful layout helps — the component's
own metrics are already fractional.

**2. State every `line-height` in whole pixels, and keep `padding`, `margin` and
`gap` on integers — or call `applyGridSnap()` and forget it.** Line boxes are
overwhelmingly the biggest offender, because a ratio resolves to whatever it
resolves to: `1.65 × 17px` is `28.05px`, and every line of prose nudges
everything after it further off the grid. Auditing the blog example before this
rule was applied, **46 of 46 components had a fractional origin and every one
traced back to a ratio line-height** — while all 46 had a perfect size. Layout
was the only fault, and whole-pixel line boxes alone fixed 45 of them.

This is the rule snapping exists for: it is the one a page breaks by accident,
and the correction is entirely inside the component. With `applyGridSnap()` on,
a page perturbed onto fractional device pixels renders bit-identically to a
clean one (`npm run verify:snap` asserts exactly that, at dpr 1/2/3).

```css
/* ✗ */ p { font-size: 17px; line-height: 1.65; }  /* → 28.05px */
/* ✓ */ p { font-size: 17px; line-height: 28px; }
```

Text you set on the kit's own faces has a third option: `<vf-paragraph>` and
`<vf-label>` state their line box in whole system pixels themselves, so a column
of copy accumulates whole offsets with nothing for the page to remember.

**3. Position a box that contains components from its start edge — or give it a
whole-pixel size.** Normal flow accumulates whole offsets by itself. Anything
right-aligned, centered, or sharing `space-between` free space computes its
origin as `edge − width`, so a width derived from a text run lands it off the
grid. That was the 46th component: two text-sized `<span>`s made their flex row
`568.484px` wide, and the `vf-select` between them inherited the fraction.

```css
/* ✗ */ .toolbar__label { /* width from its text */ }
/* ✓ */ .toolbar__label { width: 84px; }
```

The same trap catches any label whose glyphs come from a fallback face — the
showcase's Apple menu (`U+F8FF`, which the bitmap face doesn't carry) measured
`32.641` system px and pushed all five menu titles off-grid until it was given a
whole width. (It has since dropped the glyph altogether: the menu now slots a
16-px `vf-img` apple icon, whole by construction.)

Snapping covers the origin half of this rule but not the size half: a
block-level component stretched by a fractional-width parent still *measures*
fractionally, and no amount of moving it fixes that. Give the container a
whole-pixel width, or let an `auto` grid column size it.

### Checking a page

```sh
npm run dev
npm run verify:grid   # every vf-* host, at dpr 1 / 2 / 3
npm run verify:snap   # …and that they get back on it by themselves
```

`verify:grid` reports each fault as `ORIGIN` (rule 2 or 3) or `SIZE` (rule 1),
so the output points at which rule was broken. Point it at your own pages with
`VF_ORIGIN` and `VF_GRID_PAGES`. `verify:snap` knocks a page off the grid on
purpose and checks that `applyGridSnap()` recovers it — both the geometry and
the rendered pixels — through a reflow, a window drag, the `nosnap` opt-out and
the cleanup function; its pages come from `VF_SNAP_PAGES` / `VF_SNAP_DPR`, and
both scripts need a page that doesn't call `applyGridSnap()` itself (that's why
their blog default carries `?nosnap` — a page that self-snaps would hide the
broken state each script exists to observe).

## Fonts

Two System 7 bitmap faces ship inside the components and register themselves on
`document.fonts`, so they render inside every shadow root with no global CSS:

- **ChiKareGo** — the Chicago-style *chrome* face: menu bar, menus, window and
  dialog titles, buttons, checkboxes, radios, popup menus, fieldset legends, and
  editable text/number fields (System 7 typed its dialog fields in Chicago).
- **FindersKeepers** — the *body* face: list rows and page copy.

Both render on their native 1024-upm pixel grid (one design pixel = one system
pixel) and scale with `--vf-scale` (see [Display scaling](#display-scaling--true-classic-size-crisp-on-any-screen)),
staying pixel-crisp. Both are registered with `ascent-override: 75%` /
`descent-override: 25%` / `line-gap-override: 0%` — the classic Chicago 12/4
em on the 16-px design grid — because the WOFF2s' own hhea metrics are off
that grid and would set every baseline one device pixel high
(`npm run verify:baseline` asserts the rendered ink). Retheme with
`--vf-font-family-display` (chrome) and `--vf-font-family` (body), plus the
matching `--vf-font-size-display` / `--vf-font-smoothing-display` tokens.

**Your own text goes on the same faces with `vf-label` and `vf-paragraph`.**
A caption beside a control and a run of copy are the two things every page adds
around the kit, and setting them by hand means repeating the family stack, the
smoothing and — the part that actually bites — a line box that has to be a whole
number of system pixels:

```html
<vf-label for="disk">Install Location:</vf-label>
<vf-select id="disk">…</vf-select>

<vf-paragraph>Click Install to place DragThing on your hard disk.</vf-paragraph>
<vf-paragraph size="small" dim>Approximate disk space needed: 4,584K</vf-paragraph>
```

`vf-label` is chrome type on a 16px line box, `vf-paragraph` body type on a 20px
one; `face="body"` / `face="display"` swaps either, `size="small"` drops to the
12px fine print, and `dim` greys the text the way System 7 dims a label. Both
snap themselves to the device grid, and `for` does what a native `<label for>`
does — click to focus, plus the accessible name, which for a `vf-*` control has
to reach the focusable element inside its shadow root and so lands on the
control's `label` property (never overwriting one you set).

One honest limit: both faces are single 16-design-pixel masters, so
`size="small"` renders them at 0.75 design px per system px — the stems land
between device pixels and the run measures fractionally. It is the fine print
the reference screens contain, not a size to set body copy in; give a small
caption a whole width (or let it stretch) so its host stays on the grid.
`npm run verify:text` checks the line boxes, the faces and the `for` wiring.

## Utilities & style toolkit

The shared toolkit the components are built from is exported from the package
root, so you can author a custom control that matches the kit pixel-for-pixel:

```ts
import { vfBase, vfPanel, sys, glyphSvg, CHECKMARK } from 'vintage-frames'
```

| Export | What it's for |
| --- | --- |
| `applyScale`, `ScaleController`, `onScaleChange` | Opt a subtree (or your own component) into true-size rendering |
| `applyGridSnap`, `requestGridSnap`, `GridSnapController` | Opt the page into automatic device-pixel-grid snapping; add it to your own component with one controller line plus the `vf-snap` class on its painted root |
| `sys`, `toSys`, `effectiveScale`, `getScale`, `snapToSystemPx`, `snapToDevicePx`, `DEVICE_PX_PER_SYSTEM_PX` | Convert between system (art) px and CSS px, honoring the effective `--vf-scale`; snap JS-written geometry onto the system-pixel grid (what window drags, grow-box resizes and dialog pins go through — whole art pixels, like QuickDraw) or onto the finer device grid |
| `snapDialogToGrid`, `unsnapDialog` | Pin/unpin a native `<dialog>` to whole device px |
| `vfBase`, `vfDisplay`, `vfDisplayDecls`, `vfBodyDecls`, `vfStaticText`, `vfPanel`, `vfChromeFrame`, `vfTitleBar`, `vfHardShadowDecls`, `vfStripes`, `vfFocus`, `vfFocusRing`, `vfFocusUnderline`, `vfToggle`, `vfField`, `vfScrollbars` | The 1-bit CSS recipes — compose into `static styles` |
| `glyphSvg` + the glyph constants (`CHECKMARK`, `CARET_DOWN`, `STEPPER`, …) | The 1-bit sprite set, rendered inline as SVG |
| `steppedRectClip`, `steppedRingClip`, `BUTTON_FRAME`, `BUTTON_FACE`, `RING_FRAME`, `RING_HOLE`, `RING_INSET` | Pixel-stepped corner profiles and their `clip-path` traces (no antialiased `border-radius`) |
| `DragController`, `ScrollStateController`, `TrackWidthController`, `DocumentListenersController` | Pointer-drag wiring; per-axis overflow and inactive-window reporting for the always-a-rail scrollbars (a non-frontmost window's rails blank, per the HIG); a track's measured width, for drawing your own 1-bit fill on the system-pixel grid; document-level listeners scoped to an open panel or in-flight gesture (paired attach/detach + disconnect cleanup in one place) |
| `emit`, `prefersReducedMotion`, `runSelectionBlink`, `BLINK_INTERVAL_MS`, `BLINK_FLIPS`, `PRESS_HOLD_MS` | The `bubbles`+`composed` event convention; the sanctioned ~250ms selection blink; the tap-vs-hold threshold both press-drag surfaces share |
| `VfFormControl`, `VfTextControlBase`, `VfToggleControl`, `VfModalDialog`, `modalDialogStyles` | Base classes: form association, the text-field recipe, the toggle interaction skeleton (a mixin — see below), the native-`<dialog>` lifecycle |
| `registerEmbeddedFont`, `registerChiKareGo`, `registerFindersKeepers`, `CHIKAREGO_FAMILY`, `FINDERS_KEEPERS_FAMILY` | Register the bitmap faces on `document.fonts` yourself |

`VfToggleControl` is a **mixin** rather than a plain base class, because the
kit's two toggles sit on different bases and have to stay there: `vf-checkbox`
extends `VfFormControl` (it submits a value under a name), while `vf-radio` is
deliberately not form-associated — its enclosing `vf-radio-group` is the form
surface. Apply it over whichever base your control needs, and supply `checked`,
the control's `ElementInternals`, its effective disabled rule, and what a click
or Space should do:

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
one disabled gate every activation passes through, `aria-checked`/`aria-disabled`
mirroring, and a self-managed host tabindex that never clobbers a consumer's own.
