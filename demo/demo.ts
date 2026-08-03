/// <reference types="vite/client" />
/**
 * Vintage Frames demo — wires the System 7 showcase desktop (SPEC §7):
 * menu behavior, the desktop launcher icons (every window starts put away;
 * double-click opens), window close / self-dismissal via each window's own
 * buttons, the Erase Disk alert, the About and Page Setup dialogs, the Desk
 * Accessories utility palette, and the animated determinate progress bar.
 * Everything visual comes from the components; this module is behavior only.
 */
import { VfParagraph, VfWindow } from '../src/index.js'
import { effectiveScale, onScaleChange, sysLength } from '../src/scale.js'
import type {
  VfAlert,
  VfDesktop,
  VfDialog,
  VfIcon,
  VfMenu,
  VfMenuItem,
  VfProgressBar,
} from '../src/index.js'
import './desktop-page.css'
import './demo.css'

/** Detail dispatched by `vf-menu-item`'s `vf-menu-select` event. */
interface MenuSelectDetail {
  value: string
  item: VfMenuItem
}

/** Query a required element; fail loudly if the markup drifts. */
function $<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`demo: missing element ${selector}`)
  return el
}

/** Typed reader for the `vf-menu-select` menu event. */
function menuDetail(event: Event): MenuSelectDetail {
  return (event as CustomEvent<MenuSelectDetail>).detail
}

const desktop = $<VfDesktop>('#desktop')

/* ------------------------------------------------------------------ *
 * The desktop raster. A vf-desktop takes a declared width/height in
 * system px (bezel added on top), so filling the viewport is the page's
 * job: measure the box the page owns, let fitWithin() derive the largest
 * whole raster that fits, and re-derive when the window resizes or the
 * effective scale moves (zoom, a monitor change — either changes what a
 * system px costs in CSS px). The sub-system-pixel leftover stays on the
 * page, invisible against the black body behind the bezel.
 * ------------------------------------------------------------------ */
const fitDesktop = (): void => {
  const cw = document.documentElement.clientWidth
  const ch = document.documentElement.clientHeight
  desktop.fitWithin(cw, ch)
  // const { width, height } = desktop.fitWithin(cw, ch)
  // Resize diagnostic: the measured box, the scale in force, and the raster
  // assigned from them. client < inner means a space-consuming scrollbar was
  // shrinking the measurement — the loop `overflow: hidden` on <html> exists
  // to prevent.
  // console.log(
  //   `[vf-desktop fit] client ${cw}×${ch}, inner ${innerWidth}×${innerHeight}, ` +
  //     `scale ${effectiveScale(desktop)} → raster ${width}×${height} sys px ` +
  //     `(host ${width + 2 * desktop.bezel}×${height + 2 * desktop.bezel} sys px)`
  // )
}
fitDesktop()
window.addEventListener('resize', fitDesktop)
onScaleChange(fitDesktop)
const installerWindow = $<VfWindow>('#win-installer')
const formatWindow = $<VfWindow>('#win-format')
const newDocWindow = $<VfWindow>('#win-newdoc')
const newImageWindow = $<VfWindow>('#win-newimage')
const findWindow = $<VfWindow>('#win-find')
const toolsPalette = $<VfWindow>('#win-tools')
const aboutDialog = $<VfDialog>('#dlg-about')
const pageSetupDialog = $<VfDialog>('#dlg-pagesetup')
const eraseAlert = $<VfAlert>('#alert-erase')

/* ------------------------------------------------------------------ *
 * Windows: every one puts itself away — the close box where there is
 * one, its own action buttons where there is not. Special → Show All
 * Windows (or the window's launcher icon) re-opens.
 * ------------------------------------------------------------------ */

// The three movable-modal lookalikes — Format, BBEdit's New HTML Document
// and Photoshop's New — carry no close box (`closable` defaults to true
// and, being a reflected boolean, can only be turned off from script), so
// their OK/Cancel buttons below are their whole dismissal.
formatWindow.closable = false
newDocWindow.closable = false
newImageWindow.closable = false

// A window's close box fires `vf-close` on the window itself; hide it.
// (Dialog/alert `vf-close` events have a non-window target and pass through.)
desktop.addEventListener('vf-close', (event) => {
  if (event.target instanceof VfWindow) event.target.hidden = true
})

/** Wire a button to put its window away, the way its close box would. */
function dismissOnClick(selector: string, win: VfWindow): void {
  $<HTMLElement>(selector).addEventListener('click', () => {
    win.hidden = true
  })
}
dismissOnClick('#btn-format-cancel', formatWindow)
dismissOnClick('#btn-format-ok', formatWindow)
dismissOnClick('#btn-newdoc-cancel', newDocWindow)
dismissOnClick('#btn-newdoc-ok', newDocWindow)
dismissOnClick('#btn-newimage-ok', newImageWindow)
dismissOnClick('#btn-newimage-cancel', newImageWindow)
// System 7's Find dialog put itself away when the search ran.
dismissOnClick('#btn-find', findWindow)
// Installer: Quit and Install both leave, like the real one's terminal acts.
dismissOnClick('#btn-quit', installerWindow)
dismissOnClick('#btn-install', installerWindow)

/* ------------------------------------------------------------------ *
 * Opening a window centers it on the raster as it stands RIGHT NOW —
 * no window carries an authored position, so nothing can open off-canvas
 * however small the viewport is (the desktop is the viewport: a window
 * past its edge gives the page no scrollbar to reach it by).
 * ------------------------------------------------------------------ */

/** Menu bar height in system px (--vf-menubar-height's default). */
const MENU_BAR = 24

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(Math.max(value, lo), hi)

/**
 * Park a window in the middle of the screen area below the menu bar, in
 * whole system px (grid rule 3), written as the same
 * `calc(var(--vf-scale) * Npx)` idiom demo.css uses so the position stays
 * proportional if the scale moves. `nudge` staggers a batch down-right so
 * Show All Windows deals a cascade rather than one exact pile; a window
 * too large for the raster pins to the top-left of what room there is.
 */
function centerWindow(win: VfWindow, nudge = 0): void {
  const w = win.width ?? 0
  const h = win.height ?? 0
  const x = clamp(
    Math.round((desktop.width - w) / 2) + nudge,
    0,
    Math.max(0, desktop.width - w)
  )
  const y = clamp(
    MENU_BAR + Math.round((desktop.height - MENU_BAR - h) / 2) + nudge,
    MENU_BAR,
    Math.max(MENU_BAR, desktop.height - h)
  )
  win.style.position = 'absolute'
  win.style.left = sysLength(x)
  win.style.top = sysLength(y)
}

/** Un-hide every window on the desktop (Special → Show All Windows),
 *  cascading the ones that were put away around the center. */
function showAllWindows(): void {
  let step = 0
  for (const win of desktop.querySelectorAll('vf-window')) {
    if (win.hidden) centerWindow(win, (step++ % 7) * 24)
    win.hidden = false
  }
}

/* ------------------------------------------------------------------ *
 * File → New Window: spawn staggered untitled windows on the desktop.
 * ------------------------------------------------------------------ */

let untitledCount = 0

function spawnWindow(): void {
  untitledCount += 1
  const win = new VfWindow()
  win.heading =
    untitledCount === 1 ? 'untitled folder' : `untitled folder ${untitledCount}`
  win.movable = true
  // Both axes, like every other window here: a window is a fixed box, and an
  // undeclared height would size it to whatever the note below happens to wrap
  // to. Tall enough for that note at this width.
  win.width = 300
  win.height = 112
  // Center on the current raster, cascading repeat spawns down-right.
  centerWindow(win, ((untitledCount - 1) % 7) * 24)

  const note = new VfParagraph()
  note.className = 'untitled-note'
  note.textContent =
    'A fresh window. Drag it by its title bar; click any window to bring it to the front.'
  win.append(note)

  // Slotting into the desktop assigns a z-index and makes it the active
  // window automatically.
  desktop.append(win)
}

/* ------------------------------------------------------------------ *
 * Menus.
 * ------------------------------------------------------------------ */

$<VfMenu>('#menu-apple').addEventListener('vf-menu-select', (event) => {
  if (menuDetail(event).value === 'about') aboutDialog.show()
})

$<VfMenu>('#menu-file').addEventListener('vf-menu-select', (event) => {
  switch (menuDetail(event).value) {
    case 'new-window':
      spawnWindow()
      break
    case 'page-setup':
      pageSetupDialog.show()
      break
  }
})

// View: an exclusive check across the three, and the two icon views really do
// switch the desktop between the icon family's two members — the 32×32 ICN#
// and the 16×16 ics#, both already slotted on every vf-icon.
const viewMenu = $<VfMenu>('#menu-view')
viewMenu.addEventListener('vf-menu-select', (event) => {
  const { item, value } = menuDetail(event)
  for (const entry of viewMenu.querySelectorAll('vf-menu-item')) {
    entry.checked = entry === item
  }
  if (value === 'by-icon' || value === 'by-small-icon') {
    for (const icon of document.querySelectorAll<VfIcon>('vf-icon')) {
      icon.size = value === 'by-small-icon' ? 'small' : 'large'
    }
  }
})

$<VfMenu>('#menu-special').addEventListener('vf-menu-select', (event) => {
  switch (menuDetail(event).value) {
    case 'erase-disk':
      eraseAlert.show()
      break
    case 'show-all':
      showAllWindows()
      break
  }
})

/* ------------------------------------------------------------------ *
 * Launcher icons: each one's data-opens names the window or dialog it
 * stands for. `vf-open` is the icon's open gesture — a double-click, or
 * ⌘O / ⌘↓ from the keyboard; Return starts a rename instead, since every
 * icon on this desktop is `editable`, as every Finder icon was. A window
 * centers on the current raster, un-hides and comes
 * to the front of its tier; a dialog or alert shows modally (the native
 * <dialog> centers itself). While the target is on screen its launcher
 * wears the derived open ghost, the way the Finder marked an open folder.
 * ------------------------------------------------------------------ */

for (const icon of document.querySelectorAll<VfIcon>('vf-icon[data-opens]')) {
  const target = $<HTMLElement>(`#${icon.dataset.opens}`)
  icon.addEventListener('vf-open', () => {
    if (target instanceof VfWindow) {
      centerWindow(target)
      target.hidden = false
      desktop.bringToFront(target)
    } else {
      ;(target as VfDialog | VfAlert).show()
      icon.open = true
    }
  })
  // The icon's `open` ghost mirrors whether its window is on screen. Every
  // way a window goes away writes `hidden` (close box, action buttons, Show
  // All Windows), so observing that one attribute covers them all; dialogs
  // and alerts fire vf-close on every close path instead.
  if (target instanceof VfWindow) {
    const sync = () => {
      icon.open = !target.hidden
    }
    new MutationObserver(sync).observe(target, { attributeFilter: ['hidden'] })
    sync()
  } else {
    target.addEventListener('vf-close', () => {
      icon.open = false
    })
  }
}

/* ------------------------------------------------------------------ *
 * Dialog and alert buttons.
 * ------------------------------------------------------------------ */

$<HTMLElement>('#btn-about-ok').addEventListener('click', () =>
  aboutDialog.close()
)
$<HTMLElement>('#btn-pagesetup-cancel').addEventListener('click', () =>
  pageSetupDialog.close()
)
$<HTMLElement>('#btn-pagesetup-ok').addEventListener('click', () =>
  pageSetupDialog.close()
)
$<HTMLElement>('#btn-erase-cancel').addEventListener('click', () =>
  eraseAlert.close()
)
$<HTMLElement>('#btn-erase-confirm').addEventListener('click', () =>
  eraseAlert.close()
)

/* ------------------------------------------------------------------ *
 * Utility palette: one tool selected at a time (aria-pressed drives
 * the inverted cell in demo.css).
 * ------------------------------------------------------------------ */

toolsPalette.addEventListener('click', (event) => {
  const tool = (event.target as HTMLElement).closest<HTMLButtonElement>('.tool')
  if (!tool) return
  for (const other of toolsPalette.querySelectorAll<HTMLButtonElement>(
    '.tool'
  )) {
    other.setAttribute('aria-pressed', String(other === tool))
  }
})

/* ------------------------------------------------------------------ *
 * Progress: animate the determinate bar 0 → 100 on a timer, forever.
 * ------------------------------------------------------------------ */

const progress = $<VfProgressBar>('#progress-demo')
let progressValue = 0
window.setInterval(() => {
  // Climb to 100, hold there briefly, then start over.
  progressValue = progressValue >= 112 ? 0 : progressValue + 2
  progress.value = Math.min(progressValue, 100)
}, 80)

/* ------------------------------------------------------------------ *
 * Slider: mirror the live value into a readout as it is dragged.
 * ------------------------------------------------------------------ */

const sliderReadout = $<HTMLElement>('#slider-readout')
$<HTMLElement>('#slider-demo').addEventListener('vf-input', (event) => {
  sliderReadout.textContent = String((event as CustomEvent<{ value: number }>).detail.value)
})
