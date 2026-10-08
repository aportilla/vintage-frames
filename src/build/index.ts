/**
 * `vintage-frames/build` — app files, written: the Vite plugin that makes an
 * application's build write its app file, the one that builds app files
 * into a site, and the pieces under them: the packer, the writer and the box
 * in the kit's frame. Build-only: it runs under Node, and no page imports
 * it. Reading an app file is `vintage-frames/shell/pure`'s.
 * docs/APP-FILES.md is the guide.
 */

export { appFile, appFiles } from './plugins.js'
export type { AppFileOptions } from './plugins.js'
export { packApp, writeAppFile } from './app-file.js'
export type { PackAppInput } from './app-file.js'
export { composeBox } from './box.js'
export type { BoxInput } from './box.js'
