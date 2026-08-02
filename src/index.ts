/**
 * Vintage Frames — Lit web components in the style of classic Mac OS System 7.
 *
 * Importing this module registers every element. Individual components can be
 * imported from their own modules for finer-grained loading.
 *
 * Alongside the elements, the shared toolkit the components are built from is
 * re-exported below: display scaling (`applyScale` and friends), the 1-bit
 * style recipes, glyph sprites, pixel-stepped corner profiles, the behavior
 * controllers, and the base classes — so an app can scale a page and author
 * matching custom controls without reaching into `dist/` paths.
 */

// Chrome & shells
export { VfDesktop } from './components/vf-desktop.js'
export { VfWindow } from './components/vf-window.js'
export { VfDialog } from './components/vf-dialog.js'
export { VfAlert } from './components/vf-alert.js'
export { VfSeparator } from './components/vf-separator.js'

// Buttons & toggles
export { VfButton } from './components/vf-button.js'
export { VfButtonGroup } from './components/vf-button-group.js'
export { VfSwatch } from './components/vf-swatch.js'
export { VfCheckbox } from './components/vf-checkbox.js'
export { VfRadio } from './components/vf-radio.js'
export { VfRadioGroup } from './components/vf-radio-group.js'

// Text & value inputs
export { VfTextField } from './components/vf-text-field.js'
export { VfTextArea } from './components/vf-text-area.js'
export { VfNumberField } from './components/vf-number-field.js'
export { VfSelect } from './components/vf-select.js'
export { VfOption } from './components/vf-option.js'
export { VfProgressBar } from './components/vf-progress-bar.js'
export { VfSlider } from './components/vf-slider.js'

// Static text & images
export { VfLabel } from './components/vf-label.js'
export { VfParagraph } from './components/vf-paragraph.js'
export { VfImg } from './components/vf-img.js'
export { VfIcon } from './components/vf-icon.js'
export type { VfIconSize } from './components/vf-icon.js'

// Menus, lists, containers
export { VfMenuBar } from './components/vf-menu-bar.js'
export { VfMenu } from './components/vf-menu.js'
export { VfMenuItem } from './components/vf-menu-item.js'
export { VfList } from './components/vf-list.js'
export { VfListItem } from './components/vf-list-item.js'
export { VfScrollArea } from './components/vf-scroll-area.js'
export { VfFieldset } from './components/vf-fieldset.js'
export { VfGrid } from './components/vf-grid.js'
export type { VfGridRules } from './components/vf-grid.js'
export { VfStack } from './components/vf-stack.js'
export type {
  VfStackDirection,
  VfStackPlace,
} from './components/vf-stack.js'

/* ── Utilities & style toolkit ──────────────────────────────────────────── */

/**
 * Display scaling. `applyScale(document.documentElement)` is the one call an
 * app makes to opt into true classic size (3 device px per system px); the rest
 * is the system↔CSS px conversion custom components need so their JS geometry
 * stays in the same coordinate system as CSS.
 */
export {
  applyScale,
  ScaleController,
  effectiveScale,
  getScale,
  onScaleChange,
  sys,
  sysLength,
  sysLengths,
  toSys,
  snapToDevicePx,
  snapToSystemPx,
  snapDialogToGrid,
  unsnapDialog,
  DEVICE_PX_PER_SYSTEM_PX,
} from './scale.js'

/**
 * Browser-zoom tracking, the zoom half of display scaling: the kit follows the
 * user's zoom by default (6 device px per system px at 200%), and these are
 * the readouts a page or custom control needs to stay on the same grid —
 * `truePixelRatio()` is device px per CSS px *including* zoom, the number
 * `window.devicePixelRatio` stops being in Safari at any non-100% zoom.
 * `resetZoomBaseline()` declares the current state to be 100%, for the one
 * change the tracker cannot classify (a display-mode switch at an identical
 * logical size).
 */
export {
  getZoom,
  truePixelRatio,
  onZoomChange,
  devicePxPerSystemPx,
  resetZoomBaseline,
} from './zoom.js'

/**
 * Automatic device-pixel-grid snapping. `applyGridSnap()` is the one call an
 * app makes to have every component hold its own origin on whole device pixels
 * whatever the surrounding layout does — the half of the layout contract the
 * components can keep for you.
 */
export {
  applyGridSnap,
  requestGridSnap,
  GridSnapController,
} from './grid-snap.js'

/**
 * The 1-bit style recipes. Compose them into a custom element's
 * `static styles` to inherit the kit's type, panel frame, window chrome, focus
 * ring, field well and System 7 scrollbar skin.
 */
export {
  vfBase,
  vfBodyDecls,
  vfDisplay,
  vfDisplayDecls,
  vfStaticText,
  vfPanel,
  vfChromeFrame,
  vfModalFrame,
  vfTitleBar,
  vfWindowWidgets,
  vfHardShadowDecls,
  vfStripes,
  vfDots,
  vfFocus,
  vfFocusRing,
  vfFocusUnderline,
  vfToggle,
  vfField,
  vfScrollbars,
} from './styles/base.js'

/** Glyph sprites (`glyphSvg(CHECKMARK, 'check')`) and their pixel geometry. */
export {
  glyphSvg,
  CHECKBOX_X,
  RADIO_FACE,
  RADIO_RING,
  RADIO_RING_PRESSED,
  RADIO_DOT,
  CHECKMARK,
  CARET_DOWN,
  STEPPER,
  STEPPER_UP_FILL,
  STEPPER_DOWN_FILL,
  SLIDER_THUMB,
  SLIDER_THUMB_FACE,
} from './glyphs.js'
export type { Glyph } from './glyphs.js'

/** The raster half of the sprite set — the 32x32 alert icon, as a data URI. */
export { CAUTION_ICON } from './icons.js'

/** Pixel-stepped corner profiles and the clip-paths traced from them. */
export {
  steppedRectClip,
  steppedRingClip,
  steppedCornerClip,
  BUTTON_FRAME,
  BUTTON_FACE,
  RING_FRAME,
  RING_HOLE,
  RING_INSET,
  SCREEN_CORNER,
} from './pixel-frame.js'
export type { SteppedProfile } from './pixel-frame.js'

/** Behavior helpers: pointer drag, overflow reporting, event dispatch, motion. */
export { DragController } from './drag.js'
export type { DragTarget } from './drag.js'
export { ScrollStateController } from './scroll-state.js'
export { TrackWidthController } from './track-width.js'
export { DocumentListenersController } from './document-listeners.js'
export type { DocumentListenerSpec } from './document-listeners.js'
export { focusModality, trackFocusModality, FocusRuleController } from './focus-modality.js'
export type { FocusModality } from './focus-modality.js'
export { emit } from './events.js'
export {
  prefersReducedMotion,
  runSelectionBlink,
  BLINK_INTERVAL_MS,
  BLINK_FLIPS,
  PRESS_HOLD_MS,
} from './motion.js'
export type { BlinkHandle } from './motion.js'

/**
 * Element registration. `vfElement` is the kit's `@customElement`: it registers
 * through `defineElement`, which skips (and warns) rather than throwing when a
 * second copy of the library claims a tag the page already has.
 */
export { defineElement, vfElement } from './define.js'

/** Base classes — extend these to author a custom `vf-*` control. */
export { VfFormControl } from './form-control.js'
export { VfTextControlBase } from './text-control.js'
export { VfToggleControl } from './toggle-control.js'
export type { VfToggleControlInterface } from './toggle-control.js'
export { VfModalDialog, modalDialogStyles } from './modal-dialog.js'
export type { VfCloseReason } from './modal-dialog.js'

/** The embedded System 7 bitmap faces and the registration helper. */
export { registerEmbeddedFont, PIXEL_GRID_METRICS } from './styles/register-embedded-font.js'
export type { EmbeddedFontMetrics } from './styles/register-embedded-font.js'
export { registerChiKareGo, CHIKAREGO_FAMILY } from './styles/chikarego-font.js'
export {
  registerFindersKeepers,
  FINDERS_KEEPERS_FAMILY,
} from './styles/finders-keepers-font.js'
