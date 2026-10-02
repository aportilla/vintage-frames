/**
 * The shell's alert: a plain-framed `vf-dialog` with the site's caution art,
 * a message and a row of buttons, sized to the message — composed from kit
 * elements, as every alert in the kit is.
 *
 * The layout follows the plain frame's body, its width and height less 10:
 * the art and the message 16 in from the body's top-left, the buttons'
 * bottom-right corner 16 in from the body's.
 */

import { effectiveScale } from '../index.js'
import type { VfButton, VfDialog, VfParagraph } from '../index.js'

/** One button of an alert. */
export interface AlertButton {
  label: string
  /** What the alert resolves to when it is pressed. */
  value: string
  /** The default button, which Return presses. */
  default?: boolean
}

export interface AlertOptions {
  /** Default: OK, the default button. */
  buttons?: AlertButton[]
  /** The dialog's width, system px. Default 400. */
  width?: number
  /** The 32×32 art beside the message; default the shell's caution art. */
  art?: string | null
  /** The dialog's accessible name. Default "Alert". */
  label?: string
}

const FRAME = 10
const INSET = 16
const ART = 32
const BUTTONS = 28

/**
 * Show an alert inside `host` (the desktop), and resolve the value of the
 * button pressed — or null when it closed any other way, Escape say.
 */
export async function showAlert(host: Element, message: string, options: AlertOptions = {}): Promise<string | null> {
  const {
    buttons = [{ label: 'OK', value: 'ok', default: true }],
    width = 400,
    art = null,
    label = 'Alert',
  } = options
  const dialog = document.createElement('vf-dialog') as VfDialog
  dialog.frame = 'plain'
  dialog.label = label
  dialog.width = width
  dialog.height = 120
  const textLeft = art ? INSET + ART + INSET : INSET
  if (art) {
    const img = document.createElement('vf-img')
    img.width = ART
    img.height = ART
    img.left = INSET
    img.top = INSET
    const raster = document.createElement('img')
    raster.src = art
    raster.alt = ''
    img.append(raster)
    dialog.append(img)
  }
  const text = document.createElement('vf-paragraph') as VfParagraph
  text.face = 'display'
  text.width = width - FRAME - textLeft - INSET
  text.left = textLeft
  text.top = INSET
  text.textContent = message
  dialog.append(text)
  const group = document.createElement('vf-button-group')
  group.origin = 'bottom right'
  const made: VfButton[] = buttons.map((b) => {
    const button = document.createElement('vf-button') as VfButton
    button.textContent = b.label
    button.dataset.value = b.value
    if (b.default) button.variant = 'default'
    return button
  })
  group.append(...made)
  dialog.append(group)
  host.append(dialog)
  await Promise.all([dialog.updateComplete, text.updateComplete, group.updateComplete])

  /**
   * Size the box to the message. A closed dialog lays out nothing, so this
   * runs once it is shown: the read forces layout, and the new size and the
   * re-centering land before the first paint.
   */
  const fit = () => {
    const tall = Math.ceil(text.getBoundingClientRect().height / effectiveScale(text))
    const body = Math.max(art ? INSET + ART : 0, INSET + tall) + INSET + BUTTONS + INSET
    dialog.height = body + FRAME
    group.left = width - FRAME - INSET
    group.top = body - INSET
  }

  return new Promise((resolve) => {
    let value: string | null = null
    for (const button of made) {
      button.addEventListener('click', () => {
        value = button.dataset.value ?? null
        dialog.close()
      })
    }
    dialog.addEventListener(
      'vf-close',
      () => {
        dialog.remove()
        resolve(value)
      },
      { once: true }
    )
    dialog.show()
    fit()
  })
}
