/// <reference types="vite/client" />
/**
 * Vintage Frames demo — wires the System 7 showcase desktop (SPEC §7):
 * menu behavior, window close / re-open, the Erase Disk alert, the About
 * dialog, and the animated determinate progress bar. Everything visual comes
 * from the components; this module is behavior only.
 */
import { VfWindow } from '../src/index.js'
import { sys } from '../src/scale.js'
import type {
  VfAlert,
  VfDesktop,
  VfDialog,
  VfMenu,
  VfMenuItem,
  VfProgressBar,
} from '../src/index.js'
import '../src/styles/vintage.css'
import './demo.css'

/** Detail dispatched by `vf-menu-item`'s `vf-select` event. */
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

/** Typed reader for the `vf-select` menu event. */
function menuDetail(event: Event): MenuSelectDetail {
  return (event as CustomEvent<MenuSelectDetail>).detail
}

const desktop = $<VfDesktop>('#desktop')
const installerWindow = $<VfWindow>('#win-installer')
const formatWindow = $<VfWindow>('#win-format')
const newDocWindow = $<VfWindow>('#win-newdoc')
const newImageWindow = $<VfWindow>('#win-newimage')
const aboutDialog = $<VfDialog>('#dlg-about')
const eraseAlert = $<VfAlert>('#alert-erase')

/* ------------------------------------------------------------------ *
 * Windows: close hides, Special → Show All Windows re-opens.
 * ------------------------------------------------------------------ */

// The Format window emulates an always-open movable modal: no close box.
// (`closable` defaults to true and, being a reflected boolean, can only be
// turned off from script.)
formatWindow.closable = false

// The BBEdit "New HTML Document" window is the same movable-modal lookalike.
newDocWindow.closable = false

// The Photoshop "New" image dialog is another always-open movable modal.
newImageWindow.closable = false

// A window's close box fires `vf-close` on the window itself; hide it.
// (Dialog/alert `vf-close` events have a non-window target and pass through.)
desktop.addEventListener('vf-close', (event) => {
  if (event.target instanceof VfWindow) event.target.hidden = true
})

/** Un-hide every window on the desktop (Special → Show All Windows). */
function showAllWindows(): void {
  for (const win of desktop.querySelectorAll('vf-window')) {
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
  const step = (untitledCount - 1) % 7
  win.style.position = 'absolute'
  // Positions/size in system px, scaled to the display (matches demo.css).
  win.style.left = `${sys(180 + step * 28)}px`
  win.style.top = `${sys(140 + step * 26)}px`
  win.style.width = `${sys(300)}px`

  const note = document.createElement('p')
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

$<VfMenu>('#menu-apple').addEventListener('vf-select', (event) => {
  if (menuDetail(event).value === 'about') aboutDialog.show()
})

$<VfMenu>('#menu-file').addEventListener('vf-select', (event) => {
  if (menuDetail(event).value === 'new-window') spawnWindow()
})

// View: exclusive check between "by Icon" and "by Name".
const viewMenu = $<VfMenu>('#menu-view')
viewMenu.addEventListener('vf-select', (event) => {
  const { item } = menuDetail(event)
  for (const entry of viewMenu.querySelectorAll('vf-menu-item')) {
    entry.checked = entry === item
  }
})

$<VfMenu>('#menu-special').addEventListener('vf-select', (event) => {
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
 * Dialog, alert, and installer buttons.
 * ------------------------------------------------------------------ */

$<HTMLElement>('#btn-about-ok').addEventListener('click', () =>
  aboutDialog.close()
)
$<HTMLElement>('#btn-erase-cancel').addEventListener('click', () =>
  eraseAlert.close()
)
$<HTMLElement>('#btn-erase-confirm').addEventListener('click', () =>
  eraseAlert.close()
)

// Installer: Quit behaves like the close box (Show All Windows re-opens it).
$<HTMLElement>('#btn-quit').addEventListener('click', () => {
  installerWindow.hidden = true
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
