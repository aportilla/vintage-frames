# App files

An application on the shell ships as one PNG, its app file. The picture is the application's box, for people looking at the file outside a desktop. Two `iTXt` chunks carry its manifest and its code. A desktop reads the chunks and never the picture.

`vintage-frames/build` writes app files and builds them into a site, as two Vite plugins. It runs under Node in a build, and no page imports it. Reading an app file is in `vintage-frames/shell/pure`.

## The file

| `iTXt` keyword | Compressed | Holds |
| --- | --- | --- |
| `vintage-frames.app` | no | the manifest, as JSON |
| `vintage-frames.code` | yes, zlib | the application's code, one ES module |

```json
{
  "format": 1,
  "id": "meteors",
  "name": "Meteors",
  "version": "0.1.0",
  "requires": "^0.16.2",
  "author": "Adam Portilla",
  "icon": "data:image/png;base64,iVBORw0KGgo…"
}
```

- `format` is the app file's own version. A reader refuses a format it doesn't know.
- `requires` is the kit range the code was built against, a caret range.
- `icon` is the 32 × 32 icon, its PNG as a `data:` URL, so a desktop can show the icon without running the code.
- The code's default export is the application's factory. It imports `vintage-frames`, `vintage-frames/shell` and `vintage-frames/shell/pure` by name, and the page's own copy of the kit serves them.

Anything that re-encodes the picture or strips its metadata drops the chunks: an image optimizer, a chat app that recompresses uploads. Send an app file as a file.

## An application's build

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { appFile } from 'vintage-frames/build'
import { APP } from './src/app.ts'

export default defineConfig({
  plugins: [appFile({ app: APP, entry: 'src/index.ts', icon: 'src/art/meteors.png', artwork: 'art/box.png' })],
})
```

`npm run build` writes `dist/Meteors.png`, named for the application. `npm run dev` is untouched.

| Option | |
| --- | --- |
| `app` | `{ id, name, version, author }`, for the manifest and the box. |
| `entry` | The module whose default export is the application's factory. |
| `icon` | The 32 × 32 icon, a PNG. |
| `artwork` | The box's artwork, a PNG (§ The box). Optional. |
| `copyTo` | A directory to write the app file to as well, such as a site's `apps/`. Optional. |

- `requires` is the repo's `vintage-frames` range from package.json. It must be a caret range, and the kit in the build must meet it.
- The entry is built as a library: ES, one module, the kit's entries left as imports, art and `?raw` markup inlined.
- The build fails when the bundle breaks a rule, and says which: CSS or any other file emitted beside the code, more than one module, Lit or a copy of the kit bundled in, or an import of anything but the kit's three entries.
- `vite build --watch` writes the file, and the `copyTo` copy, on every rebuild. `app` is read when the build starts, so restart a watch after changing it.

## A site's build

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { appFiles } from 'vintage-frames/build'

export default defineConfig({
  plugins: [appFiles()],
})
```

```ts
import meteors, { manifest } from '../apps/Meteors.png?app'

createShell(desktop, { apps: [finder({ storage }), meteors()] })
```

- The default export is the application's factory. The definition it returns takes the manifest's icon. `manifest` is the manifest.
- The build fails on a file that isn't an app file, and on one whose `requires` the site's kit doesn't meet, naming the application and both versions.
- The code's kit imports resolve to the site's own kit, so the page keeps one copy.
- A new app file reloads the dev server's page.

For the import's types, add `vintage-frames/build/client` to tsconfig.json beside `vite/client`:

```json
{ "compilerOptions": { "types": ["vite/client", "vintage-frames/build/client"] } }
```

## The box

The box is the kit's frame with the application's artwork and text set into it. The frame is a placeholder for now: a white card drawn at 3×, 480 × 615 px, with a 384 × 384 artwork area, then the application's name in the display face and its version and author in the body face.

- Artwork is a PNG at the artwork area's size, or that divided by a whole number (192 × 192, 128 × 128, 96 × 96 …), magnified by that number so pixel art stays crisp. Any other size fails the build. Transparent pixels show the frame.
- Without artwork, the icon is stamped 8× in the middle.
- Text is set in the kit's faces, a glyph at a time. A line too long for its space ends in an ellipsis. A character the face lacks fails the build, naming it.
- Art can be 8-bit gray, RGB, gray with alpha or RGBA, or indexed or gray at 1, 2, 4 or 8 bits, non-interlaced. 16-bit and interlaced files fail the build, naming what to save them as.
- The box can be in color.

## The rules an application keeps

- **Imports**: `vintage-frames`, `vintage-frames/shell`, `vintage-frames/shell/pure` and its own files. No Lit of its own.
- **Art** is imported, so the build inlines it. No page paths.
- **Layout** is set on its own elements. No CSS import.
- **Session keys** start with its id, read back defensively, and nothing breaks when `ctx.state` is null.
- **Nothing site-specific** through the context: no `ctx.services`, no `ctx.apps`.
- **Its kinds** are named after its id, and **its id never changes**: saved icons, windows and sessions name it.

The build checks the first three.

## Pieces on their own

| `vintage-frames/build` | |
| --- | --- |
| `packApp({ manifest, icon, code, artwork })` | The whole app file. `manifest` has no `format` or `icon`; they are filled in. |
| `composeBox({ manifest, icon, artwork })` | The box alone, as a PNG. |
| `writeAppFile(box, manifest, code)` | `box` with the manifest and code in its chunks. App chunks already there are replaced, and the picture is copied as it is. |

| `vintage-frames/shell/pure` | |
| --- | --- |
| `readAppFile(bytes)` | The manifest and code, or `null` for any other PNG: a broken signature or CRC, a chunk missing or doubled, a format this kit doesn't read. |
| `satisfies(version, range)` | Whether a version meets an exact version or a caret range. |
| `VERSION` | The kit's version. |
| `APP_FILE_FORMAT` | The format this kit reads and writes: `1`. |
