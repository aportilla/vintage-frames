/**
 * The page-drawn cursor — the System 7 pointers as pixel art locked to the
 * system-pixel grid. `applyCursor()` is the one call a page makes, the same
 * shape as `applyScale()`: strictly opt-in, returns a
 * cleanup function, and ships working defaults — the embedded arrow, I-beam,
 * crosshair and wristwatch (`src/cursor-art.ts`), each overridable with the
 * consumer's own art per kind.
 *
 * Why a drawn element and not `cursor: url(…)`: the OS composites a CSS
 * cursor image at the pointer's own device position with engine-chosen
 * filtering — any device pixel, any magnification, never in phase with a
 * desktop raster's lattice, and blind to the kit's zoom-following. So the
 * native pointer is hidden instead — a page-wide
 * `* { cursor: none !important }` blanket for the light DOM (the UA sheets
 * put cursors on `<button>` and `<input>`, and an element's own declaration
 * beats anything inherited) plus the kit-wide `--vf-cursor` token for the
 * shadow trees and the top layer (SPEC §3), both applied here, only once the
 * arrow has decoded, so a broken option never strands a cursorless page —
 * and the cursor is a real element, placed the way the kit places
 * everything: whole system pixels, anchored to the desktop's origin so its
 * art shares the raster's grid phase, one art px = `scale × trueDpr` device
 * px. The honest cost is that an element repaints a frame behind the
 * hardware cursor — on a machine that moved its cursor at VBL pace, arguably
 * part of the emulation.
 *
 * The element is a `popover="manual"`, so it rides the top layer above every
 * window and fixed-position menu panel without a z-index war. A modal
 * dialog enters the top layer *later* and would cover it, so the overlay
 * re-promotes itself (hide + show) whenever a `VfModalDialog`'s reflected
 * `open` attribute appears.
 *
 * ## Cursor states
 *
 * Four kinds — `arrow`, `text`, `crosshair`, `wait` — and a kind whose art
 * is missing (passed `null`, or failed to load) falls back to the arrow.
 * What decides the kind under the pointer, in priority order:
 *
 *  1. **`wait` — declared with `aria-busy="true"`.** The standard
 *     vocabulary, so assistive tech hears the same state the wristwatch
 *     shows. Put it on the surface doing the work for as long as the work
 *     runs: a `vf-dialog` mid-save shows the watch over the whole modal (a
 *     busy open modal counts everywhere, since its backdrop covers the
 *     page); `aria-busy` on any region shows it over that region; on
 *     `<body>`, app-wide.
 *  2. **An explicit claim — `data-vf-cursor="arrow|text|crosshair|wait"`.**
 *     The opt-in channel for a component or a page region: state it on the
 *     element (light or shadow — the walk crosses shadow boundaries), and
 *     the claim nearest the pointer wins. A paint surface says
 *     `data-vf-cursor="crosshair"` and its insides get the cross.
 *  3. **`text` — automatic over native editable surfaces.** An enabled
 *     `<input>`/`<textarea>` or contenteditable under the pointer gets the
 *     I-beam with no opt-in at all, which covers every kit field, since the
 *     kit's wells are real inputs.
 *  4. Otherwise the arrow.
 *
 * The kind is re-resolved on every pointer move AND whenever `aria-busy` /
 * `data-vf-cursor` / a dialog's `open` changes anywhere — a click that
 * starts a save must swap a *stationary* pointer to the watch, so state
 * changes re-hit-test the cached position rather than waiting for a move.
 * The overlay reflects the resolved kind as `data-kind` on itself.
 *
 * `invert` art draws with the System 7 XOR pen: the black ink is flipped
 * white (`filter: invert(1)`) and composited with `mix-blend-mode:
 * difference`, so every ink pixel paints the exact inverse of what is under
 * it — black on white, white on black, inverted dither on the dither — per
 * pixel, the way the classic I-beam and crosshair drew. Art that carries
 * its own white (the arrow's outline, the watch's face) leaves it off.
 * Where the engine cannot blend from the top layer (stable Safari — see
 * `XOR_UNAVAILABLE`), `invert` art renders its `staticSrc` variant as-is
 * instead: same box, same hotspot, its own legibility (the embedded set
 * carries white-haloed variants). A multi-frame `wait` art animates, unless
 * the user prefers reduced motion.
 */
import { effectiveScale, onScaleChange } from './scale.js'
import { truePixelRatio } from './zoom.js'
import { prefersReducedMotion } from './motion.js'
import { VfModalDialog } from './modal-dialog.js'
import {
  CURSOR_ARROW,
  CURSOR_CROSSHAIR,
  CURSOR_I_BEAM,
  CURSOR_WAIT,
} from './cursor-art.js'

export interface VfCursorArt {
  /** Frame URL(s), drawn at one image px = one system px; several animate. */
  src: string | string[]
  /** Art width in image px. */
  width: number
  /** Art height in image px. */
  height: number
  /** The art pixel that lands on the cell under the pointer (tip, stem, …). */
  hotspotX?: number
  hotspotY?: number
  /** Draw with the XOR pen — per-pixel inversion of whatever is beneath. */
  invert?: boolean
  /**
   * The variant an engine that cannot XOR draws as-is (stable Safari — see
   * `XOR_UNAVAILABLE`): same box and hotspot as `src`, but carrying its own
   * legibility, e.g. a white outline. Only consulted when `invert` is set;
   * without one, such an engine draws `src` itself, un-inverted.
   */
  staticSrc?: string | string[]
}

export type VfCursorKind = 'arrow' | 'text' | 'crosshair' | 'wait'

const KINDS: readonly VfCursorKind[] = ['arrow', 'text', 'crosshair', 'wait']

export interface VfCursorOptions {
  /** The default pointer. Defaults to the embedded System 7 arrow. */
  arrow?: VfCursorArt
  /** Over editable text. Defaults to the embedded I-beam; `null` disables. */
  text?: VfCursorArt | null
  /** For `data-vf-cursor="crosshair"` claims. Defaults to the embedded
   *  crosshair; `null` disables. */
  crosshair?: VfCursorArt | null
  /** While `aria-busy`. Defaults to the embedded wristwatch; `null`
   *  disables. */
  wait?: VfCursorArt | null
  /**
   * Element whose top-left corner anchors the system-pixel lattice the
   * cursor snaps to. Defaults to the page's `vf-desktop` (else the document
   * root), so on a faux desktop the cursor's pixels land on the same grid
   * as the raster's dither.
   */
  anchor?: HTMLElement
  /** ms per `wait` frame (default 250 — a full turn of 8 hands in 2s). */
  waitFrameMs?: number
}

/** A kind's art with its frames preloaded (the Images pin the cache). */
interface Loaded {
  art: VfCursorArt
  /** The frames actually drawn: `staticSrc` where XOR is unavailable. */
  frames: string[]
  /** Whether these frames composite with the XOR pen. */
  xor: boolean
  images: HTMLImageElement[]
  ready: boolean
}

/*
 * Stable Safari cannot blend an element in the top layer against the page —
 * `mix-blend-mode: difference` there composites against nothing and XOR art
 * paints as-is, with or without a filter on the element (probed 2026-08 on
 * Safari 26). The bug is invisible to feature detection: the broken and
 * working cases have identical computed styles, and a page cannot read its
 * own rendered pixels — so this is a vendor sniff, deliberately broad. It
 * also stays conservative about the future: WebKit trunk has the fix, but
 * until a shipping Safari version is known the static variants simply keep
 * working there. The alternatives probed and rejected: `backdrop-filter:
 * invert(1)` under a mask renders nothing in Firefox and trunk WebKit, and
 * leaving the top layer breaks the cursor over open modals everywhere.
 */
const XOR_UNAVAILABLE =
  typeof navigator !== 'undefined' && (navigator.vendor ?? '').startsWith('Apple')

const TEXT_INPUTS = new Set(['text', 'password', 'search', 'email', 'url', 'tel', 'number'])

/** An editable surface the I-beam belongs over, by platform semantics. */
function isTextSurface(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.disabled
  if (el instanceof HTMLInputElement) return !el.disabled && TEXT_INPUTS.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}

/** The deepest element under a point, descending through open shadow roots. */
function deepElementAt(x: number, y: number): Element | null {
  let el = document.elementFromPoint(x, y)
  while (el?.shadowRoot) {
    const deeper = el.shadowRoot.elementFromPoint(x, y)
    if (!deeper || deeper === el) break
    el = deeper
  }
  return el
}

/** The composed ancestor chain, deepest first — hosts included, so a claim
 *  on a component host governs its shadow insides. */
function composedChain(el: Element | null): Element[] {
  const chain: Element[] = []
  while (el) {
    chain.push(el)
    const root = el.getRootNode()
    el = el.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
  }
  return chain
}

/** An open modal shell that has declared itself busy: the whole app is
 *  waiting, wherever the pointer is — its backdrop covers the page, and a
 *  hit test over a backdrop reaches nothing that could carry the
 *  attribute. */
function busyOpenModal(): boolean {
  for (const el of document.querySelectorAll('[aria-busy="true"]')) {
    if (el instanceof VfModalDialog && el.open) return true
  }
  return false
}

/**
 * Replace the native pointer with the kit's system-pixel-locked cursor art
 * (or the consumer's own, per kind). Strictly opt-in — call it once from
 * your app. Returns a cleanup function that removes the overlay and
 * restores the native pointer.
 */
export function applyCursor(options: VfCursorOptions = {}): () => void {
  const {
    anchor = document.querySelector<HTMLElement>('vf-desktop') ?? document.documentElement,
    waitFrameMs = 250,
    arrow = CURSOR_ARROW,
    text = CURSOR_I_BEAM,
    crosshair = CURSOR_CROSSHAIR,
    wait = CURSOR_WAIT,
  } = options
  const arts: Record<VfCursorKind, VfCursorArt | null> = { arrow, text, crosshair, wait }
  const root = document.documentElement
  const aborter = new AbortController()
  const { signal } = aborter

  /* The page-side blanket. Inheriting `none` from the root is NOT enough in
     the light DOM: the UA sheets put `cursor: default` on `<button>` and
     `cursor: text` on `<input>`, and an element's own declaration beats
     inheritance. A `*` rule with !important outranks UA and plain author
     declarations everywhere in the light DOM; shadow trees don't see
     document sheets and are the `--vf-cursor` token's job instead. */
  const blanket = document.createElement('style')
  blanket.textContent = '* { cursor: none !important }'

  const img = document.createElement('img')
  img.alt = ''
  img.setAttribute('aria-hidden', 'true')
  const popover = 'showPopover' in img
  if (popover) img.setAttribute('popover', 'manual')
  Object.assign(img.style, {
    // Overrides the UA popover styles (inset: 0, margin: auto, border,
    // canvas background) down to a bare image at the viewport origin; the
    // z-index only matters on an engine with no popover support, where the
    // overlay falls back to ordinary stacking and slides under open modals.
    position: 'fixed',
    inset: '0 auto auto 0',
    margin: '0',
    padding: '0',
    border: '0',
    background: 'transparent',
    overflow: 'visible',
    pointerEvents: 'none',
    imageRendering: 'pixelated',
    visibility: 'hidden',
    zIndex: '2147483647',
  })

  /* Preload every kind's frames; a kind that fails to load is dropped and
     falls back to the arrow, so a broken option costs a state, never the
     cursor. */
  const loaded = new Map<VfCursorKind, Loaded>()
  for (const kindName of KINDS) {
    const art = arts[kindName]
    if (!art) continue
    const source = art.invert && XOR_UNAVAILABLE ? (art.staticSrc ?? art.src) : art.src
    const frames = Array.isArray(source) ? source : [source]
    const images = frames.map((url) => {
      const image = new Image()
      image.src = url
      return image
    })
    loaded.set(kindName, {
      art,
      frames,
      xor: !!art.invert && !XOR_UNAVAILABLE,
      images,
      ready: false,
    })
  }
  const decodeAll = (entry: Loaded): Promise<void> =>
    Promise.all(entry.images.map((image) => image.decode())).then(() => {
      entry.ready = true
    })

  /* Geometry, all in device px: q device px per system px (whole by the
     kit's scale invariant), and the lattice anchor — the anchor element's
     origin, rounded to kill float noise. */
  let dpr = 1
  let q = 3
  let anchorX = 0
  let anchorY = 0
  let pointerX = -1
  let pointerY = -1

  let kind: VfCursorKind = 'arrow'
  let current = loaded.get('arrow')!
  let frameIndex = 0
  let frameTimer = 0

  /* Quantize the pointer onto the lattice: the hotspot's art pixel covers
     the exact cell the pointer is in, the way the classic arrow's tip owned
     one screen pixel. The translate is fractional CSS px but a whole count
     of device px, so the art rasterizes clean. */
  const place = (): void => {
    if (pointerX < 0) return
    const { hotspotX = 0, hotspotY = 0 } = current.art
    const cellX = Math.floor((pointerX * dpr - anchorX) / q)
    const cellY = Math.floor((pointerY * dpr - anchorY) / q)
    const x = (anchorX + (cellX - hotspotX) * q) / dpr
    const y = (anchorY + (cellY - hotspotY) * q) / dpr
    img.style.transform = `translate(${x}px, ${y}px)`
  }

  const measure = (): void => {
    dpr = truePixelRatio() || 1
    q = Math.max(1, Math.round(effectiveScale(anchor) * dpr))
    const rect = anchor.getBoundingClientRect()
    anchorX = Math.round(rect.left * dpr)
    anchorY = Math.round(rect.top * dpr)
    img.style.width = `${(current.art.width * q) / dpr}px`
    img.style.height = `${(current.art.height * q) / dpr}px`
    place()
  }

  /** Swap the overlay to a kind's art — falling back to the arrow when the
   *  kind was disabled or its art never arrived. */
  const apply = (next: VfCursorKind): void => {
    const entry = loaded.get(next)
    const target = entry?.ready ? entry : loaded.get('arrow')!
    // Re-applies when either the kind moved OR the same kind's real art
    // arrived after an arrow fallback (late decode).
    if (next === kind && target === current) return
    kind = next
    current = target
    img.dataset.kind = next
    window.clearInterval(frameTimer)
    frameIndex = 0
    img.src = current.frames[0]!
    // The XOR pen: ink flipped white, then difference against the backdrop.
    img.style.filter = current.xor ? 'invert(1)' : ''
    img.style.mixBlendMode = current.xor ? 'difference' : ''
    if (current.frames.length > 1 && !prefersReducedMotion()) {
      frameTimer = window.setInterval(() => {
        frameIndex = (frameIndex + 1) % current.frames.length
        img.src = current.frames[frameIndex]!
      }, waitFrameMs)
    }
    measure()
  }

  /** Which cursor belongs at the cached pointer position, per the
   *  doc-comment priority: busy > explicit claim > text surface > arrow. */
  const resolveKind = (): VfCursorKind => {
    if (busyOpenModal()) return 'wait'
    const chain = composedChain(deepElementAt(pointerX, pointerY))
    if (chain.some((el) => el.getAttribute('aria-busy') === 'true')) return 'wait'
    for (const el of chain) {
      const claim = el.getAttribute('data-vf-cursor')
      if (claim && (KINDS as readonly string[]).includes(claim))
        return claim as VfCursorKind // nearest explicit claim wins
    }
    if (chain[0] && isTextSurface(chain[0])) return 'text'
    return 'arrow'
  }

  const update = (): void => {
    if (pointerX < 0) return
    apply(resolveKind())
  }

  // Double rAF: a vf-desktop answers a resize/scale change by re-deriving
  // its raster through Lit's async update, so the box to re-anchor against
  // exists a frame later than the event.
  let raf = 0
  const scheduleMeasure = (): void => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(measure)
    })
  }

  /** Hoist the overlay back above a modal that entered the top layer later. */
  const promote = (): void => {
    if (!popover || !img.isConnected) return
    try {
      img.hidePopover()
      img.showPopover()
    } catch {
      // Not currently shown — nothing to re-order.
    }
  }
  // One observer for both jobs: an opening modal re-promotes the overlay,
  // and any of the three attributes can change the kind under a pointer
  // that isn't moving (a click that starts a save must swap to the watch by
  // itself).
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target
      if (
        record.attributeName === 'open' &&
        target instanceof VfModalDialog &&
        target.open
      ) {
        promote()
        break
      }
    }
    update()
  })

  const hide = (): void => {
    img.style.visibility = 'hidden'
  }
  const onPointer = (event: PointerEvent): void => {
    // A finger is not a pointer to draw: no hover, and nothing to track
    // between touches. The overlay returns with the next mouse move.
    if (event.pointerType === 'touch') {
      hide()
      return
    }
    pointerX = event.clientX
    pointerY = event.clientY
    update()
    place()
    img.style.visibility = 'visible'
  }

  let disposed = false
  const activate = (): void => {
    if (disposed) return
    document.body.append(img)
    if (popover) img.showPopover()
    img.dataset.kind = 'arrow'
    measure()

    // Only now that the replacement is live does the native pointer go away.
    document.head.append(blanket)
    root.style.setProperty('--vf-cursor', 'none')

    // Capture-phase on window so moves over a modal dialog (which makes the
    // rest of the page inert but still bubbles its own events) keep driving
    // the overlay.
    const opts = { capture: true, passive: true, signal } as const
    window.addEventListener('pointermove', onPointer, opts)
    window.addEventListener('pointerdown', onPointer, opts)
    window.addEventListener('pointercancel', hide, opts)
    // The pointer leaving the page, the page losing the user: hide rather
    // than freeze an arrow nobody is holding.
    document.addEventListener('mouseleave', hide, { signal })
    window.addEventListener('blur', hide, { signal })
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) hide()
      },
      { signal }
    )

    window.addEventListener('resize', scheduleMeasure, { signal })
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'aria-busy', 'data-vf-cursor'],
    })
  }

  // Reader-tier subscription: runs after every component has re-written its
  // own --vf-scale, so effectiveScale(anchor) is the settled value.
  const unsubscribeScale = onScaleChange(scheduleMeasure)

  // The arrow gates activation — no hiding without a pointer to show. The
  // overlay's OWN decode is part of the gate: the preload warms the cache
  // on separate Image objects, and the element must have painted its copy
  // before the native pointer goes away. The other kinds arrive when they
  // arrive and are dropped, with a warning, if they never do.
  decodeAll(loaded.get('arrow')!)
    .then(() => {
      img.src = current.frames[0]!
      return img.decode()
    })
    .then(activate, () => {
      console.warn('applyCursor: could not load the arrow art; keeping the native pointer')
    })
  for (const [name, entry] of loaded) {
    if (name === 'arrow') continue
    decodeAll(entry).then(
      // If the pointer is already parked on this kind (shown as the arrow
      // fallback), the late art takes over in place.
      () => update(),
      () => {
        console.warn(`applyCursor: could not load the "${name}" art; it will fall back to the arrow`)
      }
    )
  }

  return () => {
    disposed = true
    aborter.abort()
    observer.disconnect()
    unsubscribeScale()
    cancelAnimationFrame(raf)
    window.clearInterval(frameTimer)
    if (popover && img.isConnected) {
      try {
        img.hidePopover()
      } catch {
        // Never shown — fine.
      }
    }
    img.remove()
    blanket.remove()
    root.style.removeProperty('--vf-cursor')
  }
}
