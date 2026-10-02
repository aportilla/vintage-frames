/**
 * The Finder's alert: a plain-framed `vf-dialog` with the site's caution art,
 * a message and a row of buttons, sized to the message — composed from kit
 * elements, as every alert in the kit is. Its buttons submit a
 * `<form method="dialog">`, so it answers with the pressed button's `value`
 * like any dialog an application holds.
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
  /** What the alert answers when it is pressed. */
  value: string
  /** The default button, which Return presses. */
  default?: boolean
}

export interface AlertOptions {
  /** Default: OK, the default button. */
  buttons?: AlertButton[]
  /** The dialog's width, system px. Default 400. */
  width?: number
  /** The 32×32 art beside the message, or null for none. */
  art?: string | null
  /** The dialog's accessible name. Default "Alert". */
  label?: string
}

/** An alert, made but not yet shown. */
export interface ComposedAlert {
  dialog: VfDialog
  /** Resolves once its parts have rendered, so `show()` opens it at once. Call it once the dialog is in the page. */
  rendered(): Promise<unknown>
  /** Size the box to the message. Call it right after `show()`: a closed dialog lays out nothing. */
  fit(): void
}

const FRAME = 10
const INSET = 16
const ART = 32
const BUTTONS = 28

/** Make an alert for `message`. */
export function composeAlert(message: string, options: AlertOptions = {}): ComposedAlert {
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
  const form = document.createElement('form')
  form.method = 'dialog'
  form.noValidate = true
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
    form.append(img)
  }
  const text = document.createElement('vf-paragraph') as VfParagraph
  text.face = 'display'
  text.width = width - FRAME - textLeft - INSET
  text.left = textLeft
  text.top = INSET
  text.textContent = message
  form.append(text)
  const group = document.createElement('vf-button-group')
  group.origin = 'bottom right'
  group.append(
    ...buttons.map((b) => {
      const button = document.createElement('vf-button') as VfButton
      button.textContent = b.label
      button.type = 'submit'
      button.value = b.value
      if (b.default) button.variant = 'default'
      return button
    })
  )
  form.append(group)
  dialog.append(form)

  return {
    dialog,
    rendered: () => Promise.all([dialog.updateComplete, text.updateComplete, group.updateComplete]),
    // The read forces layout, and the new size and the re-centering land before the first paint.
    fit() {
      const tall = Math.ceil(text.getBoundingClientRect().height / effectiveScale(text))
      const body = Math.max(art ? INSET + ART : 0, INSET + tall) + INSET + BUTTONS + INSET
      dialog.height = body + FRAME
      group.left = width - FRAME - INSET
      group.top = body - INSET
    },
  }
}
