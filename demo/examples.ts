/**
 * Behavior for examples.html — the Vintage Frames component reference.
 *
 * The third demo page. index.html is the faux desktop, blog.html the ordinary
 * page a consumer actually has; this one is the manual: every component, its
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
 * Page CSS is NOT imported here — examples.html loads it with a `<link>` so
 * that `:root { --vf-scale: 1 }` is in scope before the components upgrade
 * (see the note at the top of examples.css).
 */
import {
  applyGridSnap,
  prefersReducedMotion,
  requestGridSnap,
} from '../src/index.js'
import type { VfProgressBar } from '../src/index.js'

/** Query a required element; fail loudly if the markup drifts. */
function $<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`examples: missing element ${selector}`)
  return el
}

/* ------------------------------------------------------------------ *
 * Device-pixel grid snapping.
 *
 * On by default. The page follows the layout contract (whole-px line boxes
 * throughout examples.css), so there is usually nothing to correct — but a
 * documentation page is exactly where a component ends up in a flex row it
 * did not expect, and snapping is what keeps that from smearing the 1-bit
 * art. Load with ?nosnap to turn it off and A/B at 100% zoom.
 * ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search)
if (!params.has('nosnap')) applyGridSnap()

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
  const lines = template.innerHTML.replace(/\r/g, '').split('\n')
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop()

  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => /^ */.exec(line)?.[0].length ?? 0)
  const pad = indents.length > 0 ? Math.min(...indents) : 0

  return lines
    .map((line) => line.slice(pad))
    .join('\n')
    .replace(/ ([a-z-]+)=""/g, (match, name: string) =>
      name === 'alt' ? match : ` ${name}`
    )
}

/**
 * Replace every `<template data-example>` with the figure it describes.
 *
 * Options come off the template's dataset:
 *   `data-stage`   — extra stage modifiers, space separated (`desktop`,
 *                    `column`, `flush`, `gapless`)
 *   `data-caption` — a line of documentation above the specimen
 *   `data-source`  — `"hidden"` collapses the markup block
 */
function mountExamples(): void {
  const templates = document.querySelectorAll<HTMLTemplateElement>(
    'template[data-example]'
  )

  for (const template of templates) {
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

    const details = document.createElement('details')
    details.className = 'example__src'
    details.open = template.dataset.source !== 'hidden'
    const summary = document.createElement('summary')
    summary.textContent = 'Markup'
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = sourceOf(template)
    pre.append(code)
    details.append(summary, pre)
    figure.append(details)

    template.replaceWith(figure)
  }
}

/* ------------------------------------------------------------------ *
 * Generic demo hooks.
 * ------------------------------------------------------------------ */

/** Every event the kit dispatches, for the live event logs. */
const VF_EVENTS = [
  'vf-input',
  'vf-change',
  'vf-close',
  'vf-zoom',
  'vf-menu-select',
  'vf-select',
  'vf-open',
  'vf-name-too-long',
  'vf-name-rejected',
] as const

/** A modal shell — `vf-dialog` and `vf-alert` share this much. */
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
wireReadouts()
wireEventLogs()
wireProgress()

// The examples were inserted after the page's own load-time snap pass.
requestGridSnap()
