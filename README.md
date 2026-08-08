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
npm test         # the whole verify suite (starts its own dev server)
```

`npm run dev` serves three demo pages:

| Page | What it is |
| --- | --- |
| [`/`](http://localhost:5173/) | **The showcase** — a full `vf-desktop` with menu bar, movable windows, dialogs, alerts and every control, under a page-drawn System 7 cursor ([`index.html`](./index.html) + [`demo/`](./demo)) |
| [`/blog.html`](http://localhost:5173/blog.html) | **The integration example** — an ordinary blog page (system-font copy, normal document flow, no global CSS) using the controls in its header, sidebar, dialogs and comment form ([`blog.html`](./blog.html) + [`demo/blog.*`](./demo)) |
| [`/examples.html`](http://localhost:5173/examples.html) | **The component reference** — every component, its custom API, and a live specimen of each state, plus the conformity notes for what it shares with the platform ([`examples.html`](./examples.html) + [`demo/examples.*`](./demo)) |

The reference page prints each demo's own `<template>` as its code sample, so a
sample can never drift from the component above it.

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
import 'vintage-frames'   // registers every <vf-*> element
```

That is the whole setup — the kit ships no stylesheet. Every visual constant
is a `--vf-*` token with an inlined fallback, the bitmap faces register
themselves on `document.fonts`, and `vf-desktop` paints its own gray dither,
so components render correctly with no global CSS at all. The one thing a
component cannot reach from its shadow root is your page itself: a desktop is
a **raster with a declared size** — `width` and `height` in system px, like a
window — and a full-screen one needs the page, the owner of the viewport, to
hand it the numbers and re-derive them when the window or the scale moves:

```ts
const desktop = document.querySelector('vf-desktop')
const fit = () =>
  desktop.fitWithin(innerWidth, innerHeight) // largest whole raster that fits
fit()
addEventListener('resize', fit)
onScaleChange(fit) // zoom or a monitor move changes what a system px costs

// html { overflow: hidden }  body { margin: 0; background: #000 }  ← the
// page's own stylesheet: the sub-system-pixel leftover stays on the page,
// black reads as bezel, and clipped overflow keeps a mid-resize scrollbar
// (the previous fit overflows the shrinking viewport for a moment) from
// feeding back into what the next fit() measures
```

### Taking only what you use

The root import registers all 30 elements. To ship less, import the ones you
use by name — same elements, same self-registration, one module each:

```ts
import 'vintage-frames/vf-button.js'
import 'vintage-frames/vf-checkbox.js'
```

**It stays one npm package.** The granularity is at the import, not the
dependency, and that is deliberate: the kit's scaling, grid snapping, focus
modality and font registration are all module-scoped singletons, so two copies
of the shared code in one page would mean `applyGridSnap()` silently missing
half the components on it. One package is what guarantees one copy. `dist/`
mirrors `src/` one file per module, so a subpath resolves to a real file a
bundler can shake — and one a `<script type="module">` or an import map can
fetch directly, with no build step at all.

**Those are also the only doors.** The package exports exactly two entries —
the root and one `vf-*.js` per element. The shared modules
behind them (the style recipes, the controllers, the fonts) are real files in
`dist/`, which is what the per-component graphs import — but *your* imports of
them go through the root (see [Utilities & style toolkit](#utilities--style-toolkit)),
never a deeper path, so `dist/`'s internal layout stays an implementation
detail rather than API. A path outside the two fails at resolve time, in the
bundler or the typechecker, not as a 404 in production.

What that costs, bundled and minified with `lit` external:

| Imported | min | gzip |
| --- | --- | --- |
| `vf-separator.js` — sets no chrome type, so it carries no Chicago face | 16.5 KB | 8.5 KB |
| `vf-button.js` | 32.7 KB | 16.0 KB |
| …plus `vf-checkbox.js` | 38.3 KB | 17.7 KB |
| the root import — all 30 elements | 280 KB | 85.2 KB |

The first component pays for the shared floor (the body face, `scale.ts` and
its zoom tracker, `grid-snap.ts`, the recipes it composes); each one after it
costs a couple of KB. Cherry-picking is worth it up to roughly a third of the kit — past that,
import the root and let the bundler keep one copy of everything.

**If a second copy does get in**, the page survives it. `customElements.define()`
throws on a name that's taken, and an uncaught throw mid-module-graph takes every
import after it down — one duplicated dependency and the page is blank. Every
element registers through `defineElement()` instead, which keeps the incumbent
and warns. The warning is the useful half: two copies means two of every
module-scoped singleton, so `applyGridSnap()` and `applyScale()` each reach only
the components built from their own copy, and the two disagree without any
visible error. `npm run verify:define` asserts the whole path — that the native
call really would have thrown, that the second copy doesn't, that the first
class keeps the tag, and that the elements still render afterwards.

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
| `vf-desktop` | Gray desktop raster (**declare `width` and `height`**, in system px; `fitWithin(w, h)` derives the largest whole raster for a CSS-px box — the viewport, usually); manages window stacking + active state, with utility windows on a floating tier — a click or keyboard focus activates a window, and tab order follows the stack; `bezel` (system px) adds the CRT's black surround with the classic rounded top screen corners |
| `vf-window` | The desktop-window shell (**declare `width` and `height`**, in system px): striped title bar, close/zoom boxes, movable/resizable, edge scroll rails (`scrollbars`), slim windoid chrome (`variant="utility"`) — see [Window archetypes](#window-archetypes--enabling-the-1992-hig-not-enforcing-it) |
| `vf-dialog` | The modal-dialog shell (native `<dialog>` under the hood; **declare `width` and `height`**, in system px): movable-modal striped bar by default (`closable` opts into a close box), classic double-rule modal frame with `frame="plain"` — also the shell an alert box is composed from (see [Glyphs are drawn, icons are yours](#glyphs-are-drawn-icons-are-yours)) |
| `vf-separator` | 1px rule (horizontal/vertical; dims inside menus) |
| `vf-button` | Push button with pixel-stepped corners (no antialiased `border-radius`); `variant="default"` renders the double-ring default button, `size="small"` the compact 16px one |
| `vf-button-group` | Arranges buttons in a row (or `vertical` column), sizing them all to the widest — the classic System 7 shared width — unless `natural`; aligns their faces so a `variant="default"` button lines up with its neighbors |
| `vf-swatch` | Color-swatch button: a white-inset color well sized in system px, showing the transparency checker when it has no color; flat by default, with `shadow` opting into the kit's hard drop shadow for a well that stands alone |
| `vf-checkbox` | Checkbox with the classic ✕ mark |
| `vf-radio`, `vf-radio-group` | Radio buttons with form-associated group |
| `vf-text-field`, `vf-text-area` | Bordered text inputs; `vf-text-area` keeps a permanent System 7 scroll rail |
| `vf-number-field` | Numeric field with the classic "little arrows" stepper |
| `vf-select`, `vf-option` | Popup menu control ("Macintosh HD ▼"); a list taller than the screen is clipped rather than scrolled, with the System 7 scroll arrow in the edge row slot — and a panel that had to slide to fit opens with blank rows at whichever end the list no longer reaches, the exact travel it rolls through. Set `--vf-popup-inset-top` once to keep clamped panels clear of a menu bar |
| `vf-progress-bar` | Determinate fill or indeterminate barber stripes |
| `vf-slider` | Horizontal 1-bit slider: solid-black fill up to a shield-shaped drag handle |
| `vf-menu-bar`, `vf-menu`, `vf-menu-item` | Pull-down menus with ⌘ shortcuts, selection blink, and the classic press-drag-release: press a title, slide onto a command, release to run it; `rounded` masks the bar's top corners with the System 7 screen-corner stair-step |
| `vf-list`, `vf-list-item` | List box with inverted selection, a permanent scroll rail, and Finder first-letter type-ahead; each row takes a leading graphic (usually a 16×16 `vf-img`) in its `icon` slot |
| `vf-scroll-area` | Container with System 7 scrollbars; reserves the scroll rail as a placeholder (per-axis via `axis`), filling in only on overflow |
| `vf-fieldset` | Group box with legend punching through the border |
| `vf-grid` | A lattice of equal cells with 1px rules between them — the desk-accessory palette, a color picker's swatch table; the cell count and cell size are properties, `rules` picks the pen (`solid`, `dashed` or `none`), `frameless` drops the perimeter for a grid whose container already draws that line, and `collapse` lands a cell's own border *on* the rule instead of beside it |
| `vf-stack` | Arranges things **in system pixels** — a flexbox whose `gap`, `pad`, `width` and `height` are declared in the art's own unit, so a window's insides need no `calc(var(--vf-scale, 1) * …)` in your stylesheet. Content-governed: a column is as wide as its widest child, and `fill-width`/`fill-height` on a child ask for more (see [Laying out inside a window](#laying-out-inside-a-window--vf-stack)) |
| `vf-label` | Static caption ("Name:", "Mode") in the chrome face; `for` focuses and names a control the way `<label for>` does, and `width` (system px) gives a caption column one whole-pixel x |
| `vf-paragraph` | A paragraph of copy in the body face, on a whole-pixel line box; `width`/`height` (system px) state the box — the measure the copy wraps to, for a placed layout |
| `vf-img` | Pixel art on the kit's grid — sizes a slotted `<img>` to one system pixel per image pixel and keeps the nearest-neighbor magnification on whole device pixels; `width`/`height` (system px) reserve the box before the file loads |
| `vf-icon` | The Finder icon: art in a reserved 32×32 or 16×16 cell with its name on a plate below — wrapped, never abbreviated, and capped at HFS's 31 characters. `selectable` (the art inverts), `open` (the art redraws as the open-window ghost, derived from the slotted art in the client), `movable` (drag or arrow keys) and `editable` (rename in place) — see [The Finder icon](#the-finder-icon--vf-icon) |

All visual constants are CSS custom properties (`--vf-*`) with inlined
fallbacks — components need **no global CSS**, and everything is themeable.
See [SPEC.md](./SPEC.md) for the full design spec, tokens, events, slots, and
parts.

### Editor support

The package ships a [custom elements manifest](https://github.com/webcomponents/custom-elements-manifest)
(`custom-elements.json`, generated by `npm run analyze` from the source JSDoc)
and the two editor formats derived from it. Point your editor at the one it
speaks and `<vf-` completes, with each attribute's own doc comment on hover:

```jsonc
// VS Code — .vscode/settings.json
{ "html.customData": ["./node_modules/vintage-frames/editor/vscode.html-custom-data.json"] }
```

JetBrains IDEs need no setup — they read the `web-types` field in
`package.json` on their own.

This matters most for the case the kit is actually built for: dropping `<vf-*>`
into an ordinary HTML page, where there is no TypeScript to lean on and the
`.d.ts` files can't reach. `npm run verify:manifest` holds the manifest to the
source — that every registered element reached it (the analyzer finds elements
by decorator name, and this kit registers with `vfElement`, so a plugin
regression would otherwise emit an empty manifest and still exit 0), and that
every documented `@csspart`, `@slot` and `@fires` is a real part, slot and
event rather than a stale comment.

It also catches the quieter failure in the other direction: a member a
component *inherits* but never finishes wiring up. Inheritance alone is enough
to put a property in the manifest and in your editor's autocomplete, and a
control that inherits `description` without rendering it looks completely
normal from outside while silently dropping every description you hand it. The
manifest is the input — if a tag claims the member, its source has to call the
method that renders it.

**Theming tokens are split by reach.** A token only a few components can be
styled with is documented on each of them as an `@cssprop`, generated from the
SPEC §3 table so the two can't disagree — 45 tags across 22 components, and
`verify:manifest` fails if a component gains such a token without one, if a tag
has no SPEC row, or if SPEC lists a token nothing reads. The 18 kit-wide knobs
(`--vf-scale`, the palette, both type stacks, the focus rule, the cursor) are
described once in [SPEC.md](./SPEC.md) rather than repeated on all 30 elements. Three kinds of token are deliberately undocumented: the
controller-owned grid-snap offsets, the private channels `vf-button-group` uses
to drive `vf-button`, and geometry a component sets on itself.

For the same reason the editor data ships HTML custom data but no CSS custom
data — `--vf-` completion inside a stylesheet mostly wants the kit-wide palette,
which is exactly the part that isn't tagged per element. SPEC §3 is the whole
table.

Keyboard focus is an affordance System 7 never had — full keyboard access
postdates it — so the kit **adds** one and draws it in the 1-bit vocabulary
rather than leaving the browser's ring on top of the artwork. Where a control
can carry the mark itself it does, as a 1px dashed rule on the system-pixel
grid (`vfFocusUnderline`) — either *inside* the control, under the ink it
marks (`vf-button` underlines its label, `vf-checkbox` its box, `vf-radio` its
circle, the three editable fields their well, `vf-menu` its bar title), or,
where there is no interior to give, *below* the whole box: `vf-select` clear of
its hard shadow, `vf-swatch` clear of whatever it is casting (nothing by
default, the shadow when it has one), and `vf-slider` under the full width of
its rail, so the mark stays put as the handle travels. Only the controls with
no face to draw on — a window's close and zoom boxes, a list row, a scroll
area's viewport — keep the dotted ring. The two controls that drop open,
`vf-menu` and `vf-select`, draw it only while closed: an open menu or list is
already saying where focus is, in a louder language.

Either way it is **keyboard-only**: a mouse click never draws it. Four controls
need help to manage that, because `:focus-visible` is true for them after a
pointer — the fields, since the selector matches a clicked text input by
design, and `vf-select`/`vf-menu`/`vf-slider`, which suppress the browser's
mouse focus to run a press-drag gesture and focus themselves instead, which
Blink reads as a visible focus. All four gate on the page's last input modality
(`FocusRuleController`, `src/focus-modality.ts`).
`npm run verify:focus` asserts the rendered pixels.

The same principle covers **forced-colors mode** (Windows High Contrast): a
user who chose their own two colors is speaking the kit's native language, so
rather than fight the override the kit re-declares its palette in system
colors — black ink becomes `CanvasText`, white faces `Canvas`, the selection
inversion the `Highlight` pair — and keeps drawing its own artwork: the
button's stepped silhouette, the dashed focus rule, the racing stripes, the
windoid dither and the barber stripes all survive on the user's palette
(SPEC §1 has the mechanics). `npm run verify:forced-colors` asserts the
rendered pixels on dark and light forced themes.

The same posture extends to the **platform's own form vocabulary**. The words
a page already knows — `<label for>`, `aria-label` / `aria-labelledby` /
`aria-describedby`, `required` — all work on the kit's controls, including
the ones whose focusable element lives inside a shadow root where the
platform alone can't deliver them: a host-level name or description is
bridged to the inner control (a control's own `label` property still wins),
and `required` runs real constraint validation with the native messages —
`form.reportValidity()` blocks, `:invalid` matches on the host,
`setCustomValidity()` works, and Enter can't submit past a failing
constraint.

The bridge is **only** for the controls that need one — the three fields,
`vf-select`, `vf-swatch` and `vf-button`, whose role sits on an element inside
their shadow root. Those six also take a `description` property, which reaches
assistive tech alongside the name and carries the validation error while there
is one. The controls whose role sits on the host — `vf-checkbox`,
`vf-radio-group`, `vf-slider` — deliberately have neither: your own
`aria-describedby` already reaches them natively, and their validation error
reaches AT the way a native control's does, through `aria-invalid` and the
browser's own validation UI. An inherited property that renders nothing is
worse than an absent one, so they don't inherit it.
`npm run verify:names` asserts the computed accessibility tree for all of it.

`vf-button` is a full member of that vocabulary: `type="submit"`/`"reset"`
(including `formaction`, `formmethod`, `formtarget`, `formenctype` and
`formnovalidate`), `name`/`value` in the submission, and — the part that is
easy to get subtly wrong — the submission runs at the *end* of the click's
propagation, so `preventDefault()` on the button cancels it exactly as it
cancels a native one. There is one thing the platform simply won't allow: a
form-associated custom element can never be a form's `event.submitter`.
The submitter is an internal proxy parented to the button, so read the
submitting control as `event.submitter.closest('vf-button')` and tell buttons
apart by `submitter.name`/`.value` rather than by comparing element
references. `npm run verify:button` asserts the whole contract.

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

Every recipe also declares its size — **both `width` and `height`**, in whole
system px, the art's own unit, so a window keeps its proportion to the chrome
inside it at any display density. A window is a fixed box in both axes, the way
a WIND resource was; one that grows with its body is one the user can neither
predict nor own via the grow box. Content taller than the declared box is
clipped at the frame, as the classic content region was — `scrollbars` is how
the user reaches the rest, and a control's drop-open list still escapes the clip
and paints past the border. The size is left out of the table above to keep the
parameter that *makes* each archetype legible.

The three `movable` recipes declare **`top` and `left`** as well, in the same
unit, for the reason a WIND resource stated a whole rect: a window that moves
needs a coordinate system to move in (see
[Positioning](#positioning-inside-a-window--top-and-left)). `vf-dialog` is the
exception — the platform anchors a modal to the viewport, and unset means
centered.

The **alert box** is a recipe too, one step further: the kit deliberately
ships no alert component, because what separates an alert from a modal dialog
is a *picture*, and pictures are the client's, never the library's. Compose it
from the modal-dialog shell and your own icon art — see
[Glyphs are drawn, icons are yours](#glyphs-are-drawn-icons-are-yours) for the
recipe, and the [reference page](http://localhost:5173/examples.html) for a
live one.

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

The chrome itself is traced, not paraphrased:
`frame="plain"` is the modal-dialog double frame — 1px outer rule, 2px gap,
2px inner band, no shadow (System 7's alert box drew the mirror trace, with
the shadow — a different chrome, and one the kit doesn't ship: an alert here
is composed over this frame) — and `variant="utility"` is the windoid: a 12px bar with a dot-grid
dither in place of racing stripes and 7×7 widgets. Inside a `vf-desktop`,
utility windows float above every document window and stand outside the
single-active rule, so clicking a tool palette never deactivates the document
you're working in. `scrollbars` puts the System 7 rails on the window edge
with the grow box in the corner cell — the TeachText composition, built in.

## Display scaling — true classic size, crisp on any screen

Every component is authored in *system pixels* (the 1-bit art grid) and renders
each one as exactly **3 device pixels** at 100% zoom, so the UI reads at its
original ~72 dpi physical size and stays pixel-crisp at any
`devicePixelRatio` — and as the user zooms, the target moves with them
(see [Following the user's zoom](#following-the-users-zoom)):

| Display | 100% zoom: scale (`3 / dpr`) | 150% zoom: `trueDpr` | 150% zoom: scale (`5 / trueDpr`) |
| --- | --- | --- | --- |
| 1× standard | 3.0 | 1.5 | 3.33 |
| 2× retina | 1.5 | 3.0 | 1.67 |
| 3× hi-dpi | 1.0 | 4.5 | 1.11 |

(`trueDpr` is device px per CSS px *including* zoom — what zooming actually
does to the rasterization grid in every engine, whether or not
`devicePixelRatio` reports it.)

This is **on by default** — a lone `<vf-button>` renders at true size with no
wrapper or setup, it re-adapts when the window moves to a different-density
monitor or the user zooms, and nested components compose without ever
double-scaling.

Override it with the inherited `--vf-scale` custom property — set it on `:root`,
a subtree, or a single element:

```css
:root { --vf-scale: 1; }  /* pin to the fixed authored size (no scaling) */
.dense { --vf-scale: 2; } /* …or any factor that keeps scale × trueDpr whole */
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

### Following the user's zoom

Reproducing physical size used to cut both ways: in Chrome and Firefox, page
zoom multiplies `devicePixelRatio`, the scale divided by it, and the kit held
its physical size while the page around it doubled — it *un-zoomed itself*,
handing a user who zoomed because 20px chrome is too small exactly the same
20px chrome. Now the target moves with the zoom: **`round(3 × zoom)` device
pixels per system pixel**, always whole, because [rule 1](#staying-on-the-device-pixel-grid--the-layout-contract)
is not negotiable. The response is quantized and identical on every display:

| zoom | device px / system px | physical size vs. 100% |
| --- | --- | --- |
| 25–33% | 1 | 33% |
| 50–80% | 2 | 67% |
| 85–115% | 3 | 100% |
| 125% | 4 | 133% |
| 150–175% | 5 | 167% |
| 200% | 6 | 200% |
| 250% | 8 | 267% |
| 300% | 9 | 300% |
| 400% | 12 | 400% |
| 500% | 15 | 500% |

Three properties of that table are deliberate. **The nearest steps do
nothing** — 90% and 110% both round to 3, so the kit holds still while the page
moves; the first step that moves it is 125% up and 80% down. This is inherent:
below 3 device px per system px there is no finer move that keeps the art
crisp, and fractional targets are exactly what rule 1 forbids. **Ties round
up** — 150% renders 167% of true size, not 133%, because a zoom-driven
accessibility response should err toward larger. And **the response is the
same in every engine**: Chrome and Firefox report zoom through
`devicePixelRatio` while Safari pins its dpr to the hardware and moves
`innerWidth` instead, so the kit tracks both signals (`src/zoom.ts`) and
arrives at the same rendered size either way — including telling a zoom apart
from the window moving to a different-density monitor, which changes the same
dpr but must keep physical size instead (and still does). Resizing the browser
window is never read as zoom: a viewport change counts only when both axes
rescale together to a real browser zoom level, so dragging a window edge can
never move the render scale — the kit's response to a resize is layout
(`fitWithin`, your own CSS), never a new scale.

The baseline is page load, assumed to be 100%. A page that *loads*
already-zoomed (Chrome persists zoom per origin) reads that as its 100% and
tracks changes from there — still crisp, just offset. `resetZoomBaseline()`
declares the current state to be 100% again; it is also the escape hatch for
the one change the tracker cannot classify, a display-mode switch at an
identical logical size. Pinch-to-zoom is out of scope by design:
`visualViewport.scale` magnifies already-rasterized pixels at composite time
and changes no rasterization density, so there is nothing for the kit to
follow. And a pinned `--vf-scale` opts out of zoom-following the same way it
opts out of display adaptation — a value in scope always wins, and the page
then scales under zoom like any ordinary CSS.

```sh
npm run verify:zoom   # the quantization table, Chrome-shaped and Safari-shaped
                      # zoom signals end to end, and that a monitor move is
                      # still never mistaken for a zoom
```

## Laying out inside a window — `vf-stack`

Every control is authored in system pixels. The *spaces between* them used to be
your problem, written by hand as `calc(var(--vf-scale, 1) * 12px)`. `vf-stack`
is that calculation as a component — a flexbox whose `gap`, `pad`, `width` and
`height` are declared in whole system px:

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

`direction` is `column` or `row`; `place` is `start`, `center` or `end` — where
the children sit across the stack — and left off it resolves per direction:
`start` down a column, `center` across a row, because the two directions want
opposite things and always did. That is the whole placement API: there is no
`justify`, and a right-aligned action row is a filled column whose one child
sits at the end of it, as above.

It is `place` and not `align` because **`align` is a legacy HTML presentation
attribute**: browsers map it to `text-align` on any element, so the cross-axis
switch used to re-align every run of copy inside the stack — an action row
quietly right-aligning its own paragraphs. Worth knowing whenever you name an
attribute on a custom element: `align`, `hidden` and `dir` all carry behavior
you didn't ask for. The stack still resets `text-align` to `inherit`, so markup
written against the old spelling stays harmless.

**The content governs the box.** A column is as wide as its widest child and a
row as tall as its tallest; children keep the size they were drawn at, because
System 7 boxes are the size they are — a push button is as wide as its label, a
popup menu hugs its widest option, and a window is a fixed box whose overflow is
clipped at the frame, not a layout that squeezes its controls to fit. The stack
distributes; it never resizes. It shrink-wraps for the same reason — a layout
box that claimed its parent's whole width would be handing out a size nobody
declared — while staying block-level, so it never sits on a line box and picks
up leading it didn't ask for.

**`fill-width` and `fill-height` are how a child asks for more**, as bare
attributes like `nosnap`. Each names the *outcome*, not an axis, so the markup
means the same thing wherever it lands and the stack does the flexbox
translation — in a row `fill-width` divides the main axis, in a column it
stretches the cross axis. One rule follows, about geometry rather than
vocabulary: **the cross axis always has a size, the main axis only has slack if
you declared one.** So `fill-width` always works in a column and needs a
declared `width` in a row; `fill-height` is exactly the other way round, and a
fill with nothing to take is inert rather than an error.

A stack reads the same two attributes about *itself*, for the parents that
aren't stacks — a window body, a fieldset, a scroll well, a grid cell. That is
where a panel's width enters the tree, and from there `fill-width` hands it
down a level at a time. Three components have no width of their own at all —
`vf-separator`, `vf-progress-bar` and `vf-slider` are drawn as a rule or a track
that *is* the width — so those read wrong until they're filled. For a cross-axis
fill a direction doesn't offer, `align-self: stretch` in your own stylesheet
still wins: a light-DOM declaration beats the component's, and a percentage is
the one fill page CSS can always express.

**A page's own stylesheet often cannot say "8 system px".** Scaling is
per-component: each element sets `--vf-scale` on *itself*, never on the
document. So `var(--vf-scale, 1)` in your CSS resolves correctly only where the
rule's element happens to sit inside a `vf-*` ancestor and inherit it — true for
a `<div>` in a window body, false for one holding two buttons on an ordinary
page, where the fallback `1` silently gives an 8px gap around 3×-sized controls.
Unless you call `applyScale()`, there is no CSS-only way to write the unit. A
component always can, because it *is* the scope. (This is why
[`blog.css`](./demo/blog.css) never reads `--vf-scale`, using `em`, `ch` and
`auto` grid tracks instead — still the right answer for *page* layout. The stack
is for laying out the kit's own boxes.)

Because whole system px is the only value the API accepts, the gap half of the
layout contract below holds by construction, and a declared `width` covers the
size half of rule 3. Porting the showcase to it took `demo.css` from 559 lines
to 328 — 23 of its 25 flex containers and 38 of its 85 `var(--vf-scale, 1)`
occurrences went away — and left every window's rendered pixels identical bar
the two noted at the end of this section. The later pass that cut the API down
to the one above holds the same line: window for window, the showcase renders
pixel-for-pixel as it did, except where a stack was covering for the `align`
bug.

It paints nothing, takes no role, and is the kit's one typographically
transparent component: `font`, smoothing, `color`, `user-select` and
`text-align` all return to `inherit`, so wrapping content in a layout box never
changes how that content reads. (`text-align` is on that list because of the
legacy `align` attribute above — the rename is the fix, this is the belt.) It is
not a `vf-button-group` (which equalizes button widths and aligns their faces)
and not a grid — `grid-template-columns: 1fr auto 1fr` stays yours.

```sh
npm run verify:stack   # system-px gaps at dpr 1/2/3, the fill matrix, and
                       # that the box takes nothing it wasn't given
```

Two things it can't fix, both documented in [SPEC.md](./SPEC.md): centering
cannot land on a whole pixel by itself (a 16px caption centered against the
25-system-px `vf-number-field` sits at 4.5 — use `place="start"`, or leave
`applyGridSnap()` to keep the ink crisp), and a flex container doesn't collapse
margins, so `vf-fieldset`'s 8px of legend room is genuinely reserved inside a
stack rather than being donated by whatever precedes it.

## Positioning inside a window — `top` and `left`

The stack is one of **two stylesheet-free ways to lay out a window's
insides**, and the other is the older one: a DITL resource laid a dialog out
by stating each item's rectangle in the window's own coordinates. Nearly every
component takes **`top` and `left` in whole system px** — set either and the
element is absolutely positioned within its parent, the coordinate you left
out defaulting to 0. Set neither and it renders in flow, exactly as before:

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

The coordinates are the art's own unit, written as the same live
`calc(var(--vf-scale, 1) * Npx)` a stack's `gap` becomes — so a placed layout
scales with the display and sits on the device-pixel grid by construction. The
stated offsets are the whole story: `right`/`bottom` are released and `margin`
zeroed while placed, and removing both attributes returns the element to flow
with every inline declaration unwound.

**Where (0,0) is.** CSS answers "within which parent" with the nearest
positioned ancestor, and every kit container is one deliberately: the
desktop's raster, a window's content region (the frame's inner edge, below
the title bar — the 12px inset governs flow content only, exactly the DITL
convention), a dialog's content area, a stack's box, a fieldset just inside
its border, and a scroll area's scrolled plane, so a placed child travels
with the content around it. In a parent of your own, add `position: relative`
— the one line of CSS this feature can't write for you. A parent that holds a
*movable* element needs a declared size as well: the clamp that keeps a dragged
window from being lost off an edge has no range to work in otherwise, and a
`position: relative` box nobody gave a height is the usual way that happens.

Four elements don't take the pair: `vf-option`, `vf-menu-item`, `vf-list-item`
and `vf-menu` are owned rows of a managing container.

**`vf-dialog` takes it in viewport coordinates**, the one anchor the platform
chooses rather than the kit: `showModal()` puts a modal in the top layer, whose
containing block is the viewport, so a dialog's `top`/`left` are screen
coordinates, not its parent's. (Its *children* still anchor to its content area,
as above.) Leave the pair off and the modal is **centered** — recomputed on
open, and again whenever its own box or the viewport changes, which is what
keeps a dialog whose slotted content upgrades after opening from being stranded
at the offset its smaller first render centered at. Setting either coordinate
back to `null` returns it to centering.

**The three elements that move themselves write through the same pair.** A
title-bar drag on a `vf-window` or `vf-dialog`, and a drag or arrow-key nudge on
a `vf-icon`, all state `top`/`left` in whole system px — the art's own unit —
so a moved element is placed exactly the way an authored one is: activating a
window never snaps it back, and a zoom that changes what a system px costs
leaves it exactly where it was dropped. `vf-window`'s grow box does the same
with `width`/`height`. Setting a property yourself is still the deliberate way
to re-place a moved element, one axis at a time.

**So a movable element states its rectangle**, the way a WIND resource carried
one: `<vf-window movable>` takes `top`/`left` *and* `width`/`height`, and
`<vf-icon movable>` takes `top`/`left` (an icon has no declared height, and its
`width` is the cell pitch). `vf-dialog` is the exception at both ends — the
platform anchors it to the viewport, and leaving the pair off means centered.

This is what asking for drag actually asks for: a coordinate system. Without
one the element is in normal flow, so the first move has to pull it out —
which reflows everything after it on the page, and collapses an auto-height
parent to whatever is left. The kit warns once per element and keeps the
gesture working (the clamp measures its box when the press lands, not while the
page is rearranging under it), but the drop is placed against a container that
moved, and nothing can put that back.

Strictly the requirement is **being out of flow**, so `position: absolute` in
your own stylesheet satisfies it too — a drag seeds from the computed offsets,
and `left: 10%` or `left: 1em` are perfectly good ways to place a window. The
attributes are the better answer because they are in the art's own unit and
scale with the display, which a CSS px constant does not; that is the same
argument [`vf-stack`](#laying-out-inside-a-window--vf-stack) makes about gaps.

All of which **costs the non-movable case nothing**: a `vf-icon` or `vf-window`
nobody asked to move takes no position, no tab stop and no role, writes nothing
to your DOM but its own `--vf-scale`, and lays out in your flex row or grid like
any other element. That is the case most pages actually want, and it is held as
a test rather than a promise (`npm run verify:position`, group CONTRACT).

Two consequences worth knowing. Read a moved element's position off the
**properties** (`win.left`), not `style.left` — the inline value is a live
`calc()`, so `parseFloat` gives you `NaN`. And the coordinates are held to the
lattice a *drag step* lands on, which is 1 system px on a 1× display but 2 on a
2× one (the run that is also whole in CSS px, so a scroll-bearing box keeps its
rail pinned to its frame — `src/scale.ts` has the mechanics). Nothing re-snaps a
dropped coordinate afterwards: whole system px is whole device px at every zoom
level by the scale contract, so the art stays crisp, and re-rounding onto each
new lattice would walk a window away from where it was dropped one zoom step at
a time.

A DITL item stated its *extent* too, and `width`/`height` (also whole system
px) are that half of the rectangle — on the four components whose box is
declared rather than governed by their content: `vf-window`, `vf-stack`,
`vf-label` and `vf-paragraph`. The pair matters most on a placed paragraph,
which otherwise shrink-wraps its longest line — the declared width is the
measure its copy wraps to. Everything else keeps the size it draws itself at,
which is the point: a push button is as wide as its label.

```sh
npm run verify:position   # system px at dpr 1/2/3, the defaults, every
                          # container's anchor, and the drag interplay
npm run verify:zoom       # …including that a dragged window, a moved icon and
                          # a grown window hold their system px across the ladder
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

**1. Keep `--vf-scale × trueDpr` a whole number.** One system pixel occupies
exactly that many device pixels, and it has to be countable. `trueDpr` is
device px per CSS px *including* browser zoom — the number
`window.devicePixelRatio` reports in Chrome and Firefox but not in Safari,
which pins its dpr to the hardware and goes stale about the rasterization
density at any non-100% zoom (`truePixelRatio()` reads it correctly in both).
This is why the default scale is `round(3 × zoom) / trueDpr` — the product is
always a whole target, 3 at 100% zoom. A hand-picked scale is your
responsibility, and can only be judged at 100% zoom (at, say, 150% zoom
`trueDpr` is 1.5× the density, and no fixed scale divides into every zoom
level — following the zoom is the default for exactly that reason):

| `--vf-scale` | 1× display | 2× retina | 3× hi-dpi |
| --- | --- | --- | --- |
| `1`, `2`, `3` … | ✓ | ✓ | ✓ |
| `1.5` | ✗ 1.5 | ✓ 3 | ✗ 4.5 |
| `1.25` | ✗ 1.25 | ✗ 2.5 | ✗ 3.75 |

Whole numbers are safe on every display at 100% zoom. Fractions are safe only
where they happen to divide into the density, so unless you are pinning a known
display, use an integer. Break this one and no amount of careful layout helps —
the component's own metrics are already fractional.

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
whole-pixel width — `<vf-stack width="260">` is that, in system px, and
`<vf-label width="84">` is the caption version of the fix above — or let an
`auto` grid column size it.

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

- **`VF Display`** — the *chrome* face: menu bar, menus, window and dialog
  titles, buttons, checkboxes, radios, popup menus, fieldset legends, and
  editable text/number fields (System 7 typed its dialog fields in Chicago).
  The artwork is the genuine Chicago 12pt strike, converted from the original
  bitmap ([fonts/README.md](./fonts/README.md) has the pipeline and
  provenance), so every label occupies exactly the pixels a real Mac gave it.
- **`VF Body`** — the *body* face: list rows and page copy. The genuine Geneva
  9pt strike, converted the same way, so body copy is likewise the pixels a
  real Mac would have set.

**They ship under the kit's names, not the strikes'.** A family name goes in
the font binary and in every consumer's `font-family` stack, which makes it a
claim rather than a description — and the artwork's provenance is Apple's to be
named by, so it is described in `fonts/README.md` instead of asserted in the
font. The *fallbacks* after each shipped family still name `Chicago`,
`Charcoal` and `Geneva`: those select faces the reader may already have
installed, which is the opposite direction and claims nothing.

Both render on their native 1024-upm pixel grid (one design pixel = one system
pixel) and scale with `--vf-scale` (see [Display scaling](#display-scaling--true-classic-size-crisp-on-any-screen)),
staying pixel-crisp. Both are registered with `ascent-override: 75%` /
`descent-override: 25%` / `line-gap-override: 0%` — the classic Chicago 12/4
em on the 16-px design grid, which both faces' own tables already carry (the
converter writes them, re-emming Geneva's natural 10/2 strike box onto the
kit's split); the overrides restate them so every face the kit registers is
pinned alike (`npm run verify:baseline` asserts the rendered
ink). Retheme with
`--vf-font-family-display` (chrome) and `--vf-font-family` (body), plus the
matching `--vf-font-size-display` / `--vf-font-smoothing-display` tokens — and
`--vf-line-height-display` / `--vf-line-height`, the face's native line, which
is what wrapped copy, captions and the text area set their pitch by: a swapped
strike states its family, size and line together.

**Your own text goes on the same faces with `vf-label` and `vf-paragraph`.**
A caption beside a control and a run of copy are the two things every page adds
around the kit, and setting them by hand means repeating the family stack, the
smoothing and — the part that actually bites — a line box that has to be a whole
number of system pixels:

```html
<vf-label for="disk">Install Location:</vf-label>
<vf-select id="disk">…</vf-select>

<vf-paragraph>Click Install to place DragThing on your hard disk.</vf-paragraph>
<vf-paragraph dim>Approximate disk space needed: 4,584K</vf-paragraph>
```

`vf-label` is chrome type on a 16px line box, `vf-paragraph` body type on a 12px
one — each face's own System 7 line, so wrapped copy sits at native pitch;
`face="body"` / `face="display"` swaps either, the line box following the face,
and `dim` greys the text the way System 7 dims a label. Both
snap themselves to the device grid, and `for` does what a native `<label for>`
does — click to focus, plus the accessible name, which for a `vf-*` control has
to reach the focusable element inside its shadow root and so lands on the
control's `label` property (never overwriting one you set).

Every strike renders at its native size — one design px = one system px. The
fine print the reference screens contain **is** the body face: System 7 set a
dialog's disk-space captions in Geneva 9, the smallest strike the classic
collection holds, at its own size — `face="body" dim`, as above. A genuinely
different size is a different strike, registered like the embedded ones and
themed in through the font tokens.
`npm run verify:text` checks the line boxes, the faces and the `for` wiring.

## Glyphs are drawn, icons are yours

Every mark the kit paints is *geometry* — a checkmark, a caret, the stepper
arrows, a radio's ring — drawn as inline SVG on integer coordinates
(`glyphs.ts`), which stays crisp at any size and retints with the tokens. The
kit ships **no raster content at all** — the one raster it carries is chrome,
the embedded [cursor set](#the-cursor--the-platforms-by-default-yours-to-draw),
base64 inside the module the way the bitmap faces are, never an asset file.
An icon is a **picture**, and a picture is
the client's asset, never the library's: slotted through `vf-img` (or
`vf-icon`'s and `vf-list-item`'s icon slots) it stays a real `<img>` in your
own DOM — `alt`, `srcset`, loading behavior and asset URLs intact — magnified
nearest-neighbor at one image pixel per system pixel.

The classic alert box is where this rule bites, and it is deliberately a
*recipe* rather than a component: the modal-dialog shell plus your own 32×32
icon art —

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

`label` is stated because the plain frame has no title bar to take a name
from, and the copy takes the chrome face because an alert speaks in chrome
type. The demo pages compose their alerts exactly this way, from their own
asset: `demo/icons/alert.png` (and the demo's 16×16 DA icons) were cut from
the reference art — black ink on transparency all
through, so the dialog's own surface shows inside the triangle and the art
survives a retheme without a baked-in white patch.

## The cursor — the platform's by default, yours to draw

The kit's chrome states the classic cursors as ordinary CSS — the arrow on
controls, the I-beam in an editable well — so a page that does nothing gets
System 7's pointer *behavior* at the OS's own crispness, and that is the
right default for dropping controls into an ordinary page.

A faux desktop can go further and draw the pointer itself:

```ts
import { applyCursor } from 'vintage-frames'

applyCursor() // → returns a cleanup function that restores the native pointer
```

One call replaces the native pointer with the embedded System 7 set — the
arrow, I-beam, crosshair and wristwatch as pixel art locked to the
system-pixel lattice, anchored to the page's `vf-desktop` (else the document
root, or an `anchor` you pass) so the cursor's pixels share the raster's
grid phase. A CSS `cursor: url(…)` could not get there — the OS composites
that image at the pointer's own device position, out of phase with the
raster's 3-device-px grid two positions in three, filtered at the engine's
discretion, and blind to the kit's zoom-following — which is why the cursor
is a drawn element, riding the top layer above windows, menus and modals,
and the native one is hidden. The hiding is two declarations, both applied
for you and both necessary:

```css
* { cursor: none !important }  /* the light DOM, UA rules included: the
                                  browser's own sheets put cursors on <button>
                                  and <input>, and an element's own declaration
                                  beats anything inherited */
:root { --vf-cursor: none }    /* the shadow trees and the top layer: every
                                  spot where the kit states a cursor reads this
                                  token first (SPEC §3) — including the ones
                                  page CSS can never reach: a scroll rail, a
                                  title-bar widget, a modal's backdrop */
```

Which art shows is read from state rather than declared per control:
`aria-busy="true"` anywhere over the pointer — or on an open modal, a dialog
mid-save — is the wristwatch, the same attribute assistive tech already
listens to; an enabled text well takes the I-beam by platform semantics
alone; `data-vf-cursor="crosshair"` claims a region explicitly; anything
else is the arrow. The I-beam and crosshair draw with the classic XOR pen —
`filter: invert(1)` plus `mix-blend-mode: difference` inverts the pixels
beneath, per pixel, black on white and white on black, exactly as System 7
drew them. The wristwatch turns its hand (8 frames, `waitFrameMs` per) and
holds still for a reader who prefers reduced motion.

One engine can't XOR: stable Safari's top layer refuses to blend against the
page (WebKit trunk already carries the fix), and no feature query can see
the difference — so on Apple engines each XOR cursor draws its `staticSrc`
variant as-is instead: same box, same hotspot, its own legibility. The
embedded set's variants put the ink under a one-pixel white halo, the
arrow's own outline treatment, generated at embed time; hand-drawn art
replaces one by adding `cursors/<name>-static.png` and re-running
`embed:cursors`. Give your own `invert` art a `staticSrc` too — without
one, Safari draws its ink un-inverted.

The art ships *inside the module* — base64 data URIs like the bitmap faces,
never an asset file (`npm run embed:cursors` regenerates `src/cursor-art.ts`
from `cursors/*.png`) — and every kind takes your own instead: a
`VfCursorArt` is frame URLs at one image px per system px, the size, the
hotspot, and whether it draws with the XOR pen. Pass one per kind, `null` to
disable a kind, or remix the exported set:

```ts
import { applyCursor } from 'vintage-frames'

applyCursor({
  crosshair: { src: '/my/pencil.png', width: 16, height: 16, hotspotY: 15 },
  wait: null, // never show the watch; busy surfaces keep the arrow
})
```

The pointer hides only once the arrow art has decoded — a broken option
never strands a cursorless page — and a kind whose art fails to load falls
back to the arrow. The honest cost of a drawn cursor is that an element
repaints a frame behind the hardware one; on a machine that moved its
cursor at VBL pace, arguably part of the emulation.

## The Finder icon — `vf-icon`

`vf-img` puts a picture on the grid. `vf-icon` makes it a **control**: the unit
the Finder actually manipulates, where a picture and a caption select together,
move together and rename together.

```html
<vf-icon label="Macintosh HD" width="64" selectable movable editable
         top="16" left="16">
  <vf-img slot="large"><img src="hd-32.png" alt=""></vf-img>
  <vf-img slot="small"><img src="hd-16.png" alt=""></vf-img>
</vf-icon>
```

`top`/`left` because it is `movable` — a moved icon needs somewhere to be moved
*from*, and a `vf-desktop` or any sized `position: relative` box is the
somewhere (see [Positioning](#positioning-inside-a-window--top-and-left)). Drop
`movable` and the coordinates go with it: a plain `vf-icon` is a picture with a
caption, and lays out in your own flex row or grid like any other element.

**The art arrives by slot, not as a `src` property** — for the reason `vf-img`
exists at all. The kit ships no raster files and never builds an `<img>` on your
behalf, so the graphic stays a real element in your own DOM with its `alt`,
`srcset`, loading behavior and asset URLs intact; a `src` string can express none
of that, and could not hold an inline `<svg>` or a `<canvas>` either. It is the
same trade `vf-list-item`'s `icon` slot already makes. The cost
is that both files fetch even though one paints — pay it with two data URIs, or
slot only the size that view uses.

**Two slots, because an icon family is two rasters.** `large` is the 32×32
`ICN#` and `small` the 16×16 `ics#`; `size` picks which one paints *and* the
cell it paints in. The cell is held whether or not there is art for it: a folder
is 32×20 of ink and a document 25×32, and a row of them keeps one baseline only
because the cell — not the ink — is the unit, which is what an icon resource
always was.

**Selection inverts, because the art already is a mask.** A System 7 icon is
black ink and opaque white on a transparent surround, so inverting flips ink and
fill and leaves the surround alone — the whole of the classic selected
appearance, exactly. The name plate takes the `--vf-highlight` pair, sharing one
selection color with `vf-list-item`. Clicking selects, Shift adds, and a press
anywhere else clears — single-selection works with no container managing the
set, which is what the outside-press listener buys.

**An icon alone is a picture; an icon in a field is an option.** That the
selection needs no container is a *behavior* win, but ARIA disagrees about the
announcement: `role="option"` is invalid without a `listbox` that owns it, and
a browser handed an orphaned one drops the role and `aria-selected` with it. So
the role follows the container. Unowned, a `selectable` icon is `role="img"`
named from its `label` — true of what it is, and honest about the fact that
"selected" has no set to mean anything within. Declare the owner and the
selection becomes announceable:

```html
<div role="listbox" aria-label="Desktop" aria-multiselectable="true">
  <vf-icon label="Macintosh HD" selectable movable editable>…</vf-icon>
  <vf-icon label="Trash" selectable movable editable>…</vf-icon>
</div>
```

One attribute on whatever already holds the field, and the wrapper is
layout-neutral — placed icons anchor to the nearest *positioned* ancestor, so
they still sit on the desktop's raster. `vf-desktop` can't be the listbox
itself: it also holds windows and a menu bar, and a non-`option` child of a
listbox is invalid the same way the orphan was. The showcase does this.

**`selectable` is what makes an icon focusable**, so `movable` and `editable`
presuppose it — the Finder's own model, where you cannot move or rename what
you have not selected, and what the pointer path already assumed (the rename
opens only on an *already-selected* icon). A `movable`-only icon is draggable
but takes no tab stop.

**`open` is derived, not shipped.** The Finder's other visual state — the
window this icon stands for is on screen — redraws the art as a ghost: the
outline held in solid black, the interior re-filled with the same loose 25%
dither the scroll rails use, the transparent surround untouched. There is no
second raster and no second fetch: the same alpha channel that makes selection
an inversion is the icon's mask resource, so both halves of the ghost are
derived from the slotted art in the client, by canvas compositing alone — a
silhouette, a 1px erosion (`destination-in` against itself shifted one pixel
each way), and a pattern fill anchored on the art's own grid, so a field of
open icons shares one lattice phase. Nothing ever reads pixels back, which
means a cross-origin image that taints its canvas still works: taint forbids
reading, not drawing or displaying. And because the ghost keeps ink and opaque
white on a transparent surround, a selected open icon inverts exactly as a
closed one does. Set `open` when you handle `vf-open`, clear it when the window
goes away — the showcase's launcher icons do exactly that. Art the pipeline
cannot draw (nothing slotted, a failed load, an inline `<svg>`) keeps rendering
as itself.

**The parameter is `movable`, never `draggable`.** `draggable` is a global HTML
attribute *and* an `HTMLElement` accessor, so declaring it would both shadow a
platform member and hand the element to the browser's own drag-and-drop
machinery — the [`align` trap](#laying-out-inside-a-window--vf-stack) in a second
costume. `align`, `hidden`, `dir`, `title` and `draggable` all carry behavior a
custom element never asked for. `vf-window` already spells this one `movable`,
so the icon does too, and moves the same way: whole art pixels, the way QuickDraw
moved things. Dragging is a pointer gesture with no keyboard equivalent, so a
focused movable icon also moves under the arrow keys — one system px, eight with
Shift.

**The label is a property because it is editable.** Renaming means the component
owns the string and hands it back on `vf-change`, and it cannot own text living
in your DOM. An empty `label` draws no plate at all — that *is* the "no label"
setting, in preference to a second attribute that could disagree with it. With
`editable`, a click on the plate of an already-selected icon opens the rename
box, Return commits, Escape reverts, and the plate widens as you type.

**The name and the art are one target, and the second click decides.** A
double-click opens the icon wherever it lands — the Finder never made you aim at
the 32 pixels of art, and the name is as much the icon as the picture is. But
the name is also where a single click renames, so both gestures begin with the
same press and only the second one tells them apart. The rename therefore
*waits*: a press on the plate arms a field that opens once the double-click
window has passed (`RENAME_DELAY_MS`, 800ms), and any press landing inside that
window calls it off, leaving the double-click to open with no rename box
flashing up behind it. A press that travels into a drag does the same — a name
is a drag handle, exactly like the art — as does a press elsewhere, or any key.
Return still opens the field at once: a keypress has no second half to wait for.

The window leans long on purpose. Nothing reports what the *browser* counts as a
double-click — it follows a platform setting the user can move — and the two
mistakes are not symmetrical: reading a lone click as a pair costs a wait before
the box appears, while reading a pair as a lone click renames when the user
asked to open.

**A name is never abbreviated, and never folded.** No ellipsis, no clipping, no
wrapping — one line, always. System 7 solved the long-name problem at the
*other* end — HFS capped a filename at 31 characters — so the Finder could
afford to always draw the name in full, and did. Wider than its cell, a name
simply overflows it, centered, the way a name wider than a 32-pixel icon always
did. So `width` is the cell, the grid pitch, not a bound on the name.

**Everything centered lands on a whole pixel, by parity.** The frame centers two
things over one axis — the art cell and the name — and a centered child sits at
`(box − child) / 2`, which is whole exactly when the box and the child share a
parity. Half a system pixel is what fringes 1-bit art: the glyph stems smear
across two device columns and go gray while the plate behind them stays sharp,
because backgrounds are pixel-snapped by the compositor and glyphs are not. A
crisp plate under a grey name is the signature of exactly that.

So the component makes the parities agree rather than correcting afterwards: the
cell is 32 or 16, and the name plate is measured from its text and sized to a
whole **even** number of system px. Both children are even, so every offset is
whole — at every density, declared `width` or not. Nothing is snapped and
nothing leans on the rasterizer, which is why the kit's normal antialiasing
stays on: a run that starts on a whole pixel gives it nothing to smooth.
Staying on one line is part of the same argument — a single run has one measured
width, rather than one per line each with its own parity.

Your side of it is one rule: **a declared `width` must be even.** The component
rounds its own plate, but it cannot round a number you chose.

`maxlength` (31) bounds the rename field, and going past it fires
**`vf-name-too-long`** with `{ attempted, accepted, limit }` — enough to raise
the alert System 7 raised rather than let characters vanish silently. It bounds
typing only: a `label` set from your own data is displayed as given and fires
nothing, since the name belongs to your model and truncating it would lose data.

**A file has to be called something**, so a rename committed empty — or as
nothing but spaces — is refused and the previous name comes back, as System 7
refused it. That fires **`vf-name-rejected`** with `{ attempted, kept, reason }`
and deliberately *no* `vf-change`, since nothing changed. An empty `label` is
still a fine state to *start* in: a freshly made icon has no name until it is
given one, draws no plate, and stays selectable, focusable and renameable via
Return. The box hugs its text while you type it, not just once you're done, so
committing never moves the name — the one exception being an edit with nothing
in it yet, which reserves a cell's width because a field you can't see is one
you can't type into.

```sh
npm run verify:icon   # the cell metrics at dpr 1/2/3; art, plate and text all on
                      # whole system px with the plate even, and not one gray
                      # pixel in a field of names; one-line names that overflow
                      # rather than abbreviate; the 31-char cap and its event;
                      # single-selection with no container; the rename gesture —
                      # deferred past the double-click window, so the name opens
                      # the icon and drags it like the art does;
                      # that `draggable` is never touched; keyboard-only focus;
                      # the open ghost read off the rendered pixels — ring,
                      # lattice, transparency, inversion — incl. from a source
                      # that taints its canvas
```

## Tests

```sh
npm test                  # all 32 verify scripts, in parallel
npm test -- focus button   # only the ones whose name matches
npm test -- --bail         # stop at the first failing script
npm run verify:focus       # one script, against a dev server you started
```

The `verify:*` scripts referenced throughout this README **are** the test
suite. They are Playwright *drivers*: Node reaches into a real page and asserts
what the browser actually computed — rendered pixels, resolved `calc()`, the
accessibility tree, the device-pixel grid at three densities.

That direction is deliberate. jsdom has no layout, no `clip-path`, no
`devicePixelRatio` and no accessibility tree, so it can resolve none of what
this kit exists to guarantee. And an in-page test runner can't help either:
`:focus-visible` and the kit's focus-modality rule only respond to **trusted**
input, which nothing running inside the page can produce — `verify:focus`
presses a real Tab key and clicks a real mouse. Clipped screenshots, per-context
`deviceScaleFactor` and the CDP accessibility domain are all Node-side too.

`npm test` starts a dev server on the port it will poll, runs every script in
parallel, prints one table and exits nonzero if any fail. A server already
listening is reused and left running — it's yours. What the scripts share (the
page builder, `check()`, the tally, a PNG decoder, the accessibility-tree
walker) lives in [`scripts/harness.mjs`](./scripts/harness.mjs); each script
keeps its own prose header explaining what it defends and why, which is the
part worth reading.

## Utilities & style toolkit

The shared toolkit the components are built from is exported from the package
root, so you can author a custom control that matches the kit pixel-for-pixel:

```ts
import { vfBase, vfPanel, sys, glyphSvg, CHECKMARK } from 'vintage-frames'
```

| Export | What it's for |
| --- | --- |
| `applyScale`, `ScaleController`, `onScaleChange` | Opt a subtree (or your own component) into true-size rendering |
| `getZoom`, `truePixelRatio`, `onZoomChange`, `devicePxPerSystemPx`, `resetZoomBaseline` | The zoom half of display scaling: the tracked page zoom; device px per CSS px *including* it (what `devicePixelRatio` stops being in Safari under zoom — the number every "snap to the device grid" computation must divide by); a subscription to zoom changes; the zoom→target quantization; and the "current state is 100%" escape hatch |
| `applyGridSnap`, `requestGridSnap`, `GridSnapController` | Opt the page into automatic device-pixel-grid snapping; add it to your own component with one controller line plus the `vf-snap` class on its painted root |
| `applyCursor`, `CURSOR_ARROW`, `CURSOR_I_BEAM`, `CURSOR_CROSSHAIR`, `CURSOR_WAIT` | Replace the native pointer with the embedded System 7 pointer set, drawn on the system-pixel grid (see [The cursor](#the-cursor--the-platforms-by-default-yours-to-draw)); the constants are the embedded art, exported so a consumer can remap or remix it with their own |
| `sys`, `toSys`, `toSysExact`, `sysLength`, `sysLengths`, `effectiveScale`, `getScale`, `snapSys`, `systemPxQuantum`, `snapToSystemPx`, `snapToDevicePx`, `DEVICE_PX_PER_SYSTEM_PX` | Convert between system (art) px and CSS px, honoring the effective `--vf-scale`; `sysLength`/`sysLengths` emit a system-px length (or a 1–4 value shorthand) that stays live against the display, which is what a position or size written onto an element belongs in; `snapSys` puts a system-px coordinate on the placement lattice (`systemPxQuantum` is that lattice — whole art pixels, like QuickDraw, in the smallest run that is also whole in CSS px), and `snapToSystemPx`/`snapToDevicePx` are its CSS-px twins |
| `VfPositioned`, `VfSized`, `PlacementController` | The `top`/`left` and `width`/`height` mixins, in whole system px — and the gesture half, which is how a drag states its result in the same properties an author would have written (see [Positioning inside a window](#positioning-inside-a-window--top-and-left)) |
| `vfBase`, `vfDisplay`, `vfDisplayDecls`, `vfBodyDecls`, `vfStaticText`, `vfPanel`, `vfChromeFrame`, `vfTitleBar`, `vfHardShadowDecls`, `vfStripes`, `vfFocus`, `vfFocusRing`, `vfFocusUnderline`, `vfToggle`, `vfField`, `vfScrollbars` | The 1-bit CSS recipes — compose into `static styles` |
| `glyphSvg` + the glyph constants (`CHECKMARK`, `CARET_DOWN`, `STEPPER`, …) | The 1-bit sprite set, rendered inline as SVG |
| `steppedRectClip`, `steppedRingClip`, `steppedCornerClip`, `BUTTON_FRAME`, `BUTTON_FACE`, `RING_FRAME`, `RING_HOLE`, `RING_INSET`, `SCREEN_CORNER` | Pixel-stepped corner profiles and their `clip-path` traces (no antialiased `border-radius`), plus the screen-corner mask `vf-menu-bar rounded` paints |
| `DragController`, `ScrollStateController`, `TrackWidthController`, `DocumentListenersController` | Pointer-drag wiring; per-axis overflow and inactive-window reporting for the always-a-rail scrollbars (a non-frontmost window's rails blank, per the HIG); a track's measured width, for drawing your own 1-bit fill on the system-pixel grid; document-level listeners scoped to an open panel or in-flight gesture (paired attach/detach + disconnect cleanup in one place) |
| `focusModality`, `trackFocusModality`, `FocusRuleController` | Whether the keyboard or a pointer last drove the page, and that resolved against a host's own focus as one reactive flag — what a control consults to mark keyboard focus only, wherever `:focus-visible` can't say so: a *clicked* text input matches it, and so does any control that suppresses the browser's mouse focus and calls `focus()` itself |
| `emit`, `prefersReducedMotion`, `runSelectionBlink`, `BLINK_INTERVAL_MS`, `BLINK_FLIPS`, `PRESS_HOLD_MS`, `RENAME_DELAY_MS` | The `bubbles`+`composed` event convention; the sanctioned ~250ms selection blink; the tap-vs-hold threshold both press-drag surfaces share; and the window a press on an icon's name waits out before it renames, so a double-click there opens instead |
| `defineElement`, `vfElement` | Register a custom element without the duplicate-copy footgun — `vfElement` is the kit's `@customElement`, and both skip (with a warning) rather than throwing when the tag is already taken (see below) |
| `VfFormControl`, `VfTextControlBase`, `VfToggleControl`, `VfPositioned`, `VfModalDialog`, `modalDialogStyles` | Base classes: form association, the text-field recipe, the toggle interaction skeleton (a mixin — see below), explicit placement (`top`/`left` in system px — the mixin every kit element already wears), the native-`<dialog>` lifecycle |
| `registerEmbeddedFont`, `registerDisplayFace`, `registerBodyFace`, `VF_DISPLAY_FAMILY`, `VF_BODY_FAMILY` | Register the bitmap faces on `document.fonts` yourself; the two constants are the family names they register under (`'VF Display'`, `'VF Body'`) |

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
