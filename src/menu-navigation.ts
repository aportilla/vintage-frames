import type { VfMenu } from './components/vf-menu.js'
import type { VfMenuItem } from './components/vf-menu-item.js'
import type { TypeAheadBuffer } from './type-ahead.js'

/**
 * The keyboard of an open menu and its submenus, shared by the two hosts that
 * own one: `vf-menu-bar` for its open menu, and a `vf-menu` standing alone.
 * Each listens on the document while a menu is open and hands the keydown to
 * {@link navigateMenus}, which acts on the deepest open menu holding focus,
 * after the APG menubar and menu patterns:
 *
 * - ↓/↑ walk that menu's enabled items, wrapping; Home/End jump to its first
 *   and last; printable keys run the shared first-letter type-ahead
 *   (src/type-ahead.ts), Space and modified keys aside.
 * - → on an item that opens a submenu opens it and moves focus to its first
 *   enabled item, as Enter and Space do from the item itself. On any other
 *   item in a bar, → opens the next menu.
 * - ← in a submenu closes it and puts focus back on its item; at the top of a
 *   bar, ← opens the previous menu.
 * - Escape closes one level: a submenu back to its item, the top menu back to
 *   its title. Tab closes every menu and lets focus move on.
 */
export interface MenuKeyboard {
  /** The open top-level menu. */
  readonly menu: VfMenu
  /** The host's own first-letter type-ahead buffer. */
  readonly typeAhead: TypeAheadBuffer
  /** Close every menu, putting focus back on the title when `refocus`. */
  close(refocus: boolean): void
  /** In a bar: open the next (1) or previous (-1) menu. */
  switchMenu?(direction: 1 | -1): void
}

/** The open menus from `menu` down: each the submenu of an item in the one before. */
export function openPath(menu: VfMenu): VfMenu[] {
  const path = [menu]
  for (let sub = menu.expandedItem?.submenu; sub?.open; sub = sub.expandedItem?.submenu) {
    path.push(sub)
  }
  return path
}

/** Handles one keydown for an open menu and the submenus open under it. */
export function navigateMenus(event: KeyboardEvent, keys: MenuKeyboard): void {
  if (event.defaultPrevented) return
  const path = openPath(keys.menu)
  const root = keys.menu.getRootNode() as Document | ShadowRoot
  const focused = root.activeElement
  // The deepest open menu holding focus; the top one while focus is on its title.
  let level = 0
  for (let i = path.length - 1; i > 0; i--) {
    if (path[i]!.allItems.includes(focused as VfMenuItem)) {
      level = i
      break
    }
  }
  const menu = path[level]!
  const items = menu.items
  const current = items.indexOf(focused as VfMenuItem)

  /** Close the submenu `sub` and put focus back on its item. */
  const back = (sub: VfMenu): void => {
    const item = sub.parentElement as VfMenuItem
    keys.typeAhead.reset()
    // Focus first: closing hides the focused row, which would drop focus to
    // <body> and read as focus leaving the menus.
    item.focus()
    item.closest('vf-menu')?.expand(null)
  }

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      if (level > 0) back(menu)
      else keys.close(true)
      break
    case 'Tab':
      // Let focus move on; close without cancelling the tab. The hosts'
      // focusout listeners are the belt for this suspender.
      keys.close(false)
      break
    case 'ArrowDown':
    case 'ArrowUp': {
      event.preventDefault()
      if (items.length === 0) break
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const next =
        current < 0
          ? direction === 1
            ? 0
            : items.length - 1
          : (current + direction + items.length) % items.length
      items[next]?.focus()
      break
    }
    case 'Home':
    case 'End':
      event.preventDefault()
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
      break
    case 'ArrowRight': {
      const item = items[current]
      if (item?.submenu) {
        event.preventDefault()
        keys.typeAhead.reset()
        menu.expand(item, { focus: true })
      } else if (keys.switchMenu) {
        event.preventDefault()
        keys.switchMenu(1)
      }
      break
    }
    case 'ArrowLeft':
      if (level > 0) {
        event.preventDefault()
        back(menu)
      } else if (keys.switchMenu) {
        event.preventDefault()
        keys.switchMenu(-1)
      }
      break
    default: {
      // Printable keys run the shared Finder type-ahead over the menu's items.
      // Space stays out of the prefix — it is the focused item's activation
      // key — and modified keys stay the consumer's.
      if (
        event.key.length !== 1 ||
        event.key === ' ' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        break
      }
      event.preventDefault()
      const index = keys.typeAhead.feed(
        event.key,
        current,
        // Already the enabled rows only, so nothing here is disabled.
        items.map((item) => ({ text: item.labelText, disabled: false }))
      )
      items[index]?.focus()
      break
    }
  }
}
