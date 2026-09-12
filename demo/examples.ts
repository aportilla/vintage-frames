/**
 * Behavior for index.html — the Vintage Frames component reference.
 *
 * The kit's own root page — the manual: every component, its
 * custom API, and a live specimen of each state that can be shown standing
 * still.
 *
 * Almost nothing here is example-specific. The page authors each demo as an
 * inert `<template data-example>`, and this file does three things with it:
 *
 *   1. clones it into a live stage, so the demo runs;
 *   2. prints the template's own markup underneath as the code sample, so the
 *      sample cannot drift from the thing above it — they are one source;
 *   3. wires the few generic hooks a demo can ask for by attribute
 *      (`data-show`, `data-close`, `data-value-of`, `data-log`, …).
 *
 * Page CSS is NOT imported here — index.html loads it with a `<link>`, so
 * anything it declared in `:root` would be in scope before the components
 * upgrade, which is what a page pinning --vf-scale would need. This page pins
 * nothing (see the note at the top of examples.css): the specimens are shown
 * in their default state, self-scaled to true size.
 */
import {
  effectiveScale,
  getZoom,
  onScaleChange,
  prefersReducedMotion,
  requestGridSnap,
  truePixelRatio,
} from '../src/index.js'
import type {
  VfDesktop,
  VfIcon,
  VfIconDragDetail,
  VfIconField,
  VfIconMove,
  VfProgressBar,
  VfWindow,
} from '../src/index.js'

/** Query a required element; fail loudly if the markup drifts. */
function $<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`examples: missing element ${selector}`)
  return el
}

/* ------------------------------------------------------------------ *
 * Device-pixel grid snapping.
 *
 * Always on — the components snap themselves. The page follows the layout
 * contract (whole-px line boxes throughout examples.css), so there is usually
 * nothing to correct — but a documentation page is exactly where a component
 * ends up in a flex row it did not expect, and snapping is what keeps that
 * from smearing the 1-bit art. Load with ?nosnap to opt every element out
 * (the per-element `nosnap` attribute, applied page-wide) and A/B at 100%
 * zoom. The sweep runs after the stages below are built; elements created
 * later are not opted out.
 * ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search)
if (params.has('nosnap')) {
  queueMicrotask(() => {
    for (const el of document.querySelectorAll('*')) {
      if (el.tagName.toLowerCase().startsWith('vf-')) el.setAttribute('nosnap', '')
    }
  })
}

/* ------------------------------------------------------------------ *
 * Examples: template → live stage + its own markup as the code sample.
 * ------------------------------------------------------------------ */

/**
 * The template's markup, dedented and tidied for display.
 *
 * `innerHTML` on a `<template>` serializes its inert content, so what comes
 * back is what the page author wrote — no reflected attributes, no upgraded
 * state, no shadow DOM. The one cosmetic fix is the serializer's `attr=""`
 * for boolean attributes, which is correct HTML but not how anyone writes
 * `movable`. `alt=""` is left alone: there the empty value is the meaning.
 */
function sourceOf(template: HTMLTemplateElement): string {
  return dedent(template.innerHTML).replace(/ ([a-z-]+)=""/g, (match, name: string) =>
    name === 'alt' ? match : ` ${name}`
  )
}

/** Drop the leading and trailing blank lines and the common indent. */
function dedent(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n')
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop()

  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => /^ */.exec(line)?.[0].length ?? 0)
  const pad = indents.length > 0 ? Math.min(...indents) : 0

  return lines.map((line) => line.slice(pad)).join('\n')
}

/** A collapsible source block under the stage — "Markup", "Script". */
function sourceBlock(label: string, code: string, open: boolean): HTMLDetailsElement {
  const details = document.createElement('details')
  details.className = 'example__src'
  details.open = open
  const summary = document.createElement('summary')
  summary.textContent = label
  const pre = document.createElement('pre')
  const codeEl = document.createElement('code')
  codeEl.textContent = code
  pre.append(codeEl)
  details.append(summary, pre)
  return details
}

/**
 * Replace every `<template data-example>` with the figure it describes.
 *
 * Options come off the template's dataset:
 *   `data-stage`   — extra stage modifiers, space separated (`desktop`,
 *                    `column`, `flush`, `gapless`)
 *   `data-caption` — a line of documentation above the specimen
 *   `data-source`  — `"hidden"` collapses the markup block
 *
 * A demo whose behavior needs page script beyond what its markup's own
 * properties enable carries that script as a `<script type="text/plain"
 * data-script>` child of the template — the last child, so lifting it out
 * leaves no blank line in the markup — and it is shown under the markup as
 * a second block, "Script". Inert twice over (template content, and a
 * non-script type), never what the page runs: each shows the API surface
 * the demo rests on, written the way a page would write it — the elements
 * by name, an `app` object standing for the page's own state — and not the
 * `data-*` hooks below that actually drive the demo, which are this page's
 * glue.
 */
function mountExamples(): void {
  const templates = document.querySelectorAll<HTMLTemplateElement>(
    'template[data-example]'
  )

  for (const template of templates) {
    const script = template.content.querySelector('script[data-script]')
    script?.remove()

    const figure = document.createElement('figure')
    figure.className = 'example'

    const caption = template.dataset.caption
    if (caption !== undefined && caption !== '') {
      const el = document.createElement('figcaption')
      el.className = 'example__caption'
      el.textContent = caption
      figure.append(el)
    }

    const stage = document.createElement('div')
    stage.className = 'example__stage'
    for (const modifier of (template.dataset.stage ?? '').split(' ')) {
      if (modifier !== '') stage.classList.add(`example__stage--${modifier}`)
    }
    stage.append(template.content.cloneNode(true))
    figure.append(stage)

    figure.append(sourceBlock('Markup', sourceOf(template), template.dataset.source !== 'hidden'))
    if (script) figure.append(sourceBlock('Script', dedent(script.textContent ?? ''), true))

    template.replaceWith(figure)
  }
}

/* ------------------------------------------------------------------ *
 * Generic demo hooks.
 * ------------------------------------------------------------------ */

/**
 * Every event the kit dispatches, for the live event logs — except `vf-drag`,
 * which fires on every lattice step of a drag and would bury the rest.
 */
const VF_EVENTS = [
  'vf-input',
  'vf-change',
  'vf-close',
  'vf-zoom',
  'vf-resize',
  'vf-menu-select',
  'vf-select',
  'vf-open',
  'vf-name-too-long',
  'vf-name-rejected',
  'vf-drag-start',
  'vf-drop',
  'vf-drag-cancel',
] as const

/** A modal shell — the `show()`/`close()` pair `data-show`/`data-close` drive. */
interface Modal extends HTMLElement {
  show(): void
  close(): void
}

/**
 * `data-show` / `data-close` on any element: open or close the modal named by
 * the selector. Page glue only — the API being demonstrated is the
 * `show()` / `close()` pair on the modal itself.
 */
function wireModalTriggers(): void {
  for (const trigger of document.querySelectorAll<HTMLElement>('[data-show]')) {
    trigger.addEventListener('click', () => {
      $<Modal>(trigger.dataset.show ?? '').show()
    })
  }
  for (const trigger of document.querySelectorAll<HTMLElement>('[data-close]')) {
    trigger.addEventListener('click', () => {
      $<Modal>(trigger.dataset.close ?? '').close()
    })
  }
}

/**
 * `data-hide-on-close` on a `vf-window`: the close box hides it, since the
 * component deliberately does not remove itself (the consumer decides — see
 * the `vf-close` row in its events table). `data-reopen` puts it back.
 */
function wireWindowClosing(): void {
  for (const win of document.querySelectorAll<HTMLElement>(
    '[data-hide-on-close]'
  )) {
    win.addEventListener('vf-close', () => {
      win.hidden = true
    })
  }
  for (const button of document.querySelectorAll<HTMLElement>('[data-reopen]')) {
    button.addEventListener('click', () => {
      $<HTMLElement>(button.dataset.reopen ?? '').hidden = false
    })
  }
}

/**
 * `data-size-readout` on a window's `slot="status"` element: mirror the
 * window's size in system px from `vf-resize` — the status bar and the
 * resize event working as the pair they were built to be.
 */
function wireSizeReadouts(): void {
  for (const readout of document.querySelectorAll<HTMLElement>(
    '[data-size-readout]'
  )) {
    readout.closest('vf-window')?.addEventListener('vf-resize', (event) => {
      const { width, height } = (
        event as CustomEvent<{ width: number; height: number }>
      ).detail
      readout.textContent = `${width}px x ${height}px`
    })
  }
}

/**
 * `data-value-src="<id>"` on a readout: mirror that control's current value.
 * `data-value-prop` picks a different property (`values`, `checked`).
 *
 * (`data-value-of` would be the obvious name and is unusable: it lands on
 * `dataset.valueOf`, which every object already has.)
 *
 * One document-level listener serves every readout on the page: the kit's
 * events are `bubbles: true, composed: true` by convention, so they all
 * arrive here whatever shadow root they started in.
 */
function wireReadouts(): void {
  const readouts = document.querySelectorAll<HTMLElement>('[data-value-src]')
  if (readouts.length === 0) return

  const refresh = (): void => {
    for (const readout of readouts) {
      const source = document.getElementById(readout.dataset.valueSrc ?? '')
      if (!source) continue
      const prop = readout.dataset.valueProp ?? 'value'
      const value = (source as unknown as Record<string, unknown>)[prop]
      readout.textContent = `${source.localName}.${prop} = ${JSON.stringify(value ?? null)}`
    }
  }

  for (const type of VF_EVENTS) document.addEventListener(type, refresh)
  // Components report their value once they have upgraded and rendered.
  requestAnimationFrame(refresh)
}

/**
 * `data-log` on a `<pre>`: log every `vf-*` event dispatched inside the same
 * example. The convention being demonstrated is that they bubble and compose,
 * so one listener on the stage sees all of them.
 */
function wireEventLogs(): void {
  for (const log of document.querySelectorAll<HTMLElement>('[data-log]')) {
    const stage = log.closest('.example__stage')
    if (!stage) continue

    for (const type of VF_EVENTS) {
      stage.addEventListener(type, (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail
        const target = event.target as HTMLElement
        const line = `${type.padEnd(15)}${target.localName.padEnd(17)}${JSON.stringify(detail, replaceElements)}\n`
        log.textContent = line + (log.textContent ?? '')
      })
    }
  }
}

/** `vf-menu-select` carries the item element itself; print it as a tag name. */
function replaceElements(_key: string, value: unknown): unknown {
  return value instanceof HTMLElement ? `<${value.localName}>` : value
}

/**
 * `data-filing` on a `vf-desktop`: file icons across its fields by drag and
 * drop — the page's half of the Finder drag, which the kit deliberately
 * leaves to the page (it reports the gesture; folders are the page's own
 * catalog). A `vf-window` holding a `vf-icon-field` is a folder window; a
 * `vf-icon` carrying `data-folder="<id>"` is the folder that opens it.
 *
 * Under a drag the folder icon under the pointer wears `target`. At the
 * drop: icons let go over a folder icon are filed into that folder's
 * window; ones let go over a folder window are placed there where their
 * outlines were (`placementAt`, handed the member so an `origin` it carries
 * is folded in); ones let go on the desktop are placed on the desktop's
 * field the same way. The whole set travels — `detail.icons`, the dragged
 * icon first — and each member lands where its own outline was: its box
 * translated by the delta the leader's `x`/`y` carry. In each case the
 * handler cancels the default action and does the writes itself.
 * A drop on the container the icons already sit in is left to the kit: the
 * default action moves them.
 */
function wireFiling(): void {
  for (const desktop of document.querySelectorAll<VfDesktop>('vf-desktop[data-filing]')) {
    const desktopField = desktop.querySelector<HTMLElement>(':scope > vf-icon-field')
    const isFolderIcon = (el: Element): el is VfIcon =>
      el.localName === 'vf-icon' && (el as HTMLElement).dataset.folder !== undefined
    const isFolderWindow = (el: Element): el is VfWindow =>
      el.localName === 'vf-window' && el.querySelector('vf-icon-field') !== null

    /** What is under the pointer, the travelling icons themselves skipped. */
    const under = (x: number, y: number, skip: readonly Element[]) => {
      const stack = document.elementsFromPoint(x, y).filter((el) => !skip.includes(el))
      return {
        folder: stack.find(isFolderIcon) ?? null,
        window: stack.find(isFolderWindow) ?? null,
        desktop: stack.includes(desktop),
      }
    }
    const countItems = (win: VfWindow): void => {
      const readout = win.querySelector<HTMLElement>('[data-item-count]')
      if (!readout) return
      const n = win.querySelectorAll('vf-icon').length
      readout.textContent = `${n} item${n === 1 ? '' : 's'}`
    }
    let target: VfIcon | null = null
    const highlight = (next: VfIcon | null): void => {
      if (target === next) return
      if (target) target.target = false
      target = next
      if (target) target.target = true
    }

    desktop.addEventListener('vf-drag', (event) => {
      const { clientX, clientY, icons } = (event as CustomEvent<VfIconDragDetail>).detail
      const hit = under(clientX, clientY, icons)
      highlight(hit.folder ?? null)
    })
    desktop.addEventListener('vf-drag-cancel', () => highlight(null))
    desktop.addEventListener('vf-drop', (event) => {
      const icon = event.target as VfIcon
      const { clientX, clientY, x, y, icons } = (event as CustomEvent<VfIconDragDetail>).detail
      const hit = under(clientX, clientY, icons)
      highlight(null)
      const from = icon.closest('vf-window')

      // Where each member's outline was: its own box, translated by the
      // delta the leader's x/y carry. Measured before anything moves.
      const lead = icon.getBoundingClientRect()
      const landings = icons.map((member) => {
        const r = member.getBoundingClientRect()
        return { member, x: r.left + (x - lead.left), y: r.top + (y - lead.top) }
      })
      // Held at the container's origin: a member whose outline was let go
      // partly past the plane's edge lands on it rather than under it.
      const place = (
        field: Element,
        at: (landing: (typeof landings)[number], i: number) => { left: number; top: number }
      ): void => {
        landings.forEach((landing, i) => {
          const { left, top } = at(landing, i)
          field.append(landing.member)
          landing.member.left = Math.max(0, left)
          landing.member.top = Math.max(0, top)
        })
      }

      if (hit.folder) {
        // Into the folder: the next free cells of its window's field.
        const win = document.getElementById(hit.folder.dataset.folder ?? '') as VfWindow | null
        const field = win?.querySelector('vf-icon-field')
        if (!win || !field) return
        event.preventDefault()
        const n = field.querySelectorAll('vf-icon').length
        place(field, (_, i) => ({
          left: 16 + ((n + i) % 3) * 80,
          top: 16 + Math.floor((n + i) / 3) * 64,
        }))
        countItems(win)
        if (from && from !== win) countItems(from)
        return
      }
      if (hit.window && hit.window !== from) {
        // Into a folder window, where the outlines were let go.
        const field = hit.window.querySelector('vf-icon-field')
        if (!field) return
        event.preventDefault()
        const win = hit.window
        place(field, (landing) => win.placementAt(landing.x, landing.y, landing.member))
        countItems(win)
        if (from) countItems(from)
        return
      }
      if (!hit.window && hit.desktop && from && desktopField) {
        // Out onto the desktop, where the outlines were let go.
        event.preventDefault()
        place(desktopField, (landing) =>
          desktop.placementAt(landing.x, landing.y, landing.member)
        )
        countItems(from)
      }
      // Otherwise: the same container they came from — the kit's default
      // action moves them.
    })
  }
}

/**
 * `data-clean-up` on a `vf-desktop`: Special's item names its object — Clean
 * Up Window while a folder window is active, Clean Up Desktop after a press
 * on the bare desktop (`clearActive()`, the FINDER rule) — and walks that
 * container's icons onto the page's own lattice through the kit's walk
 * (`vf-icon-field.dragIcons`). The split is the one the Finder drag makes:
 * the kit owns the outline, the cadence and the landing; the page owns the
 * cells and the order, since the kit ships no lattice. Each icon takes the
 * nearest free cell to where it sits — an alignment, never a re-flow —
 * served in the lattice's reading order (row, then column), which is also
 * the order the walk takes. An icon already on its cell is handed over too:
 * a move that shows nothing takes no beat. A window's lattice has as many
 * rows as it takes; a cell below the fold is reached by the rail, since a
 * scrolling plane holds only the origin.
 */
function wireCleanUp(): void {
  for (const desktop of document.querySelectorAll<VfDesktop>('vf-desktop[data-clean-up]')) {
    const desktopField = desktop.querySelector<VfIconField>(':scope > vf-icon-field')
    const item = desktop.querySelector<HTMLElement>('vf-menu-item[value="clean-up"]')
    if (!desktopField || !item) continue
    const folder = (): VfWindow | null => {
      const win = desktop.activeWindow as VfWindow | null
      return win?.querySelector('vf-icon-field') ? win : null
    }
    const label = (): void => {
      item.textContent = folder() ? 'Clean Up Window' : 'Clean Up Desktop'
    }
    desktop.addEventListener('vf-activate', label)
    // A press on the desktop's own field — its dither or one of its icons —
    // clicks the Finder: no window is active.
    desktop.addEventListener('pointerdown', (event) => {
      if (event.composedPath().includes(desktopField)) desktop.clearActive()
    })
    label()
    desktop.addEventListener('vf-menu-select', (event) => {
      if ((event as CustomEvent<{ value: string }>).detail.value !== 'clean-up') return
      const win = folder()
      const field = win?.querySelector<VfIconField>('vf-icon-field') ?? desktopField
      const grid = win ? windowLattice(field) : desktopLattice(desktop)
      const icons = [...field.querySelectorAll<VfIcon>(':scope > vf-icon')]
      void field.dragIcons(cleanUpMoves(icons, grid))
    })
  }
}

/** The page's lattice: cell (0,0), the pitch, and how many cells fit. */
interface Lattice {
  left: number
  top: number
  dx: number
  dy: number
  cols: number
  rows: number
}

/** The desktop's: 16 in from the edges and below the 20px menu bar, on the Finder's 80 × 72 pitch. */
function desktopLattice(desktop: VfDesktop): Lattice {
  const edge = 16
  const cell = { width: 64, height: 44 }
  const left = edge
  const top = 20 + edge
  const dx = 80
  const dy = 72
  return {
    left,
    top,
    dx,
    dy,
    cols: Math.max(1, Math.floor(((desktop.width ?? 512) - edge - left - cell.width) / dx) + 1),
    rows: Math.max(1, Math.floor(((desktop.height ?? 342) - edge - top - cell.height) / dy) + 1),
  }
}

/**
 * A window's: from the plane's corner, as many columns as the plane's width
 * holds (the filled field is exactly that wide) and as many rows as it takes.
 */
function windowLattice(field: VfIconField): Lattice {
  const width = field.getBoundingClientRect().width / effectiveScale(field)
  return {
    left: 16,
    top: 16,
    dx: 80,
    dy: 72,
    cols: Math.max(1, Math.floor((width - 16 - 64) / 80) + 1),
    rows: Infinity,
  }
}

/** Each icon to the nearest free cell, in the lattice's reading order. */
function cleanUpMoves(icons: readonly VfIcon[], grid: Lattice): VfIconMove[] {
  const clamp = (v: number, max: number): number => Math.min(Math.max(v, 0), max)
  const key = (col: number, row: number): string => `${col},${row}`
  const taken = new Set<string>()
  const wanted = icons
    .map((icon) => {
      const left = icon.left ?? 0
      const top = icon.top ?? 0
      return {
        icon,
        left,
        top,
        col: clamp(Math.round((left - grid.left) / grid.dx), grid.cols - 1),
        row: clamp(Math.round((top - grid.top) / grid.dy), grid.rows - 1),
      }
    })
    .sort((a, b) => a.row - b.row || a.col - b.col)
  const moves = wanted.map((want) => {
    // Rings outward from the ideal cell; within a ring, the cell nearest the
    // icon's actual position wins. The icons before this one hold at most
    // that many cells, so a free one lies within that many rings of any
    // lattice that has one; more icons than cells stack on the ideal.
    let cell = { col: want.col, row: want.row }
    search: for (let r = 0; r <= icons.length; r++) {
      let best: { col: number; row: number; d: number } | null = null
      for (let col = want.col - r; col <= want.col + r; col++) {
        for (let row = want.row - r; row <= want.row + r; row++) {
          if (Math.max(Math.abs(col - want.col), Math.abs(row - want.row)) !== r) continue
          if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue
          if (taken.has(key(col, row))) continue
          const d = Math.hypot(grid.left + col * grid.dx - want.left, grid.top + row * grid.dy - want.top)
          if (!best || d < best.d) best = { col, row, d }
        }
      }
      if (best) {
        cell = best
        break search
      }
    }
    taken.add(key(cell.col, cell.row))
    return { icon: want.icon, cell, left: grid.left + cell.col * grid.dx, top: grid.top + cell.row * grid.dy }
  })
  return moves
    .sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col)
    .map(({ icon, left, top }) => ({ icon, left, top }))
}

/* ------------------------------------------------------------------ *
 * The zoom readout — the one snippet on the page that rewrites itself.
 *
 * The Zoom part of "Sizing and the device-pixel grid" invites the reader to
 * zoom the page and watch the target move, so this line has to report the
 * numbers the kit is actually rendering with: the resolved
 * --vf-scale off a live component, the tracked zoom, and trueDpr (device px
 * per CSS px INCLUDING zoom — what devicePixelRatio stops being in Safari
 * under zoom). onScaleChange is the one subscription that covers every way
 * these can move: a zoom in either engine's dialect, and a monitor move,
 * which changes the grid without changing the scale.
 * ------------------------------------------------------------------ */

function wireZoomReadout(): void {
  const readout = document.getElementById('zoom-readout')
  if (!readout) return
  // Any component serves as the probe — scaling is per component, and the
  // masthead label is the first one on the page.
  const probe = document.querySelector('vf-label')
  const refresh = (): void => {
    if (!probe) return
    const zoom = getZoom()
    const trueDpr = truePixelRatio()
    const scale = effectiveScale(probe)
    const density = Math.round((trueDpr / zoom) * 100) / 100
    readout.textContent =
      `--vf-scale ${Math.round(scale * 10000) / 10000} · ` +
      `${Math.round(zoom * 100)}% zoom on a ${density}× display · ` +
      `1 system px = ${Math.round(scale * trueDpr)} device px`
  }
  // A frame after the change, not during it: this module subscribed before
  // the components upgraded, so its listener runs before their controllers
  // have rewritten --vf-scale, and an immediate read reports the old scale.
  // Page-lifetime glue; nothing to clean up.
  onScaleChange(() => requestAnimationFrame(refresh))
  requestAnimationFrame(refresh)
}

/* ------------------------------------------------------------------ *
 * Table of contents + scroll spy.
 * ------------------------------------------------------------------ */

function buildToc(): void {
  const toc = $<HTMLElement>('#toc')
  const sections = document.querySelectorAll<HTMLElement>('section.doc[id]')
  const links = new Map<string, HTMLAnchorElement>()
  let group = ''
  let list: HTMLOListElement | null = null

  for (const section of sections) {
    const sectionGroup = section.dataset.group ?? ''
    if (sectionGroup !== group || list === null) {
      group = sectionGroup
      if (group !== '') {
        const heading = document.createElement('h2')
        heading.textContent = group
        toc.append(heading)
      }
      list = document.createElement('ol')
      toc.append(list)
    }

    const link = document.createElement('a')
    link.href = `#${section.id}`
    const title = section.dataset.toc ?? section.querySelector('h2')?.textContent ?? section.id
    if (title.startsWith('vf-')) {
      const code = document.createElement('code')
      code.textContent = title
      link.append(code)
    } else {
      link.textContent = title
    }

    const item = document.createElement('li')
    item.append(link)
    list.append(item)
    links.set(section.id, link)
  }

  // Scroll spy: the topmost section intersecting the scrollport wins. The
  // document does not scroll — <main> is the page's scroll container at every
  // width (examples.css, "Page frame") — so it is the observer's root.
  const scroller = $<HTMLElement>('.main')
  const visible = new Set<string>()
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).id
        if (entry.isIntersecting) visible.add(id)
        else visible.delete(id)
      }
      let current: string | null = null
      for (const section of sections) {
        if (visible.has(section.id)) {
          current = section.id
          break
        }
      }
      for (const [id, link] of links) {
        if (id === current) link.setAttribute('aria-current', 'true')
        else link.removeAttribute('aria-current')
      }
    },
    { root: scroller, rootMargin: '-24px 0px -70% 0px' }
  )
  for (const section of sections) observer.observe(section)
}

/* ------------------------------------------------------------------ *
 * The one demo that has to move: a determinate bar filling.
 * ------------------------------------------------------------------ */

function wireProgress(): void {
  const bar = document.getElementById('ex-progress-live') as VfProgressBar | null
  if (!bar) return
  if (prefersReducedMotion()) {
    bar.value = 60
    return
  }
  window.setInterval(() => {
    bar.value = bar.value >= 100 ? 0 : bar.value + 2
  }, 120)
}

/* ------------------------------------------------------------------ *
 * Boot.
 * ------------------------------------------------------------------ */

mountExamples()
buildToc()
wireModalTriggers()
wireWindowClosing()
wireSizeReadouts()
wireReadouts()
wireEventLogs()
wireFiling()
wireCleanUp()
wireProgress()
wireZoomReadout()

// The examples were inserted after the page's own load-time snap pass.
requestGridSnap()
