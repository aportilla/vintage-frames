import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      // Four entries: the kit at the package root, the shell at
      // `vintage-frames/shell` (src/shell/), which reaches the kit only
      // through the root's exports, the shell's pure modules at
      // `vintage-frames/shell/pure`, which reach nothing of the kit, and
      // `vintage-frames/build` (src/build/), which runs under Node in a
      // site's or an application's build and reaches no element.
      entry: {
        index: 'src/index.ts',
        'shell/index': 'src/shell/index.ts',
        'shell/pure': 'src/shell/pure.ts',
        'build/index': 'src/build/index.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      // Lit is a dependency; Node's own modules are the build entry's, left
      // as imports for Node to resolve.
      external: [/^lit/, /^node:/],
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
