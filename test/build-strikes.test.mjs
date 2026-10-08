// The faces as data (src/styles/*-strike.ts), which the box's text is set
// from: each strike holds every character its glyph manifest lists, with the
// advance, placement, size and ink the manifest gives it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { VF_BODY_STRIKE } from '../scripts/.tmp/unit/styles/body-strike.js'
import { VF_DISPLAY_STRIKE } from '../scripts/.tmp/unit/styles/display-strike.js'

/** A manifest's font table and its entries, read plainly. */
function manifest(name) {
  const lines = readFileSync(new URL(`../fonts/${name}`, import.meta.url), 'utf8').split('\n')
  const table = {}
  const entries = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '== font ==') {
      for (i += 2; lines[i]; i++) {
        const [key, value] = lines[i].split(',')
        table[key] = value
      }
    } else if (lines[i].startsWith('== U+')) {
      const fields = lines[i + 2].split(',')
      const [advance, x0, y0, width, height] = fields.slice(-5).map((v) => Number(v || 0))
      const rows = []
      for (i += 4; lines[i]; i++) rows.push(lines[i])
      entries.push({ char: String.fromCodePoint(parseInt(fields[0].slice(2), 16)), advance, x0, y0, width, height, rows })
    }
  }
  return { table, entries }
}

for (const [file, strike] of [
  ['VF-Display.glyphs.txt', VF_DISPLAY_STRIKE],
  ['VF-Body.glyphs.txt', VF_BODY_STRIKE],
]) {
  test(`${strike.family}: every character the manifest lists, as it lists it`, () => {
    const { table, entries } = manifest(file)
    assert.equal(strike.family, table.family)
    assert.equal(strike.ascent, Number(table.ascent))
    assert.equal(strike.descent, Number(table.descent))
    assert.equal(entries.length, Number(table.characters))
    assert.equal(Object.keys(strike.glyphs).length, entries.length)
    for (const { char, rows, ...metrics } of entries) {
      const glyph = strike.glyphs[char]
      assert.ok(glyph, `U+${char.codePointAt(0).toString(16)} is missing`)
      const { rows: inked, ...placed } = glyph
      assert.deepEqual(placed, metrics, `U+${char.codePointAt(0).toString(16)}`)
      assert.deepEqual(inked, rows[0] === '(no ink)' ? [] : rows)
    }
  })

  test(`${strike.family}: rows agree with each glyph's size, in # and . alone; the spaces have an advance and no ink`, () => {
    for (const [char, glyph] of Object.entries(strike.glyphs)) {
      assert.equal(glyph.rows.length, glyph.height, char)
      for (const row of glyph.rows) {
        assert.equal(row.length, glyph.width, char)
        assert.match(row, /^[#.]+$/)
      }
    }
    for (const space of [' ', ' ', ' ']) {
      assert.ok(strike.glyphs[space].advance > 0)
      assert.deepEqual(strike.glyphs[space].rows, [])
    }
  })
}
