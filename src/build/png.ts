/**
 * PNG pixels, with no canvas and no dependency: a decoder for the forms art
 * comes in, and an encoder for the box.
 *
 * - Decoding takes 8-bit gray, RGB, gray with alpha and RGBA, and indexed
 *   or gray at 1, 2, 4 or 8 bits, non-interlaced, with their transparency.
 *   16-bit and interlaced files are refused, naming what to save them as.
 * - Encoding writes 8-bit RGBA, each row filtered the way that compresses
 *   it best.
 */

import { crc32, deflate, inflate, PNG_SIGNATURE, pngChunks } from '../shell/app-file.js'

/** Straight RGBA, 8 bits a channel, rows top first. */
export interface Pixels {
  width: number
  height: number
  data: Uint8Array
}

/** Channels per pixel, by color type: gray, RGB, indexed, gray and alpha, RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/** `parts`, end to end. */
export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** One chunk, with its length and CRC. */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** A PNG's pixels. `what` names it in an error: "the artwork". */
export async function decodePng(bytes: Uint8Array, what = 'the PNG'): Promise<Pixels> {
  const chunks = pngChunks(bytes)
  const ihdr = chunks?.[0]
  if (!chunks || ihdr?.type !== 'IHDR' || ihdr.data.length !== 13) throw new Error(`${what} is not a whole PNG`)
  const head = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, 13)
  const width = head.getUint32(0)
  const height = head.getUint32(4)
  const [depth, color, compression, filtering, interlace] = ihdr.data.subarray(8)
  if (depth === 16) throw new Error(`${what} is a 16-bit PNG: save it as an 8-bit PNG`)
  if (interlace) throw new Error(`${what} is interlaced: save it as a non-interlaced PNG`)
  const channels = CHANNELS[color!]
  const depthOk = color === 0 || color === 3 ? [1, 2, 4, 8].includes(depth!) : depth === 8
  if (!channels || !depthOk || compression || filtering) {
    throw new Error(`${what} is a kind of PNG this kit doesn't read (color type ${color}, ${depth} bits): save it as an 8-bit PNG`)
  }

  let palette: Uint8Array | null = null
  /** Indexed: each palette entry's alpha. Gray and RGB: the one color that is transparent. */
  let trns: Uint8Array | null = null
  const idat: Uint8Array[] = []
  for (const { type, data } of chunks) {
    if (type === 'PLTE') palette = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IDAT') idat.push(data)
  }
  if (color === 3 && !palette) throw new Error(`${what} is indexed and has no palette`)

  const bits = channels * depth!
  const stride = Math.ceil((width * bits) / 8)
  const raw = await inflate(concat(idat)).catch(() => {
    throw new Error(`${what} is not a whole PNG`)
  })
  if (raw.length < height * (stride + 1)) throw new Error(`${what} is not a whole PNG`)
  const rows = unfilter(raw, height, stride, Math.max(1, bits >> 3), what)

  const max = (1 << depth!) - 1
  /** The x-th sample of a row of sub-byte samples. */
  const sample = (row: number, x: number) => {
    const bit = x * depth!
    return (rows[row + (bit >> 3)]! >> (8 - depth! - (bit & 7))) & max
  }
  /** The i-th sample of the transparent color, or -1. */
  const keyed = (i: number) => (trns && trns.length >= i * 2 + 2 ? (trns[i * 2]! << 8) | trns[i * 2 + 1]! : -1)

  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const row = y * stride
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (color === 0) {
        const v = depth === 8 ? rows[row + x]! : sample(row, x)
        data[o] = data[o + 1] = data[o + 2] = Math.round((v * 255) / max)
        data[o + 3] = v === keyed(0) ? 0 : 255
      } else if (color === 3) {
        const i = depth === 8 ? rows[row + x]! : sample(row, x)
        if (i * 3 + 2 >= palette!.length) throw new Error(`${what} uses a color its palette lacks`)
        data[o] = palette![i * 3]!
        data[o + 1] = palette![i * 3 + 1]!
        data[o + 2] = palette![i * 3 + 2]!
        data[o + 3] = trns?.[i] ?? 255
      } else if (color === 2) {
        const p = row + x * 3
        data.set(rows.subarray(p, p + 3), o)
        const opaque = rows[p] !== keyed(0) || rows[p + 1] !== keyed(1) || rows[p + 2] !== keyed(2)
        data[o + 3] = opaque ? 255 : 0
      } else if (color === 4) {
        const p = row + x * 2
        data[o] = data[o + 1] = data[o + 2] = rows[p]!
        data[o + 3] = rows[p + 1]!
      } else {
        data.set(rows.subarray(row + x * 4, row + x * 4 + 4), o)
      }
    }
  }
  return { width, height, data }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** What filter `f` predicts from the byte to the left, above, and above left. */
function predict(f: number, a: number, b: number, c: number): number {
  return f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0
}

/** The scanlines with their filters undone, filter bytes dropped. */
function unfilter(raw: Uint8Array, height: number, stride: number, bpp: number, what: string): Uint8Array {
  const out = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!
    if (f > 4) throw new Error(`${what} is not a whole PNG`)
    const src = y * (stride + 1) + 1
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp]! : 0
      const b = y ? out[row - stride + x]! : 0
      const c = x >= bpp && y ? out[row - stride + x - bpp]! : 0
      out[row + x] = (raw[src + x]! + predict(f, a, b, c)) & 0xff
    }
  }
  return out
}

/** Pixels as an 8-bit RGBA PNG. */
export async function encodePng({ width, height, data }: Pixels): Promise<Uint8Array> {
  const stride = width * 4
  const raw = new Uint8Array(height * (stride + 1))
  const lines = Array.from({ length: 5 }, () => new Uint8Array(stride))
  for (let y = 0; y < height; y++) {
    const row = y * stride
    let best = 0
    let least = Infinity
    for (let f = 0; f < 5; f++) {
      const line = lines[f]!
      let sum = 0
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? data[row + x - 4]! : 0
        const b = y ? data[row - stride + x]! : 0
        const c = x >= 4 && y ? data[row - stride + x - 4]! : 0
        const v = (data[row + x]! - predict(f, a, b, c)) & 0xff
        line[x] = v
        sum += v < 128 ? v : 256 - v
      }
      if (sum < least) {
        least = sum
        best = f
      }
    }
    raw[y * (stride + 1)] = best
    raw.set(lines[best]!, y * (stride + 1) + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 6
  return concat([PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', await deflate(raw)), pngChunk('IEND', new Uint8Array(0))])
}
