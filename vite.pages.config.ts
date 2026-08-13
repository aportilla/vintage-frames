import { defineConfig } from 'vite'

// The one Node global this config needs, declared rather than pulled in:
// @types/node isn't in the tree, and one env var doesn't earn it.
declare const process: { env: Record<string, string | undefined> }

/** Normalize a base path to Vite's `/prefix/` shape; `/` for a site at a root. */
function normalizeBase(raw: string): string {
  const trimmed = raw.replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? '/' : `/${trimmed}/`
}

// The demo pages as an ordinary multi-page site. vite.config.ts is lib mode —
// it builds the package, not these — so the Pages deploy gets its own config.
//
// A GitHub Pages *project* site is served under /<repo>/, and every URL the
// build emits has to carry that prefix. The workflow passes the real one in
// VF_BASE (a custom domain or a user site would send `/`); the default is what
// `npm run build:pages` uses locally. `||`, not `??`: a step output that didn't
// resolve arrives as an empty string, and taking that literally would build a
// root-based site whose every asset 404s under /vintage-frames/.
export default defineConfig({
  base: normalizeBase(process.env.VF_BASE || '/vintage-frames/'),
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
