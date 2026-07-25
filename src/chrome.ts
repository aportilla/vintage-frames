import { html, type TemplateResult } from 'lit'
import type { DragController } from './drag.js'

/**
 * The title-bar element shared by `vf-window` and `vf-dialog`: the
 * `.vf-title-bar` row (skinned by `vfTitleBar` in styles/base.ts), the racing
 * stripe layer behind it, and the four pointer bindings that hand the bar to a
 * {@link DragController}.
 *
 * Both components render a byte-identical header with byte-identical wiring;
 * only what sits in the bar differs — vf-window interleaves its close/zoom
 * widgets around the title, vf-dialog carries just the title (with the id its
 * `aria-labelledby` points at). That goes in as `content`, so the four bindings
 * — which have to stay in lockstep with DragController's three handlers, and
 * where a dropped `pointercancel` would strand a drag — live in one place.
 *
 * Internal to the kit: it bakes in our own `part` name and class contract, so
 * it is deliberately not re-exported from index.ts (same call as `number.ts`).
 */
export const chromeTitleBar = (
  drag: DragController,
  content: unknown
): TemplateResult => html`
  <header
    class="vf-title-bar"
    part="title-bar"
    @pointerdown=${drag.onPointerDown}
    @pointermove=${drag.onPointerMove}
    @pointerup=${drag.onPointerUp}
    @pointercancel=${drag.onPointerUp}
  >
    <div class="vf-stripes"></div>
    ${content}
  </header>
`
