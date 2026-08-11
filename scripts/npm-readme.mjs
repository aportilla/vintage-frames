/**
 * Swap the npm-facing README into place around `npm pack` / `npm publish`.
 *
 * npm shows whatever `README.md` is in the tarball, pack always includes it,
 * and no package.json field can point the registry at a different file. So
 * the repo README (the full manual, GitHub's) and the npm README (the
 * storefront, `docs/README.npm.md`) trade places around the pack: `prepack`
 * ends with `swap`, `postpack` runs `restore`. The repo copy waits out the
 * pack as `.README.github.md` (gitignored). Both directions are no-ops when
 * there is nothing to do, so an interrupted publish is repaired by running
 * restore again — or by `git checkout README.md` plus deleting the parked
 * copy.
 */
import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const repoReadme = join(root, 'README.md')
const npmReadme = join(root, 'docs', 'README.npm.md')
const parked = join(root, '.README.github.md')

const mode = process.argv[2]

if (mode === 'swap') {
  if (existsSync(parked)) {
    console.log('[npm-readme] already swapped — leaving it')
  } else {
    renameSync(repoReadme, parked)
    copyFileSync(npmReadme, repoReadme)
    console.log('[npm-readme] README.md ← docs/README.npm.md (repo copy parked)')
  }
} else if (mode === 'restore') {
  if (existsSync(parked)) {
    rmSync(repoReadme, { force: true })
    renameSync(parked, repoReadme)
    console.log('[npm-readme] README.md restored')
  } else {
    console.log('[npm-readme] nothing parked — nothing to restore')
  }
} else {
  console.error('usage: node scripts/npm-readme.mjs swap|restore')
  process.exit(1)
}
