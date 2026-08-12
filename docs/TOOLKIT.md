# Utilities & style toolkit

The toolkit the components are built from is exported from the package root, so a custom control can match the kit pixel-for-pixel:

```ts
import { vfBase, vfPanel, sys, glyphSvg, CHECKMARK } from 'vintage-frames'
```

| Export | What it's for |
| --- | --- |
| `applyScale`, `ScaleController`, `onScaleChange` | Opt a subtree, or your own component, into true-size rendering |
| `getZoom`, `truePixelRatio`, `onZoomChange`, `devicePxPerSystemPx`, `resetZoomBaseline` | The zoom half of scaling: tracked page zoom; device px per CSS px *including* zoom (what `devicePixelRatio` stops being in Safari under zoom); a zoom subscription; the density→target derivation; and the "current state is 100%" escape hatch |
| `applyGridSnap`, `requestGridSnap`, `GridSnapController` | Automatic device-pixel-grid snapping; add it to your own component with one controller line plus the `vf-snap` class on its painted root |
| `applyCursor`, `CURSOR_ARROW`, `CURSOR_I_BEAM`, `CURSOR_CROSSHAIR`, `CURSOR_WAIT` | Replace the native pointer with the embedded System 7 set; the constants are that art, exported for reuse |
| `sys`, `toSys`, `toSysExact`, `sysLength`, `sysLengths`, `effectiveScale`, `getScale`, `snapSys`, `systemPxQuantum`, `snapToSystemPx`, `snapToDevicePx`| Convert between system (art) px and CSS px against the effective `--vf-scale`. `sysLength`/`sysLengths` emit a live system-px length (or 1–4 value shorthand) for a position or size written onto an element; `snapSys` puts a system-px coordinate on the placement lattice, `snapToSystemPx`/`snapToDevicePx` are its CSS-px twins. `CLASSIC_DPI` / `CSS_REFERENCE_DPI` / `SYSTEM_PX_IN_CSS_PX` are the constants the target is derived from |
| `VfPositioned`, `VfSized`, `PlacementController` | The `top`/`left` and `width`/`height` mixins, plus the gesture half that states a drag's result in those same properties |
| `vfBase`, `vfDisplay`, `vfDisplayDecls`, `vfBodyDecls`, `vfStaticText`, `vfPanel`, `vfChromeFrame`, `vfModalFrame`, `vfTitleBar`, `vfWindowWidgets`, `vfHardShadowDecls`, `vfStripes`, `vfDots`, `vfFocus`, `vfFocusRing`, `vfFocusUnderline`, `vfToggle`, `vfField`, `vfScrollRail` | The 1-bit CSS recipes — compose into `static styles` |
| `ScrollRailController`, `renderScrollRail` | The kit-drawn System 7 scroll rails: the template helper renders the rail subtree (arrows, dither trough, the fixed 16px thumb) as a sibling of your scrolling element, and the controller syncs it to the native scrolling — which stays the platform's; only the native bar is hidden — while driving thumb drag, trough paging and arrow auto-repeat |
| `vfTileSize`, `vfTileMaskSize`, `tileImage`, `tileSpan`, `TILE_LATTICE` | A CSS-repeating fill's span and its art. State the motif in system px; the tile spans `lcm(motif, 15)`, the smallest whole number of motifs whose CSS length every derived scale can hold exactly. Still load-bearing for the underlays and the forced-colors masks; the converted surfaces (the scroll trough among them) render through the tile grid below |
| `vfTileGrid`, `tileGrid`, `tileRaster`, `tileRects`, `patternOverride`, `TileRasterCache` | The exact tiled fill (see [SIZING.md](./SIZING.md) § The tile grid): a motif stated as rect data (`TileRect[]`) renders as one whole-surface raster (`tileRaster`, kit art) or a flat grid of placed tiles (`tileGrid`, consumer pattern tokens) — 1-bit at every scale, zoom-minted ones included |
| `glyphSvg` + the glyph constants (`CHECKMARK`, `CARET_DOWN`, `STEPPER`, …) | The 1-bit sprite set, rendered inline as SVG |
| `steppedRectClip`, `steppedRingClip`, `steppedCornerClip`, `BUTTON_FRAME`, `BUTTON_FACE`, `RING_FRAME`, `RING_HOLE`, `RING_INSET`, `SCREEN_CORNER` | Pixel-stepped corner profiles and their `clip-path` traces, plus the screen-corner mask |
| `DragController`, `ScrollStateController`, `TrackWidthController`, `DocumentListenersController` | Pointer-drag wiring; per-axis overflow and inactive-window reporting for the scrollbars; a track's measured width; document-level listeners scoped to an open panel or in-flight gesture |
| `focusModality`, `trackFocusModality`, `FocusRuleController` | Whether the keyboard or a pointer last drove the page, resolved against a host's own focus as one reactive flag |
| `emit`, `prefersReducedMotion`, `runSelectionBlink`, `BLINK_INTERVAL_MS`, `BLINK_FLIPS`, `PRESS_HOLD_MS`, `RENAME_DELAY_MS` | The `bubbles`+`composed` event convention; the ~250ms selection blink; the tap-vs-hold threshold; the rename delay |
| `defineElement`, `vfElement` | Register a custom element without the duplicate-copy footgun — both skip with a warning rather than throwing when the tag is taken |
| `VfFormControl`, `VfTextControlBase`, `VfToggleControl`, `VfModalDialog`, `modalDialogStyles` | Base classes: form association, the text-field recipe, the toggle interaction skeleton (a mixin), the native-`<dialog>` lifecycle |
| `registerEmbeddedFont`, `registerDisplayFace`, `registerBodyFace`, `VF_DISPLAY_FAMILY`, `VF_BODY_FAMILY` | Register the bitmap faces on `document.fonts` yourself; the constants are the family names (`'VF Display'`, `'VF Body'`) |

`VfToggleControl` is a mixin rather than a base class, because the kit's two toggles sit on different bases: `vf-checkbox` extends `VfFormControl` (it submits a value under a name), while `vf-radio` is not form-associated — its `vf-radio-group` is the form surface. Apply it over whichever base your control needs, and supply `checked`, the control's `ElementInternals`, its effective disabled rule, and what a click or Space should do:

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

You get the click/Space wiring (including the held-Space auto-repeat guard), one disabled gate every activation passes through, `aria-checked`/`aria-disabled` mirroring, and a self-managed host tabindex that never clobbers a consumer's own.
