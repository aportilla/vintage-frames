import { css, html, LitElement } from 'lit'
import { vfElement } from '../define.js'
import { VfPositioned } from '../position.js'
import { VfSized } from '../size.js'
import { vfBase } from '../styles/base.js'
import { ScaleController } from '../scale.js'
import { GridSnapController } from '../grid-snap.js'

/**
 * `<vf-container>` — a box that is nothing but its declared size.
 *
 * The kit's positioned-placement story (src/position.ts) ends with one line of
 * CSS it can't write for you: children placed with `top`/`left` need a
 * positioned ancestor, and while every kit container is one — a window body, a
 * stack, a fieldset — a region of *your own* needs `position: relative` in a
 * stylesheet. This component is that region as an element: declare `width` and
 * `height` in whole system px, slot anything into it, place children against
 * its origin. A DITL's enclosing rectangle, with nothing drawn in it.
 *
 * ```html
 * <vf-container width="200" height="120">
 *   <vf-icon label="System" width="64" top="8" left="12">…</vf-icon>
 *   <vf-icon label="Finder" width="64" top="8" left="104">…</vf-icon>
 * </vf-container>
 * ```
 *
 * The rectangle is the whole API — `width`/`height` here, plus the `top`/`left`
 * pair nearly every component takes ({@link VfPositioned}), so a container is
 * itself placeable: inside a window, a desktop, or another container, at whole
 * system px that keep its box on the device-pixel grid by construction.
 *
 * **It is not a `vf-stack`.** The stack is a flexbox with opinions — it
 * distributes children along an axis, compiles `fill-width`/`fill-height` into
 * flex, defaults a cross-axis alignment. This box has no layout opinion at
 * all: in-flow children get normal flow, placed children get a coordinate
 * system, and that is the whole API. Reach for it when the stack's opinions
 * are the thing in the way — a field of placed icons, a fixed stage for
 * absolutely-positioned art, a consumer's own composition that brings its
 * layout with it.
 *
 * **The declared size is the layout.** `width`/`height` land on the host as a
 * live `calc(var(--vf-scale, 1) * Npx)` ({@link VfSized}), so the box scales
 * with the display and sits on the device-pixel grid by construction. Content
 * that outgrows the box overflows it rather than growing it — the number is
 * the layout, and content that doesn't fit is a number to raise. Leave a
 * dimension off and that axis shrink-wraps: `fit-content`, not the parent's
 * width, because a layout box that silently claimed a size nobody declared
 * would be inventing one (the `vf-stack` rule, held here too).
 *
 * **It paints nothing and means nothing.** No border, background, role,
 * keyboard behavior or selection — what it holds decides what it is.
 *
 * **It holds its box on the device-pixel grid** — with a `GridSnapController`.
 * A container's box is itself the consumer's coordinate system, including for
 * non-`vf` content that cannot correct itself, so the box is the thing to
 * hold on the grid. The shadow box below owns the `position: relative` anchor
 * and the `vf-snap` class together, so under `applyGridSnap()` the correction
 * moves the whole coordinate system — everything placed against it rides
 * along instead of being re-corrected child by child. (`vf-stack` shipped
 * without a controller on the theory that slotted `vf-*` children correct
 * their own origins; this component is where that theory's gap — consumer
 * content — became visible, and the stack has since adopted the same
 * arrangement.)
 *
 * Like the stack it is **typographically transparent**: `vfBase`'s chrome
 * dress is returned to `inherit` on the host, so wrapping content in a sized
 * box changes nothing about how that content reads.
 *
 * `fill-width` / `fill-height` work here the way they do everywhere: read
 * about the host (be as big as *its* parent allows), and compiled for slotted
 * children — `width: 100%` in normal flow, so a child filling the cross of a
 * declared box needs no stylesheet. A height fill needs a declared `height`
 * to resolve against; with none it is inert, not an error.
 *
 * @slot - The content. In flow by default; `top`/`left` on a kit child places
 *   it against this box's origin. `fill-width` / `fill-height` on a child
 *   fills it to the declared box.
 */
@vfElement('vf-container')
export class VfContainer extends VfSized(VfPositioned(LitElement)) {
  static override styles = [
    vfBase,
    css`
      :host {
        display: block;
        /* Shrink-wrap an undeclared axis rather than claim the parent's
           width — the vf-stack rule: a layout box must not hand out a size
           nobody declared. A declared width/height lands on the host's inline
           style (VfSized) and beats this. */
        width: fit-content;
        /* Typographic transparency — the same reset vf-stack carries, for the
           same reason: vfBase dresses a host as chrome (body face, ratio line
           box, black, unselectable), and a box that holds no text of its own
           must not change how slotted content reads. font is a shorthand, so
           it carries the line box back with the family, size and weight. */
        font: inherit;
        -webkit-font-smoothing: inherit;
        color: inherit;
        user-select: inherit;
        -webkit-user-select: inherit;
        text-align: inherit;
      }

      /* The coordinate system, as one shadow box coinciding with the host box.
         vf-snap (vfBase) gives it position: relative plus the controller's
         --vf-snap-dx/-dy offset — so it is BOTH the positioning anchor for
         children placed with top/left (src/position.ts) AND the element the
         grid-snap correction lands on. One element owning both is the point:
         corrected, it takes every placed child with it, kit or not. */
      .box {
        /* flow-root: contain slotted margins, so the box's top edge — the
           origin placed children measure from — stays glued to the host's
           corner instead of being pushed down by a first child's margin
           collapsing through. */
        display: flow-root;
        /* Coincide with a declared height (100% of a definite host height;
           against an undeclared one it computes to auto and wraps content),
           so slotted percentage fills resolve against the stated box. */
        height: 100%;
      }

      /* The same two words a child uses, read about the host itself — for the
         parents that can give this box a size: a window body, a filled stack
         column, a grid cell. A percentage is the one fill a page can always
         express; a declared width/height on the inline style beats it. */
      :host([fill-width]) {
        width: 100%;
      }
      :host([fill-height]) {
        height: 100%;
      }

      /* And compiled for slotted children. Normal flow has no flex axes to
         translate onto, so both fills are the percentage form: width resolves
         against the box always, height only against a declared height —
         percentage-against-auto computes to auto, so a fill with nothing to
         take is inert, not an error (the vf-stack wording, kept true here). A
         light-DOM declaration beats a ::slotted one, so a page can still
         override either on its own children. */
      ::slotted([fill-width]) {
        width: 100%;
      }
      ::slotted([fill-height]) {
        height: 100%;
      }
    `,
  ]

  // `width`/`height` come from VfSized, `top`/`left` from VfPositioned — the
  // whole DITL rectangle, and the whole API.

  /**
   * Default-on display scaling (true 72dpi size); see src/scale.ts. Without
   * one, a lone container on a plain page would resolve its declared size
   * against the `var(--vf-scale, 1)` fallback while its slotted children each
   * self-scaled around it — the vf-stack reasoning, inherited with the rest.
   */
  private readonly scale = new ScaleController(this)

  /**
   * Hold the box on the device-pixel grid under `applyGridSnap()` — see the
   * class doc. The host is what gets measured; `.box` (vf-snap) is where the
   * correction lands.
   */
  private readonly gridSnap = new GridSnapController(this)

  protected override render() {
    return html`<div class="vf-snap box"><slot></slot></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vf-container': VfContainer
  }
}
