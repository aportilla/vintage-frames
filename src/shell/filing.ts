/**
 * Filing by drag: what a drop of icons means. A drop onto a folder icon
 * files the icons into that folder at its next free cells; a drop into a
 * folder window lands each icon where its outline was let go; a drop out of
 * a window onto the desktop the same. The folder under the pointer wears
 * `target`. A folder never goes into itself or a folder inside it, and a
 * drop over another application's window moves nothing. A drop inside the
 * icons' own field is the kit's: its default action moves them there.
 *
 * The Finder runs it over its catalog; a page of its own can run it over the
 * DOM, with callbacks that say what a container is and what filing does.
 */

import type { VfDesktop, VfIcon, VfIconDragDetail, VfWindow } from '../index.js'
import type { Point } from './geometry.js'

/** What filing needs to know, and what it does. */
export interface FilingOptions {
  /**
   * The container a window shows — a folder's id — or undefined for a
   * window that holds no icons of the page's: a drop over it moves nothing.
   */
  folderOfWindow(win: VfWindow): string | undefined
  /** The container a folder icon opens — its folder's id — or undefined for any other icon. */
  folderOfIcon(icon: VfIcon): string | undefined
  /**
   * The container an icon sits in: a folder's id, or null for the desktop.
   * Undefined for an icon filing leaves alone, another application's: its
   * drags go by.
   */
  containerOf(icon: VfIcon): string | null | undefined
  /** Whether `icons` may go into `folder` (null: the desktop). */
  canFile(icons: VfIcon[], folder: string | null): boolean
  /**
   * File the icons into `folder` (null: the desktop), each at its landing
   * there in whole system px, or null for the folder's next free cell.
   */
  file(icons: VfIcon[], folder: string | null, landings: Map<VfIcon, Point | null>): void
}

/** Wire filing by drag on a desktop. Returns the teardown. */
export function fileByDrag(desktop: VfDesktop, options: FilingOptions): () => void {
  const { folderOfWindow, folderOfIcon, containerOf, canFile, file } = options

  /**
   * What the pointer is over, the dragged icons aside. elementsFromPoint also
   * returns covered elements, so the stack is read only down to the first
   * window: a folder icon in front of it, that window, and whether the bare
   * desktop is under the point.
   */
  const under = (x: number, y: number, skip: Element[]) => {
    const stack = document.elementsFromPoint(x, y).filter((el) => !skip.includes(el))
    const front = stack.findIndex((el) => el.localName === 'vf-window')
    const seen = front < 0 ? stack : stack.slice(0, front)
    const folderIcon =
      (seen.find((el) => el.localName === 'vf-icon' && folderOfIcon(el as VfIcon) !== undefined) as VfIcon | undefined) ??
      null
    const win = front < 0 ? null : (stack[front] as VfWindow)
    return {
      folderIcon,
      folder: folderIcon ? (folderOfIcon(folderIcon) as string) : undefined,
      win,
      window: win ? folderOfWindow(win) : undefined,
      desktop: !win && stack.includes(desktop),
    }
  }

  let target: VfIcon | null = null
  const highlight = (next: VfIcon | null) => {
    if (target === next) return
    if (target) target.target = false
    target = next
    if (target) target.target = true
  }

  const onDrag = (e: Event) => {
    if (containerOf(e.target as VfIcon) === undefined) return
    const { clientX, clientY, icons } = (e as CustomEvent<VfIconDragDetail>).detail
    const hit = under(clientX, clientY, icons)
    highlight(hit.folderIcon && canFile(icons, hit.folder ?? null) ? hit.folderIcon : null)
  }
  const onCancel = () => highlight(null)
  const onDrop = (e: Event) => {
    const leader = e.target as VfIcon
    const from = containerOf(leader)
    if (from === undefined) return
    const { clientX, clientY, x, y, icons } = (e as CustomEvent<VfIconDragDetail>).detail
    const hit = under(clientX, clientY, icons)
    highlight(null)
    // Where each icon's outline was let go: its box offset by the leader's
    // delta, measured before anything moves.
    const lead = leader.getBoundingClientRect()
    const landings = icons.map((icon) => {
      const r = icon.getBoundingClientRect()
      return { icon, x: r.left + (x - lead.left), y: r.top + (y - lead.top) }
    })

    if (hit.folder !== undefined) {
      // Onto a folder icon: into its next free cells, when allowed.
      e.preventDefault()
      if (canFile(icons, hit.folder)) file(icons, hit.folder, new Map(icons.map((i) => [i, null])))
      return
    }
    if (hit.win && hit.window === undefined) {
      // Over a window that is not a folder's: nothing moves.
      e.preventDefault()
      return
    }
    if (hit.win && hit.window !== undefined && hit.window !== from) {
      // Into a folder window from elsewhere: at each drop point on its plane.
      e.preventDefault()
      if (!canFile(icons, hit.window)) return
      const win = hit.win
      file(
        icons,
        hit.window,
        new Map(
          landings.map(({ icon, x: lx, y: ly }) => {
            const p = win.placementAt(lx, ly)
            return [icon, { left: Math.max(0, p.left), top: Math.max(0, p.top) }]
          })
        )
      )
      return
    }
    if (hit.desktop && from !== null) {
      // Out of a window onto the desktop: at each drop point, below the menu bar.
      e.preventDefault()
      if (!canFile(icons, null)) return
      const floor = desktop.workArea.top
      file(
        icons,
        null,
        new Map(
          landings.map(({ icon, x: lx, y: ly }) => {
            const p = desktop.placementAt(lx, ly)
            return [icon, { left: Math.max(0, p.left), top: Math.max(floor, p.top) }]
          })
        )
      )
    }
    // Otherwise the drop is inside the icons' own container, and the kit moves them.
  }

  desktop.addEventListener('vf-drag', onDrag)
  desktop.addEventListener('vf-drag-cancel', onCancel)
  desktop.addEventListener('vf-drop', onDrop)
  return () => {
    highlight(null)
    desktop.removeEventListener('vf-drag', onDrag)
    desktop.removeEventListener('vf-drag-cancel', onCancel)
    desktop.removeEventListener('vf-drop', onDrop)
  }
}
