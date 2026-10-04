# Developing

Working on the kit itself: the demo pages, the verify suite, and the generated editor data.

## Demo pages

```sh
nvm use            # Node 24, from .nvmrc
npm run dev        # http://localhost:5173
npm run build      # library build to dist/
npm run typecheck
npm test           # the whole verify suite (starts its own dev server)
```

The reference page is published at **[vintage-frames.portill.io](https://vintage-frames.portill.io/)**. Cloudflare builds every push to `main` with `npm run build:pages` and serves `dist-pages/`; its build settings live in the Cloudflare dashboard, and it reads the Node version from `.nvmrc`. The deploy does not wait on CI. `npm run build:pages` builds that site locally (`vite.pages.config.ts`, a separate config because `vite.config.ts` is lib mode) and `npm run preview:pages` serves the built copy.

| Page | What it is |
| --- | --- |
| [`/`](http://localhost:5173/) | **Component reference** — every element, its API, and a live specimen of each state. Each markup sample is the demo's own source, so it can't drift. A demo whose behavior needs page script beyond its markup shows that too, as a "Script" block: the API surface the demo rests on, written the way a page would write it — the elements by name, an `app` object standing for the page's own state — not the `data-*` hooks in `demo/examples.ts` that actually drive it. Authored as a `<script type="text/plain" data-script>` last child of the demo's template |
| [`/shell.html`](http://localhost:5173/shell.html) | **The shell's reference page** ([SHELL.md](./SHELL.md)): a desktop filling the viewport with the Finder over a catalog seeded from the page's markup, and Note Pad, a small application with documents, a palette and a close that asks about unsaved changes (`demo/shell.ts`). `?save=1` keeps the catalog and the session across reloads; `?cleanup=1` turns on Clean Up after a resize; `?open=Projects&open=Archive` opens those items at load. The art is the page's own |
| [`/tile-repeat-probe.html`](http://localhost:5173/tile-repeat-probe.html) | **The tiled-fill check for real browsers.** A full-window `vf-desktop`, shown as shipped, as a candidate tile, or as the old whole-surface raster for reference, with a diff switch (`mix-blend-mode: difference`: black where two paint the same pixel). Paste or drop a screenshot of the dither and it checks that every run of black and white is exactly n device px. No headless engine reproduces Safari's image smoothing, so after changing a tiled fill, check Safari, Chrome and Firefox at a few zoom levels, and the iOS Simulator: `xcrun simctl openurl booted '<url>'` loads a configuration (every control reads the query string), and `xcrun simctl io booted screenshot <file>` exports the framebuffer — the Simulator's window is scaled, so judge the export |
| [`/border-zoom-probe.html`](http://localhost:5173/border-zoom-probe.html) | **The stroke check for real browsers.** Probe boxes drawn as a `border`, an `outline` and the shipped stroke (`vfStrokeDecls`), each measured in device px against n, then real components with every kit line in them to screenshot. Safari rounds a border width before page zoom, and no headless engine reproduces its page zoom, so after changing how a line is drawn, load it at 100% in Safari and step ⌘+ / ⌘− through the zoom levels (the readout's **Copy readout** copies the table), then check Chrome and Firefox |

The faux System 7 desktop that used to be this site's root moved to its own repo, [aportilla/system-online](https://github.com/aportilla/system-online), where it consumes `vintage-frames` from npm like any other app. Changing a component and wanting to see the desktop react means publishing (or `npm link`ing) the package — which is the point: the desktop is now a consumer, and it exercises the same public API everyone else gets.

Grid snapping is the components' own always-on behavior. Load the reference with `?nosnap` to opt every element out (the per-element `nosnap` attribute, applied page-wide) and compare at 100% zoom.

## Tests

```sh
npm test                   # all 44 verify scripts, in parallel
npm test -- focus button   # only the ones whose name matches
npm test -- --bail         # stop at the first failing script
npm run verify:focus       # one script, against a dev server you started
```

The `verify:*` scripts are the test suite: Playwright drivers where Node reaches into a real page and asserts what the browser computed — rendered pixels, resolved `calc()`, the accessibility tree, the device-pixel grid at three densities. jsdom can resolve none of that, and an in-page runner can't produce the **trusted** input `:focus-visible` and the focus-modality rule require.

The shell's pure modules (the geometry, the catalog, the saved session) also have unit tests, in `test/*.test.mjs`. `verify:shell-unit` compiles their entry, `src/shell/pure.ts` (the package's `vintage-frames/shell/pure`), with `tsconfig.unit.json` into `scripts/.tmp/unit`, and the tests import through it, run by Node's own runner. It also checks the shell's ground rules from its sources: it imports nothing but the kit's root exports, the pure modules and their entry import nothing of the kit, and it registers no elements and writes no styles. `verify:shell-front`, `verify:shell-windows` and `verify:shell-finder` drive `shell.html`, and `verify:grid` and `verify:snap` walk it beside `/`, with windows open.

`npm test` starts a dev server on the port it will poll, runs every script in parallel, prints one table and exits nonzero if any fail. A server already listening is reused and left running. Shared code (the page builder, `check()`, the tally, a PNG decoder, the accessibility-tree walker) lives in [`scripts/harness.mjs`](../scripts/harness.mjs); each script keeps its own header explaining what it covers.

Density comes two ways. By default the page builder sets it with Playwright's `deviceScaleFactor`, which is emulation: the page reports the density, but Chromium styles and lays it out as if at 1×, so layout quantizes to 1/64 CSS px and a box edge on a half CSS px can paint a device px off. A display does neither. `build(markup, { dpr, real: true })` renders at display density instead — a Chromium launched with `--force-device-scale-factor` and no viewport override (`browserAt`) — and is what checks about where a line puts content, or about the device grid, use: `verify:grid`, `verify:baseline`, and the pixel groups in `verify:scrollbars` and `verify:rule`.

## Editor data & the manifest

The package ships a [custom elements manifest](https://github.com/webcomponents/custom-elements-manifest) (`custom-elements.json`, generated by `npm run analyze`) and the two editor formats derived from it (`editor/vscode.html-custom-data.json`, `editor/web-types.json`). All three are build outputs — regenerate them, don't hand-edit.

`npm run verify:manifest` checks the manifest against the source: that every registered element reached it, that every documented `@csspart`, `@slot` and `@fires` is real, and that a member a component *inherits* is actually wired up (inheritance alone puts a property in your editor's autocomplete, so a control that inherits `description` without rendering it would silently drop any description you set).

Theming tokens are split by reach. A token only a few components read is documented on each of them as an `@cssprop`, generated from the SPEC §3 table — 45 tags across 22 components. The 18 kit-wide knobs (`--vf-scale`, the palette, both type stacks, the focus rule, the cursor) are described once in [SPEC.md](./SPEC.md), and the whole set is listed with defaults in [DESIGN-TOKENS.md](./DESIGN-TOKENS.md). Three kinds of token are deliberately undocumented: the controller-owned grid-snap offsets, the private channels `vf-button-group` uses to drive `vf-button`, and geometry a component sets on itself.
