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

// Menus, lists, containers
export { VfMenuBar } from './components/vf-menu-bar.js'
export { VfMenu } from './components/vf-menu.js'
export { VfMenuItem } from './components/vf-menu-item.js'
export { VfList } from './components/vf-list.js'
export { VfListItem } from './components/vf-list-item.js'
export { VfScrollArea } from './components/vf-scroll-area.js'
export { VfFieldset } from './components/vf-fieldset.js'

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
  toSys,
  snapToDevicePx,
  snapDialogToGrid,
  unsnapDialog,
  DEVICE_PX_PER_SYSTEM_PX,
} from './scale.js'

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
  vfDisplay,
  vfDisplayDecls,
  vfPanel,
  vfChromeFrame,
  vfTitleBar,
  vfHardShadowDecls,
  vfStripes,
  vfFocus,
  vfFocusRing,
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

/** Pixel-stepped corner profiles and the clip-paths traced from them. */
export {
  steppedRectClip,
  steppedRingClip,
  BUTTON_FRAME,
  BUTTON_FACE,
  RING_FRAME,
  RING_HOLE,
  RING_INSET,
} from './pixel-frame.js'
export type { SteppedProfile } from './pixel-frame.js'

/** Behavior helpers: pointer drag, overflow reporting, event dispatch, motion. */
export { DragController } from './drag.js'
export type { DragTarget } from './drag.js'
export { ScrollStateController } from './scroll-state.js'
export { TrackWidthController } from './track-width.js'
export { emit } from './events.js'
export {
  prefersReducedMotion,
  runSelectionBlink,
  BLINK_INTERVAL_MS,
  BLINK_FLIPS,
} from './motion.js'
export type { BlinkHandle } from './motion.js'

/** Base classes — extend these to author a custom `vf-*` control. */
export { VfFormControl } from './form-control.js'
export { VfTextControlBase } from './text-control.js'
export { VfToggleControl } from './toggle-control.js'
export type { VfToggleControlInterface } from './toggle-control.js'
export { VfModalDialog, modalDialogStyles } from './modal-dialog.js'
export type { VfCloseReason } from './modal-dialog.js'

/** The embedded System 7 bitmap faces and the registration helper. */
export { registerEmbeddedFont } from './styles/register-embedded-font.js'
export { registerChiKareGo, CHIKAREGO_FAMILY } from './styles/chikarego-font.js'
export {
  registerFindersKeepers,
  FINDERS_KEEPERS_FAMILY,
} from './styles/finders-keepers-font.js'
