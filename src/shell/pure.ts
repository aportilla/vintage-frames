/**
 * `vintage-frames/shell/pure` — the shell's pure modules on their own: the
 * catalog, the geometry and the saved session. They import nothing from the
 * kit and touch no DOM at import, so a site's own pure modules and their
 * tests import them under Node. `vintage-frames/shell` exports the same
 * names.
 */

export * from './catalog.js'
export * from './geometry.js'
export * from './state.js'
