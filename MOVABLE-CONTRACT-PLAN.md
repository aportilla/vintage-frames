# The movable contract — a standalone-shipping cleanup pass

Working notes, 2026-08-06. Follows commit `1141a55` ("placement: a drag states
top/left in system px, not frozen CSS px").

## Context

The kit is meant to ship two ways at once: as the chrome of a faux System 7
desktop, and as ordinary custom elements dropped into any old webpage. The
second case is the one `blog.html` exists to prove, and it is the one npm
consumers will actually reach for first — someone wants a `vf-icon` on their
page, sized on the display-pixel grid, positioned by their own flex or grid
layout, and they want *nothing else*: no drag, no rename, no coordinate system.

An audit of that case after `1141a55` found the **default path is already
clean** and the **gesture path quietly assumes a kit container**. Everything
below is about closing that second half without giving up the first.

The fix is not more machinery. It is a line: **asking for drag is asking for a
coordinate system, so state it.** A `movable` element declares its rectangle in
the art's own unit, the way a WIND resource did. That retires two defects and a
rounding artifact by removing a supported path rather than adding code to
support it better.

## What the audit found

Verified in Chromium at dpr 1–3, not by inspection. Numbers are from throwaway
probe scripts (not kept — the coverage they stood in for becomes `verify:*`
cases in item 5).

**The default path is sound.** `<vf-icon label="Read Me" width="64">` in an
ordinary page carries exactly one inline declaration, `--vf-scale: 3`. No
`position`, no `tabindex`, no `role`, `touch-action: auto`. That is
`PositionController` returning before it touches `style` when both coordinates
are unset (`src/position.ts:125-128`) and `SizeController` doing the same
(`src/size.ts:105-113`). `movable`, `editable`, `selectable` and `resizable` all
default `false`; `resizable` never renders the grow box, and the other three
gate inside the drag delegate (`vf-icon.ts:560`, `vf-window.ts:398`) so there is
no pointer capture and no `preventDefault`.

**No `vf-desktop` is required.** The only reference to it in `src/` is
`cursor.ts:210`, with a fallback. A standalone `<vf-window closable zoomable
resizable>` renders, its widgets fire, and the grow box resizes correctly.

**`1141a55` improved the standalone case**, twice: the old code wrote
`position: absolute` at *pointerdown*, so a bare click on an in-flow window's
title bar yanked it out of flow having moved nothing; and it tested only
`computed.position !== 'absolute'`, so a page-`fixed` host seeded from
`offsetLeft`. Both fixed.

**Two defects, both in the gesture path.**

*The clamp re-measures a parent the drag just collapsed.* `#keepGrabbable`
(`vf-window.ts:371-380`) and `#keepWhole` (`vf-icon.ts:537-545`) read
`this.offsetParent.clientHeight` on every pointermove. Move one goes absolute,
the host leaves flow, an auto-height parent collapses, move two clamps against
the wreckage. A movable window in `<div style="padding:40px">`:

```
start       rect 40,40    parent height 500
after mv 1  rect 48,48    parent height 80    ← collapsed
after mv 2  rect 69,9     top=3               ← flew to the top of the page
```

Asked +30/+30, got +29/−31. Invisible inside a `vf-desktop` or a window body,
because those have declared heights.

*The first drag reflows the host page.* Three movable icons in a flex row; drag
the first, and the two untouched siblings each jump 208px left. Inherent to
going absolute — but currently undocumented and unavoidable.

Also noted, and handled separately below: `movable`/`editable` give the host a
tab stop with no role (`vf-icon.ts:884-893` vs `:591-594`); neither clamp lets a
host go above or left of its container origin (`Math.max(v, 0)`); standalone
windows all default `active = true` (`vf-window.ts:330`), so three on a page all
look frontmost.

## The contract

Two parts. The second is the one that is easy to forget.

> **Amended in the writing.** The first half is really *be out of flow when the
> gesture starts* — `top`/`left` are the kit's way and the only one that scales,
> but a stylesheet's own `position: absolute` satisfies it, and `seed()` already
> reads that case from the computed offsets. The showcase places its 14 desktop
> icons exactly that way (`demo.css`), so checking for the properties alone
> would have warned at the kit's own reference page. The warning also had to
> move from `updated()` to gesture time, or it would race a stylesheet and latch
> a warning that was never true.

**1. A `movable` element states its own rectangle**, in whole system px:

| Component | Requires | Why not the rest |
| --- | --- | --- |
| `vf-window[movable]` | `top`, `left`, `width`, `height` | It is `VfSized`; a window is a fixed box in both axes, as a WIND was |
| `vf-icon[movable]` | `top`, `left` | Not `VfSized` — height is content-governed (cell + gap + plate), and `width` is the grid *pitch*, which a long name overflows by design |
| `vf-dialog` | *nothing — exempt* | Top layer, viewport coordinates, `display: contents` host, and unset-means-centered. Dragging from centered already measures exactly +30/+30 with no hitch, because `seed()` reads the already-`fixed` box's client rect |

**2. A `movable` element's positioning parent is `position: relative` with a
declared size.** Declaring `top`/`left` is necessary but not sufficient: a
movable window with coordinates inside a bare `<div style="position:relative">`
has a zero-height parent from the start, so `#keepGrabbable` computes
`ph - KEEP_GRABBABLE < 0` and pins it to `y = 0` — it cannot be dragged down at
all. The old failure was "flies to the top mid-drag"; this one is "won't move
vertically." Every kit container already satisfies this (the desktop raster, a
window's content region, a dialog's content area), which is exactly why the gap
never showed up in the demos.

**What the contract buys.** With coordinates stated, `seed()` takes its
authoritative branch (`position.ts:221-223`) and returns them verbatim — no
`getComputedStyle`, no measurement, no lattice snap. So:

- the flow-reflow defect **cannot arise** (the element was never in flow);
- the clamp-collapse defect **stops firing** (the parent's box was computed
  without the element in it, so it is stable across the gesture — which means
  no capture-bounds-at-gesture-start machinery is needed);
- the ±1 CSS px first-drag hitch **disappears** (nothing is being rounded; the
  author already stated a lattice value);
- `seed()`'s `offsetLeft`/`offsetTop` branch demotes from *contract* to
  *fallback for misuse*, and no longer has to be exactly right.

**What it costs, and why that's the right trade.** `movable` becomes
incompatible with page-CSS layout. A consumer who wants a draggable panel
initially placed by their own flex row now computes the coordinates themselves.
That is the honest answer — it is the same line the README already draws between
`vf-stack` and page CSS, and it costs the non-movable case nothing, which is the
case standalone shipping actually depends on.

## Work items

> **Done 2026-08-06** — items 1, 2, 3 and 5. Two things changed shape once the
> code was written, both recorded in place below: the guard had to become
> frozen bounds rather than a zero-box check, and the contract's first half is
> *out of flow*, not literally `top`/`left`. Item 4 moved to
> `ACCESSIBILITY-REVIEW.md` §6.12.

### 1. Document the contract — SPEC and README

`SPEC.md` §2, the **Explicit placement** bullet (`SPEC.md:162-196`). The
"Gestures write through the same properties" sub-bullet (`:185-196`) gains the
requirement: a movable host states its rectangle, and its positioning parent is
a positioned box with a declared size. Name the two failure modes (collapse
mid-drag, pinned to `y = 0`) in one sentence each, in the file's existing voice —
the sub-bullet already documents the frozen-CSS-px bug this way.

`README.md`, **Positioning inside a window — `top` and `left`**
(`README.md:597-679`). Two edits:

- The "three elements that move themselves" paragraph (`:646-653`) currently
  reads as pure capability. Add the requirement.
- The "Where (0,0) is" paragraph (`:624-631`) says *"In a parent of your own,
  add `position: relative` — the one line of CSS this feature can't write for
  you."* That is currently framed as being about *children* of a non-kit parent.
  Extend it to the movable host itself, and add the declared-size half — for a
  movable host, `position: relative` alone is not enough.

Also worth a line in **Window archetypes** (`README.md:326-334`), which already
says every recipe declares `width` and `height`: the four movable recipes
declare `top` and `left` too.

### 2. Warn, don't refuse — `vf-window` and `vf-icon`

`movable` going silently dead is worse than a console line, and the kit already
has this idiom: `#warnIfUnsized` (`vf-window.ts:440-456`), one warning per
element via a `#warnedNoSize` latch, fired from `updated()`.

Add the same shape for the movable contract. `vf-window` can fold it into the
existing warning path (it already runs `updated()` → `#warnIfUnsized`); `vf-icon`
needs a new one. One message covering both halves of the contract:

- `movable` with `top == null && left == null`;
- a positioning parent with a zero-size client box.

Check the second at the same latched moment, not per render. Keep the message in
the existing register — say what is missing, say what it falls back to, show the
markup that fixes it.

### 3. ~~Zero-box guard~~ → freeze the clamp bounds at gesture start

**The zero-box guard as planned does not work, and the plan was wrong about
why.** It assumed the collapsing parent goes to *zero*; measured, a
`<div style="padding:40px">` collapses to 80px — the padding — which is a
perfectly non-zero box that simply has no room in it. The guard never fired and
the window still flew to the top of the page.

The fix is the one the contract was supposed to make unnecessary: **measure the
containing box once, in `seed()`, and clamp every move of that gesture against
it** (`PlacementController.#measureBounds`, `PlacementBounds` threaded through
`PlacementClamp`). Re-measuring per move holds the rest of the gesture inside a
box the host never sat in, walking it toward the parent's origin while the user
drags away. Freezing also de-duplicates the two clamps, which each carried their
own copy of the `offsetParent ?? viewport` measurement — `#keepGrabbable` and
`#keepWhole` now take the box and only decide how much of the host has to stay
in it.

The zero-box fallback survives inside `#measureBounds` for the *other* fault, a
positioned parent nobody sized: clamping into nothing would pin the host to the
origin, so it falls back to the viewport and lets the warning teach.

Note this changes `PlacementClamp`'s signature, which `src/index.ts` exports —
a breaking change for anyone building their own movable component on it, and a
minor bump pre-1.0 per `PUBLISHING.md`.

`vf-icon.ts`'s `clamp` helper keeps its `max <= 0` branch, for a container
genuinely smaller than the icon; its doc comment now points at the contract
instead of describing the collapse as the expected case.

### 4. `vf-icon`'s host semantics — moved out of this pass

Tracked as **`ACCESSIBILITY-REVIEW.md` §6.12**, next to the §6.8 precedent it
mirrors. Investigating the `movable`-only tab stop turned up the larger fault
underneath it: `role="option"` is orphaned in every configuration the kit ships,
including the showcase desktop, so it collapses to `generic` and `aria-selected`
is discarded — selection state reaches assistive tech nowhere.

That is wrong today with no drag involved, which makes it an accessibility fix
that predates this pass and outlives it. Keeping it here would hold a
documentation-and-one-warning pass behind an ARIA redesign.

### 4b. The showcase now places icons the kit's way — added 2026-08-06

Writing item 2 turned up that `demo.css` positioned all 14 desktop icons by
hand: `.desktop-icon { position: absolute }` plus 60 lines of
`left: calc(var(--vf-scale, 1) * Npx)`. It worked — `seed()` reads computed
offsets — but inside a simulated desktop, `top`/`left` in system px *are* the
way to place something, and a stylesheet restating that can only ever be the
static half: the attributes are already the art's unit, and a drag writes back
through the same two properties, so an authored icon and a moved one are one
declaration. The grid (columns 24/134/244/354, rows 40/100/160/220) moved onto
the elements and the CSS block and its class went away.

Verified identical: all 14 land on the same device pixels (the desktop's
`bezel="10"` is part of the anchor), the icons still paint under the windows
(`vf-desktop` gives a raised window `z-index: 2`, an icon none), and the page
is silent through a drag of every one.

**One real bug found alongside it.** `.da-list` set
`--vf-list-max-height: calc(var(--vf-scale, 1) * 132px)`, but kit geometry
tokens are stated in **unscaled** system px — the component multiplies
(`vf-list.ts:75`, and `--vf-button-group-gap` on the next component is written
correctly). The factor was squared, so at scale 3 the list was capped at 1194px
instead of 402 and its rail never took over. Now 402. It was the only token in
any demo written that way.

Checked and left alone: the remaining `calc(var(--vf-scale, 1) * …)` in
`demo.css` are on components with no attribute for the job — `vf-scroll-area`
and `vf-number-field` are not `VfSized` — or are per-child margins a `vf-stack`
gap cannot express, which the README already names as page CSS's remit. No demo
JavaScript writes geometry to an inline style, and `examples.html`'s 14 movable
hosts already stated their coordinates.

### 5. Verify coverage — close the gap that hid this

`scripts/verify-chrome.mjs:287-343` already drags a movable window outside a
desktop with no coordinates — but in a `position:relative; height:600px` div, so
it never sees either failure. `verify-position.mjs`'s INTERPLAY group
(`:348-442`) always uses a `vf-desktop` *with* authored coordinates.

Add a group — `verify-position.mjs` is the natural home, next to INTERPLAY:

- movable window and movable icon in an **auto-height static** parent: assert
  the warning fires, and that the guard from item 3 keeps the drag sane rather
  than flinging the host to `y = 0`;
- movable host in a **positioned but zero-height** parent: same;
- the **contract-satisfying** case (coordinates + sized positioned parent):
  assert the drag lands exactly, with no seed hitch — `seed()`'s authoritative
  branch means a +30 CSS px drag at scale 3 is exactly +10 system px, no ±1;
- a **flex row of non-movable icons**: assert nothing is positioned, nothing is
  focusable, and the row is untouched — the standalone-shipping guarantee, held
  as a test rather than as a claim.

## Not in this pass

**`#warnIfUnsized` firing at a page-CSS-sized window is correct.** I flagged it
in the audit as a defect; re-reading `vf-window.ts:436-438`, it is deliberate
and the reasoning holds — a stylesheet `width: 300px` is indistinguishable from
block layout, and more to the point a window sized in CSS px does not scale with
`--vf-scale`, so it is not the kit's box at any density. The warning is right.
The only residual is that there is no way to silence it for a consumer who
knowingly opts out of scale fidelity; that is an enhancement, not a fix, and it
can wait for someone to ask.

**`active` defaults to `true`** (`vf-window.ts:330`), so three standalone
windows all look frontmost. Correct for the single-panel case, and arbitrating
without a desktop would mean shipping desktop behavior in the window. The page
owns `active`; a README line under Window archetypes is enough if it comes up.

**`vf-dialog` is always modal** — `show()` calls `dialog.showModal()`
(`modal-dialog.ts:339`); there is no in-page dialog. A settled design decision,
not a standalone gap, and the top-layer anchor is precisely what makes the
dialog the best-behaved standalone component in the kit.

**Neither clamp lets a host go above or left of its container origin**
(`Math.max(v, 0)` in both). Intentional for a desktop; harmless under the new
contract, since the container is the coordinate system the author chose.

## Verification

```sh
npm run dev            # in another shell (port 5173)
npm run verify:position   # the new standalone group, plus the existing five
npm run verify:chrome     # the movable-window-outside-a-desktop path
npm run verify:icon       # drag, nudge, rename
npm run verify:zoom       # group (e) — drag/move/grow across the ladder
npm run verify:grid
npm run verify:snap
npm run typecheck
npm run analyze && npm run verify:manifest   # doc comments feed the manifest
```

`verify:manifest` matters here: item 1 touches JSDoc on documented properties
(`movable`, `top`/`left`, `width`/`height`), and the manifest is generated from
it.

Then the thing the pass is actually for — a page that is not a demo:

```html
<!-- no vf-desktop, no kit CSS, page-owned layout -->
<div style="display:flex; gap:16px">
  <vf-icon label="Read Me" width="64"><vf-img slot="large">…</vf-img></vf-icon>
  <vf-icon label="Notes"   width="64"><vf-img slot="large">…</vf-img></vf-icon>
</div>
```

Nothing positioned, nothing focusable, art on the device-pixel grid, no console
output. That is the guarantee.

---

*This joins `ACCESSIBILITY-REVIEW.md` as an untracked working note in the repo
root — see the `PUBLISHING.md` pre-flight checklist, which wants them committed
or ignored before the first publish rather than left ambient.*
