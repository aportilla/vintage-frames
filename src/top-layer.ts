/**
 * The kit's entries into the top layer. Whatever enters the top layer later
 * paints over what entered before, so an overlay that must stay above
 * everything — the drawn cursor (src/cursor.ts) — re-promotes itself after
 * each kit entry. A popup shown here escapes every stacking context on its
 * way up: a window's z-index can't hold it under a palette.
 */

const entries = new Set<() => void>()

/** Show a manual popover in the top layer, then let the overlays above it re-promote. */
export function showInTopLayer(el: HTMLElement): void {
  if (!('showPopover' in el) || !el.isConnected || el.matches(':popover-open')) return
  el.showPopover()
  for (const fn of [...entries]) fn()
}

/** Take a popover {@link showInTopLayer} showed back out of the top layer. */
export function hideFromTopLayer(el: HTMLElement): void {
  if ('hidePopover' in el && el.matches(':popover-open')) el.hidePopover()
}

/** Run `fn` after every kit entry into the top layer. Returns the unsubscribe. */
export function onTopLayerEntry(fn: () => void): () => void {
  entries.add(fn)
  return () => void entries.delete(fn)
}
