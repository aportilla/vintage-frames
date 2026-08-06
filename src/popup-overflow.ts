/**
 * Popup overflow — the geometry of a menu taller than the screen.
 *
 * System 7 never put a scrollbar on a menu. A popup whose list doesn't fit is
 * **clipped**: the panel is drawn once, the overflowing items are simply not on
 * screen, and the edge slot that has items beyond it shows a solid black arrow
 * in place of a row. Resting the pointer on the arrow rolls the items through
 * the panel one row at a time; once the last item is in view the arrow
 * disappears. A list can overflow both edges at once, and the panel box itself
 * never moves or resizes while open — scrolling rolls the items *inside* it.
 *
 * This module is the arithmetic of that, kept out of the component for the same
 * reason `zoom.ts` is: it is pure, it is testable without a browser, and
 * `vf-menu` will want the identical model when pull-down clamping lands (System
 * 7 scrolled long pull-downs with the very same mechanism).
 *
 * Three ideas carry the whole thing.
 *
 * **The pill lattice.** A popup opens with the selected row's cell laid over
 * the closed pill, which fixes an `idealTop` — the panel top at which that
 * overlay is exact. Every clamp here is quantized to *whole rows* off that
 * lattice, so a panel forced away from the screen edge lands one, two, five
 * rows down rather than an arbitrary number of pixels: the row grid never
 * shifts relative to the pill, and a clamped popup keeps the closed↔open label
 * alignment that an un-quantized pixel clamp destroys.
 *
 * **The panel is as tall as the list wants, not as tall as the items it can
 * currently show.** This is the part that looks wrong until you scroll it. A
 * 12-item list that has to sit somewhere other than where the pill would put it
 * keeps all 12 slots and slides whole rows to fit the screen; the item strip
 * stays welded to the pill, so the slots the strip doesn't reach are drawn as
 * empty white. That blank is not filler — it is the exact travel the list will
 * roll through, so that scrolling to the end lands the strip flush with the
 * panel, *precisely* full, both arrows retired. The kit reproduces it because
 * System 7 did: it is visible in a screenshot of Find File's criteria popup
 * (5 empty rows above `name`) and of the Character Set font menu (2 above
 * `Athens`). Only when the whole list cannot fit the screen band at all does
 * the panel stop at the band's capacity and keep an arrow permanently.
 *
 * **The two directions are one rule.** A panel pushed *up* the screen (the pill
 * is low) reserves its blank at the **top** and rolls down into it; a panel
 * pushed *down* (the pill is high, with a late item selected) reserves it at
 * the **bottom** and rolls up into it. Nothing below distinguishes the cases —
 * the sign of one integer does.
 *
 * **One integer.** `scroll` is how many rows the strip is rolled up past the
 * panel's top edge, and slot `i` shows row `scroll + i`. It is free to leave
 * the range `[0, rowCount − visibleSlots]` that would keep every slot filled,
 * and *that* is the reserved blank: below 0 the first `−scroll` slots are
 * empty, above `rowCount − visibleSlots` the last few are. The up arrow shows
 * when `scroll > 0` (rows really are hidden above), the down arrow when
 * `scroll < rowCount − visibleSlots` (rows really are hidden below).
 * Everything else — which rows are pickable, where the highlight may legally
 * sit, how far a keypress must roll the list — falls out of that. Note what the
 * two conditions say about the opening state: whichever end the blank is on,
 * the arrow pointing back at it is the one that is *off*. The blank is a
 * one-way starting position, not somewhere the user can scroll back to.
 */

/**
 * Float slack for the row-count divisions. A row height is a *measured*
 * `getBoundingClientRect()` height and at scale 1.5 (a 2× display) it is 24 CSS
 * px, but at a zoom-derived scale it can be a ratio like 80/3 — and a slot lost
 * to a few ulps of drift is a visibly short panel. A twentieth of a device
 * pixel is far below anything that could mask a genuinely-not-fitting row.
 */
const EPSILON = 1e-3

/**
 * The fewest row slots a clamped panel is drawn with. With both arrows shown,
 * three slots is the minimum that leaves one *pickable* row between them — at
 * two, the panel offers nothing to choose. A viewport too short for three rows
 * (48 system px) is already outside the kit's world, so the floor is allowed to
 * intrude on the screen-edge insets: a shaved inset beats a menu you cannot
 * pick from.
 */
export const MIN_VISIBLE_SLOTS = 3

/** Inputs to {@link layoutClampedPopup}. Lengths in CSS px, already scaled. */
export interface PopupClampArgs {
  /** Panel top at which the selected row overlays the pill exactly. */
  idealTop: number
  /** Height of one option row. */
  rowHeight: number
  /** The panel's border width (one side). */
  border: number
  /** How many options the list holds. */
  rowCount: number
  /** Top of the usable screen band (the top inset). */
  viewTop: number
  /** Bottom of the usable screen band (viewport height minus the bottom inset). */
  viewBottom: number
}

/** The panel box and the scroll state a clamped popup opens with. */
export interface PopupLayout {
  /** Panel border-box top, a whole number of rows off the pill lattice. */
  panelTop: number
  /** Panel border-box height — a whole number of row slots plus both borders. */
  panelHeight: number
  /** Row slots the panel is drawn with (`R`). */
  visibleSlots: number
  /** Opening scroll (`S`) — negative when the panel opens with blank above. */
  initialScroll: number
}

/**
 * Fit a popup's panel into the usable screen band, quantized to the pill
 * lattice.
 *
 * The panel wants every row it has (`rowCount` slots) and wants to sit at
 * `idealTop`. Both wishes bend a whole row at a time:
 *
 *  - **Position** first. `scroll` *is* the panel's row offset from `idealTop`
 *    (`panelTop = idealTop + scroll × rowHeight`), because sliding the box
 *    while the strip stays on the lattice is the same act as scrolling the
 *    strip while the box stays put. So the search is for the integer `scroll`
 *    nearest 0 that puts the whole box inside the band — negative to slide the
 *    box up, positive to slide it down, with the reserved blank falling out at
 *    whichever end the strip no longer reaches.
 *  - **Height** only if position alone can't do it. Each row given up buys one
 *    row of freedom for `scroll`, so the loop hands back one slot at a time
 *    until an integer fits — which is at most a couple of iterations, and is
 *    also how a list far taller than the screen settles at the band's capacity.
 *
 * When neither has to bend — `initialScroll` 0 and `visibleSlots === rowCount`
 * — the result is exactly the unclamped placement the popup has always used, so
 * a list that fits is untouched by any of this.
 */
export function layoutClampedPopup(args: PopupClampArgs): PopupLayout {
  const { idealTop, rowHeight, border, rowCount, viewTop, viewBottom } = args
  if (rowCount <= 0 || rowHeight <= 0) {
    return {
      panelTop: idealTop,
      panelHeight: 2 * border,
      visibleSlots: 0,
      initialScroll: 0,
    }
  }

  // Never start below the pickable floor, and never above what the list holds.
  const floorSlots = Math.min(rowCount, MIN_VISIBLE_SLOTS)
  const capacity = Math.floor(
    (viewBottom - viewTop - 2 * border) / rowHeight + EPSILON
  )
  let slots = Math.min(rowCount, Math.max(capacity, floorSlots))
  let scroll = 0

  for (;;) {
    const height = slots * rowHeight + 2 * border
    // The band's two edges, expressed as bounds on `scroll`.
    const lowest = Math.ceil((viewTop - idealTop) / rowHeight - EPSILON)
    const highest = Math.floor(
      (viewBottom - height - idealTop) / rowHeight + EPSILON
    )
    if (lowest <= highest) {
      // The value nearest 0 — the closer to `idealTop`, the less the panel had
      // to give.
      scroll = Math.min(Math.max(0, lowest), highest)
      break
    }
    if (slots <= floorSlots) {
      // Out of rows to trade. Honor the top edge (a page's menu bar is there)
      // and let the panel intrude past the bottom inset — see MIN_VISIBLE_SLOTS.
      scroll = Math.max(0, lowest)
      break
    }
    slots -= 1
  }

  return {
    panelTop: idealTop + scroll * rowHeight,
    panelHeight: slots * rowHeight + 2 * border,
    visibleSlots: slots,
    initialScroll: scroll,
  }
}

/**
 * The lowest row index the user can pick right now. An arrow *overlays* the
 * slot it occupies — an opaque white row covering the item beneath, which is
 * the whole mechanism — so a shown up arrow costs the first slot its row. With
 * blank reserved above (`scroll` negative) there is no up arrow and no hidden
 * row, so the first item is simply row 0.
 */
export function firstPickableRow(scroll: number): number {
  return scroll > 0 ? scroll + 1 : 0
}

/**
 * The highest row index the user can pick right now — the mirror of the above,
 * ending at the last row when the down arrow is absent (which covers both the
 * flush case and blank reserved below).
 */
export function lastPickableRow(
  scroll: number,
  rowCount: number,
  visibleSlots: number
): number {
  return scroll < rowCount - visibleSlots
    ? scroll + visibleSlots - 2
    : rowCount - 1
}

/**
 * The scroll position that brings row `index` into a pickable slot, leaving it
 * one slot clear of whichever arrow will still be showing. Already-pickable
 * rows give the scroll back unchanged — including one outside the flush range,
 * so opening a panel with reserved blank and then merely moving the highlight
 * doesn't scrub that blank away.
 *
 * The two endpoints are the reason for the `+ 2` / `− 1` rather than the
 * obvious `+ 1` / `− 0`: row 0 and row `rowCount − 1` are reached at
 * `scroll = 0` and `scroll = rowCount − visibleSlots`, where the arrow in
 * question has just disappeared and the row may take the edge slot itself.
 *
 * A deliberate move never re-enters the reserved blank at either end — it is a
 * starting position the list rolls out of, not one it can roll back into.
 */
export function ensureVisibleScroll(
  index: number,
  scroll: number,
  rowCount: number,
  visibleSlots: number
): number {
  let next = scroll
  if (index < firstPickableRow(scroll)) {
    next = index === 0 ? 0 : index - 1
  } else if (index > lastPickableRow(scroll, rowCount, visibleSlots)) {
    next =
      index === rowCount - 1
        ? rowCount - visibleSlots
        : index - visibleSlots + 2
  }
  return clampScroll(next, scroll, rowCount, visibleSlots)
}

/**
 * Hold a scroll inside its legal range. Normally that is `0` (row 0 in slot 0)
 * to `rowCount − visibleSlots` (the last row in the last slot) — but a panel
 * that opened with reserved blank starts *outside* that range at whichever end
 * the blank is on, and the widened bound (`min(from, 0)`, `max(from, …)`) is
 * what lets it roll out of the blank while never letting it roll back in.
 * Symmetric in both directions, and it narrows to the normal range the moment
 * the list reaches it.
 */
export function clampScroll(
  scroll: number,
  from: number,
  rowCount: number,
  visibleSlots: number
): number {
  return Math.max(
    Math.min(from, 0),
    Math.min(scroll, Math.max(from, rowCount - visibleSlots))
  )
}
