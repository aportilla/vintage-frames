/**
 * The Vite plugins. `appFile()` makes an application's build write its app
 * file; `appFiles()` builds app files into a site.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { inspectAppFile, isVersion, satisfies } from '../shell/app-file.js'
import { VERSION } from '../shell/version.js'
import { packApp } from './app-file.js'

/** The kit's three entries: all an application imports besides its own files. */
const KIT_ENTRIES = ['vintage-frames', 'vintage-frames/shell', 'vintage-frames/shell/pure']

/** The query that serves an app file's code as a module of its own. */
const CODE_QUERY = 'app-code'

export interface AppFileOptions {
  /** The application's id, name, version and author, and its description if it has one: its `app.ts`. */
  app: { id: string; name: string; version: string; author: string; description?: string }
  /** The module whose default export is the application's factory. */
  entry: string
  /** Its 32 × 32 icon, a PNG. */
  icon: string
  /** Its artwork for the box: a PNG at the artwork slot's size, or that divided by a whole number. */
  artwork?: string
  /** A directory to write the app file to as well, such as a site's `apps/`. */
  copyTo?: string
}

/** What a bundled module's path says it is that an app file can't carry: Lit, or a copy of the kit. */
function forbidden(id: string): string | null {
  const packages = id.match(/(?<=[\\/]node_modules[\\/])(?:@[^\\/]+[\\/])?[^\\/]+/g)
  const name = packages?.at(-1)?.replace('\\', '/')
  if (name === 'vintage-frames') return 'a copy of vintage-frames'
  if (name && /^(?:lit|lit-html|lit-element|@lit\/.+|@lit-labs\/.+)$/.test(name)) return `Lit (${name})`
  return null
}

/** The `vintage-frames` range in the package.json at `root`, which must be a caret range. */
async function kitRange(root: string): Promise<string> {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const range: unknown = pkg.devDependencies?.['vintage-frames'] ?? pkg.dependencies?.['vintage-frames']
  if (typeof range !== 'string') throw new Error('package.json has no vintage-frames dev dependency')
  if (!/^\^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(range)) {
    throw new Error(`package.json's vintage-frames range is "${range}", and an app file requires a caret range: ^${VERSION}`)
  }
  return range
}

/**
 * Makes an application's build write its app file, `dist/<name>.png`. It
 * builds the entry as a library, one ES module with the kit's entries left
 * as imports, and fails the build when the bundle breaks a rule: CSS or any
 * other file beside the code, more than one module, Lit or the kit bundled
 * in, or an import of anything but the kit's three entries. `npm run dev`
 * is untouched.
 */
export function appFile(options: AppFileOptions): Plugin {
  const { app, entry, icon, artwork, copyTo } = options
  for (const field of ['id', 'name', 'version', 'author'] as const) {
    if (typeof app?.[field] !== 'string' || !app[field]) throw new Error(`vintage-frames appFile(): app.${field} is missing`)
  }
  if (!isVersion(app.version)) throw new Error(`vintage-frames appFile(): app.version, ${app.version}, is not a version`)
  if (!entry || !icon) throw new Error(`vintage-frames appFile(): ${entry ? 'icon' : 'entry'} is missing`)
  const fileName = `${app.name.replace(/[\\/:*?"<>|]/g, '-')}.png`
  let root = ''
  let packed: Uint8Array | null = null

  return {
    name: 'vintage-frames:app-file',
    apply: 'build',
    config: () => ({
      build: {
        lib: { entry, formats: ['es'], fileName: 'app' },
        copyPublicDir: false,
        rolldownOptions: {
          external: /^vintage-frames(?:\/|$)/,
          output: { codeSplitting: false },
        },
      },
    }),
    configResolved(config) {
      root = config.root
    },
    buildStart() {
      for (const file of [icon, artwork, 'package.json']) if (file) this.addWatchFile(resolve(root, file))
    },
    // Last, so it sees the whole bundle: Vite emits a library's CSS in its own generateBundle.
    generateBundle: {
      order: 'post',
      async handler(_, bundle) {
        const outputs = Object.values(bundle)
        const chunks = outputs.filter((o) => o.type === 'chunk')
        const beside = outputs.filter((o) => o.type === 'asset').map((o) => o.fileName)
        if (beside.length) {
          this.error(
            `${app.name} emits ${beside.join(', ')} beside its code, and an app file holds one module: ` +
              'no CSS import, no source map file, its art inlined.'
          )
        }
        const [chunk] = chunks
        if (!chunk || chunks.length > 1) this.error(`${app.name} builds to ${chunks.length} modules, and an app file holds one.`)
        for (const id of Object.keys(chunk.modules)) {
          const what = forbidden(id)
          if (what) this.error(`${app.name} bundles ${what}. It composes the page's kit and brings none of its own.`)
        }
        const imports = [...chunk.imports, ...chunk.dynamicImports].filter((spec) => !KIT_ENTRIES.includes(spec))
        if (imports.length) {
          this.error(`${app.name} imports ${imports.join(', ')}. An application imports ${KIT_ENTRIES.join(', ')} and its own files.`)
        }

        try {
          const requires = await kitRange(root)
          if (!satisfies(VERSION, requires)) {
            throw new Error(`package.json requires vintage-frames ${requires}, and the build is on ${VERSION}: move the range`)
          }
          packed = await packApp({
            manifest: {
              id: app.id,
              name: app.name,
              version: app.version,
              requires,
              author: app.author,
              description: app.description,
            },
            icon: new Uint8Array(await readFile(resolve(root, icon))),
            code: chunk.code,
            artwork: artwork ? new Uint8Array(await readFile(resolve(root, artwork))) : undefined,
          })
        } catch (err) {
          this.error(`${app.name}: ${(err as Error).message}`)
        }
        delete bundle[chunk.fileName]
        this.emitFile({ type: 'asset', fileName, source: packed })
      },
    },
    async writeBundle() {
      if (!copyTo || !packed) return
      const dir = resolve(root, copyTo)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, fileName), packed)
    },
  }
}

/**
 * Builds app files into a site. An import of `*.png?app` reads the file and
 * refuses one that isn't an app file, or whose `requires` this kit's
 * version doesn't meet. Its default export is the application's factory,
 * its definition given the manifest's icon, and `manifest` is the manifest.
 * The code imports the kit by name, so the page keeps one copy of it. A new
 * file reloads the dev server's page.
 */
export function appFiles(): Plugin {
  let root = ''
  return {
    name: 'vintage-frames:app-files',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    async load(id) {
      const query = id.indexOf('?')
      if (query < 0) return null
      const file = id.slice(0, query)
      const params = new URLSearchParams(id.slice(query + 1))
      if (!file.endsWith('.png') || !(params.has('app') || params.has(CODE_QUERY))) return null
      this.addWatchFile(file)
      const name = relative(root, file)
      const read = await inspectAppFile(new Uint8Array(await readFile(file)))
      if (typeof read === 'string') this.error(`${name} is not an app file: ${read}.`)
      const { manifest, code } = read
      if (params.has(CODE_QUERY)) return code
      if (!satisfies(VERSION, manifest.requires)) {
        this.error(
          `${name}: ${manifest.name} ${manifest.version} requires vintage-frames ${manifest.requires}, ` +
            `and this site has ${VERSION}. Build ${manifest.name} on ${VERSION} and copy its app file in.`
        )
      }
      return [
        `import factory from ${JSON.stringify(`${file}?${CODE_QUERY}`)}`,
        `export const manifest = ${JSON.stringify(manifest)}`,
        'export default (...args) => ({ ...factory(...args), icon: manifest.icon })',
        '',
      ].join('\n')
    },
  }
}
