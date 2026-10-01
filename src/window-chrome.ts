/**
 * A window's chrome as numbers: the insets between its outer box and the
 * region its content lays out in, and the floor its grow box stops at.
 *
 * A page sizing a window to its content, or content to its window, needs the
 * chrome between the two — a folder window's field sized to the scrolled
 * plane, a palette sized to hold its cells exactly. Restating `1 + 18 + 20 +
 * 15 + 1` in the page was the alternative, with a note to re-derive it if
 * the kit's chrome ever changed.
 */

/** The grow box's default floors, in system px: a window smaller than this can't be worked. */
export const WINDOW_MIN_WIDTH = 80
export const WINDOW_MIN_HEIGHT = 54

/** The chrome's metrics in system px, at the kit's default tokens. */
const FRAME = 1
const TITLE_BAR = 18
const TITLE_BAR_UTILITY = 12
const STATUS_BAR = 15
const RAIL = 15

/** The declared options that decide a window's chrome — `vf-window`'s own. */
export interface VfWindowChromeOptions {
  /** `'utility'` for the windoid's 12px bar; anything else is the 18px one. */
  variant?: 'utility' | null
  /** The edge scroll rails, as on `vf-window`. */
  scrollbars?: 'vertical' | 'horizontal' | 'both' | null
  /** The header's height, rule included, while the `header` slot is populated. */
  headerHeight?: number | null
  /** Whether the `status` slot is populated. */
  status?: boolean
}

/** Four insets in system px. */
export interface VfInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * The insets, in system px, between a window's outer box (its `width` and
 * `height`) and the region its content lays out in: the body, or under
 * `scrollbars` the scrolled plane's viewport. They go both ways — the content
 * of a window `W` wide is `W − left − right`, and a window that holds content
 * `w` wide is `w + left + right`. The frame's 1px stroke on every side, the
 * title bar (18, or 12 for a utility window) and the header above, the status
 * strip (15) and a horizontal rail (15) below, a vertical rail (15) on the
 * right. The numbers are the default tokens': a page that restyles
 * `--vf-titlebar-height` or `--vf-status-bar-height` restates them.
 */
export function windowChrome({
  variant,
  scrollbars,
  headerHeight,
  status = false,
}: VfWindowChromeOptions = {}): VfInsets {
  const vertical = scrollbars === 'vertical' || scrollbars === 'both'
  const horizontal = scrollbars === 'horizontal' || scrollbars === 'both'
  return {
    top: FRAME + (variant === 'utility' ? TITLE_BAR_UTILITY : TITLE_BAR) + Math.max(0, headerHeight ?? 0),
    right: FRAME + (vertical ? RAIL : 0),
    bottom: FRAME + (status ? STATUS_BAR : 0) + (horizontal ? RAIL : 0),
    left: FRAME,
  }
}
