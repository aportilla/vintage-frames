import { css } from 'lit'

/**
 * Racing stripes for title bars. Apply the class to an absolutely-positioned
 * layer inset 3px (top/bottom) and 2px (left/right) within the title bar. At
 * the 18px bar height this yields exactly six 1px stripes spanning the close
 * box's top and bottom edges (title-bar interior 17px, stripes 11px tall).
 */
export const vfStripes = css`
  .vf-stripes {
    position: absolute;
    inset: calc(var(--vf-scale, 1) * 3px) calc(var(--vf-scale, 1) * 2px);
    background: repeating-linear-gradient(
      to bottom,
      var(--vf-black, #000) 0 calc(var(--vf-scale, 1) * 1px),
      transparent calc(var(--vf-scale, 1) * 1px) calc(var(--vf-scale, 1) * 2px)
    );
    pointer-events: none;
    /* Forced colors deletes gradient backgrounds, and the stripes are the
       active window's whole signal. The layer paints nothing but this
       gradient, already in the remapped ink token, so exempting it keeps the
       active-window state readable in the user's own pair. */
    @media (forced-colors: active) {
      forced-color-adjust: none;
    }
  }
`

/**
 * Dot-grid dither for the utility ("windoid") title bar — the slim bar's
 * counterpart to {@link vfStripes}. Apply the class to an absolutely-positioned
 * layer inset 2px top/bottom and FLUSH left/right: the close-up reference art
 * runs the dots all the way into the side borders (the Windows/ sheet hand-
 * insets them 2px, which the close-up shows is not the bar's own geometry).
 * The tile is 2×2 with a single black pixel at the tile origin (see
 * `npm run extract:windows`), drawn as a crisp 1-bit SVG for the same reason
 * as vf-desktop's checker: gradient hard stops feather at scale, SVG rects
 * don't. Override the whole pattern via `--vf-dots-pattern`.
 */
export const vfDots = css`
  .vf-dots {
    position: absolute;
    inset: calc(var(--vf-scale, 1) * 2px) 0;
    background-image: var(
      --vf-dots-pattern,
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2' shape-rendering='crispEdges'%3E%3Crect width='1' height='1' fill='%23000000'/%3E%3C/svg%3E")
    );
    background-size: calc(var(--vf-scale, 1) * 2px) calc(var(--vf-scale, 1) * 2px);
    pointer-events: none;
  }
  /* Forced colors preserves url() tiles verbatim, so the dots would stay
     literal black — invisible on a dark high-contrast theme. Repainted as the
     ink token through the same tile as a mask (the vf-grid rules idiom), so
     the windoid bar's signature follows the user's palette. */
  @media (forced-colors: active) {
    .vf-dots {
      background-image: none;
      background-color: var(--vf-black, #000);
      mask-image: var(
        --vf-dots-pattern,
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2' shape-rendering='crispEdges'%3E%3Crect width='1' height='1' fill='%23000000'/%3E%3C/svg%3E")
      );
      mask-size: calc(var(--vf-scale, 1) * 2px) calc(var(--vf-scale, 1) * 2px);
    }
  }
`
