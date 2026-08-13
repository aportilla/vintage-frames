import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { effectiveScale } from './scale.js'

/** The axis a container centers its children across — `null` when it doesn't. */
export type CrossAxis = 'x' | 'y' | null

/** What {@link CrossCenterController} reads off its host before each measure. */
export interface CrossCenterParts {
  /** The flex box the children are centered in. */
  box: HTMLElement | null | undefined
  /** The slot they arrive through. */
  slot: HTMLSlotElement | null | undefined
  /** Which axis that centering happens on, if it happens at all. */
  axis: CrossAxis
}

/**
 * Marks a held child; the container's `::slotted()` rule keys off it. The
 * container owns the correction, the child carries only the fact of it.
 */
export const CENTER_TIE_ATTRIBUTE = 'data-vf-tie'

/** The custom properties the correction is written to, per axis. */
const OFFSET_PROPERTY = { x: '--vf-stack-dx', y: '--vf-stack-dy' } as const

/**
 * Smallest correction worth writing, in CSS px. Chromium stores used lengths
 * in 1/64 CSS px and both measured edges carry that rounding, so a child as
 * centered as the engine can express still asks for a sub-layout-unit nudge.
 * Two layout units is above that noise and far below a genuine tie, which is
 * half a system px (0.5 CSS px at 1×).
 */
const NOISE_FLOOR = 1 / 32

/**
 * How far from an exact half still counts as one, in system px. At a scale the
 * engine can't hold (a true 3× display's 4/3) every length floors to a
 * 1/64-CSS-px layout unit, so a child centered at 23.5 system px measures
 * 23.502 — and rounding half down without slack would send it to 24, the wrong
 * side of the tie. Two layout units is ~0.023 system px there; 0.05 covers it
 * and is nowhere near the 0.5 that would reach the next lattice point.
 */
const TIE_SLACK = 0.05

/** A held child's correction: which axis it is on, and the offset in CSS px. */
interface Hold {
  axis: 'x' | 'y'
  offset: number
}

/** A computed length, as a number. */
const num = (value: string): number => parseFloat(value) || 0

/** Where `el`'s content box starts along `axis`, in client CSS px. */
function contentStart(el: HTMLElement, axis: 'x' | 'y'): number {
  const style = getComputedStyle(el)
  const rect = el.getBoundingClientRect()
  return axis === 'x'
    ? rect.left + num(style.borderLeftWidth) + num(style.paddingLeft)
    : rect.top + num(style.borderTopWidth) + num(style.paddingTop)
}

/**
 * Holds cross-axis centering on the system-pixel grid.
 *
 * Centering halves the free space, and half of an odd count of system px is a
 * half: a 71-system-px child centered in 200 sits at 64.5 — half a *system*
 * px, so the child's whole 1-bit interior misses the device grid at every
 * density. CSS can't round it: no rule can say "half my child's width,
 * floored", and a fractional transform leaves the composite-time fringe
 * grid-snap.ts measured. So the offset is measured here and corrected through
 * layout: each centered child steps to the nearest whole system px, the exact
 * half going toward the start as QuickDraw's `div 2` did.
 *
 * It measures where flexbox actually put each child rather than deriving from
 * the two widths — a stack holds anything, including a child whose width isn't
 * whole system px (`vf-select` is 87⅓ at 1.5×), and deriving would move such a
 * child *off* a grid position it already held. Everything is relative to the
 * box, so a stack the page put on a fractional origin is untouched: that stays
 * the page's fault, or the grid snapper's to absorb (src/grid-snap.ts).
 *
 * The correction lands as {@link CENTER_TIE_ATTRIBUTE} plus a length in
 * `--vf-stack-dx` / `--vf-stack-dy`, applied by the container's own
 * `::slotted([data-vf-tie])` rule (see vf-stack.ts). A marker plus a variable
 * is the weakest channel available — any inline style or page rule beats it —
 * and the marker matters because a `::slotted` rule outranks a slotted
 * element's own `:host` (measured): a blanket `position` would restyle
 * `vf-window` and `vf-menu`.
 *
 * Re-measures after every host render and on any resize of the box or a child
 * — a density change, a late-registering face, an edited label. A relative
 * offset changes no box's size, so the measurement stays stable: the applied
 * correction is subtracted back out before the next one is derived, and a
 * child already on the grid is left exactly as it is.
 */
export class CrossCenterController implements ReactiveController {
  private observer?: ResizeObserver
  private observed: Element[] = []
  private slot?: HTMLSlotElement
  private readonly held = new Map<HTMLElement, Hold>()

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly read: () => CrossCenterParts
  ) {
    host.addController(this)
  }

  hostConnected(): void {
    this.sync()
  }

  hostUpdated(): void {
    this.sync()
  }

  hostDisconnected(): void {
    this.rest()
  }

  /** Re-attach to the current box, slot and children, then re-measure. */
  private readonly sync = (): void => {
    const parts = this.read()
    const { box, slot, axis } = parts
    // Nothing centered means nothing to watch: a default column stays inert.
    if (!box || !slot || !axis) return this.rest()
    if (slot !== this.slot) {
      this.slot?.removeEventListener('slotchange', this.sync)
      slot.addEventListener('slotchange', this.sync)
      this.slot = slot
    }
    this.watch(box, slot)
    this.hold(parts)
  }

  /**
   * Detach from everything and give every held child its box back. Keeps the
   * observer instance, so a re-parented stack doesn't allocate a fresh one.
   */
  private rest(): void {
    this.observer?.disconnect()
    this.observed = []
    this.slot?.removeEventListener('slotchange', this.sync)
    this.slot = undefined
    for (const child of [...this.held.keys()]) this.clear(child)
  }

  /** Observe the box and every child, once per distinct set. */
  private watch(box: HTMLElement, slot: HTMLSlotElement): void {
    if (typeof ResizeObserver === 'undefined') return
    const targets: Element[] = [box, ...slot.assignedElements()]
    const unchanged =
      targets.length === this.observed.length &&
      targets.every((el, i) => el === this.observed[i])
    if (unchanged) return
    this.observer ??= new ResizeObserver(() => this.hold(this.read()))
    this.observer.disconnect()
    for (const target of targets) this.observer.observe(target)
    this.observed = targets
  }

  /** Put every centered child on the nearest whole system px, ties to the start. */
  private hold({ box, slot, axis }: CrossCenterParts): void {
    if (!box || !slot || !axis) return
    const scale = effectiveScale(this.host)
    const start = contentStart(box, axis)
    const stale = new Set(this.held.keys())

    for (const child of slot.assignedElements()) {
      if (!(child instanceof HTMLElement)) continue
      stale.delete(child)
      const position = getComputedStyle(child).position
      // An out-of-flow child is not a flex item, so nothing centers it.
      if (position === 'absolute' || position === 'fixed') {
        this.clear(child)
        continue
      }
      const rect = child.getBoundingClientRect()
      const edge = axis === 'x' ? rect.left : rect.top
      // Where flexbox put it, with our own correction taken back out — same-
      // axis only, since a direction flip leaves the old axis's offset moving
      // the other edge — so the read never compounds.
      const prior = this.held.get(child)
      const placed = edge - start - (prior?.axis === axis ? prior.offset : 0)
      // Round half DOWN onto whole system px: `Math.round` would send the tie
      // to the end. {@link TIE_SLACK} is what makes a measured half count as
      // one on a display whose scale the engine cannot hold exactly.
      const sys = Math.ceil(placed / scale - 0.5 - TIE_SLACK)
      const offset = sys * scale - placed
      if (Math.abs(offset) < NOISE_FLOOR) this.clear(child)
      else this.apply(child, axis, offset)
    }

    for (const child of stale) this.clear(child)
  }

  private apply(child: HTMLElement, axis: 'x' | 'y', offset: number): void {
    const prior = this.held.get(child)
    if (prior?.axis === axis && prior.offset === offset) return
    child.style.setProperty(OFFSET_PROPERTY[axis], `${offset}px`)
    child.style.removeProperty(OFFSET_PROPERTY[axis === 'x' ? 'y' : 'x'])
    child.setAttribute(CENTER_TIE_ATTRIBUTE, '')
    this.held.set(child, { axis, offset })
  }

  /** Give a child back exactly the box it arrived with. */
  private clear(child: HTMLElement): void {
    if (!this.held.delete(child)) return
    child.style.removeProperty(OFFSET_PROPERTY.x)
    child.style.removeProperty(OFFSET_PROPERTY.y)
    child.removeAttribute(CENTER_TIE_ATTRIBUTE)
    // An emptied style attribute is the page's own markup again, not ours.
    if (!child.getAttribute('style')) child.removeAttribute('style')
  }
}
