# Placement origin (anchor point) — plan

Proposed 2026-09-10; the attribute is `origin`. Delete this file when the
feature ships.

## The feature

A placed element names which point of its own box `left`/`top` place. Today
that point is always the box's top-left corner; the feature adds the other
eight.

```html
<!-- a 300-wide plain dialog: its body is 290 × 184 -->
<vf-label origin="top center" left="145" top="16">Page Setup</vf-label>
<vf-button-group origin="bottom right" left="274" top="168">
  <vf-button>Cancel</vf-button>
  <vf-button variant="default">OK</vf-button>
</vf-button-group>
```

The title stays centered on x = 145 whatever its text, and the button group
keeps its bottom-right corner 16px in from the body's corner however long its
labels run. A dialog declares its size, so every coordinate in it is known in
advance except the size of the item being placed; the anchor point hands that
measurement to the kit.

## Values

`origin` takes nine keywords, vertical then horizontal:

| | left | center | right |
| --- | --- | --- | --- |
| **top** | `top left` (default) | `top center` | `top right` |
| **center** | `center left` | `center` | `center right` |
| **bottom** | `bottom left` | `bottom center` | `bottom right` |

A reflected string property on `VfPositioned`, so every component takes it
with `top`/`left`. An unknown value places as `top left` and warns once per
element. On its own it places nothing: it changes what `left`/`top` mean and
is inert on an element in flow (`fixed`, by contrast, is itself a placement).

## The name

`origin`, decided 2026-09-10: CSS's word for the point of a box that holds
still (`transform-origin`, with the same keywords), and how the kit already
speaks of a stated `left`/`top` — a dialog's "dragged or authored origin".

`anchor`, the working name, is taken twice:

- **In the kit**, "anchor" is the positioned container a placement measures
  from: the (0,0) of LAYOUT's "`top` and `left`", the `anchor` argument of
  `placementIn()`, `placementAt()`'s docs, verify:position's ANCHORS group. An
  `anchor` attribute meaning a point on the *item* would give one word both
  ends of the same measurement.
- **In HTML**, `anchor` is a proposed global attribute (the implicit anchor
  element of CSS anchor positioning; Chromium has implemented it behind a
  flag). A custom element that claims it is betting it never ships.

## Mechanics

- **Measured, in whole system px.** With a non-default origin,
  `PositionController` (src/position.ts) measures the host's border box in
  system px, rounded to whole (w × h), and writes
  `left: calc(var(--vf-scale, 1) * (L − ⌈w·fx⌉) * 1px)` with `fx` 0, ½ or 1,
  and `top` the same way. The ceiling sends an odd size's leftover half toward
  the start (left, up) — the tie rule `vf-stack` (`cross-center.ts`,
  `data-vf-tie`) and the title patch (`TitleCenterController`,
  `--vf-title-dx`) already use. The plain-frame heading this replaces
  centered with `text-align: center`, which put Page Setup's title at
  x = 108.5.
- **Kept current by a ResizeObserver**, as the same controller already does
  for `fixed`: a relabel, a late font, a translated string. A zoom step
  changes CSS px, not system px, so it recomputes the same offset. Observed
  only while the origin isn't `top left`.
- **Announced.** An observer-driven rewrite fires `vf-placement-change` like
  any other write, so a scroll area re-measures when a centered child's growth
  moves its edges.
- **Not a transform.** `translate: -50% 0` is the no-JavaScript version, and
  it fails twice. A percentage of an odd width is half a pixel, which smears
  the 1-bit art. And a transform makes the host the containing block for
  `position: fixed` descendants: a placed group holding a `vf-select` would
  trap its list, which is `position: fixed` off the control's own rect. The
  kit's two existing centering offsets are relative `left`s for these
  reasons.
- **`top left` is today's code path**: no observer, no measurement, the same
  inline style.
- **The box is the border box**, margins excluded (placement zeroes them). For
  a `vf-fieldset` that includes the 8px legend room above the frame line; for
  a group holding a default button, its bold ring.

## Interactions to settle

- **Gestures.** `PlacementController.seed()` returns the stated pair and
  `moveTo()` writes one, clamping the box against the container. With an
  origin the stated pair stays the origin point: the clamp converts to the
  box's corner, clamps, and converts back before writing. A dragged title
  stays centered on wherever it was dropped.
- **Drops.** `placementAt()` returns the top-left pair a dropped child is
  written with. Writing it to a child with an origin needs the child's offset
  added — either `placementAt()` takes the child, or the offset is exposed.
  Settle against the Finder drag code (`vf-icon-field`).
- **`fixed`.** The sticky engine uses `left`/`top` as its thresholds; folding
  the offset into them should be all it takes, since the footprint-cancelling
  margins are the box's own size. Needs its own verify case.
- **`vf-dialog`.** Its own `top`/`left` are viewport coordinates written by
  `VfModalDialog`, not `VfPositioned`, and unset already centers it. Leave it
  out of the first version.
- **Grid snap.** Whole-system-px offsets keep a snapped origin whole; verify at
  dpr 1, 2 and 3.

## Related, not in this plan

Measuring from the container's right or bottom edge — CSS's own
`right`/`bottom`, which placement currently releases to `auto` — keeps an item
in a corner of a container whose size changes, such as a resizable window
whose grow box moves the corner away from a button row. In a dialog, whose
size is fixed, an origin does the same job.

## Tests — verify:position, a new ORIGIN group

- Each of the nine origins lands its named point on (L, T), at dpr 1, 2 and 3.
- An odd width under a center origin puts the leftover half on the left; an
  odd height, on top.
- A relabel re-centers and re-right-aligns (the observer).
- A zoom step keeps the named point where it was.
- Dragging a movable element with an origin writes the origin-point pair and
  keeps the element under the pointer; the clamp holds the box inside.
- `fixed` with an origin.
- Unset and `top left` write exactly today's inline style.
- An unknown value warns once and places as `top left`.

## Docs

LAYOUT "`top` and `left`", SPEC §1 Explicit placement, the reference page (the
Page Setup dialog's title and button row become the demo), and verify:position's
header.
