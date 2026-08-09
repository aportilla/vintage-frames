/**
 * Copy the imported strike collection into the built demo site.
 *
 * The Character Set window resolves a strike at runtime — it builds
 * `<base>fonts/imported/<Family>-<size>.woff2` from the manifest's file name
 * and hands it to `new FontFace()` — so no bundler can see the reference and
 * none of these files is reachable from a module graph. They also sit outside
 * Vite's `publicDir`, which is the other way a file gets copied verbatim.
 *
 * So the copy is explicit, and it stays a copy rather than a bundled asset on
 * purpose: as files they are fetched only when someone opens that one window,
 * where an `import.meta.glob` would inline the small ones into the JS every
 * visitor downloads. Only the woff2s go — `imported/bdf/` is the intermediate
 * the pipeline converts *from*, and the site never asks for it.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const from = join(root, 'fonts', 'imported')
const to = join(root, 'dist-pages', 'fonts', 'imported')

if (!existsSync(from)) {
  console.warn(`[copy-strikes] ${from} is missing — the Character Set window will explain itself.`)
  process.exit(0)
}

const strikes = readdirSync(from).filter((f) => f.endsWith('.woff2'))
mkdirSync(to, { recursive: true })
for (const strike of strikes) cpSync(join(from, strike), join(to, strike))

console.log(`[copy-strikes] ${strikes.length} strikes → dist-pages/fonts/imported/`)
