# The cursor

The kit's chrome sets the classic cursors with ordinary CSS — the arrow on
controls, the I-beam in an editable well — so a page with no setup gets
System 7's pointer behavior at native crispness.

A faux desktop can draw the pointer itself:

```ts
import { applyCursor } from 'vintage-frames'

applyCursor() // → returns a cleanup function that restores the native pointer
```

That replaces the native pointer with the embedded System 7 set — arrow,
I-beam, crosshair and wristwatch as pixel art locked to the system-pixel
lattice, anchored to the page's `vf-desktop` (else the document root, or an
`anchor` you pass) so the cursor shares the raster's grid phase. It renders in
the top layer above windows, menus and modals, and hides the native pointer with
two declarations, both applied for you: `* { cursor: none !important }` for the
light DOM including UA rules, and `:root { --vf-cursor: none }` for the shadow
trees and top layer.

Which art shows is read from state, not declared per control: `aria-busy="true"`
anywhere over the pointer is the wristwatch, an enabled text well takes the
I-beam, `data-vf-cursor="crosshair"` claims a region explicitly, anything else
is the arrow. The I-beam and crosshair draw with the classic XOR pen
(`filter: invert(1)` plus `mix-blend-mode: difference`). The wristwatch turns
its hand over 8 frames and holds still under `prefers-reduced-motion`.

Stable Safari's top layer does not blend against the page, and no feature
query can detect this, so on Apple engines each XOR cursor draws its
`staticSrc` variant instead — same box, same hotspot, ink under a one-pixel
white halo. Give your own `invert` art a `staticSrc` too.

Each kind accepts custom art: a `VfCursorArt` is frame URLs at one image px
per system px, the size, the hotspot, and whether it draws with the XOR pen.

```ts
applyCursor({
  crosshair: { src: '/my/pencil.png', width: 16, height: 16, hotspotY: 15 },
  wait: null, // never show the watch; busy surfaces keep the arrow
})
```

The pointer hides only once the arrow art has decoded, and a kind whose art
fails to load falls back to the arrow. The art ships inside the module as
base64 data URIs; `npm run embed:cursors` regenerates `src/cursor-art.ts` from
`cursors/*.png`.
