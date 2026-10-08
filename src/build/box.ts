/**
 * The box: the picture an app file shows. The kit's frame, with the
 * application's artwork in the artwork slot, or its icon stamped large on
 * the slot's backdrop when there is none, and lines of text set from the
 * kit's strikes with the manifest's fields in them. Artwork and the stamp
 * are pasted by their alpha. Nothing is drawn outside the slots.
 */

import type { AppManifest } from '../shell/app-file.js'
import type { Strike } from '../styles/strike.js'
import { FRAME } from './frame.js'
import { decodePng, encodePng } from './png.js'
import type { Pixels } from './png.js'

/** A box in a frame's picture, in its px. */
export interface Slot {
  left: number
  top: number
  width: number
  height: number
}

/** A frame: a picture with everything fixed drawn in, and its slots. */
export interface BoxFrame {
  /** The picture, a PNG. */
  picture: Uint8Array
  /** Where the artwork goes. Without artwork the icon goes there, `stamp` times its size and centered. */
  artwork: Slot & { stamp: number }
  /** The lines of text. */
  text: readonly TextSlot[]
}

/** A line of text on the box. */
export interface TextSlot {
  /** The top-left of its em box, and the width it fits in. */
  left: number
  top: number
  width: number
  strike: Strike
  /** Picture px per design px. */
  scale: number
  /** `#rrggbb`. */
  ink: string
  align?: 'left' | 'center' | 'right'
  /** The line, with manifest fields in braces: `{name}`, `Version {version}`, `by {author}`, or fixed text. */
  text: string
}

/** What a box is composed from. */
export interface BoxInput {
  manifest: AppManifest
  /** The icon's PNG, 32 × 32. */
  icon: Uint8Array
  /** The artwork's PNG: the artwork slot's size, or that divided by a whole number. */
  artwork?: Uint8Array
}

/** The manifest fields a line of text can hold. */
const TEXT_FIELDS = ['id', 'name', 'version', 'requires', 'author'] as const

/** The box in the kit's frame, as a PNG. */
export async function composeBox(input: BoxInput): Promise<Uint8Array> {
  return encodePng(await drawBox(FRAME, input))
}

/** The box in `frame`, as pixels. */
export async function drawBox(frame: BoxFrame, { manifest, icon, artwork }: BoxInput): Promise<Pixels> {
  const box = await decodePng(frame.picture, 'the frame')
  const iconPx = await decodePng(icon, 'the icon')
  if (iconPx.width !== 32 || iconPx.height !== 32) {
    throw new Error(`the icon is ${iconPx.width} × ${iconPx.height}, and an icon is 32 × 32`)
  }
  const slot = frame.artwork
  if (artwork) {
    const art = await decodePng(artwork, 'the artwork')
    const n = slot.width / art.width
    if (!Number.isInteger(n) || art.height * n !== slot.height) {
      throw new Error(
        `the artwork is ${art.width} × ${art.height}: draw it at ${slot.width} × ${slot.height}, ` +
          `or that divided by a whole number (${fractions(slot)})`
      )
    }
    paste(box, art, slot.left, slot.top, n, slot)
  } else {
    const size = 32 * slot.stamp
    const left = slot.left + Math.floor((slot.width - size) / 2)
    const top = slot.top + Math.floor((slot.height - size) / 2)
    paste(box, iconPx, left, top, slot.stamp, slot)
  }
  for (const line of frame.text) setLine(box, line, fill(line.text, manifest))
  return box
}

/** The first few sizes that divide a slot's by a whole number, for an error. */
function fractions({ width, height }: Slot): string {
  const sizes: string[] = []
  for (let n = 2; n <= width && sizes.length < 3; n++) {
    if (width % n === 0 && height % n === 0) sizes.push(`${width / n} × ${height / n}`)
  }
  return [...sizes, '…'].join(', ')
}

/** Paste `src` with its top-left at `left`, `top`, each px n × n, by its alpha, inside `clip`. */
function paste(box: Pixels, src: Pixels, left: number, top: number, n: number, clip: Slot): void {
  const x0 = Math.max(left, clip.left, 0)
  const y0 = Math.max(top, clip.top, 0)
  const x1 = Math.min(left + src.width * n, clip.left + clip.width, box.width)
  const y1 = Math.min(top + src.height * n, clip.top + clip.height, box.height)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const s = (Math.floor((y - top) / n) * src.width + Math.floor((x - left) / n)) * 4
      blend(box, x, y, src.data.subarray(s, s + 4))
    }
  }
}

/** Composite one RGBA px over the box's at `x`, `y`. */
function blend(box: Pixels, x: number, y: number, [r, g, b, a]: Uint8Array): void {
  if (!a) return
  const d = box.data
  const i = (y * box.width + x) * 4
  if (a === 255) {
    d[i] = r!
    d[i + 1] = g!
    d[i + 2] = b!
    d[i + 3] = 255
    return
  }
  const under = (d[i + 3]! * (255 - a!)) / 255
  const out = a! + under
  d[i] = Math.round((r! * a! + d[i]! * under) / out)
  d[i + 1] = Math.round((g! * a! + d[i + 1]! * under) / out)
  d[i + 2] = Math.round((b! * a! + d[i + 2]! * under) / out)
  d[i + 3] = Math.round(out)
}

/** A line's text, its braces filled from the manifest. */
function fill(text: string, manifest: AppManifest): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const field = TEXT_FIELDS.find((f) => f === key)
    if (!field) throw new Error(`the frame's line "${text}" names {${key}}, which a manifest doesn't have`)
    return manifest[field]
  })
}

/** A character as an error names it. */
const describe = (ch: string) => `"${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`

/** The pen advance of `text`, in design px. */
const advanceOf = (strike: Strike, text: string) => [...text].reduce((w, ch) => w + strike.glyphs[ch]!.advance, 0)

/** `text`, or as much of it as fits in `room` design px, ended with an ellipsis. */
function fit(strike: Strike, text: string, room: number): string {
  if (advanceOf(strike, text) <= room) return text
  if (!strike.glyphs['…']) throw new Error(`${strike.family} has no ${describe('…')} to shorten "${text}" with`)
  const chars = [...text]
  while (chars.length && advanceOf(strike, chars.join('').trimEnd() + '…') > room) chars.pop()
  return chars.join('').trimEnd() + '…'
}

/** Set `text` in `slot`: each glyph's ink a `scale` × `scale` square of the slot's ink, inside the slot's em box. */
function setLine(box: Pixels, slot: TextSlot, text: string): void {
  const { strike, scale } = slot
  for (const ch of text) {
    if (!strike.glyphs[ch]) throw new Error(`${strike.family} has no ${describe(ch)}, in "${text}"`)
  }
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(slot.ink)
  if (!m) throw new Error(`the frame's ink "${slot.ink}" is not #rrggbb`)
  const ink = Uint8Array.of(parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16), 255)

  const line = fit(strike, text, slot.width / scale)
  const width = advanceOf(strike, line) * scale
  const offset =
    slot.align === 'center'
      ? Math.floor((slot.width - width) / 2 / scale) * scale
      : slot.align === 'right'
        ? slot.width - width
        : 0
  const clip = { left: slot.left, top: slot.top, width: slot.width, height: (strike.ascent + strike.descent) * scale }
  const baseline = slot.top + strike.ascent * scale
  let pen = slot.left + offset
  for (const ch of line) {
    const glyph = strike.glyphs[ch]!
    glyph.rows.forEach((row, r) => {
      const top = baseline - (glyph.y0 + glyph.height - r) * scale
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== '#') continue
        const left = pen + (glyph.x0 + c) * scale
        for (let y = Math.max(top, clip.top, 0); y < Math.min(top + scale, clip.top + clip.height, box.height); y++) {
          for (let x = Math.max(left, clip.left, 0); x < Math.min(left + scale, clip.left + clip.width, box.width); x++) {
            blend(box, x, y, ink)
          }
        }
      }
    })
    pen += glyph.advance * scale
  }
}
