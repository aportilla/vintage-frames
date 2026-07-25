/// <reference types="vite/client" />
/**
 * Behavior for blog.html — the Vintage Frames integration example.
 *
 * The companion to demo.ts. Where that file wires a faux System 7 desktop, this
 * one wires an ordinary blog page whose controls happen to come from the kit:
 * a `vf-menu-bar` used as site nav, `vf-checkbox`/`vf-radio-group`/`vf-list`
 * driving a real filter-sort-search over the article list, a `vf-slider` and
 * `vf-progress-bar` in the sidebar, and a `<form>` whose fields are the kit's
 * form-associated controls.
 *
 * Page CSS is NOT imported here — blog.html loads it with a `<link>` so that
 * `:root { --vf-scale: 1 }` is in scope before the components upgrade. See the
 * comment at the top of blog.html.
 */
import { applyGridSnap, effectiveScale } from '../src/index.js'
import type {
  VfAlert,
  VfCheckbox,
  VfDialog,
  VfList,
  VfMenuItem,
  VfProgressBar,
  VfRadioGroup,
  VfSeparator,
  VfSlider,
  VfTextField,
} from '../src/index.js'

/** Detail dispatched by `vf-menu-item`'s `vf-menu-select` event. */
interface MenuSelectDetail {
  value: string
  item: VfMenuItem
}

/** Query a required element; fail loudly if the markup drifts. */
function $<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`blog: missing element ${selector}`)
  return el
}

/** Typed reader for the `vf-menu-select` menu event. */
function menuDetail(event: Event): MenuSelectDetail {
  return (event as CustomEvent<MenuSelectDetail>).detail
}

const root = document.documentElement

/* ------------------------------------------------------------------ *
 * Device-pixel grid snapping — on, with the switches to see it work.
 *
 * This page follows the layout contract to the letter (every line-height in
 * whole px, the header label given a fixed width), so with a clean load
 * applyGridSnap() has nothing to correct — verify:grid scores it 45/45 either
 * way. To see the thing actually working you have to break the page first:
 *
 *   ?offgrid          reintroduce the faults the contract exists to prevent —
 *                     a ratio leading, and a fractional offset on the whole
 *                     document. Every component lands off the grid.
 *   ?offgrid&nosnap   the same page with snapping off. This is the comparison:
 *                     A/B these two at 100% zoom and the stepped button
 *                     corners, hairline borders and glyph stems are the tell.
 *
 * Zoom the browser to sweep dpr through fractional values while you look; the
 * corrections re-apply on every density change.
 * ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search)
const snapping = !params.has('nosnap')

if (params.has('offgrid')) {
  const style = document.createElement('style')
  style.textContent = `
    :root { --article-leading: 1.65; }   /* 17px × 1.65 = 28.05px */
    body { padding-left: .4px; padding-top: .4px; }
  `
  document.head.append(style)
}

if (snapping) applyGridSnap()

/* ------------------------------------------------------------------ *
 * Display scale — reported, never set.
 *
 * The page declares no --vf-scale, so every component's ScaleController takes
 * over and writes `3 / devicePixelRatio` on its own host: one system pixel is
 * always exactly 3 device pixels, which is both the true ~72dpi size and the
 * reason the art stays crisp at any density. Read the resolved value off a
 * component rather than the document root — the root does not have one.
 * ------------------------------------------------------------------ */

const scaleReadout = $<HTMLElement>('#scale-readout')
const subscribeButton = $<HTMLElement>('#subscribe')

function reportScale(): void {
  const scale = effectiveScale(subscribeButton)
  const dpr = window.devicePixelRatio
  const height = subscribeButton.getBoundingClientRect().height
  if (height === 0) return // not laid out yet; the observer will call again
  // Count what is actually off the grid right now, the same way verify:grid
  // does — with snapping on this should read 0 whether or not ?offgrid is set.
  let off = 0
  let hosts = 0
  for (const host of document.querySelectorAll('*')) {
    if (!host.tagName.toLowerCase().startsWith('vf-')) continue
    const rect = host.getBoundingClientRect()
    if (!rect.width && !rect.height) continue
    hosts++
    const err = (v: number): number => Math.abs(v * dpr - Math.round(v * dpr))
    if (Math.max(err(rect.left), err(rect.top)) > 0.05) off++
  }
  scaleReadout.textContent =
    `Components self-scaled to --vf-scale ${scale} on this ${dpr}× display ` +
    `(${Math.round(scale * dpr)} device px per system px). ` +
    `The Subscribe button is ${Math.round(height)}px tall next to 17px body copy. ` +
    `Grid snapping ${snapping ? 'ON' : 'OFF'}${params.has('offgrid') ? ', page deliberately off-grid' : ''} — ` +
    `${off} of ${hosts} components off the device-pixel grid.`
}

// Observing the button covers both moments that matter: its first layout, and
// the window moving to a display of a different density — the components
// re-scale themselves, and the readout follows the size they land on.
new ResizeObserver(reportScale).observe(subscribeButton)
reportScale()

// The off-grid count above needs one more nudge than the scale does: a snap
// correction moves components without resizing anything, so nothing the
// ResizeObserver watches changes. Re-read after the sweep has landed, and
// whenever the viewport (and therefore every origin) moves.
requestAnimationFrame(() => requestAnimationFrame(reportScale))
window.addEventListener('resize', () =>
  requestAnimationFrame(() => requestAnimationFrame(reportScale))
)

/* ------------------------------------------------------------------ *
 * Sticky offsets.
 *
 * The harness bar and the site header both stick, and the header's height
 * moves with --vf-scale — its menu bar alone spans 24px to 72px across the
 * switcher's range. Publishing both heights as custom properties lets the CSS
 * derive the sidebar's sticky top and the posts' scroll-margin from them
 * instead of guessing a constant.
 * ------------------------------------------------------------------ */

const harness = $<HTMLElement>('.harness')
const siteHeader = $<HTMLElement>('.site-header')

const publishHeights = (): void => {
  root.style.setProperty('--harness-height', `${harness.offsetHeight}px`)
  root.style.setProperty('--header-height', `${siteHeader.offsetHeight}px`)
}

new ResizeObserver(publishHeights).observe(harness)
new ResizeObserver(publishHeights).observe(siteHeader)
publishHeights()

/* ------------------------------------------------------------------ *
 * The post list: one filter/sort/search pipeline, rendered in place.
 * ------------------------------------------------------------------ */

interface Post {
  el: HTMLElement
  id: string
  topic: string
  /** ISO date — sortable as a plain string. */
  date: string
  minutes: number
  /** Held back until "Load older posts". */
  extra: boolean
  /** Lowercased text, for search. */
  text: string
}

const postList = $<HTMLElement>('#post-list')
const status = $<HTMLElement>('#status')

const posts: Post[] = [
  ...postList.querySelectorAll<HTMLElement>('article.post'),
].map((el) => ({
  el,
  id: el.id,
  topic: el.dataset.topic ?? '',
  date: el.dataset.date ?? '',
  minutes: Number(el.dataset.minutes ?? '0'),
  extra: el.hasAttribute('data-extra'),
  text: (el.textContent ?? '').toLowerCase(),
}))

/**
 * Separators between posts. The ones in the markup seed a pool; re-rendering
 * reuses them and creates more on demand, so the page also covers components
 * built at runtime and moved around the DOM (each disconnect/reconnect runs
 * their controllers again).
 */
const rulePool = [...postList.querySelectorAll<VfSeparator>('vf-separator.post-rule')]

function ruleAt(index: number): VfSeparator {
  const existing = rulePool[index]
  if (existing) return existing
  const created = document.createElement('vf-separator') as VfSeparator
  created.className = 'post-rule'
  rulePool.push(created)
  return created
}

/** Selected topics; empty means "everything". */
const topics = new Set<string>()
let sortBy = 'newest'
let query = ''
let showExtras = false

function compare(a: Post, b: Post): number {
  switch (sortBy) {
    case 'oldest':
      return a.date.localeCompare(b.date)
    case 'shortest':
      return a.minutes - b.minutes || b.date.localeCompare(a.date)
    default:
      return b.date.localeCompare(a.date)
  }
}

function describe(shown: number): string {
  const parts = [`Showing ${shown} of ${posts.length} posts`]
  if (topics.size > 0) parts.push(`topics: ${[...topics].join(', ')}`)
  if (query) parts.push(`search: “${query}”`)
  if (sortBy !== 'newest') parts.push(`sorted by ${sortBy}`)
  return parts.join(' · ')
}

function render(): void {
  const visible = posts
    .filter((post) => {
      if (post.extra && !showExtras) return false
      if (topics.size > 0 && !topics.has(post.topic)) return false
      if (query && !post.text.includes(query)) return false
      return true
    })
    .sort(compare)

  const ordered: Element[] = []
  visible.forEach((post, index) => {
    if (index > 0) ordered.push(ruleAt(index - 1))
    ordered.push(post.el)
  })
  postList.replaceChildren(...ordered)

  status.textContent = visible.length
    ? describe(visible.length)
    : `Nothing matches — ${describe(0).toLowerCase()}`
}

/* ------------------------------------------------------------------ *
 * Topic filter: sidebar checkboxes and the Topics menu are two independent
 * components kept in sync through the same bit of page state.
 * ------------------------------------------------------------------ */

const filterBoxes = [...document.querySelectorAll<VfCheckbox>('vf-checkbox.filter')]
const topicItems = [
  ...document.querySelectorAll<VfMenuItem>('#menu-topics vf-menu-item[checkable]'),
]

function syncTopicUi(): void {
  for (const box of filterBoxes) box.checked = topics.has(box.value)
  for (const item of topicItems) item.checked = topics.has(item.value ?? '')
}

function setTopic(topic: string, on: boolean): void {
  if (on) topics.add(topic)
  else topics.delete(topic)
  syncTopicUi()
  render()
}

for (const box of filterBoxes) {
  box.addEventListener('vf-change', () => setTopic(box.value, box.checked))
}

$<HTMLElement>('#menu-topics').addEventListener('vf-menu-select', (event) => {
  const { value } = menuDetail(event)
  if (value === 'clear-topics') {
    topics.clear()
    syncTopicUi()
    render()
    return
  }
  setTopic(value, !topics.has(value))
})

/* ------------------------------------------------------------------ *
 * Sort, search, archive jump.
 * ------------------------------------------------------------------ */

$<VfRadioGroup>('#sort').addEventListener('vf-change', (event) => {
  sortBy = (event as CustomEvent<{ value: string }>).detail.value
  render()
})

const searchField = $<VfTextField>('#search')

function runSearch(): void {
  query = searchField.value.trim().toLowerCase()
  // A search that would hide the held-back posts is more useful with them in.
  if (query) showExtras = true
  render()
}

searchField.addEventListener('vf-change', runSearch)
$<HTMLElement>('#search-go').addEventListener('click', runSearch)

/** Bring a post into view and flash its heading. */
function jumpTo(id: string): void {
  const post = posts.find((entry) => entry.id === id)
  if (!post) return
  // It may be filtered out or still held back — make sure it is on screen.
  if (post.extra) showExtras = true
  if (topics.size > 0 && !topics.has(post.topic)) topics.add(post.topic)
  if (query) {
    query = ''
    searchField.value = ''
  }
  syncTopicUi()
  render()

  post.el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  post.el.classList.add('is-flagged')
  window.setTimeout(() => post.el.classList.remove('is-flagged'), 1200)
}

const archive = $<VfList>('#archive')
archive.addEventListener('vf-change', (event) => {
  jumpTo((event as CustomEvent<{ value: string }>).detail.value)
})

$<HTMLElement>('#menu-archive').addEventListener('vf-menu-select', (event) => {
  const { value } = menuDetail(event)
  if (value === 'all-posts') {
    topics.clear()
    query = ''
    searchField.value = ''
    showExtras = true
    syncTopicUi()
    render()
    return
  }
  const year = value.replace('year-', '')
  query = ''
  searchField.value = ''
  showExtras = true
  const match = posts.find((post) => post.date.startsWith(year))
  render()
  if (match) jumpTo(match.id)
  else status.textContent = `No posts from ${year}.`
})

/* ------------------------------------------------------------------ *
 * Sidebar odds and ends.
 * ------------------------------------------------------------------ */

const textSize = $<VfSlider>('#text-size')
const textSizeReadout = $<HTMLElement>('#text-size-readout')

// A kit control driving ordinary page CSS. The leading moves with the size as
// a whole number rather than a ratio: a fractional line box would push every
// control below the article column off the device grid (see blog.css).
textSize.addEventListener('vf-input', (event) => {
  const { value } = (event as CustomEvent<{ value: number }>).detail
  root.style.setProperty('--article-size', `${value}px`)
  root.style.setProperty('--article-leading', `${value + 11}px`)
  textSizeReadout.textContent = `${value}px`
})

const progress = $<VfProgressBar>('#progress')
const progressReadout = $<HTMLElement>('#progress-readout')
const postsColumn = $<HTMLElement>('#posts')

function updateProgress(): void {
  const rect = postsColumn.getBoundingClientRect()
  const scrolled = -rect.top
  const travel = rect.height - window.innerHeight
  const pct = travel <= 0 ? 100 : Math.min(100, Math.max(0, (scrolled / travel) * 100))
  progress.value = pct
  progressReadout.textContent = `${Math.round(pct)}%`
}

window.addEventListener('scroll', updateProgress, { passive: true })
window.addEventListener('resize', updateProgress)

$<HTMLElement>('#random').addEventListener('click', () => {
  const pool = posts.filter((post) => post.el.isConnected)
  const pick = pool[Math.floor(Math.random() * pool.length)]
  if (pick) jumpTo(pick.id)
})

$<HTMLElement>('#top-of-page').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

const loadMore = $<HTMLElement>('#load-more')
loadMore.addEventListener('click', () => {
  showExtras = true
  loadMore.setAttribute('disabled', '')
  render()
})

/* ------------------------------------------------------------------ *
 * Per-post actions.
 * ------------------------------------------------------------------ */

const saved = new Set<string>()

postList.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLElement>('[data-action]')
  if (!button) return
  const id = button.dataset.post ?? ''
  if (button.dataset.action === 'save') {
    const nowSaved = !saved.has(id)
    if (nowSaved) saved.add(id)
    else saved.delete(id)
    button.textContent = nowSaved ? 'Unsave' : 'Save'
    document.querySelector(`[data-saved-for="${id}"]`)?.toggleAttribute('hidden', !nowSaved)
    return
  }
  status.textContent = `Link to “${id}” would be copied here.`
})

/* ------------------------------------------------------------------ *
 * Dialogs and the alert.
 * ------------------------------------------------------------------ */

const subscribeDialog = $<VfDialog>('#dlg-subscribe')
const subscribeEmail = $<VfTextField>('#sub-email')
const aboutDialog = $<VfDialog>('#dlg-about')
const noteAlert = $<VfAlert>('#alert-note')
const alertMessage = $<HTMLElement>('#alert-message')

$<HTMLElement>('#subscribe').addEventListener('click', () => subscribeDialog.show())
$<HTMLElement>('#sub-cancel').addEventListener('click', () => subscribeDialog.close())
$<HTMLElement>('#sub-confirm').addEventListener('click', () => {
  const email = subscribeEmail.value.trim()
  subscribeDialog.close()
  status.textContent = email
    ? `Subscribed ${email}. (Not really — this is a demo.)`
    : 'Subscription needs an email address.'
})

$<HTMLElement>('#menu-about').addEventListener('vf-menu-select', (event) => {
  const { value } = menuDetail(event)
  if (value !== 'about' && value !== 'colophon') return
  $<HTMLElement>('#about-scale').textContent =
    `Rendering at --vf-scale ${effectiveScale(aboutDialog)} on a ${window.devicePixelRatio}× display.`
  aboutDialog.show()
})
$<HTMLElement>('#about-ok').addEventListener('click', () => aboutDialog.close())

function warn(message: string): void {
  alertMessage.textContent = message
  noteAlert.show()
}

$<HTMLElement>('#alert-ok').addEventListener('click', () => noteAlert.close())

/* ------------------------------------------------------------------ *
 * The comment form.
 *
 * vf-text-field, vf-text-area and vf-checkbox are form-associated, so a plain
 * `new FormData(form)` reads them by name with no page glue — and the kit's
 * submit/reset buttons drive the native form the same way `<button>` would.
 * ------------------------------------------------------------------ */

const commentForm = $<HTMLFormElement>('#comment-form')
const notes = $<HTMLElement>('#notes')

commentForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const data = new FormData(commentForm)
  const name = String(data.get('name') ?? '').trim()
  const body = String(data.get('note') ?? '').trim()

  if (!body) return warn('A note needs some text before you can post it.')
  if (!name) return warn('Add a name so people know who wrote the note.')

  const item = document.createElement('li')
  const who = document.createElement('p')
  who.className = 'notes__who'
  who.textContent = data.get('notify') === 'yes' ? `${name} · following replies` : name
  const text = document.createElement('p')
  text.className = 'notes__body'
  text.textContent = body
  item.append(who, text)
  notes.prepend(item)

  commentForm.reset()
  status.textContent = 'Note posted.'
})

/* ------------------------------------------------------------------ *
 * First paint.
 * ------------------------------------------------------------------ */

render()
updateProgress()
