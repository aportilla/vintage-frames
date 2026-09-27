import { defineConfig } from 'vite'

// The demo site as an ordinary page build. vite.config.ts is lib mode — it
// builds the package, not the page — so the site gets its own config. It is
// served at the root of vintage-frames.portill.io, so Vite's default base holds.
export default defineConfig({
  build: {
    outDir: 'dist-pages',
    emptyOutDir: true,
    rollupOptions: {
      // The one page README documents: the component reference at the site
      // root. (The faux desktop that used to be the root lives in its own
      // repo now — see README.)
      input: {
        index: 'index.html',
      },
    },
  },
})
