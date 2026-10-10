/**
 * App files: an application on the shell as one PNG. The picture is the
 * application's box; two iTXt chunks before IEND carry its manifest, as
 * JSON, and its code, one ES module compressed with zlib. Any PNG tool reads
 * the chunks and any decoder skips them.
 *
 * This is the reading half: the reader, checking a version against a range,
 * putting versions in order, and the scale every box is drawn at. It is
 * pure and runs the same under Node and in a page, through the platform's
 * compression streams. Writing an app file, and the box, are
 * `vintage-frames/build`'s.
 */

/** The app file format this kit reads and writes. */
export const APP_FILE_FORMAT = 1

/**
 * One system px of an app file's box, in its picture's px: every box of
 * this format is drawn at 3×, each system px a 3 × 3 block.
 */
export const BOX_SCALE = 3

/** The iTXt keywords of the manifest's chunk and the code's. */
export const MANIFEST_KEYWORD = 'vintage-frames.app'
export const CODE_KEYWORD = 'vintage-frames.code'

/** What an app file says about its application. */
export interface AppManifest {
  /** The app file's own format, {@link APP_FILE_FORMAT}. */
  format: number
  id: string
  name: string
  version: string
  /** The kit range the code was built and checked against: `^0.17.0`. */
  requires: string
  author: string
  /** What the application is, in a sentence or two of plain text. */
  description?: string
  /** Its 32 × 32 icon: its PNG as a `data:` URL. */
  icon: string
}

/** An application, read from its app file. */
export interface AppFile {
  manifest: AppManifest
  /** One ES module. Its default export is the application's factory. */
  code: string
}

/** The fields a manifest holds, in the order a written one lists them. All but `description` are required. */
const FIELDS = ['id', 'name', 'version', 'requires', 'author', 'description', 'icon'] as const

/** The eight bytes every PNG starts with. */
export const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

/** The CRC-32 a PNG chunk ends with, over its type and data. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** One chunk of a PNG. */
export interface PngChunk {
  type: string
  data: Uint8Array
  /** Where it sits in the file: its length's first byte, and the byte after its CRC. */
  start: number
  end: number
}

/**
 * A PNG's chunks, IEND last, or null when it isn't a whole PNG: the
 * signature is wrong, a chunk runs past the end, a CRC doesn't match, or
 * there is no IEND. Anything after IEND is left out.
 */
export function pngChunks(bytes: Uint8Array): PngChunk[] | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunks: PngChunk[] = []
  let at = 8
  while (at + 12 <= bytes.length) {
    const end = at + 12 + view.getUint32(at)
    if (end > bytes.length) return null
    if (crc32(bytes.subarray(at + 4, end - 4)) !== view.getUint32(end - 4)) return null
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    chunks.push({ type, data: bytes.subarray(at + 8, end - 4), start: at, end })
    if (type === 'IEND') return chunks
    at = end
  }
  return null
}

/** An iTXt chunk's keyword. */
export function itxtKeyword(data: Uint8Array): string {
  const nul = data.indexOf(0)
  return nul > 0 ? String.fromCharCode(...data.subarray(0, nul)) : ''
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** An iTXt chunk's text, inflated when it is compressed. Throws on a broken chunk. */
async function itxtText(data: Uint8Array): Promise<string> {
  const nul = data.indexOf(0)
  const compressed = data[nul + 1]
  const method = data[nul + 2]
  const language = data.indexOf(0, nul + 3)
  const translated = language < 0 ? -1 : data.indexOf(0, language + 1)
  if (nul < 1 || translated < 0 || compressed! > 1 || method !== 0) throw new Error('a broken iTXt chunk')
  const text = data.subarray(translated + 1)
  return utf8.decode(compressed ? await inflate(text) : text)
}

/** zlib data, inflated. */
export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** zlib data, deflated. */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** A parsed manifest as one this kit reads, or what is wrong with it. */
export function manifestOf(json: unknown): AppManifest | string {
  if (!json || typeof json !== 'object') return 'its manifest is not an object'
  const m = json as Record<string, unknown>
  if (m.format !== APP_FILE_FORMAT) {
    return typeof m.format === 'number'
      ? `it is format ${m.format}, and this kit reads format ${APP_FILE_FORMAT}`
      : 'its manifest has no format'
  }
  const manifest: Partial<AppManifest> = { format: APP_FILE_FORMAT }
  for (const field of FIELDS) {
    const value = m[field]
    if (field === 'description') {
      if (value !== undefined && typeof value !== 'string') return 'its description is not text'
      if (typeof value === 'string' && value.trim()) manifest.description = value
      continue
    }
    if (typeof value !== 'string' || !value) return `its manifest has no ${field}`
    if (field === 'version' && !isVersion(value)) return `its version, ${value}, is not a version`
    if (field === 'requires' && !isRange(value)) return `its requires, ${value}, is not a range`
    manifest[field] = value
  }
  return manifest as AppManifest
}

/**
 * The manifest and code an app file carries, or why it isn't one: not a
 * whole PNG, a chunk missing or doubled, a format this kit doesn't read, a
 * field missing or unreadable, or code that doesn't inflate. The reason ends
 * a sentence such as "Meteors.png is not an app file: …", and is for people:
 * its wording can change in any release, so match on nothing in it.
 */
export async function inspectAppFile(bytes: Uint8Array): Promise<AppFile | string> {
  const chunks = pngChunks(bytes)
  if (!chunks) return 'it is not a whole PNG'
  const found = new Map<string, Uint8Array>()
  for (const { type, data } of chunks) {
    if (type !== 'iTXt') continue
    const keyword = itxtKeyword(data)
    if (keyword !== MANIFEST_KEYWORD && keyword !== CODE_KEYWORD) continue
    if (found.has(keyword)) return `it has two ${keyword} chunks`
    found.set(keyword, data)
  }
  const manifestData = found.get(MANIFEST_KEYWORD)
  const codeData = found.get(CODE_KEYWORD)
  if (!manifestData && !codeData) return 'it carries no application'
  if (!manifestData) return 'its manifest is missing'
  if (!codeData) return 'its code is missing'
  let json: unknown
  try {
    json = JSON.parse(await itxtText(manifestData))
  } catch {
    return 'its manifest does not read'
  }
  const manifest = manifestOf(json)
  if (typeof manifest === 'string') return manifest
  try {
    return { manifest, code: await itxtText(codeData) }
  } catch {
    return 'its code does not inflate'
  }
}

/** The manifest and code an app file carries, or null for any other PNG. */
export async function readAppFile(bytes: Uint8Array): Promise<AppFile | null> {
  const file = await inspectAppFile(bytes)
  return typeof file === 'string' ? null : file
}

interface Semver {
  core: [number, number, number]
  pre: string[]
}

/** A version exactly as semver writes one: the pattern semver.org gives. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/**
 * `text` as a version, read for comparing: space around it and a leading `v`
 * are let go. Null for anything else, a string or not.
 */
function parseSemver(text: unknown): Semver | null {
  if (typeof text !== 'string') return null
  const m = SEMVER.exec(text.trim().replace(/^v/, ''))
  return m ? { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] } : null
}

/**
 * Whether `text` is a version exactly as semver writes one: `0.1.0`,
 * `1.0.0-rc.1`, but not `v0.1.0`, ` 0.1.0` or `01.2.3`.
 */
export function isVersion(text: string): boolean {
  return SEMVER.test(text)
}

/** Whether `text` is a version or a caret range, exactly as written: `0.17.0`, `^0.17.0`. */
function isRange(text: string): boolean {
  return isVersion(text.startsWith('^') ? text.slice(1) : text)
}

/** The version a range names, read for comparing: the range itself, or a caret range's floor. Null when it is neither. */
function rangeVersion(range: unknown): Semver | null {
  if (typeof range !== 'string') return null
  const text = range.trim()
  return parseSemver(text.startsWith('^') ? text.slice(1) : text)
}

/** Below zero, zero or above as `a` comes before, with or after `b`. */
function compareSemver(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i]! - b.core[i]!
  // A release comes after its prereleases.
  if (!a.pre.length || !b.pre.length) return b.pre.length - a.pre.length
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i]
    const y = b.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) return Number(x) - Number(y)
    if (xn !== yn) return xn ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

/**
 * Below zero, zero or above as version `a` comes before, with or after `b`,
 * in semver's order: a release after its prereleases, build metadata
 * ignored. Anything that isn't a version, a string or not, comes before
 * every version, so a sort never throws.
 */
export function compareVersions(a: string, b: string): number {
  const x = parseSemver(a)
  const y = parseSemver(b)
  return x && y ? compareSemver(x, y) : (x ? 1 : 0) - (y ? 1 : 0)
}

/**
 * Whether `version` meets `range`: an exact version, or a caret range as
 * npm reads it. `^1.2.3` takes 1.x from 1.2.3 on, `^0.2.3` takes 0.2.x from
 * 0.2.3 on, and `^0.0.3` takes 0.0.3 alone. A prerelease meets a range only
 * when the range names a prerelease of the same version. Anything else is
 * false.
 */
export function satisfies(version: string, range: string): boolean {
  const v = parseSemver(version)
  const r = rangeVersion(range)
  if (!v || !r) return false
  if (!range.trim().startsWith('^')) return compareSemver(v, r) === 0
  if (v.pre.length && !(r.pre.length && v.core.every((n, i) => n === r.core[i]))) return false
  const [major, minor, patch] = r.core
  const below: Semver = { core: major ? [major + 1, 0, 0] : minor ? [0, minor + 1, 0] : [0, 0, patch + 1], pre: [] }
  return compareSemver(v, r) >= 0 && compareSemver(v, below) < 0
}
