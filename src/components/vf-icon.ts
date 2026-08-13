import { css, html, LitElement, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import { vfElement } from '../define.js'
import { PlacementController, VfPositioned, warnMovableContract } from '../position.js'
import type { PlacementBounds } from '../position.js'
import { vfBase, vfBodyDecls, vfFocusUnderline } from '../styles/base.js'
import { effectiveScale, ScaleController, toSysExact } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'
import { DragController } from '../drag.js'
import { DocumentListenersController } from '../document-listeners.js'
import { FocusRuleController } from '../focus-modality.js'
import { emit } from '../events.js'
import { RENAME_DELAY_MS } from '../motion.js'
import { deriveOpenArt } from '../open-art.js'

/** Which member of the icon family paints — the two System 7 resource sizes. */
export type VfIconSize = 'large' | 'small'

/** The cell each size reserves, in system px: an `ICN#` and an `ics#`. */
const CELL: Record<VfIconSize, number> = { large: 32, small: 16 }

/** How far an arrow key moves a movable icon, in system px (Shift multiplies). */
const NUDGE = 1
const NUDGE_COARSE = 8

/**
 * Hold a drag origin in `[0, max]`. A `max` at or below zero means the
 * container is genuinely smaller than the icon and has no range to clamp into,
 * so the origin is only held off the near edge.
 *
 * A container with *no* box is a different thing and never reaches here —
 * `#keepWhole` falls back to the viewport for that, because an empty parent
 * usually means the movable contract was not met (no `top`/`left`, so the icon
 * left flow on its first move and collapsed the parent it is measured against)
 * rather than a container that is really zero-sized.
 */
const clamp = (v: number, max: number): number =>
  max <= 0 ? Math.max(v, 0) : Math.min(Math.max(v, 0), max)

/**
 * `<vf-icon>` — a Finder icon: pixel art in a reserved cell with its name on a
 * plate below, selectable, movable and renameable in place.
 *
 * It is the one composite in the kit whose parts already existed separately —
 * `vf-img` draws the art, `vf-list-item` inverts on selection, `vf-window`
 * drags — and the reason to have it anyway is that the *icon* is the unit the
 * Finder actually manipulates. A picture and a caption that select together,
 * move together and rename together is a control, not a layout.
 *
 * ### The art arrives by slot
 *
 * Two slots, one per resource size — `large` is the 32×32 `ICN#` and `small`
 * the 16×16 `ics#` — each holding a `vf-img` around the consumer's own `<img>`:
 *
 * ```html
 * <vf-icon label="Macintosh HD" selectable movable editable>
 *   <vf-img slot="large"><img src="hd-32.png" alt=""></vf-img>
 *   <vf-img slot="small"><img src="hd-16.png" alt=""></vf-img>
 * </vf-icon>
 * ```
 *
 * Slots rather than `src` properties, for the reason `vf-img` exists at all:
 * the kit ships no raster files and never builds an `<img>` on a consumer's
 * behalf, so the graphic stays a real element in the light DOM with its own
 * `alt`, `srcset`, loading behavior and asset URLs. A `src` string can express
 * none of that, and it could not hold an inline `<svg>` or a `<canvas>` either.
 * `vf-list-item`'s `icon` slot makes the same trade.
 *
 * The cost is that both files fetch even though one paints — pay it with two
 * data URIs, or slot only the size that view uses.
 *
 * ### The cell is reserved, the art is registered in it
 *
 * `size` picks which slot paints *and* the cell it paints in: 32×32 or 16×16,
 * held whether or not there is art for it. A folder is 32×20 of ink and a
 * document 25×32, and a row of them keeps one baseline only because the cell —
 * not the ink — is the unit, which is what an icon resource always was.
 *
 * ### Everything centered lands on a whole pixel, by parity
 *
 * The frame centers two things over one axis — the art cell and the name — and
 * a centered child sits at `(box − child) / 2`. That is a whole number exactly
 * when the box and the child have the **same parity**. Half a system pixel is
 * what fringes 1-bit art: the glyph stems smear across two device columns and
 * go gray, while the plate behind them stays sharp, because backgrounds are
 * pixel-snapped by the compositor and glyphs are not. A crisp plate under a
 * grey name is the signature of exactly this.
 *
 * So the component makes the parities agree instead of correcting afterwards.
 * The cell is 32 or 16, and {@link #measurePlate} sizes the name plate to a
 * whole **even** number of system px — measured from the text, rounded up. Both
 * children are then even, and so is every offset, at every display density and
 * whether or not a `width` is declared. Nothing is snapped, nothing leans on
 * the rasterizer, and `verify:icon` asserts both the geometry and that a field
 * of names renders without a single gray pixel — with the kit's normal
 * antialiasing left on, since a run on whole pixels gives it nothing to smooth.
 *
 * Your side of it is one rule: **a declared `width` must be even**, since the
 * component cannot round a number you chose. Supply art at the cell size too —
 * which "one image pixel is one system pixel" already implies — because art
 * differing from its cell by an odd number centers the same way.
 *
 * ### Selection inverts, because the art is a 1-bit mask
 *
 * A System 7 icon is black ink and opaque white on a transparent surround —
 * precisely an image plus its mask — so inverting it flips ink and fill and
 * leaves the surround alone, which is the whole of the classic selected
 * appearance. `filter: invert(1)` reproduces it exactly for 1-bit art. Color
 * art inverts too, into a photographic negative rather than the darkening
 * System 7 gave it; that is the case to revisit if the kit ever grows a
 * selected-state treatment of its own. The label plate inverts to the
 * `--vf-highlight` pair, sharing one selection color with `vf-list-item`.
 *
 * ### Open is derived, not shipped
 *
 * With `open`, the art redraws as the Finder's open ghost: the outline held
 * in solid black, the interior re-filled with the kit's loose 25% dither (the
 * scrollbar trough's lattice), the transparent surround untouched. There is
 * no second raster and no second fetch — the same alpha channel that makes
 * selection an inversion makes the ghost derivable, and `src/open-art.ts`
 * derives it from the slotted art by canvas compositing alone. No pixels are
 * ever read back, so a cross-origin image that taints its canvas still works:
 * taint forbids reading, not drawing or displaying.
 *
 * The ghost keeps the shape selection expects — ink and opaque white on a
 * transparent surround — so a selected open icon inverts exactly as a closed
 * one does, with no second treatment. The slot stays in the tree while the
 * ghost paints, hidden (it is where the art loads, and re-loads, from), and
 * art the pipeline cannot draw — nothing slotted yet, a failed load, an
 * inline `<svg>` — keeps rendering as itself rather than vanishing behind a
 * state it cannot show.
 *
 * ### `movable`, not `draggable`
 *
 * `draggable` is a global HTML attribute *and* an `HTMLElement` accessor, so
 * declaring it would both shadow a platform member and hand the element to the
 * browser's own drag-and-drop machinery. This is the `align` trap from
 * `vf-stack` in a second costume — `align`, `hidden`, `dir`, `draggable` and
 * `title` all carry behavior a custom element never asked for. The kit already
 * spells this parameter `movable` on `vf-window`, so the icon does too, and it
 * moves the same way: `DragController` tracks the gesture and
 * `PlacementController` writes the result into `left`/`top` in whole system px,
 * the art's own unit — the same pair markup places an icon with, so a moved
 * icon is still where it was dropped after a zoom.
 *
 * Dragging is a pointer gesture with no keyboard equivalent, which is the kind
 * of gap the kit closes rather than inherits (SPEC §1): a focused movable icon
 * also moves under the arrow keys, one system px at a time and eight with
 * Shift. Focus is what `selectable` grants, so the keyboard half of `movable`
 * and `editable` presupposes it — see the role section below.
 *
 * Opening gets the same treatment. The double-click is the pointer gesture,
 * and its keyboard route is ⌘O / ⌘↓ — the System 7 Open shortcuts, with Ctrl
 * standing in for ⌘ off the Mac. Return is deliberately not one of them: the
 * Finder's Return renamed, never opened, so on an editable icon it starts the
 * edit and on a non-editable one it does nothing at all.
 *
 * ### The name and the art are one target, and the second click decides
 *
 * A double-click opens the icon *wherever it lands* — the name is as much the
 * icon as the picture is, and the Finder never made you aim at the 32 pixels of
 * art. But the name is also where a single click renames, so the two gestures
 * begin with the same press and only the second one tells them apart.
 *
 * So the rename waits for it. A press on the plate of an already-selected icon
 * arms the field rather than opening it, and the next press inside
 * {@link RENAME_DELAY_MS} calls it off — leaving the double-click to open, with
 * no rename box flashing up behind it. Nothing needs to *undo* an edit that
 * began: the press that starts one and the press that opens are the same
 * press, so the only thing that can be got right is not committing early.
 *
 * The window is generous in the one direction that is cheap. Reading a lone
 * click as a pair costs a wait before the box appears; reading a pair as a lone
 * click renames when the user asked to open. The same reasoning covers a press
 * that turns into a drag, a press elsewhere, and any key — each calls the
 * pending rename off, because none of them is the click it is waiting for.
 *
 * ### An icon alone is a picture; an icon in a field is an option
 *
 * `role="option"` is only meaningful inside a `listbox` that owns it. Written
 * unconditionally it is not merely untidy — the browser *drops* it, and
 * `aria-selected` with it, so a `selectable` icon announced as a bare generic
 * and its selection state reached assistive tech nowhere at all.
 *
 * So the role follows the container. Owned, the icon is an `option` that names
 * itself from its plate and publishes `aria-selected`. Unowned, it degrades to
 * `role="img"` with a name — the same vocabulary the derived open ghost uses,
 * and true of what it is. Deliberately not `button`: that would promise Enter
 * and Space activate, and here Return *renames* while the open route is ⌘O / ⌘↓.
 *
 * Declaring the owner is one attribute on whatever already holds the field, and
 * it is what buys the selection state back:
 *
 * ```html
 * <div role="listbox" aria-label="Desktop" aria-multiselectable="true">
 *   <vf-icon label="Macintosh HD" selectable movable editable>…</vf-icon>
 *   <vf-icon label="Trash" selectable movable editable>…</vf-icon>
 * </div>
 * ```
 *
 * A `vf-desktop` cannot be that container itself: it also holds windows and a
 * menu bar, and a non-`option` child of a listbox is invalid the same way the
 * orphaned option was. The plain wrapper above is layout-neutral — placed icons
 * anchor to the nearest *positioned* ancestor, which is still the desktop's
 * raster. One divergence from the APG listbox is deliberate: its options share
 * a single roving tab stop, while these stay one stop each, the way a Finder
 * icon is reached on its own.
 *
 * **`selectable` is what makes an icon focusable**, and `movable`/`editable`
 * presuppose it. That is the Finder's own model — you cannot move or rename
 * what you have not selected — and the pointer path already assumed it: the
 * rename opens on a press on the plate of an *already-selected* icon. A
 * `movable`-only icon is a picture you can drag, not a widget.
 *
 * ### The label is a property, because it is editable
 *
 * The caption is `label` rather than slotted content: renaming means the
 * component owns the string and hands it back on `vf-change`, and it cannot own
 * text that lives in the consumer's DOM. An empty `label` draws no plate at
 * all — that *is* the "no label" parameter, in preference to a second attribute
 * that could disagree with it. `editable` then lets a click on the plate of an
 * already-selected icon open the rename box a moment later, as the Finder's
 * does (see above), with Return committing, Escape reverting, and the plate
 * widening as you type.
 *
 * ### A name is never abbreviated, and never folded
 *
 * There is no ellipsis, no clipping and no wrapping: one line, always. System 7
 * solved the long-name problem at the *other* end — HFS capped a filename at 31
 * characters — so the Finder could afford to always draw the name in full, and
 * did. A name wider than its cell simply overflows it, centered, the way a name
 * wider than a 32-pixel icon always did.
 *
 * Staying on one line is also what keeps the name on the grid: a single run has
 * a single measured width, so the even-plate rule above is one number rather
 * than one per line, each with its own parity. `width` is therefore the cell —
 * the grid pitch — not a bound on the name.
 *
 * `maxlength` (31) bounds the rename field rather than the `label` property:
 * the name belongs to the consumer's model, and truncating one handed to us
 * would lose data.
 *
 * The box hugs its text while you type it, not only once you are done, which is
 * what keeps the name from moving when the edit commits: the plate is the same
 * width either side of it, so the glyphs stay exactly where they were.
 *
 * A file also has to be called *something*, so a rename committed empty — or
 * as nothing but spaces — is refused rather than applied, and the previous name
 * comes back, which is what System 7 did. An empty `label` is still a perfectly
 * good state to *start* in, though: a freshly made icon has no name until it is
 * given one. Such an icon draws no plate but stays selectable, focusable and
 * renameable — Return opens a field, and an edit with nothing in it yet is the
 * one time the box stops hugging and reserves a cell's width, since a field you
 * cannot see is one you cannot type into.
 *
 * @slot large - The 32×32 art, normally a `vf-img` around an `<img>`.
 * @slot small - The 16×16 art, shown under `size="small"`.
 * @csspart frame - The icon and its label plate, stacked.
 * @csspart icon - The reserved art cell.
 * @csspart label - The name block; its lines are centered under the art.
 * @csspart plate - The inked run behind the name, which each wrapped line gets
 *   its own of (inverts when selected).
 * @csspart input - The rename field, while editing.
 * @cssprop --vf-icon-gap - Space between the art cell and the name plate
 * @cssprop --vf-icon-label-height - The name plate's line box
 * @fires vf-select - Selection changed by user interaction. `detail: { selected: boolean }`.
 * @fires vf-change - The name was committed. `detail: { label: string, previous: string }`.
 * @fires vf-open - The icon was opened — double-clicked anywhere on it, its
 *   name included, or ⌘O / ⌘↓ from the keyboard (Ctrl off the Mac), the
 *   System 7 shortcuts. Return renames instead, as the Finder's did.
 *   `detail: {}`.
 * @fires vf-name-too-long - A rename was typed or pasted past `maxlength`, and
 *   the field refused the excess. `detail: { attempted, accepted, limit }` —
 *   enough to raise the alert System 7 raised rather than drop the characters
 *   silently. Not fired for a `label` set from your own code, which is never
 *   truncated in the first place.
 * @fires vf-name-rejected - A rename was committed with no name in it, so the
 *   edit was dropped and the old name put back.
 *   `detail: { attempted, kept, reason: 'empty' }`. A `vf-change` is *not*
 *   fired alongside it — nothing changed.
 */
@vfElement('vf-icon')
export class VfIcon extends VfPositioned(LitElement) {
  static override styles = [
    vfBase,
    css`
      :host {
        display: inline-block;
        cursor: var(--vf-cursor, default);
        /* The reserved cell, resolved once so the art box and the no-label
           focus rule share one definition. Not a public token: the two sizes
           are the two icon resources, not a taste. */
        --_cell: 32px;
      }
      :host([size='small']) {
        --_cell: 16px;
      }
      .frame {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .art {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: calc(var(--vf-scale, 1) * var(--_cell));
        height: calc(var(--vf-scale, 1) * var(--_cell));
        /* Art larger than its cell is clipped rather than allowed to collide
           with the plate — a wrong-size asset stays a visibly wrong asset. */
        overflow: hidden;
      }
      /* The classic selected icon: the art is ink and opaque white on a
         transparent surround, so inverting flips the two and the surround
         stays out of it (see the class doc). The open ghost keeps exactly
         that shape, so the same rule is the whole of selected-open too. */
      :host([selected]) .art {
        filter: invert(1);
      }
      /* The open ghost replaces the slotted art while there is one — the
         slot stays in the tree (it is where the art loads and re-loads
         from) but paints nothing. Gated on the class, not :host([open]):
         art the pipeline cannot draw keeps rendering as itself rather than
         vanishing behind a state it cannot show. */
      .art.open slot {
        display: none;
      }
      /* The derived raster displays on the terms vf-img gives the art it
         came from: natural size in system px (the inline style it carries),
         nearest-neighbor on whole device pixels. */
      .ghost {
        display: block;
        image-rendering: pixelated;
      }
      /* Sized by the plate, and deliberately NOT clamped to the frame: a name
         wider than the cell has to straddle the centre line, not start at the
         cell's left edge and run off to the right. Clamping it left the art
         and the name on two different axes — and since the plate is even and
         the cell is even, the negative offset a wider caption gets from the
         centring below is still a whole number of system px. */
      .caption {
        position: relative;
        margin-top: calc(var(--vf-scale, 1) * var(--vf-icon-gap, 2px));
      }
      .label {
        ${vfBodyDecls}
        font-weight: var(--vf-font-weight, 700);
        /* Whole system px, never a ratio — layout contract rule 2. 12, not
           the face's 16px em: the Finder's plate is 12 system px tall, and
           the em centered in it lands the ink exactly where the Finder put
           it — 3px above the ascenders, descenders on the bottom edge. The
           half-leading is (12 − 16) / 2, so an override must keep the box's
           parity even for the baseline to stay on a whole pixel. */
        line-height: calc(
          var(--vf-scale, 1) * var(--vf-icon-label-height, 12px)
        );
        /* One line, always. A name is never abbreviated and never wrapped: it
           is at most 31 characters, and it overflows its cell rather than
           folding — which is also what keeps its x whole (see the class doc). */
        white-space: nowrap;
        text-align: center;
      }
      /* Inline, not block, so the plate hugs each line separately — a wrapped
         name reads as stacked bars of different widths, which is how System 7
         drew it. The clone value is what repeats the 1px side padding onto
         every fragment instead of only the first and last. */
      /* The plate: an inline-block sized to a whole EVEN number of system px
         (see #measurePlate). That parity is the whole alignment argument —
         with it, both things the frame centers land on a whole pixel by
         construction rather than by correction. */
      .name {
        display: inline-block;
        /* The plate is opaque white in its own right, not the surrounding
           surface: on the desktop dither the name reads because it sits on a
           plate, and --vf-surface is unset out there. */
        background: var(--vf-white, #fff);
        color: var(--vf-black, #000);
        /* Whole system px, and NOT centered inside the plate: the text starts
           at the padding edge, so its own x is the plate's x plus one whole
           pixel. Centering here would re-introduce the half pixel the even
           width just removed, one level down. Any slack from rounding up to
           even lands after the text, where it is a hairline of extra plate. */
        padding: 0 calc(var(--vf-scale, 1) * 1px);
        text-align: left;
      }
      :host([selected]) .name {
        /* Forced colors: exempt the inverted plate from the mode's text
           backplate, which would land a Canvas slab on the highlight bar —
           see vf-list-item's forced-colors note. The pair is already the
           user's own via the vfBase token remap. */
        @media (forced-colors: active) {
          forced-color-adjust: none;
        }
        background: var(--vf-highlight, #000);
        color: var(--vf-highlight-text, #fff);
      }
      /* Editing: the plate keeps rendering the draft — still measured, still
         even — so the box tracks the typed width the way the Finder's rename
         box grew, while handing its pixels to the field overlaying it.
         white-space: pre holds the spaces a name may legitimately end in,
         which the collapsing default would drop from the measurement. */
      .caption.editing .label {
        visibility: hidden;
        white-space: pre;
      }
      /* The rename box: a 1px border with a 1px white well inside it, boxing
         the highlighted name rather than letting it touch the rule, the way
         the classic rename box did. The border and well are a wrapper rather
         than the input's own border and padding, because the selection behind
         a highlighted name paints at the face's full 16px em and is clipped
         only at the input's own edge — on one element the em-tall selection
         floods the padding and lands on the border. Splitting them sizes the
         input to the plate's line box, which clips the selection to the same
         12px the plate stands, and keeps the well white outside it.
         Out by the border sideways, and by border-plus-well top and bottom:
         border + well comes to 1px in from the caption horizontally against
         the plate's 1px padding, and 2px in vertically against the 2px it
         was pushed out by, so the run sits exactly where the plate put it
         and nothing shifts when the field opens. */
      .rename-box {
        position: absolute;
        inset: calc(var(--vf-scale, 1) * -2px) calc(var(--vf-scale, 1) * -1px);
        background: var(--vf-white, #fff);
        border: calc(var(--vf-scale, 1) * 1px) solid var(--vf-black, #000);
        padding: calc(var(--vf-scale, 1) * 1px);
      }
      .rename {
        display: block;
        width: 100%;
        /* The plate's own line box, stated as height too: the input clips its
           selection paint at this edge, which is the whole reason it has no
           border of its own (see .rename-box). */
        height: calc(var(--vf-scale, 1) * var(--vf-icon-label-height, 12px));
        ${vfBodyDecls}
        font-weight: var(--vf-font-weight, 700);
        line-height: calc(
          var(--vf-scale, 1) * var(--vf-icon-label-height, 12px)
        );
        /* Hand-rolled rather than composed from vfField: that recipe sets the
           Chicago display face, and pulling it in would ship the whole chrome
           WOFF2 with an element that otherwise sets only body type (see the
           note at the top of styles/base.ts). The Finder renamed in the same
           face it labelled in, so this is the faithful reading too. */
        background: none;
        color: var(--vf-black, #000);
        border: none;
        border-radius: 0;
        padding: 0;
        margin: 0;
        /* Left, matching the plate it overlays: same text x, so the name does
           not shift by half a pixel the moment you start typing — and the
           field's own run stays on the grid for the same reason the plate's
           does. */
        text-align: left;
        user-select: text;
        -webkit-user-select: text;
        outline: none;
        -webkit-appearance: none;
        appearance: none;
      }
      .rename::selection {
        background-color: var(--vf-highlight, #000);
        color: var(--vf-highlight-text, #fff);
      }
      /* Keyboard focus is the kit's dashed rule below the plate, not a ring
         around the icon (see vfFocusUnderline). Below rather than inside it:
         every pixel of the plate is either the name or the fill inverting
         behind it, so there is no interior to lend — the vf-select placement,
         for the same reason. -2px puts it in the second row under a box whose
         ink runs to its own edge. Drawn in currentColor, so it turns white
         along with the name on a selected plate.
         Gated on a class, not :focus-visible: the host takes focus from its own
         pointerdown so a press-drag can own the pointer, and Blink reads that
         as a visible focus (see focus-modality.ts). */
      .caption.focus-rule .label::after {
        --vf-focus-underline-offset: -2px;
        ${vfFocusUnderline}
      }
      /* No name, no plate — the rule falls back to the art cell. */
      .art.focus-rule::after {
        --vf-focus-underline-offset: -2px;
        ${vfFocusUnderline}
      }
      :host(:focus) {
        outline: none;
      }
    `,
  ]

  /** The icon's name. Empty draws no plate — that is the "no label" setting. */
  @property() label = ''

  /**
   * Which member of the icon family paints, and the cell it is registered in:
   * `large` (32×32) or `small` (16×16).
   */
  @property({ reflect: true }) size: VfIconSize = 'large'

  /**
   * Clicking selects. Set `selected` yourself to drive selection some other way.
   *
   * This is also the flag that makes an icon focusable and gives it a role, so
   * the keyboard halves of {@link movable} and {@link editable} presuppose it —
   * as the Finder did. A container carrying `role="listbox"` turns the role from
   * `img` into a real `option`; see the class doc.
   */
  @property({ type: Boolean, reflect: true }) selectable = false

  /** Whether the icon is selected: the art inverts and the plate goes black. */
  @property({ type: Boolean, reflect: true }) selected = false

  /**
   * The icon's window is on screen, so the art paints as the Finder's open
   * ghost — outline held, interior re-filled with the kit's loose dither —
   * derived in the client from the slotted art itself (see the class doc).
   * Set it when handling `vf-open`, clear it when the window goes away.
   * Selection inverts the ghost exactly as it inverts the art.
   */
  @property({ type: Boolean, reflect: true }) open = false

  /**
   * Drag to move — `movable`, never `draggable`, which is a platform attribute
   * and accessor (see the class doc). Arrow keys move a focused icon too, which
   * means pairing this with {@link selectable}: focus is what that grants.
   */
  @property({ type: Boolean, reflect: true }) movable = false

  /**
   * The name can be renamed in place: click a selected plate, or press Return.
   * Pair with {@link selectable} — both routes start from a selected icon.
   *
   * The pointer route opens the field once the double-click window has passed
   * ({@link RENAME_DELAY_MS}), so double-clicking the *name* opens the icon the
   * way double-clicking its art does. Return opens it at once — a keypress has
   * no second half to wait for.
   */
  @property({ type: Boolean, reflect: true }) editable = false

  /**
   * The cell width in whole system px — the grid pitch, and it must be
   * **even**: the component rounds its own plate to keep every centered offset
   * whole, but it cannot round a number you chose (see the class doc).
   *
   * It is not a bound on the name. Left off, the box is as wide as the wider of
   * the art cell and the name; set, a longer name overflows it, centered.
   * Declaring one is what keeps a field of icons on a single pitch, and what
   * keeps a text-sized box off a fractional origin (contract rule 3).
   */
  @property({ type: Number }) width?: number

  /**
   * The most characters the rename field will accept — 31, the HFS filename
   * limit every System 7 name was cut to, which is also why the Finder could
   * afford to always draw the whole name. Going past it fires
   * `vf-name-too-long` with what was tried, so a host can say so rather than
   * let characters vanish.
   *
   * It bounds *typing* only: a `label` set from your own data is displayed as
   * given and fires nothing, since the name belongs to your model and silently
   * truncating it would lose data.
   */
  @property({ type: Number }) maxlength = 31

  /** Default-on display scaling (true 72dpi size); see src/scale.ts. */
  private readonly scale = new ScaleController(this)

  /** Device-pixel grid snapping; see src/grid-snap.ts. */
  private readonly gridSnap = new GridSnapController(this)

  /** Whether to wear the dashed focus rule; see src/focus-modality.ts. */
  private readonly focusRule = new FocusRuleController(this)

  /** True while the rename field is open. */
  @state() private _editing = false

  /** The name as typed. The hidden plate renders it, so the box tracks it. */
  @state() private _draft = ''

  /**
   * The plate's width in whole, EVEN system px — 0 until the text is measured.
   * See {@link #measurePlate}; this is what keeps every name on the grid.
   *
   * Deliberately NOT `@state()`. The width can only be known by rendering the
   * name and measuring it, so a reactive field would make every icon render
   * twice — once to measure, once to deliver one number back — and Lit's
   * change-in-update warning is exactly that round trip being spotted. It
   * feeds a single inline width and nothing else, so {@link #measurePlate}
   * writes it straight to the plate instead, the ownership the grid snapper
   * has over `--vf-snap-dx`/`-dy`. The template still reads it so a caption
   * Lit re-creates (one leaving `_editing`, say) is born at the settled width
   * rather than flashing through the unmeasured one.
   */
  #plateWidth = 0

  /** The derived open ghost, or null while there is nothing to derive from. */
  @state() private _ghost: HTMLCanvasElement | null = null

  /** The art element the ghost derives from, so a rehome moves the listener. */
  #art: HTMLImageElement | HTMLCanvasElement | null = null

  /**
   * ARIA goes through internals, never `setAttribute` on the host: internals
   * values are *defaults*, so a consumer's own `role`/`aria-*` on the tag wins
   * — the platform's own precedence. See SPEC §2.
   */
  readonly #internals = this.attachInternals()

  /**
   * Whether a container is claiming this icon as one item of a set — the
   * `vf-menu` `#inBar` idiom. `option` is invalid without a `listbox` that owns
   * it: unowned, the browser drops the role and `aria-selected` with it, which
   * is how a selectable icon reached assistive tech as a bare `generic` in
   * every configuration the kit shipped.
   *
   * Matched on the attribute because that is what the recipe writes
   * (`<div role="listbox">` — see the class doc). A `vf-list` is deliberately
   * not a match: it holds `vf-list-item` rows, and its own `listbox` role now
   * lives in internals rather than on the tag anyway.
   */
  get #inListbox(): boolean {
    return this.closest('[role="listbox"]') !== null
  }

  /** What the current ghost was derived from, so a no-op refresh is free. */
  #ghostKey = ''

  /** The name editing started from, for Escape to put back. */
  #committed = ''

  /** A rename waiting out the double-click window; 0 when none is pending. */
  #renameTimer = 0

  /**
   * When the last press on this icon landed, so the next one can tell whether
   * it is the second half of a double-click. `-Infinity` until there is one,
   * which is what keeps the very first press from reading as a pair.
   */
  #lastPressTime = -Infinity

  /**
   * Clicking elsewhere deselects, the way it does on a real desktop. Attached
   * only while this icon is both selectable and selected, so an unselected
   * field of icons costs nothing. Capture phase, so a handler that stops the
   * press still deselects — and so the icon being clicked *into* selects after
   * this runs, which is what makes plain clicks single-select with no container
   * managing the set. A container that wants multi-select suppresses it by
   * owning `selected` and leaving `selectable` off.
   */
  readonly #outside = new DocumentListenersController(this, () => [
    [document, 'pointerdown', this.#onOutsidePointerDown, true],
  ])

  /**
   * Where a moved icon is allowed to end up, in system px. Unlike `vf-window`,
   * which only keeps a grabbable strip on screen, an icon is small enough to
   * hold whole — losing half of one to an edge reads as a bug rather than as a
   * window pushed aside.
   */
  #keepWhole = (
    x: number,
    y: number,
    bounds: PlacementBounds
  ): { x: number; y: number } => {
    return {
      x: clamp(x, bounds.width - toSysExact(this.offsetWidth, this)),
      y: clamp(y, bounds.height - toSysExact(this.offsetHeight, this)),
    }
  }

  /**
   * Drag and nudge placement: the origin lands in `top`/`left` in system px,
   * so a moved icon is placed the way an authored one is and holds its spot
   * through a zoom (see src/position.ts).
   */
  readonly #placement = new PlacementController(this, (x, y, bounds) =>
    this.#keepWhole(x, y, bounds)
  )

  /**
   * Drag-to-move, on the same delegate shape as `vf-window`: the placement
   * controller seeds the origin — from the in-flow offset the first time — and
   * writes back each move the drag controller has snapped onto the lattice.
   */
  /** Where the in-flight drag started, so a move can be told from jitter. */
  #dragOrigin = { x: 0, y: 0 }

  readonly #drag = new DragController(this, {
    onDragStart: (event: PointerEvent): { x: number; y: number } | null => {
      if (!this.movable || event.button !== 0 || this._editing) return null
      this.#warnIfUnplaced()
      return (this.#dragOrigin = this.#placement.seed())
    },
    onDrag: (x: number, y: number): void => {
      // Moving an icon is not renaming it, so a press that travels calls off
      // the rename it armed. Measured against the seeded origin rather than
      // taken from the move itself: a stationary press still reports jitter,
      // and every one of those steps snaps back onto the same system px.
      if (x !== this.#dragOrigin.x || y !== this.#dragOrigin.y) this.#disarmRename()
      this.#placement.moveTo(x, y)
    },
  })

  override connectedCallback(): void {
    super.connectedCallback()
    this.#syncTabIndex()
    // Re-derived on every connect, not just the first: whether a listbox owns
    // this icon is a fact about where it currently sits, and updated() does not
    // re-fire on a reconnect — so re-parenting an icon into or out of a field
    // would otherwise strand it on the role it had in the old place.
    this.#syncRole()
    // On the host, not in the template: the host is the focusable element, so
    // it is where the key events land.
    this.addEventListener('keydown', this.#onKeyDown)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('keydown', this.#onKeyDown)
    // A timer outliving the element would open a field in a torn-down tree.
    this.#disarmRename()
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('selectable')) this.#syncTabIndex()
    if (
      changed.has('selectable') ||
      changed.has('selected') ||
      changed.has('label')
    ) {
      this.#syncRole()
    }
    if (changed.has('selected') || changed.has('selectable')) {
      if (this.selectable && this.selected) this.#outside.attach()
      else this.#outside.detach()
    }
    if (changed.has('_editing') && this._editing) {
      const input = this.renderRoot.querySelector('input')
      input?.focus()
      input?.select()
    }
    // Anything that can change the run of glyphs re-measures. Not `width` or
    // `size`: the plate's width is the text's, in system px, which neither the
    // cell nor the display density moves.
    if (changed.has('label') || changed.has('_draft') || changed.has('_editing')) {
      this.#measurePlate()
    }
    // `size` swaps which slot (and so which art) the ghost derives from; the
    // slotchange and load listeners cover every other route to a new raster.
    if (changed.has('open') || changed.has('size')) {
      this.#trackArt()
    }
  }

  /** One warning per element, not per gesture. */
  #warnedNoPlacement = false

  /**
   * A movable icon states its origin. Unlike `vf-window` there is no size half
   * — an icon's height is its content's and `width` is the grid pitch — so this
   * is the whole of the contract here. Checked at gesture time for the reason
   * `vf-window` states. See {@link warnMovableContract}.
   */
  #warnIfUnplaced(): void {
    if (this.#warnedNoPlacement) return
    this.#warnedNoPlacement = warnMovableContract(
      this,
      `vf-icon${this.label ? ` ("${this.label}")` : ''}`,
      '<vf-icon movable label="Read Me" width="64" top="16" left="16">'
    )
  }

  override firstUpdated(): void {
    // The faces register themselves asynchronously, and a name measured
    // against the fallback is a different number of pixels wide. Re-measure
    // once they have landed; `fonts.ready` is already settled by then on a
    // warm page, so this is usually a no-op that costs one microtask.
    void document.fonts.ready.then(() => this.#measurePlate())
  }

  /**
   * Size the plate to a whole, EVEN number of system pixels.
   *
   * This is the whole alignment argument, so it is worth stating plainly. The
   * frame centers two things over one axis — the art cell and the name — and a
   * centered child's offset is `(box − child) / 2`. That is a whole number
   * exactly when the box and the child have the SAME PARITY. The cell is 32 or
   * 16 and a declared `width` is required even, so if the plate is even too,
   * every offset in the component is whole by construction: no correction, no
   * snapping, nothing for the compositor to round.
   *
   * The text is measured rather than the plate, with a Range over its own
   * contents — the plate already carries the width this computed last time, so
   * reading the element back would just return it. The measurement is in
   * system px and so is scale-invariant: the same name is the same number of
   * art pixels wide at every display density, which is why nothing here
   * re-runs when the scale changes.
   *
   * Rounding UP to even (never down) means the plate never clips the run it
   * was measured from; the leftover is at most one system pixel of extra plate
   * after the text, since the embedded faces advance in whole pixels and only
   * a fallback face measures fractionally.
   */
  #measurePlate(): void {
    const plate = this.renderRoot?.querySelector<HTMLElement>('.name')
    if (!plate) {
      this.#plateWidth = 0
      return
    }
    let textCss = 0
    // No text node at all when the name is empty — a legitimate state while
    // an unnamed icon is being named, not a reason to bail.
    if (plate.firstChild) {
      const range = document.createRange()
      range.selectNodeContents(plate)
      textCss = range.getBoundingClientRect().width
      range.detach()
    }
    // 2 = the plate's own 1px of padding either side.
    const natural = textCss / effectiveScale(this) + 2
    const even = Math.max(2, Math.ceil(natural / 2) * 2)
    // The box hugs its text in BOTH states, which is what keeps the name from
    // moving when an edit commits: the plate is the same width either side of
    // it, so the glyphs stay exactly where they were. The one exception is an
    // edit with nothing in it at all — a 2px sliver is a field you cannot see
    // or click — which reserves the cell width until the first character
    // arrives and the box goes back to hugging. The floor is the cell, which
    // is even, so the parity argument is untouched.
    this.#plateWidth =
      this._editing && textCss === 0 ? Math.max(even, CELL[this.size]) : even
    // Settle the frame we were measured in. The template writes the same
    // string on any later render, so the two never disagree.
    plate.style.width = this.#plateWidthCss
  }

  /** The measured width as the live `calc()` both writers use, or '' at 0. */
  get #plateWidthCss(): string {
    return this.#plateWidth
      ? `calc(var(--vf-scale, 1) * ${this.#plateWidth}px)`
      : ''
  }

  #onArtSlotChange = (): void => {
    this.#trackArt()
    // The art carries the fallback name for the unowned `img` branch, and it
    // arrives after the first render — re-state the name now it is readable.
    this.#syncRole()
  }

  #onArtSettled = (): void => {
    this.#refreshGhost()
  }

  /**
   * Follow the active slot's art element and keep the ghost derived from it.
   * The art is normally an `<img>` inside a slotted `vf-img`, but a bare
   * `<img>` or a `<canvas>` (slotted directly or wrapped) derives the same.
   * The `load` listener lives on an element inside this host's own light DOM,
   * so it cannot outlive us (the `vf-img` reasoning), and it re-fires on a
   * `src` swap — the re-derivation a swapped icon needs.
   */
  #trackArt(): void {
    const slot = this.renderRoot?.querySelector<HTMLSlotElement>(
      `slot[name='${this.size}']`
    )
    let art: HTMLImageElement | HTMLCanvasElement | null = null
    for (const el of slot?.assignedElements({ flatten: true }) ?? []) {
      const found =
        el instanceof HTMLImageElement || el instanceof HTMLCanvasElement
          ? el
          : el.querySelector('img, canvas')
      if (
        found instanceof HTMLImageElement ||
        found instanceof HTMLCanvasElement
      ) {
        art = found
        break
      }
    }
    if (art !== this.#art) {
      this.#art?.removeEventListener('load', this.#onArtSettled)
      this.#art?.removeEventListener('error', this.#onArtSettled)
      this.#art = art
      art?.addEventListener('load', this.#onArtSettled)
      art?.addEventListener('error', this.#onArtSettled)
    }
    this.#refreshGhost()
  }

  /**
   * Derive (or drop) the open ghost. Keyed on the art's current source so the
   * usual refresh — a slotchange or load that changed nothing — costs a
   * string compare; a `<canvas>` source has no such fingerprint and
   * re-derives each time, which at icon sizes is a handful of composited
   * draws.
   */
  #refreshGhost(): void {
    const art = this.#art
    const ready =
      art instanceof HTMLImageElement
        ? art.complete && art.naturalWidth > 0
        : art != null && art.width > 0
    if (!this.open || art == null || !ready) {
      this._ghost = null
      this.#ghostKey = ''
      return
    }
    const key =
      art instanceof HTMLImageElement ? `${this.size} ${art.currentSrc}` : ''
    if (key !== '' && key === this.#ghostKey && this._ghost) return
    const ghost = deriveOpenArt(art)
    if (ghost) {
      ghost.className = 'ghost'
      // The terms vf-img gives the art itself: one image pixel is one system
      // pixel, scaled in calc() like every other metric.
      ghost.style.width = `calc(var(--vf-scale, 1) * ${ghost.width}px)`
      ghost.style.height = `calc(var(--vf-scale, 1) * ${ghost.height}px)`
      // The ghost stands in for the art in the tree as well as visually:
      // carry the source's alt, so a graphic that names its icon keeps doing
      // so while its slot is hidden.
      const alt = art instanceof HTMLImageElement ? art.alt : ''
      if (alt) {
        ghost.setAttribute('role', 'img')
        ghost.setAttribute('aria-label', alt)
      }
    }
    this._ghost = ghost
    this.#ghostKey = ghost ? key : ''
  }

  /**
   * Wait out the double-click window, then rename. The press that starts the
   * gesture cannot know yet which gesture it is — see {@link RENAME_DELAY_MS}.
   */
  #armRename(): void {
    this.#disarmRename()
    this.#renameTimer = window.setTimeout(() => {
      this.#renameTimer = 0
      this.startEditing()
    }, RENAME_DELAY_MS)
  }

  /** Call off a pending rename: this gesture turned out to be another one. */
  #disarmRename(): void {
    if (!this.#renameTimer) return
    clearTimeout(this.#renameTimer)
    this.#renameTimer = 0
  }

  /**
   * Open the rename field. The whole name starts selected, as the Finder's did
   * — the common rename is a replacement, not an edit.
   */
  startEditing(): void {
    // Whether it opens here or is already open, nothing is left waiting to open
    // it again a moment from now.
    this.#disarmRename()
    if (!this.editable || this._editing) return
    this.#committed = this.label
    this._draft = this.label
    this._editing = true
  }

  /**
   * Keep the typed name and close the field — unless there is no name left, in
   * which case the edit is refused and the old one comes back.
   *
   * A file has to be called something: System 7 would not let you commit an
   * empty name, and this does the same, treating a run of nothing but spaces
   * as empty too (the plate would read as blank either way). The refusal is
   * reported as `vf-name-rejected` for the same reason `vf-name-too-long` is —
   * so a host can say why instead of leaving the name to silently snap back.
   */
  commitEditing(): void {
    if (!this._editing) return
    this._editing = false
    const previous = this.#committed
    const next = this._draft

    if (next.trim() === '') {
      this._draft = previous
      if (next !== previous) {
        emit(this, 'vf-name-rejected', {
          attempted: next,
          kept: previous,
          reason: 'empty',
        })
      }
      return
    }

    if (next === previous) return
    this.label = next
    emit(this, 'vf-change', { label: next, previous })
  }

  /** Put the previous name back and close the field. */
  cancelEditing(): void {
    if (!this._editing) return
    this._editing = false
    this._draft = this.#committed
  }

  protected override render() {
    const editing = this._editing
    const caption = editing ? this._draft : this.label
    const marked = this.focusRule.marked && !editing
    // An empty name draws no plate — but the caption still has to exist while
    // renaming, or an unnamed icon would have nowhere to put the field and
    // could never be given a name at all.
    const showCaption = caption !== '' || editing
    // The rule hangs off the plate when there is one and the art cell when
    // there isn't, so a nameless icon still marks its focus.
    const captionClasses = `caption${editing ? ' editing' : ''}${
      marked && caption ? ' focus-rule' : ''
    }`
    const artClasses = `art${this.open && this._ghost ? ' open' : ''}${
      marked && !caption ? ' focus-rule' : ''
    }`
    const width = this.width
      ? `width: calc(var(--vf-scale, 1) * ${this.width}px)`
      : ''
    return html`<div
      class="frame vf-snap"
      part="frame"
      style=${width}
      @pointerdown=${this.#onPointerDown}
      @pointermove=${this.#drag.onPointerMove}
      @pointerup=${this.#drag.onPointerUp}
      @pointercancel=${this.#drag.onPointerUp}
      @dblclick=${this.#onDoubleClick}
    >
      <div class=${artClasses} part="icon">
        ${this.size === 'small'
          ? html`<slot name="small" @slotchange=${this.#onArtSlotChange}></slot>`
          : html`<slot name="large" @slotchange=${this.#onArtSlotChange}></slot>`}${this
          ._ghost ?? nothing}
      </div>
      ${showCaption
        ? html`<div class=${captionClasses}>
            <!-- No whitespace around the span: it is the measured run, and a
                 stray space would widen it. -->
            <div class="label" part="label"><span
              class="name"
              part="plate"
              style=${this.#plateWidth ? `width: ${this.#plateWidthCss}` : ''}
              >${caption}</span
            ></div>
            ${editing
              ? html`<div class="rename-box">
                  <input
                    class="rename"
                    part="input"
                    type="text"
                    maxlength=${this.maxlength}
                    .value=${this._draft}
                    @beforeinput=${this.#onBeforeInput}
                    @input=${this.#onInput}
                    @keydown=${this.#onInputKeyDown}
                    @blur=${this.commitEditing}
                  />
                </div>`
              : nothing}
          </div>`
        : nothing}
    </div>`
  }

  /**
   * An icon alone is a picture; an icon in a field is an option.
   *
   * `option` is only meaningful inside a `listbox` that owns it, so it is
   * written only when one does. Unowned, the icon degrades to `img` — the same
   * vocabulary the derived open ghost already uses, and true of what the
   * element is: a named picture. Deliberately not `button`, which would promise
   * that Enter and Space activate; here Return *renames* and the open route is
   * ⌘O / ⌘↓, so the role would lie about the keyboard contract.
   *
   * `img` is not a name-from-content role, so the unowned branch has to state
   * the name that `option` took from the plate by itself — the label, else the
   * art's own `alt`.
   */
  #syncRole(): void {
    if (!this.selectable) {
      // A plain vf-icon is a picture with a caption, not a widget: no role, and
      // the slotted <img> announces itself through its own alt.
      this.#internals.role = null
      this.#internals.ariaSelected = null
      this.#internals.ariaLabel = null
      return
    }
    if (this.#inListbox) {
      this.#internals.role = 'option'
      this.#internals.ariaSelected = this.selected ? 'true' : 'false'
      this.#internals.ariaLabel = null
      return
    }
    this.#internals.role = 'img'
    // Dropped with the role: aria-selected is invalid on img, and an unowned
    // icon has no set for "selected" to mean anything within. This is what the
    // role="listbox" recipe buys back.
    this.#internals.ariaSelected = null
    this.#internals.ariaLabel = this.label || this.#artAlt || null
  }

  /** The slotted art's `alt`, when it is what names the icon. */
  get #artAlt(): string {
    return this.#art instanceof HTMLImageElement ? this.#art.alt : ''
  }

  /**
   * Focusable exactly when there is something to do with it — which is
   * `selectable` alone. The Finder's model is that you cannot move or rename
   * what you have not selected: `editable` is already half-inert without it on
   * the pointer path (the rename opens on a press on the plate of an ALREADY
   * selected icon), and a `movable`-only icon was a tab stop that announced
   * nothing about what it was or that arrow keys moved it.
   */
  get #interactive(): boolean {
    return this.selectable
  }

  #syncTabIndex(): void {
    // Never clobber a consumer's own tabindex (matches VfToggleControl).
    if (this.hasAttribute('tabindex')) return
    if (this.#interactive) this.tabIndex = 0
    else this.removeAttribute('tabindex')
  }

  #setSelected(next: boolean): void {
    if (next === this.selected) return
    this.selected = next
    emit(this, 'vf-select', { selected: next })
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this._editing) return
    const onPlate = event
      .composedPath()
      .some((n) => n instanceof HTMLElement && n.classList.contains('label'))
    const wasSelected = this.selected

    // A press landing inside the rename delay of the previous one is the second
    // half of a double-click, wherever in the icon either of them fell: the name
    // and the art are one target for opening, so the plate can't take a press
    // that belongs to the pair (see the class doc).
    const doubling = event.timeStamp - this.#lastPressTime < RENAME_DELAY_MS
    this.#lastPressTime = event.timeStamp
    // Whatever this press turns out to be, it is not the lone click a pending
    // rename is still waiting to be sure of.
    this.#disarmRename()

    if (this.selectable) {
      // Shift/⌘ toggles this icon without disturbing the rest; a plain press
      // selects, and every other selected icon's outside listener clears it.
      if (event.shiftKey || event.metaKey) this.#setSelected(!this.selected)
      else this.#setSelected(true)
    }

    // A click on the plate of an icon that was ALREADY selected opens the
    // rename box — the Finder gesture. The press that does the selecting never
    // does, or every first click would start an edit. It opens on a delay
    // rather than under the press, so the second click of a double-click can
    // still arrive and claim the gesture for opening instead.
    if (
      this.editable &&
      onPlate &&
      wasSelected &&
      !doubling &&
      !event.shiftKey &&
      !event.metaKey
    ) {
      this.#armRename()
    }

    if (this.#interactive) {
      // Take focus ourselves: the drag below preventDefault()s the press so the
      // gesture owns the pointer, which suppresses the focus the browser would
      // otherwise land here. suppress() keeps the dashed rule off a pure mouse
      // press — an already-focused host fires no focusin for the controller to
      // read (see focus-modality.ts).
      this.focus({ preventScroll: true })
      this.focusRule.suppress()
    }
    this.#drag.onPointerDown(event)
  }

  /**
   * The whole icon opens, name included: the handler is bound to the frame, and
   * the press path is what keeps the plate from having spent the gesture on a
   * rename before the second click gets here.
   *
   * Still guarded on the field: a double-click inside an open rename box is a
   * word being selected, not an icon being opened.
   */
  #onDoubleClick = (): void => {
    if (this._editing) return
    emit(this, 'vf-open', {})
  }

  #onOutsidePointerDown = (event: PointerEvent): void => {
    if (event.composedPath().includes(this)) return
    // Wherever that press went, it wasn't this name: a rename still waiting to
    // open is called off even where the modifier keeps the selection.
    this.#disarmRename()
    if (event.shiftKey || event.metaKey) return
    this.#setSelected(false)
  }

  /**
   * Report a name the limit will not take, before the field refuses it.
   *
   * `beforeinput` rather than `input`, because by the time `input` fires the
   * attempt is gone: with `maxlength` on the field a blocked keystroke fires
   * `beforeinput` and then NO `input` at all, and an overshooting paste
   * reaches `input` already trimmed to fit. Only the "about to change" event
   * still knows what was tried, which is the thing an integrator wants to put
   * in an alert — as System 7 did, rather than silently dropping characters.
   */
  #onBeforeInput = (event: InputEvent): void => {
    const input = event.target as HTMLInputElement
    const inserted = event.data ?? event.dataTransfer?.getData('text') ?? ''
    if (inserted === '') return // a deletion can't overflow
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    const attempted =
      input.value.slice(0, start) + inserted + input.value.slice(end)
    if (attempted.length > this.maxlength) this.#reportTooLong(attempted)
  }

  #onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement
    // The field's own maxlength is the cap, and every route into it that the
    // platform reports goes through beforeinput above. This is the backstop for
    // one that doesn't: trim, report, and keep the draft inside the limit, so
    // the guarantee holds even where the attribute or the event doesn't.
    if (input.value.length > this.maxlength) {
      const attempted = input.value
      const caret = Math.min(input.selectionStart ?? this.maxlength, this.maxlength)
      input.value = attempted.slice(0, this.maxlength)
      input.setSelectionRange(caret, caret)
      this.#reportTooLong(attempted)
    }
    this._draft = input.value
  }

  #reportTooLong(attempted: string): void {
    emit(this, 'vf-name-too-long', {
      attempted,
      accepted: attempted.slice(0, this.maxlength),
      limit: this.maxlength,
    })
  }

  #onInputKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.commitEditing()
      this.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      // Stop the press before an enclosing vf-dialog reads it as a dismissal:
      // Escape out of a rename cancels the rename, nothing more.
      event.stopPropagation()
      this.cancelEditing()
      this.focus()
    }
  }

  #onKeyDown = (event: KeyboardEvent): void => {
    // The keyboard has taken over from the press that armed it — Return opens
    // the field now, an arrow moves the icon, Tab leaves — so a rename waiting
    // on the double-click window is called off whichever key this is.
    this.#disarmRename()
    if (this._editing || event.defaultPrevented) return
    // ⌘O / ⌘↓ — the System 7 Open shortcuts, with Ctrl standing in for ⌘ off
    // the Mac. A double-click is a pointer gesture, and this is its keyboard
    // route (SPEC §1). Return is deliberately NOT one: the Finder's Return
    // renamed, never opened. Checked before the switch so ⌘↓ opens instead of
    // nudging a movable icon.
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      (event.key.toLowerCase() === 'o' || event.key === 'ArrowDown')
    ) {
      event.preventDefault()
      emit(this, 'vf-open', {})
      return
    }
    switch (event.key) {
      case 'Enter':
        // Return starts the rename, as the Finder's did. On a non-editable
        // icon it does nothing — opening is the double-click (or ⌘O above).
        if (!this.editable) return
        event.preventDefault()
        this.startEditing()
        return
      case ' ':
        if (!this.selectable) return
        event.preventDefault()
        this.focusRule.reveal()
        this.#setSelected(!this.selected)
        return
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!this.movable) return
        event.preventDefault()
        this.focusRule.reveal()
        // The nudge is already in the unit a placement is stored in.
        const step = event.shiftKey ? NUDGE_COARSE : NUDGE
        const dx =
          event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy =
          event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        this.#warnIfUnplaced()
        const origin = this.#placement.seed()
        this.#placement.moveTo(origin.x + dx, origin.y + dy)
      }
    }
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'vf-icon': VfIcon
  }
}
