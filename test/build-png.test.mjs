// The build entry's PNG pixels (src/build/png.ts): each form art comes in
// reads to the same pixels, 16-bit and interlaced files are refused naming
// what to save them as, and what the encoder writes reads back pixel for
// pixel. The PNGs here are made with Node's zlib, every row filtered a
// different way.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'

import { decodePng, encodePng } from '../scripts/.tmp/unit/build/png.js'

const W = 5
const H = 5

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

const paeth = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/**
 * A PNG of `samples` (per pixel, its channels' values), packed at `depth`,
 * row y filtered with filter y % 5, its image data split over two IDATs.
 */
function png({ color, depth, samples, plte, trns, interlace = 0 }) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color]
  const stride = Math.ceil((W * channels * depth) / 8)
  const bpp = Math.max(1, (channels * depth) >> 3)
  const lines = []
  for (let y = 0; y < H; y++) {
    const line = Buffer.alloc(stride)
    let bit = 0
    for (let x = 0; x < W; x++) {
      for (const v of samples[y * W + x]) {
        if (depth === 16) line.writeUInt16BE(v, bit >> 3)
        else line[bit >> 3] |= v << (8 - depth - (bit & 7))
        bit += depth
      }
    }
    lines.push(line)
  }
  const raw = []
  lines.forEach((line, y) => {
    const f = y % 5
    const out = Buffer.alloc(stride + 1)
    out[0] = f
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0
      const b = y ? lines[y - 1][x] : 0
      const c = x >= bpp && y ? lines[y - 1][x - bpp] : 0
      const p = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]
      out[x + 1] = (line[x] - p) & 0xff
    }
    raw.push(out)
  })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = depth
  ihdr[9] = color
  ihdr[12] = interlace
  const idat = zlib.deflateSync(Buffer.concat(raw))
  const half = idat.length >> 1
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      ...(plte ? [chunk('PLTE', Buffer.from(plte.flat()))] : []),
      ...(trns ? [chunk('tRNS', Buffer.from(trns))] : []),
      chunk('IDAT', idat.subarray(0, half)),
      chunk('IDAT', idat.subarray(half)),
      chunk('IEND', Buffer.alloc(0)),
    ])
  )
}

/** The pixel at i, of n values, as a deterministic run through the range. */
const level = (i, max) => (i * 7 + 3) % (max + 1)

async function reads(bytes, expected) {
  const { width, height, data } = await decodePng(bytes)
  assert.equal(width, W)
  assert.equal(height, H)
  assert.deepEqual([...data], expected.flat())
}

const pixels = Array.from({ length: W * H }, (_, i) => i)

test('gray at 1, 2, 4 and 8 bits reads as gray, scaled to 8 bits', async () => {
  for (const depth of [1, 2, 4, 8]) {
    const max = (1 << depth) - 1
    const samples = pixels.map((i) => [level(i, max)])
    const expected = samples.map(([v]) => {
      const g = Math.round((v * 255) / max)
      return [g, g, g, 255]
    })
    await reads(png({ color: 0, depth, samples }), expected)
  }
})

test('gray with tRNS: the keyed gray is transparent', async () => {
  const samples = pixels.map((i) => [i % 3 ? 200 : 64])
  const expected = samples.map(([v]) => [v, v, v, v === 64 ? 0 : 255])
  await reads(png({ color: 0, depth: 8, samples, trns: [0, 64] }), expected)
})

test('gray with alpha, RGB with tRNS, and RGBA read as they are', async () => {
  const ga = pixels.map((i) => [level(i, 255), (i * 50) % 256])
  await reads(png({ color: 4, depth: 8, samples: ga }), ga.map(([v, a]) => [v, v, v, a]))
  const rgb = pixels.map((i) => (i % 4 ? [i * 9, 255 - i, (i * 31) % 256] : [1, 2, 3]))
  await reads(png({ color: 2, depth: 8, samples: rgb, trns: [0, 1, 0, 2, 0, 3] }), rgb.map(([r, g, b]) => [r, g, b, r === 1 && g === 2 && b === 3 ? 0 : 255]))
  const rgba = pixels.map((i) => [i * 9, 255 - i, (i * 31) % 256, (i * 40) % 256])
  await reads(png({ color: 6, depth: 8, samples: rgba }), rgba)
})

test('indexed at 1, 2, 4 and 8 bits reads its palette, alpha from tRNS where it has one', async () => {
  const palette = [
    [255, 255, 255],
    [0, 0, 0],
    [255, 0, 0],
    [0, 128, 255],
  ]
  for (const depth of [1, 2, 4, 8]) {
    const colors = Math.min(4, 1 << depth)
    const samples = pixels.map((i) => [level(i, colors - 1)])
    const trns = [0]
    const expected = samples.map(([k]) => [...palette[k], k === 0 ? 0 : 255])
    await reads(png({ color: 3, depth, samples, plte: palette.slice(0, colors), trns }), expected)
  }
})

test('16-bit and interlaced files are refused, naming what to save them as', async () => {
  const samples = pixels.map(() => [0, 0, 0, 65535])
  await assert.rejects(decodePng(png({ color: 6, depth: 16, samples }), 'the artwork'), /^Error: the artwork is a 16-bit PNG: save it as an 8-bit PNG$/)
  const gray = pixels.map(() => [0])
  await assert.rejects(decodePng(png({ color: 0, depth: 8, samples: gray, interlace: 1 }), 'the icon'), /^Error: the icon is interlaced: save it as a non-interlaced PNG$/)
})

test('what the encoder writes reads back pixel for pixel', async () => {
  const width = 37
  const height = 11
  const data = Uint8Array.from({ length: width * height * 4 }, (_, i) => (i * 73 + (i >> 5)) % 256)
  const back = await decodePng(await encodePng({ width, height, data }))
  assert.equal(back.width, width)
  assert.equal(back.height, height)
  assert.deepEqual(back.data, data)
})
