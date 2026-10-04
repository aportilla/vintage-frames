/**
 * `vintage-frames/shell` — experimental. Applications over one desktop: a
 * window manager, a menu bar that shows the front application's menus, a
 * catalog of what is where, and the stock Finder that shows it. Plain
 * modules over the kit's elements: it registers no elements, writes no
 * styles and ships no art, and it reaches the kit only through the
 * package's own exports, so the page imports `vintage-frames` first.
 *
 * Its API may change in any minor release while it is experimental.
 * docs/SHELL.md is the guide.
 */

export { createShell, defineApp, appIdOf, APP_KIND } from './shell.js'
export type { AppContext, AppDefinition, CatalogSetup, KindDefinition, Shell, ShellOptions } from './shell.js'

export { createWindowManager, focusInto } from './windows.js'
export type {
  AdoptOptions,
  ArrangeGroup,
  BoxInput,
  CloseHandler,
  FocusHome,
  HomeBox,
  OpenOptions,
  PlacePolicy,
  Placed,
  WindowManager,
  WindowManagerOptions,
} from './windows.js'

export { finder, FINDER } from './finder.js'
export type {
  FinderAlert,
  FinderAlertHandler,
  FinderAlerts,
  FinderApi,
  FinderArt,
  FinderCommand,
  FinderCommandSpec,
  FinderFailedAction,
  FinderMenu,
  FinderOpen,
  FinderOptions,
} from './finder.js'

export { fileByDrag } from './filing.js'
export type { FilingOptions } from './filing.js'

export {
  createCatalog,
  memoryStorage,
  childrenOf,
  containerOf,
  copyName,
  descendantsOf,
  enclosingFolders,
  isContainerKind,
  isInside,
  isTrashed,
  isVolume,
  itemCount,
  itemOf,
  nextFolderName,
  DISK,
  FOLDER,
  TRASH,
  UNTITLED_FOLDER,
} from './catalog.js'
export type {
  Catalog,
  CatalogArchive,
  CatalogOptions,
  CatalogState,
  CatalogStorage,
  Item,
  KindHooks,
  NewItem,
  Volumes,
} from './catalog.js'
export { indexedDbStorage } from './storage.js'

export { localStorageState, mergeSession, openWindowsOf, readSession } from './state.js'
export type { LocalStorageStateOptions, SavedSession, SavedWindow, SessionSnapshot, ShellState } from './state.js'

export {
  BAND,
  CASCADE_SLOTS,
  CASCADE_STEP,
  ICON_CELL,
  ICON_COLUMN,
  ICON_INSET,
  ICON_ROW,
  NEAR,
  WINDOW_ORIGIN,
  cascadedBox,
  cascadeFrom,
  cascadeSlot,
  centeredBox,
  cleanUp,
  collisions,
  desktopLattice,
  fieldExtent,
  fillOrder,
  folderLattice,
  frameOf,
  isPin,
  latticeCell,
  latticeSlot,
  nearBox,
  nextFreeCell,
  pinOf,
  pinTo,
  trashCell,
  windowOrigin,
} from './geometry.js'
export type {
  Bands,
  Box,
  CascadeOptions,
  EdgePin,
  Frame,
  Lattice,
  LatticeOptions,
  Pin,
  Point,
  Policy,
  Size,
} from './geometry.js'

export { startClock, formatDate, formatTime, DATE_HOLD_MS } from './clock.js'
