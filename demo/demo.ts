/// <reference types="vite/client" />
/**
 * Vintage Frames demo — wires the System 7 showcase desktop (SPEC §7):
 * menu behavior, the desktop launcher icons (every window starts put away;
 * double-click opens), window close / self-dismissal via each window's own
 * buttons, the Erase Disk alert, the About and Page Setup dialogs, the Desk
 * Accessories utility palette, and the animated determinate progress bar.
 * Everything visual comes from the components; this module is behavior only.
 */
import { VfParagraph, VfWindow, applyCursor } from '../src/index.js'
import { effectiveScale, onScaleChange, snapSys, systemPxQuantum } from '../src/scale.js'
import type {
  VfDesktop,
  VfDialog,
  VfFieldset,
  VfIcon,
  VfMenu,
  VfMenuItem,
  VfOption,
  VfProgressBar,
  VfSelect,
} from '../src/index.js'
import { CHARSET_FAMILIES } from './charset-manifest.js'
import type { CharsetFamily, CharsetFont } from './charset-manifest.js'
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

/* ------------------------------------------------------------------ *
 * The cursor. One call: the kit's embedded System 7 pointer set — arrow,
 * I-beam, crosshair and wristwatch — drawn as a JS-positioned image locked
 * to the desktop's system-pixel lattice (src/cursor.ts documents why CSS
 * `cursor: url(…)` can't do this, and the state pattern). The default
 * anchor finds this page's vf-desktop by itself, and which art shows is
 * state, not markup: `aria-busy="true"` anywhere over the pointer (or on
 * an open modal) is the wristwatch, an enabled text well is the I-beam by
 * platform semantics alone, and `data-vf-cursor="crosshair"` is there for
 * a region that wants the cross.
 * ------------------------------------------------------------------ */
applyCursor()
const installerWindow = $<VfWindow>('#win-installer')
const formatWindow = $<VfWindow>('#win-format')
const newDocWindow = $<VfWindow>('#win-newdoc')
const newImageWindow = $<VfWindow>('#win-newimage')
const findWindow = $<VfWindow>('#win-find')
const toolsPalette = $<VfWindow>('#win-tools')
const aboutDialog = $<VfDialog>('#dlg-about')
const pageSetupDialog = $<VfDialog>('#dlg-pagesetup')
const prefsDialog = $<VfDialog>('#dlg-prefs')
const eraseAlert = $<VfDialog>('#alert-erase')

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
const MENU_BAR = 20

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(Math.max(value, lo), hi)

/**
 * Park a window in the middle of the screen area below the menu bar, on the
 * placement lattice ({@link snapSys}) — the same k-system-px rung a drag
 * lands on — through the component's own `top`/`left` placement; the
 * properties stay live against the scale the way the old hand-written
 * `calc(var(--vf-scale) * Npx)` idiom did, with the calc now the component's
 * business. The lattice matters here, not just whole system px (grid rule 3):
 * it is the drag contract — a centered window sits on the same k-system-px
 * rung a drag would land it on, so activating or nudging it never re-snaps
 * it. The clamp bounds sit on the
 * same lattice (floored, so a pinned window never overhangs the raster), and
 * the 24px cascade nudge is divisible by every k ≤ 4, so a staggered batch
 * stays on it too. `nudge` staggers a batch down-right so Show All Windows
 * deals a cascade rather than one exact pile; a window too large for the
 * raster pins to the top-left of what room there is.
 *
 * One nuance inherited from the placement contract: a property write is a
 * no-op when the value hasn't changed, and a drag owns the coordinates once
 * it happens. So a window you dragged, closed and reopened comes back where
 * you left it — the position memory a real System 7 window had — and still
 * on-canvas, because the drag itself clamps. It re-centers only when the
 * raster has changed underneath it, which is exactly the off-canvas case
 * centering exists for.
 */
function centerWindow(win: VfWindow, nudge = 0): void {
  const w = win.width ?? 0
  const h = win.height ?? 0
  const k = systemPxQuantum(win)
  const down = (v: number): number => Math.floor(v / k) * k
  const up = (v: number): number => Math.ceil(v / k) * k
  win.left = clamp(
    snapSys((desktop.width - w) / 2, win) + nudge,
    0,
    Math.max(0, down(desktop.width - w))
  )
  win.top = clamp(
    snapSys(MENU_BAR + (desktop.height - MENU_BAR - h) / 2, win) + nudge,
    up(MENU_BAR),
    Math.max(up(MENU_BAR), down(desktop.height - h))
  )
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

$<VfMenu>('#menu-edit').addEventListener('vf-menu-select', (event) => {
  if (menuDetail(event).value === 'preferences') prefsDialog.show()
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
 * stands for. `vf-open` is the icon's open gesture — a double-click anywhere
 * on it, the name included, or ⌘O / ⌘↓ from the keyboard; Return starts a
 * rename instead, since every icon on this desktop is `editable`, as every
 * Finder icon was. A window
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
      ;(target as VfDialog).show()
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
$<HTMLElement>('#btn-prefs-cancel').addEventListener('click', () =>
  prefsDialog.close()
)
$<HTMLElement>('#btn-prefs-ok').addEventListener('click', () =>
  prefsDialog.close()
)
$<HTMLElement>('#btn-erase-cancel').addEventListener('click', () =>
  eraseAlert.close()
)
// Erase pretends to erase before closing — the modal async-work pattern:
// declare the wait with `aria-busy="true"` on the dialog doing the work (the
// standard vocabulary, so assistive tech hears the same state) and the cursor
// module shows the wristwatch over the whole modal until the attribute comes
// off. A real app would await its fetch where the timeout stands.
$<HTMLElement>('#btn-erase-confirm').addEventListener('click', () => {
  if (eraseAlert.hasAttribute('aria-busy')) return
  eraseAlert.setAttribute('aria-busy', 'true')
  window.setTimeout(() => {
    eraseAlert.removeAttribute('aria-busy')
    eraseAlert.close()
  }, 1500)
})

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

/* ------------------------------------------------------------------ *
 * Character Set: one strike at a time from the imported collection
 * (fonts/imported/ — untracked, built by the fonts/ pipeline). The Font
 * and Size popups resolve a pick to a woff2 loaded on demand through the
 * FontFace API, each strike under its own family name ("Geneva 9"),
 * since CSS can't pick a bitmap strike by size. The specimen then sets
 * the characters the manifest read from that strike's cmap — so nothing
 * here can be a system-font fallback — as vf-paragraph rows carrying the
 * strike's own typesetting: the pick writes the font tokens onto the
 * container (--vf-font-family, --vf-font-size = the rect, one design px
 * per system px) plus --vf-paragraph-line-height = the manifest's pitch,
 * the strike's measured native line where established, its rect
 * otherwise — so the rows wrap at the spacing a real Mac gave that face.
 * ------------------------------------------------------------------ */

const charsetWindow = $<VfWindow>('#win-charset')
const charsetPanel = $<VfFieldset>('#charset-panel')
const charsetSpecimen = $<HTMLElement>('#charset-specimen')
const charsetCountEl = $<HTMLElement>('#charset-count')
const charsetFontSelect = $<VfSelect>('#charset-font')
const charsetSizeSelect = $<VfSelect>('#charset-size')

/** Registered strikes by family name; a pending load dedupes re-picks. */
const charsetFaces = new Map<string, Promise<boolean>>()

const strikeName = (family: CharsetFamily, font: CharsetFont): string =>
  `${family.label} ${font.size}`

/** Fetch + register a strike once. Resolves false — and forgets the attempt,
 *  so building the collection doesn't need a reload — when the file is absent. */
function loadStrike(family: CharsetFamily, font: CharsetFont): Promise<boolean> {
  const name = strikeName(family, font)
  let pending = charsetFaces.get(name)
  if (!pending) {
    // The broad weight range is load-bearing, exactly as in
    // register-embedded-font.ts: window content inherits the kit's
    // font-weight 700, and a face registered at the default 400 would have
    // the browser synthesize faux-bold over the strike, smearing every stem.
    // Root-relative through the site's base, not the origin's: a Pages project
    // site serves this page under /<repo>/, and fonts/ is under that too.
    const url = `${import.meta.env.BASE_URL}fonts/imported/${font.file}`
    const face = new FontFace(name, `url(${url})`, {
      style: 'normal',
      weight: '100 900',
    })
    pending = face.load().then(
      () => {
        document.fonts.add(face)
        return true
      },
      () => {
        charsetFaces.delete(name)
        return false
      }
    )
    charsetFaces.set(name, pending)
  }
  return pending
}

/** Split coverage into the specimen's rows: ASCII, accented Latin, the rest. */
function charsetRowsOf(chars: string): string[] {
  let ascii = ''
  let latin = ''
  let symbols = ''
  for (const ch of chars) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp <= 0x7e) ascii += ch
    else if (cp <= 0x24f) latin += ch
    else symbols += ch
  }
  return [ascii, latin, symbols].filter((row) => row !== '')
}

let charsetFamily: CharsetFamily
let charsetFont: CharsetFont
let charsetPick = 0

async function renderCharset(): Promise<void> {
  const family = charsetFamily
  const font = charsetFont
  const pick = ++charsetPick
  charsetPanel.legend = strikeName(family, font)
  // The modal async-work pattern again: aria-busy declares the wait — the
  // wristwatch cursor and assistive tech both read it — until this pick (or
  // a newer one, which then owns the cleanup) resolves.
  charsetWindow.setAttribute('aria-busy', 'true')
  const loaded = await loadStrike(family, font)
  if (pick !== charsetPick) return
  charsetWindow.removeAttribute('aria-busy')
  charsetSpecimen.replaceChildren()
  if (!loaded) {
    charsetSpecimen.style.removeProperty('--vf-font-family')
    charsetSpecimen.style.removeProperty('--vf-font-size')
    charsetSpecimen.style.removeProperty('--vf-paragraph-line-height')
    const note = new VfParagraph()
    note.textContent =
      `fonts/imported/${font.file} didn't load — rebuild the strike with ` +
      'fonts/import-bdf.py, then rerun charset-manifest.py; fonts/README.md ' +
      'has the pipeline.'
    charsetSpecimen.append(note)
    charsetCountEl.textContent = ''
    return
  }
  // The pick, as tokens the vf-paragraph rows read (all whole system px —
  // the components do the × scale): the strike's family, its rect as the
  // 1-px-per-px size, and its native pitch as the line box, so the rows
  // wrap at the strike's own line spacing.
  charsetSpecimen.style.setProperty('--vf-font-family', `'${strikeName(family, font)}'`)
  charsetSpecimen.style.setProperty('--vf-font-size', `${font.line}px`)
  charsetSpecimen.style.setProperty('--vf-paragraph-line-height', `${font.pitch}px`)
  for (const row of charsetRowsOf(font.chars)) {
    const line = new VfParagraph()
    line.textContent = row
    charsetSpecimen.append(line)
  }
  charsetCountEl.textContent = `${[...font.chars].length} characters`
}

function charsetOption(value: string): VfOption {
  const option = document.createElement('vf-option')
  option.value = value
  option.textContent = value
  return option
}

/** Rebuild the Size popup for the current family and mark the current pick. */
function syncSizeOptions(): void {
  charsetSizeSelect.replaceChildren(
    ...charsetFamily.fonts.map((font) => charsetOption(String(font.size)))
  )
  charsetSizeSelect.value = String(charsetFont.size)
}

/** The strike whose size sits nearest a target (ties go to the smaller). */
const nearestStrike = (family: CharsetFamily, target: number): CharsetFont =>
  family.fonts.reduce((best, font) =>
    Math.abs(font.size - target) < Math.abs(best.size - target) ? font : best
  )

const charsetInitial =
  CHARSET_FAMILIES.find((family) => family.label === 'Chicago') ??
  CHARSET_FAMILIES[0]

if (charsetInitial) {
  charsetFamily = charsetInitial
  charsetFont = nearestStrike(charsetInitial, 12)
  charsetFontSelect.replaceChildren(
    ...CHARSET_FAMILIES.map((family) => charsetOption(family.label))
  )
  charsetFontSelect.value = charsetFamily.label
  syncSizeOptions()
  void renderCharset()

  charsetFontSelect.addEventListener('vf-change', (event) => {
    const picked = (event as CustomEvent<{ value: string }>).detail.value
    const family = CHARSET_FAMILIES.find((entry) => entry.label === picked)
    if (!family || family === charsetFamily) return
    // Carry the size across the way a Size menu selection survived a font
    // change: keep it where the new family has the strike, else the nearest.
    charsetFont = nearestStrike(family, charsetFont.size)
    charsetFamily = family
    syncSizeOptions()
    void renderCharset()
  })

  charsetSizeSelect.addEventListener('vf-change', (event) => {
    const picked = Number((event as CustomEvent<{ value: string }>).detail.value)
    const font = charsetFamily.fonts.find((entry) => entry.size === picked)
    if (!font || font === charsetFont) return
    charsetFont = font
    void renderCharset()
  })
} else {
  // The manifest is empty — it was generated before the collection existed.
  const note = new VfParagraph()
  note.textContent =
    'No strikes in demo/charset-manifest.ts — build fonts/imported/ and rerun ' +
    'fonts/charset-manifest.py (fonts/README.md).'
  charsetSpecimen.append(note)
}
