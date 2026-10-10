/**
 * `vintage-frames/shell/pure` — the shell's pure modules on their own: the
 * catalog, the geometry, the saved session, the app file reader and the
 * kit's version. They import nothing from the kit and touch no DOM at
 * import, so a site's own pure modules and their tests import them under
 * Node. `vintage-frames/shell` exports the same names.
 */

export * from './catalog.js'
export * from './geometry.js'
export * from './state.js'
export { APP_FILE_FORMAT, BOX_SCALE, compareVersions, inspectAppFile, readAppFile, satisfies } from './app-file.js'
export type { AppFile, AppManifest } from './app-file.js'
export { VERSION } from './version.js'
