// App files: what the build entry writes (src/build/app-file.ts), the
// shell's reader reads back (src/shell/app-file.ts), a description with it or
// not; a PNG that isn't one reads as null, and `inspectAppFile` says why; a
// version or range not exactly as semver writes it is refused; `satisfies`
// checks a version against a range and `compareVersions` puts versions in
// semver's order, neither throwing on what isn't one; and the kit's VERSION
// is package.json's.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import zlib from 'node:zlib'

import {
  APP_FILE_FORMAT,
  VERSION,
  compareVersions,
  inspectAppFile,
  readAppFile,
  satisfies,
} from '../scripts/.tmp/unit/shell/pure.js'
import { appFile, packApp, writeAppFile } from '../scripts/.tmp/unit/build/index.js'
import { encodePng } from '../scripts/.tmp/unit/build/png.js'

/** A PNG's chunks, each with where it sits in the file and its bytes there. */
function chunksOf(bytes) {
  const buf = Buffer.from(bytes)
  const out = []
  for (let at = 8; at < buf.length; ) {
    const end = at + 12 + buf.readUInt32BE(at)
    const type = buf.toString('latin1', at + 4, at + 8)
    const data = buf.subarray(at + 8, end - 4)
    out.push({ at, type, raw: buf.subarray(at, end), keyword: type === 'iTXt' ? data.toString('latin1', 0, data.indexOf(0)) : null })
    at = end
  }
  return out
}
const assemble = (chunks) => new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks.map((c) => c.raw)]))
function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])), 0)
  return { type, raw: Buffer.concat([head, data, crc]) }
}
const itxt = (keyword, text, compressed) =>
  chunk('iTXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0, compressed ? 1 : 0, 0, 0, 0]), compressed ? zlib.deflateSync(text) : Buffer.from(text)]))

const pixels = (width, height, f) => {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(f(i % width, Math.floor(i / width)), i * 4)
  return { width, height, data }
}

const ICON = await encodePng(pixels(32, 32, (x, y) => [x * 8, y * 8, 0, (x + y) % 2 ? 255 : 0]))
const ICON_URL = `data:image/png;base64,${Buffer.from(ICON).toString('base64')}`
const MANIFEST = { format: APP_FILE_FORMAT, id: 'meteors', name: 'Meteors', version: '0.1.0', requires: '^0.16.2', author: 'Adam Portilla', icon: ICON_URL }
const CODE = "import { defineApp } from 'vintage-frames/shell'\nexport default () => defineApp({ id: 'meteors' }) // ☄\n"

/** A box with chunks of its own around its image data. */
async function box() {
  const plain = chunksOf(await encodePng(pixels(6, 4, (x, y) => [x * 40, y * 60, 9, 255])))
  return assemble([plain[0], chunk('tEXt', Buffer.from('Comment\0a box')), ...plain.slice(1)])
}

/** An app file made by hand, so the reader meets manifests no writer would write. */
async function handMade(manifest) {
  const chunks = chunksOf(await box())
  const app = [itxt('vintage-frames.app', JSON.stringify(manifest), false), itxt('vintage-frames.code', CODE, true)]
  return assemble([...chunks.slice(0, -1), ...app, chunks.at(-1)])
}

/** The manifest's JSON as the file holds it, past its iTXt chunk's keyword and header. */
function manifestText(file) {
  const { raw } = chunksOf(file).find((c) => c.keyword === 'vintage-frames.app')
  return raw.toString('utf8', 8 + 'vintage-frames.app'.length + 5, raw.length - 4)
}

test('a written app file reads back its manifest and code, and its other chunks are the box\'s', async () => {
  const before = await box()
  const file = await writeAppFile(before, MANIFEST, CODE)
  assert.deepEqual(await readAppFile(file), { manifest: MANIFEST, code: CODE })
  const kept = chunksOf(file).filter((c) => !c.keyword?.startsWith('vintage-frames.'))
  assert.deepEqual(kept.map((c) => c.raw), chunksOf(before).map((c) => c.raw))
  assert.deepEqual(chunksOf(file).slice(-3).map((c) => c.keyword ?? c.type), ['vintage-frames.app', 'vintage-frames.code', 'IEND'])
})

test('writing over an app file replaces its app chunks rather than adding a second pair', async () => {
  const once = await writeAppFile(await box(), MANIFEST, CODE)
  const twice = await writeAppFile(once, { ...MANIFEST, version: '0.2.0' }, 'export default () => ({})')
  assert.equal(chunksOf(twice).filter((c) => c.keyword?.startsWith('vintage-frames.')).length, 2)
  const read = await readAppFile(twice)
  assert.equal(read.manifest.version, '0.2.0')
  assert.equal(read.code, 'export default () => ({})')
})

test('packed, the manifest holds its format and the icon\'s file byte for byte, and the box is a picture', async () => {
  const file = await packApp({
    manifest: { id: 'meteors', name: 'Meteors', version: '0.1.0', requires: '^0.16.2', author: 'Adam Portilla' },
    icon: ICON,
    code: CODE,
  })
  const { manifest, code } = await readAppFile(file)
  assert.equal(manifest.format, APP_FILE_FORMAT)
  assert.deepEqual(Buffer.from(manifest.icon.replace('data:image/png;base64,', ''), 'base64'), Buffer.from(ICON))
  assert.equal(code, CODE)
  assert.deepEqual(chunksOf(file).map((c) => c.keyword ?? c.type), ['IHDR', 'IDAT', 'vintage-frames.app', 'vintage-frames.code', 'IEND'])
})

test('a PNG without app chunks, a broken CRC, a missing chunk, two of one or an unknown format reads as null', async () => {
  const plain = await box()
  assert.equal(await readAppFile(plain), null)
  assert.equal(await readAppFile(new Uint8Array([1, 2, 3])), null)

  const file = await writeAppFile(plain, MANIFEST, CODE)
  const broken = Uint8Array.from(file)
  broken[chunksOf(file).find((c) => c.keyword === 'vintage-frames.code').at + 40] ^= 0xff
  assert.equal(await readAppFile(broken), null)

  const chunks = chunksOf(file)
  const without = (keyword) => assemble(chunks.filter((c) => c.keyword !== keyword))
  assert.equal(await readAppFile(without('vintage-frames.code')), null)
  assert.equal(await readAppFile(without('vintage-frames.app')), null)
  const doubled = assemble(chunks.flatMap((c) => (c.keyword === 'vintage-frames.code' ? [c, c] : [c])))
  assert.equal(await readAppFile(doubled), null)

  assert.ok(await readAppFile(await handMade(MANIFEST)), 'the hand-made file reads')
  assert.equal(await readAppFile(await handMade({ ...MANIFEST, format: 2 })), null)
  assert.equal(await readAppFile(await handMade({ ...MANIFEST, requires: undefined })), null)
})

test('inspectAppFile says why a file isn\'t an app file, where readAppFile reads null', async () => {
  const plain = await box()
  const file = await writeAppFile(plain, MANIFEST, CODE)
  const broken = Uint8Array.from(file)
  broken[chunksOf(file).find((c) => c.keyword === 'vintage-frames.code').at + 40] ^= 0xff
  const codeless = assemble(chunksOf(file).filter((c) => c.keyword !== 'vintage-frames.code'))
  for (const [bytes, reason] of [
    [plain, 'it carries no application'],
    [broken, 'it is not a whole PNG'],
    [codeless, 'its code is missing'],
  ]) {
    assert.equal(await inspectAppFile(bytes), reason)
    assert.equal(await readAppFile(bytes), null)
  }
  assert.deepEqual(await inspectAppFile(file), { manifest: MANIFEST, code: CODE })
})

test('the reader refuses a version that isn\'t a version and a requires that isn\'t a version or a caret range, saying which', async () => {
  for (const [manifest, reason] of [
    [{ ...MANIFEST, version: '1.0' }, 'its version, 1.0, is not a version'],
    [{ ...MANIFEST, requires: 'banana' }, 'its requires, banana, is not a range'],
    [{ ...MANIFEST, requires: '>=0.16.2' }, 'its requires, >=0.16.2, is not a range'],
    [{ ...MANIFEST, requires: '~0.16.2' }, 'its requires, ~0.16.2, is not a range'],
    // Only as semver writes one: no v, no space around it, no leading zeros.
    ...['v0.1.0', ' 0.1.0', '0.1.0 ', '01.2.3', '1.0.0-01'].map((version) => [{ ...MANIFEST, version }, `its version, ${version}, is not a version`]),
    ...['^v0.16.2', ' ^0.16.2', '^0.016.2'].map((requires) => [{ ...MANIFEST, requires }, `its requires, ${requires}, is not a range`]),
  ]) {
    const file = await handMade(manifest)
    assert.equal(await inspectAppFile(file), reason)
    assert.equal(await readAppFile(file), null)
    await assert.rejects(writeAppFile(await box(), manifest, CODE), {
      message: `vintage-frames/build: the manifest won't read back: ${reason}`,
    })
  }
  for (const requires of ['0.16.2', '^0.17.0-rc.1']) {
    assert.ok(await readAppFile(await handMade({ ...MANIFEST, requires })), requires)
  }
  for (const version of ['0.0.0', '10.20.30', '1.0.0-0.3.7', '1.0.0-x-y.0a', '1.0.0+build.007']) {
    assert.ok(await readAppFile(await handMade({ ...MANIFEST, version })), version)
  }
})

test('appFile() refuses an app.version that isn\'t a version when the build starts, as it refuses a missing field', () => {
  const app = { id: 'meteors', name: 'Meteors', version: '0.1.0', author: 'Adam Portilla' }
  assert.doesNotThrow(() => appFile({ app, entry: 'src/index.ts', icon: 'icon.png' }))
  for (const version of ['1.0', 'v0.1.0']) {
    assert.throws(() => appFile({ app: { ...app, version }, entry: 'src/index.ts', icon: 'icon.png' }), {
      message: `vintage-frames appFile(): app.version, ${version}, is not a version`,
    })
  }
})

test('a description is written after the author and read back, and packApp carries it', async () => {
  const described = { ...MANIFEST, description: 'An Asteroids-style game on a 320 × 240 1-bit screen.' }
  const file = await writeAppFile(await box(), described, CODE)
  assert.deepEqual(await readAppFile(file), { manifest: described, code: CODE })
  assert.deepEqual(Object.keys(JSON.parse(manifestText(file))), ['format', 'id', 'name', 'version', 'requires', 'author', 'description', 'icon'])
  const { format, icon, ...fields } = described
  const packed = await packApp({ manifest: fields, icon: ICON, code: CODE })
  assert.equal((await readAppFile(packed)).manifest.description, described.description)
})

test('a manifest without a description, or with an empty one, has none; one that isn\'t text is refused', async () => {
  for (const description of [undefined, '', '  ']) {
    const written = await readAppFile(await writeAppFile(await box(), { ...MANIFEST, description }, CODE))
    assert.deepEqual(written.manifest, MANIFEST, `written: ${JSON.stringify(description)}`)
    if (description === undefined) continue
    const handWritten = await readAppFile(await handMade({ ...MANIFEST, description }))
    assert.deepEqual(handWritten.manifest, MANIFEST, `hand-made: ${JSON.stringify(description)}`)
  }
  for (const description of [42, null, ['a description']]) {
    assert.equal(await inspectAppFile(await handMade({ ...MANIFEST, description })), 'its description is not text')
    await assert.rejects(writeAppFile(await box(), { ...MANIFEST, description }, CODE), /its description is not text/)
  }
})

test('the writer refuses a manifest it couldn\'t read back', async () => {
  await assert.rejects(writeAppFile(await box(), { ...MANIFEST, format: 2 }, CODE), /format 2/)
  await assert.rejects(writeAppFile(new Uint8Array([1, 2, 3]), MANIFEST, CODE), /not a whole PNG/)
})

test('satisfies: a caret range on 0.x takes its minor\'s patches and nothing past them; on 1.x and up, its major\'s', () => {
  assert.ok(satisfies('0.16.2', '^0.16.2'))
  assert.ok(satisfies('0.16.9', '^0.16.2'))
  assert.ok(!satisfies('0.16.1', '^0.16.2'))
  assert.ok(!satisfies('0.17.0', '^0.16.2'))
  assert.ok(!satisfies('1.0.0', '^0.16.2'))
  assert.ok(satisfies('0.0.3', '^0.0.3'))
  assert.ok(!satisfies('0.0.4', '^0.0.3'))
  assert.ok(satisfies('1.2.3', '^1.2.3'))
  assert.ok(satisfies('1.9.0', '^1.2.3'))
  assert.ok(!satisfies('2.0.0', '^1.2.3'))
  assert.ok(!satisfies('1.2.2', '^1.2.3'))
})

test('satisfies: exact versions, prereleases only against their own, anything else false', () => {
  assert.ok(satisfies('0.16.2', '0.16.2'))
  assert.ok(!satisfies('0.16.3', '0.16.2'))
  assert.ok(!satisfies('0.17.0-rc.1', '^0.16.2'))
  assert.ok(!satisfies('0.16.3-rc.1', '^0.16.2'))
  assert.ok(satisfies('0.17.0-rc.2', '^0.17.0-rc.1'))
  assert.ok(!satisfies('0.17.0-rc.1', '^0.17.0-rc.2'))
  assert.ok(satisfies('0.17.0', '^0.17.0-rc.1'))
  assert.ok(!satisfies('0.17.0-rc.1', '^0.17.0'))
  assert.ok(!satisfies('0.16.2', '>=0.16.2'))
  assert.ok(!satisfies('0.16.2', '~0.16.2'))
  assert.ok(!satisfies('banana', '^0.16.2'))
  assert.ok(!satisfies(null, '^0.16.2'))
  assert.ok(!satisfies('0.16.2', undefined))
})

test('compareVersions: semver\'s order, build metadata ignored, and anything that isn\'t a version first', () => {
  // semver.org's own example of precedence, sorted from the wrong end.
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0']
  assert.deepEqual([...ordered].reverse().sort(compareVersions), ordered)
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0)
  assert.ok(compareVersions('0.9.0', '0.10.0') < 0)
  assert.ok(compareVersions('1.0.0-rc.2', '1.0.0-rc.10') < 0, 'numeric identifiers by value')
  assert.ok(compareVersions('1.0.0-1', '1.0.0-alpha') < 0, 'numeric identifiers before alphanumeric ones')
  assert.equal(compareVersions('0.17.0', '0.17.0'), 0)
  assert.equal(compareVersions('1.0.0+build.1', '1.0.0+build.2'), 0)
  assert.ok(compareVersions('banana', '0.0.0-0') < 0)
  assert.ok(compareVersions('0.0.0-0', '1.0') > 0)
  assert.equal(compareVersions('banana', '1.0'), 0)
  assert.ok(compareVersions('01.0.0', '0.0.0-0') < 0, 'leading zeros: not a version')
  // Read for comparing: space around a version and a leading v are let go.
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions(' 1.0.0 ', '1.0.0'), 0)
  // What isn't a string sorts with what isn't a version, and no sort throws.
  assert.deepEqual(['1.0.0', null, '0.9.0', 7, { version: '2.0.0' }].sort(compareVersions), [null, 7, { version: '2.0.0' }, '0.9.0', '1.0.0'])
})

test('VERSION is package.json\'s version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(VERSION, pkg.version)
})
