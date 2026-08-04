/**
 * Regenerates src/cursor-art.ts from cursors/*.png — the embedded System 7
 * pointer set `applyCursor()` ships by default.
 *
 * The PNGs in cursors/ are the source of truth for the pixels; this manifest
 * is the source of truth for everything a PNG cannot state: the hotspot (the
 * art pixel that lands on the cell under the pointer) and whether the art
 * draws with the XOR pen. Dimensions are read from each file's IHDR, and a
 * multi-frame set is checked for one shared size.
 *
 * XOR art also gets a STATIC variant, for the engines whose top layer cannot
 * blend (stable Safari — see the sniff note in src/cursor.ts): the same ink
 * with a one-pixel white halo dilated from its alpha, the arrow's own
 * outline treatment, drawn as-is instead of inverting. Both variants are
 * padded by one transparent pixel so the halo has room and the two share one
 * box and hotspot (the manifest hotspot below is pre-pad, in the source
 * file's own coordinates). Hand-drawn art wins over the generated halo:
 * add `cursors/<name>-static.png` (same size as the padded box) and re-run.
 *
 * The runtime copies are data URIs for the same reason the bitmap faces are
 * base64 in src/styles/*-font.ts: the package ships no asset files and no
 * asset pipeline — a data URI resolves inside the module graph, so the set
 * works from a bundler, an import map, or a bare <script type="module">
 * alike.
 *
 *   npm run embed:cursors
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const CURSORS = [
  {
    name: 'CURSOR_ARROW',
    files: ['arrow.png'],
    hotspot: [1, 1],
    invert: false,
    doc: `The System 7 arrow. Hotspot on the black tip at (1,1), inside the
 * white outline whose corner is (0,0); the outline is what keeps it legible
 * on any background, so it draws as-is rather than with the XOR pen.`,
  },
  {
    name: 'CURSOR_I_BEAM',
    files: ['i-beam.png'],
    hotspot: [3, 7],
    invert: true,
    staticName: 'i-beam-static.png',
    doc: `The text-entry I-beam. Hotspot mid-stem, per the classic CURS
 * resource; draws with the XOR pen, as System 7 drew it, with a white-halo
 * static variant for the engines that cannot (see \`staticSrc\`).`,
  },
  {
    name: 'CURSOR_CROSSHAIR',
    files: ['crosshair.png'],
    hotspot: [6, 6],
    invert: true,
    staticName: 'crosshair-static.png',
    doc: `The crosshair. Hotspot on the intersection; draws with the XOR pen,
 * as System 7 drew it, with a white-halo static variant for the engines
 * that cannot (see \`staticSrc\`).`,
  },
  {
    name: 'CURSOR_WAIT',
    files: Array.from({ length: 8 }, (_, i) => `wait-${i + 1}.png`),
    hotspot: [8, 8],
    invert: false,
    doc: `The wristwatch, 8 frames of turning hand. Opaque white face, so it
 * reads on any background drawn as-is.`,
  },
]

/* ── Minimal PNG codec (8-bit RGBA, enough for this art) ─────────────────── */

function decodePng(buffer) {
  let pos = 8
  let w, h, bitDepth, colorType
  let idat = Buffer.alloc(0)
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const chunk = buffer.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = chunk.readUInt32BE(0)
      h = chunk.readUInt32BE(4)
      bitDepth = chunk[8]
      colorType = chunk[9]
    } else if (type === 'IDAT') idat = Buffer.concat([idat, chunk])
    pos += 12 + len
  }
  if (bitDepth !== 8 || colorType !== 6)
    throw new Error(`expected 8-bit RGBA PNG, got depth ${bitDepth} colortype ${colorType}`)
  const raw = zlib.inflateSync(idat)
  const stride = w * 4
  const px = Buffer.alloc(w * h * 4)
  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const o = y * stride
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? px[o + x - 4] : 0
      const up = y > 0 ? px[o - stride + x] : 0
      const ul = y > 0 && x >= 4 ? px[o - stride + x - 4] : 0
      let v = line[x]
      if (f === 1) v += left
      else if (f === 2) v += up
      else if (f === 3) v += (left + up) >> 1
      else if (f === 4) v += paeth(left, up, ul)
      px[o + x] = v & 255
    }
  }
  return { w, h, px }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function encodePng(w, h, px) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'ascii')
    data.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ── Art transforms ──────────────────────────────────────────────────────── */

/** One transparent pixel of border all round (halo room; same box for both
 *  variants). */
function pad(img) {
  const w = img.w + 2
  const h = img.h + 2
  const px = Buffer.alloc(w * h * 4)
  for (let y = 0; y < img.h; y++)
    img.px.copy(px, ((y + 1) * w + 1) * 4, y * img.w * 4, (y + 1) * img.w * 4)
  return { w, h, px }
}

/** The static variant: every transparent pixel touching ink (8-neighborhood)
 *  becomes opaque white — the arrow's own outline treatment. */
function halo(img) {
  const { w, h } = img
  const px = Buffer.from(img.px)
  const inky = (x, y) => x >= 0 && y >= 0 && x < w && y < h && img.px[(y * w + x) * 4 + 3] > 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (px[i + 3] > 0) continue
      outline: for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && inky(x + dx, y + dy)) {
            px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 255
            break outline
          }
    }
  return { w, h, px }
}

const uri = (img) => `data:image/png;base64,${encodePng(img.w, img.h, img.px).toString('base64')}`

/* ── Emit ────────────────────────────────────────────────────────────────── */

const blocks = []
const summary = []
for (const { name, files, hotspot, invert, staticName, doc } of CURSORS) {
  let size
  const images = files.map((file) => {
    const img = decodePng(readFileSync(join(ROOT, 'cursors', file)))
    if (size && (img.w !== size.w || img.h !== size.h))
      throw new Error(`${name}: ${file} is ${img.w}×${img.h}, expected ${size.w}×${size.h}`)
    size = { w: img.w, h: img.h }
    return img
  })

  // XOR art is padded (both variants alike) so the halo has room; the
  // hotspot moves with it.
  const padded = invert ? images.map(pad) : images
  const [hx, hy] = invert ? [hotspot[0] + 1, hotspot[1] + 1] : hotspot
  const box = { w: padded[0].w, h: padded[0].h }

  const srcList = padded.map(uri)
  const src =
    srcList.length === 1
      ? `'${srcList[0]}'`
      : `[\n    ${srcList.map((u) => `'${u}'`).join(',\n    ')},\n  ]`

  let staticField = ''
  if (invert) {
    const overridePath = join(ROOT, 'cursors', staticName)
    let staticImg
    let provenance
    if (existsSync(overridePath)) {
      staticImg = decodePng(readFileSync(overridePath))
      if (staticImg.w !== box.w || staticImg.h !== box.h)
        throw new Error(
          `${staticName} is ${staticImg.w}×${staticImg.h}; the padded box is ${box.w}×${box.h}`
        )
      provenance = 'hand-drawn'
    } else {
      staticImg = halo(padded[0])
      provenance = 'auto-halo'
    }
    staticField = `\n  staticSrc: '${uri(staticImg)}',`
    summary.push(`${name} static: ${provenance}`)
  }

  blocks.push(`/**
 * ${doc}
 */
export const ${name}: VfCursorArt = {
  src: ${src},${staticField}
  width: ${box.w},
  height: ${box.h},
  hotspotX: ${hx},
  hotspotY: ${hy},${invert ? '\n  invert: true,' : ''}
}`)
}

const out = `/**
 * The embedded System 7 pointer set — GENERATED by \`npm run embed:cursors\`
 * from \`cursors/*.png\`; edit the art there (or the hotspot/XOR manifest in
 * \`scripts/embed-cursor-art.mjs\`) and re-run rather than editing this file.
 *
 * Like the bitmap faces, the art ships base64-embedded so the package needs
 * no asset files: these are the defaults \`applyCursor()\` uses, exported so a
 * consumer can pass one explicitly, remap it to another kind, or mix the set
 * with art of their own. XOR art carries a \`staticSrc\` variant — the same
 * ink under a one-pixel white halo — for the engines whose top layer cannot
 * blend; supply \`cursors/<name>-static.png\` to replace the generated halo
 * with hand-drawn art.
 */
import type { VfCursorArt } from './cursor.js'

${blocks.join('\n\n')}
`

writeFileSync(join(ROOT, 'src/cursor-art.ts'), out)
console.log(
  `src/cursor-art.ts: ${CURSORS.map((c) => `${c.name} (${c.files.length} frame${c.files.length > 1 ? 's' : ''})`).join(', ')}; ${summary.join(', ')}`
)
