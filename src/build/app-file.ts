/**
 * Writing app files. The box's own chunks are copied as they are, so the
 * picture is never re-encoded; any app chunks already there are dropped,
 * and the manifest's and the code's go in before IEND.
 */

import {
  APP_FILE_FORMAT,
  CODE_KEYWORD,
  deflate,
  itxtKeyword,
  MANIFEST_KEYWORD,
  manifestOf,
  PNG_SIGNATURE,
  pngChunks,
} from '../shell/app-file.js'
import type { AppManifest } from '../shell/app-file.js'
import { composeBox } from './box.js'
import { concat, pngChunk } from './png.js'

/** What {@link packApp} packs. */
export interface PackAppInput {
  /** The manifest's fields but its format and icon, which the packer fills in. */
  manifest: Omit<AppManifest, 'format' | 'icon'>
  /** The icon's PNG, 32 × 32. */
  icon: Uint8Array
  /** The application's code: one ES module whose default export is its factory. */
  code: string
  /** The artwork's PNG, for the box. Without it the icon is stamped there. */
  artwork?: Uint8Array
}

const utf8 = new TextEncoder()

/** An iTXt chunk with no language tag and no translated keyword. */
function itxt(keyword: string, text: Uint8Array, compressed: boolean): Uint8Array {
  const head = Uint8Array.from([...keyword].map((ch) => ch.charCodeAt(0)))
  return pngChunk('iTXt', concat([head, Uint8Array.of(0, compressed ? 1 : 0, 0, 0, 0), text]))
}

/** `box` with `manifest` and `code` in its chunks. */
export async function writeAppFile(box: Uint8Array, manifest: AppManifest, code: string): Promise<Uint8Array> {
  const chunks = pngChunks(box)
  if (!chunks) throw new Error('vintage-frames/build: the box is not a whole PNG')
  const checked = manifestOf(manifest)
  if (typeof checked === 'string') throw new Error(`vintage-frames/build: the manifest won't read back: ${checked}`)
  const app = [
    itxt(MANIFEST_KEYWORD, utf8.encode(JSON.stringify(checked)), false),
    itxt(CODE_KEYWORD, await deflate(utf8.encode(code)), true),
  ]
  const parts: Uint8Array[] = [PNG_SIGNATURE]
  for (const chunk of chunks) {
    if (chunk.type === 'iTXt' && [MANIFEST_KEYWORD, CODE_KEYWORD].includes(itxtKeyword(chunk.data))) continue
    if (chunk.type === 'IEND') parts.push(...app)
    parts.push(box.subarray(chunk.start, chunk.end))
  }
  return concat(parts)
}

/** The whole app file: the box in the kit's frame, then the manifest and the code. */
export async function packApp({ manifest, icon, code, artwork }: PackAppInput): Promise<Uint8Array> {
  const full: AppManifest = { ...manifest, format: APP_FILE_FORMAT, icon: `data:image/png;base64,${base64(icon)}` }
  return writeAppFile(await composeBox({ manifest: full, icon, artwork }), full, code)
}

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
