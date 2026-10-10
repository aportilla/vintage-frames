// The box (src/build/box.ts), against a small frame and strike made here:
// a line of text with the manifest's fields in it, each glyph's ink where
// the strike puts it, at the slot's scale and in its ink, shortened with an
// ellipsis when it doesn't fit; artwork at the slot's size or a whole
// fraction of it, the icon stamped without any; and the frame's own pixels
// everywhere else. Then the kit's own frame, drawn at BOX_SCALE, and a box
// in it without artwork, on its grid.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { drawBox } from '../scripts/.tmp/unit/build/box.js'
import { FRAME } from '../scripts/.tmp/unit/build/frame.js'
import { decodePng, encodePng } from '../scripts/.tmp/unit/build/png.js'
import { composeBox } from '../scripts/.tmp/unit/build/index.js'
import { BOX_SCALE } from '../scripts/.tmp/unit/shell/pure.js'

const STRIKE = {
  family: 'Test',
  ascent: 3,
  descent: 1,
  glyphs: {
    A: { advance: 3, x0: 0, y0: 0, width: 2, height: 3, rows: ['##', '#.', '##'] },
    B: { advance: 2, x0: 0, y0: -1, width: 1, height: 2, rows: ['#', '#'] },
    ' ': { advance: 1, x0: 0, y0: 0, width: 0, height: 0, rows: [] },
    '…': { advance: 2, x0: 0, y0: 0, width: 1, height: 1, rows: ['#'] },
  },
}

/** Pixels whose every px differs from its neighbors', so a moved px shows. */
const pixels = (width, height, f) => {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(f(x, y), (y * width + x) * 4)
  return { width, height, data }
}
const at = (px, x, y) => [...px.data.subarray((y * px.width + x) * 4, (y * px.width + x) * 4 + 4)]

const picture = pixels(100, 80, (x, y) => [x * 2, y * 3, 99, 255])
const ARTWORK = { left: 4, top: 4, width: 64, height: 64, stamp: 2 }
const NAME = { left: 70, top: 4, width: 20, strike: STRIKE, scale: 2, ink: '#ff0000', text: '{name}' }
const SHORT = { left: 70, top: 20, width: 10, strike: STRIKE, scale: 1, ink: '#00ff00', text: '{name} {author}' }
const MANIFEST = { format: 1, id: 'ab', name: 'AB', version: 'A', requires: '^0.16.2', author: 'BA', icon: 'data:,' }

const frame = async (text = [NAME, SHORT]) => ({ picture: await encodePng(picture), artwork: ARTWORK, text })
/** An icon opaque on every third diagonal, transparent between. */
const icon = () => encodePng(pixels(32, 32, (x, y) => ((x + y) % 3 ? [0, 0, 0, 0] : [x * 8, y * 8, 7, 255])))

/** Whether (x, y) is inside one of `cells`' size × size squares. */
const inside = (cells, size, x, y) => cells.some(([cx, cy]) => x >= cx && x < cx + size && y >= cy && y < cy + size)

test('a line: the manifest\'s fields, each glyph\'s ink where the strike puts it, at the slot\'s scale and in its ink', async () => {
  const box = await drawBox(await frame(), { manifest: MANIFEST, icon: await icon() })
  // "AB" at 2×, its baseline at 4 + 3 × 2: A's three rows, then B's two, one below the baseline.
  const cells = [[70, 4], [72, 4], [70, 6], [70, 8], [72, 8], [76, 8], [76, 10]]
  for (let y = 4; y < 4 + 8; y++) {
    for (let x = 70; x < 90; x++) {
      assert.deepEqual(at(box, x, y), inside(cells, 2, x, y) ? [255, 0, 0, 255] : at(picture, x, y), `${x},${y}`)
    }
  }
})

test('a line too long for its slot ends in an ellipsis', async () => {
  const box = await drawBox(await frame(), { manifest: MANIFEST, icon: await icon() })
  // "AB BA" is 11 px and the slot 10: "AB B…".
  const cells = [[70, 20], [71, 20], [70, 21], [70, 22], [71, 22], [73, 22], [73, 23], [76, 22], [76, 23], [78, 22]]
  for (let y = 20; y < 24; y++) {
    for (let x = 70; x < 80; x++) {
      assert.deepEqual(at(box, x, y), inside(cells, 1, x, y) ? [0, 255, 0, 255] : at(picture, x, y), `${x},${y}`)
    }
  }
})

test('a character the strike lacks is refused, naming it', async () => {
  await assert.rejects(
    drawBox(await frame(), { manifest: { ...MANIFEST, name: 'AC' }, icon: await icon() }),
    /Test has no "C" \(U\+0043\), in "AC"/
  )
})

test('artwork at the slot\'s size lands as it is, by its alpha', async () => {
  const art = pixels(64, 64, (x, y) => (x === y ? [0, 0, 0, 0] : [x, y, 200, 255]))
  const box = await drawBox(await frame([]), { manifest: MANIFEST, icon: await icon(), artwork: await encodePng(art) })
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      assert.deepEqual(at(box, 4 + x, 4 + y), x === y ? at(picture, 4 + x, 4 + y) : at(art, x, y))
    }
  }
})

test('artwork at a whole fraction of the slot is magnified to fill it; any other size is refused, naming the slot\'s', async () => {
  const art = pixels(16, 16, (x, y) => [x * 16, y * 16, 50, 255])
  const box = await drawBox(await frame([]), { manifest: MANIFEST, icon: await icon(), artwork: await encodePng(art) })
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) assert.deepEqual(at(box, 4 + x, 4 + y), at(art, x >> 2, y >> 2))
  }
  for (const [w, h] of [[30, 30], [32, 16]]) {
    await assert.rejects(
      drawBox(await frame([]), { manifest: MANIFEST, icon: await icon(), artwork: await encodePng(pixels(w, h, () => [0, 0, 0, 255])) }),
      new RegExp(`the artwork is ${w} × ${h}: draw it at 64 × 64, or that divided by a whole number \\(32 × 32, 16 × 16`)
    )
  }
})

test('without artwork, the icon is stamped: magnified, centered, pasted by its alpha', async () => {
  const stamp = await decodePng(await icon())
  const box = await drawBox(await frame([]), { manifest: MANIFEST, icon: await icon() })
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const px = at(stamp, x >> 1, y >> 1)
      assert.deepEqual(at(box, 4 + x, 4 + y), px[3] ? px : at(picture, 4 + x, 4 + y))
    }
  }
  await assert.rejects(
    drawBox(await frame([]), { manifest: MANIFEST, icon: await encodePng(pixels(16, 16, () => [0, 0, 0, 255])) }),
    /the icon is 16 × 16, and an icon is 32 × 32/
  )
})

test('everything outside the slots is the frame\'s', async () => {
  const art = await encodePng(pixels(32, 32, () => [1, 2, 3, 255]))
  for (const artwork of [art, undefined]) {
    const box = await drawBox(await frame(), { manifest: MANIFEST, icon: await icon(), artwork })
    const slots = [ARTWORK, { ...NAME, height: 8 }, { ...SHORT, height: 4 }]
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 100; x++) {
        if (slots.some((s) => x >= s.left && x < s.left + s.width && y >= s.top && y < s.top + s.height)) continue
        assert.deepEqual(at(box, x, y), at(picture, x, y), `${x},${y}`)
      }
    }
  }
})

test('the kit\'s frame: its picture reads, its slots lie inside it, and a box composes in it', async () => {
  const { width, height } = await decodePng(FRAME.picture)
  const inBounds = (s, h) => s.left >= 0 && s.top >= 0 && s.left + s.width <= width && s.top + h <= height
  assert.ok(inBounds(FRAME.artwork, FRAME.artwork.height))
  assert.ok(32 * FRAME.artwork.stamp <= Math.min(FRAME.artwork.width, FRAME.artwork.height))
  for (const line of FRAME.text) assert.ok(inBounds(line, (line.strike.ascent + line.strike.descent) * line.scale), line.text)
  const box = await decodePng(
    await composeBox({
      manifest: { ...MANIFEST, name: 'Meteors', version: '0.1.0', author: 'Adam Portilla' },
      icon: await icon(),
    })
  )
  assert.equal(box.width, width)
  assert.equal(box.height, height)
})

test('the kit\'s frame is drawn at BOX_SCALE: its picture and every slot are whole system px, and its text is set at that scale', async () => {
  const { width, height } = await decodePng(FRAME.picture)
  const whole = (...ns) => ns.every((n) => n % BOX_SCALE === 0)
  assert.ok(whole(width, height), `the picture, ${width} × ${height}`)
  const { left, top, width: w, height: h } = FRAME.artwork
  assert.ok(whole(left, top, w, h), 'the artwork slot')
  for (const line of FRAME.text) {
    assert.ok(whole(line.left, line.top, line.width), line.text)
    assert.equal(line.scale, BOX_SCALE, line.text)
  }
})

test('a box without artwork is on the grid: every block of BOX_SCALE × BOX_SCALE px is one color, the stamped icon\'s too', async () => {
  const { width, height, data } = await decodePng(
    await composeBox({
      manifest: { ...MANIFEST, name: 'Meteors', version: '0.1.0', author: 'Adam Portilla' },
      icon: await icon(),
    })
  )
  const off = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const corner = ((y - (y % BOX_SCALE)) * width + x - (x % BOX_SCALE)) * 4
      if ([0, 1, 2, 3].some((c) => data[i + c] !== data[corner + c])) off.push(`${x},${y}`)
    }
  }
  assert.deepEqual(off.slice(0, 5), [], `${off.length} px differ from their block's top-left`)
})
