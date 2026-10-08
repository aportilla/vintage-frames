/**
 * Writes package.json's version into src/shell/version.ts, the kit's
 * `VERSION`. `npm version` runs it through the `version` script, after the
 * bump and before the commit, so the bump's commit and tag carry it.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const file = join(ROOT, 'src/shell/version.ts')
const text = readFileSync(file, 'utf8')
const pattern = /export const VERSION = '[^']*'/
if (!pattern.test(text)) throw new Error('src/shell/version.ts: no VERSION to rewrite')
writeFileSync(file, text.replace(pattern, `export const VERSION = '${version}'`))
console.log(`src/shell/version.ts: VERSION = '${version}'`)
