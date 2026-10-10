/**
 * The release check, `npm run check:app-api`, which `npm version` runs
 * before it bumps: app-api.json, fresh from `npm run analyze`, against the
 * last release's. It stops the bump when something a built application can
 * use was removed or changed and APP_API (src/shell/app-file.ts) stayed where
 * it was, and lists each one. Additions pass: they leave the level alone
 * (docs/APP-FILES.md § The app API).
 *
 * A change can keep every application built at the level running: a
 * parameter that gained a default, a type TypeScript now prints another way,
 * something only a page uses. Then let the bump through:
 *
 *   APP_API_COMPATIBLE=1 npm version patch
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The names `after` removed from `before`, the ones whose type it changed, and the ones it added. */
export function surfaceChanges(before, after) {
  const removed = []
  const changed = []
  for (const [name, type] of Object.entries(before)) {
    if (!Object.hasOwn(after, name)) removed.push(name)
    else if (after[name] !== type) changed.push(name)
  }
  const added = Object.keys(after).filter((name) => !Object.hasOwn(before, name))
  return { removed, changed, added }
}

/** The levels from `oldest` to `api`, as words. */
const levels = (oldest, api) => (oldest === api ? `${api}` : `${oldest} to ${api}`)

/**
 * Whether to stop the bump, and what to say: `after` is this release's
 * app-api.json, `before` the last release's (`since`), or null when it has
 * none. `compatible` lets a removal or change through at the same level.
 */
export function releaseCheck(before, after, { since = 'the last release', compatible = false } = {}) {
  const { api, oldest } = after
  if (oldest > api) return { stop: true, message: `APP_API_OLDEST, ${oldest}, is past APP_API, ${api}.` }
  if (!before) return { stop: false, message: `App API ${api}: ${since} has no app-api.json to compare with.` }
  if (api < before.api || oldest < before.oldest) {
    return {
      stop: true,
      message: `The app API went down: ${levels(before.oldest, before.api)} at ${since}, ${levels(oldest, api)} now. Neither level ever goes down.`,
    }
  }
  const { removed, changed, added } = surfaceChanges(before.surface, after.surface)
  const list = [
    ...removed.map((name) => `  removed  ${name}`),
    ...changed.map((name) => `  changed  ${name}\n             was ${before.surface[name]}\n             now ${after.surface[name]}`),
  ].join('\n')
  const count = `${removed.length} removed, ${changed.length} changed, ${added.length} added since ${since}`

  if (api > before.api) {
    const kept =
      oldest === before.oldest
        ? `APP_API_OLDEST stays ${oldest}, so this kit still runs applications built at ${levels(oldest, before.api)}. Raise it if one of them can't run on this release.`
        : `APP_API_OLDEST goes from ${before.oldest} to ${oldest}: applications built before ${oldest} stop running here.`
    return { stop: false, message: `App API ${before.api} to ${api}: ${count}.${list ? `\n${list}` : ''}\n${kept}` }
  }
  if (!list) return { stop: false, message: `App API ${api}: ${count}.` }
  if (compatible) {
    return { stop: false, message: `App API ${api}, kept by APP_API_COMPATIBLE: ${count}.\n${list}` }
  }
  return {
    stop: true,
    message: [
      `The app API stays at ${api}, and this release removes or changes what an application built at ${api} can use (${count}):`,
      '',
      list,
      '',
      `Raise APP_API in src/shell/app-file.ts, run npm run analyze, commit, and bump again.`,
      `Raise APP_API_OLDEST as well if an application built at ${api} can't run on this release, and the kit keeps no old behavior for it.`,
      `If every change keeps applications built at ${api} running, let the bump through instead:`,
      `  APP_API_COMPATIBLE=1 npm version <patch | minor>`,
    ].join('\n'),
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** git's output, or null when it fails. */
function git(...args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const after = JSON.parse(readFileSync(join(ROOT, 'app-api.json'), 'utf8'))
  const since = git('describe', '--tags', '--abbrev=0', '--match', 'v*')?.trim() || null
  const books = since && git('show', `${since}:app-api.json`)
  const { stop, message } = releaseCheck(books ? JSON.parse(books) : null, after, {
    since: since ?? 'the last release',
    compatible: !!process.env.APP_API_COMPATIBLE,
  })
  if (stop) {
    console.error(message)
    process.exitCode = 1
  } else {
    console.log(message)
  }
}
