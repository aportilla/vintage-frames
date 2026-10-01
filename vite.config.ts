import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      // Two entries: the kit at the package root, and the shell at
      // `vintage-frames/shell` (src/shell/), which reaches the kit only
      // through the root's exports.
      entry: {
        index: 'src/index.ts',
        'shell/index': 'src/shell/index.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^lit/],
      // Emit one file per source module rather than a single rolled-up bundle,
      // mirroring src/ into dist/. That is what makes the per-component subpath
      // exports real: `vintage-frames/vf-button.js` has to resolve to a file
      // that pulls only what a button composes, and a no-bundler consumer
      // (a <script type="module">, an import map) has to be able to fetch it.
      // Declarations already land beside it from tsconfig.build.json.
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
})
