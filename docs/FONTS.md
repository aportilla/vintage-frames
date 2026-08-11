# Fonts

Two bitmap faces ship inside the components and register themselves on
`document.fonts`, so they render inside every shadow root with no global CSS:

- **`VF Display`** — the chrome face: menu bar, menus, window and dialog
  titles, buttons, checkboxes, radios, popup menus, fieldset legends, and
  editable text/number fields. A re-drawn strike in the style of Chicago
  12pt, extended with the kit's backfill in the same heavier idiom — so a
  shortcut string like `⇧⌘S` renders every key in chrome pixels.
- **`VF Body`** — the body face: list rows and page copy. A re-drawn strike
  in the style of Geneva 9pt, extended with a body-copy backfill drawn in its
  idiom (`€`, `−`, `·`, the uppercase accents, arrows, `⌘ ⇧ ⌥ ⌃`, fractions —
  see [fonts/README.md](../fonts/README.md)) so modern copy doesn't fall back
  mid-sentence.

Both faces are the kit's own artwork: every glyph is authored as a plaintext
pixel field in `fonts/VF-*.glyphs.txt`, and the binaries are built from those
manifests alone. The designs they re-draw — Chicago and Geneva, created by
Susan Kare for Apple's original Macintosh — are hers and Apple's; the kit's
strikes share their appearance, not their files. They ship under the kit's
names, since a family name goes into the font binary and every consumer's
`font-family` stack. [fonts/README.md](../fonts/README.md) has the pipeline
and design lineage. The *fallbacks* after each family still name `Chicago`,
`Charcoal` and `Geneva`, which select faces the reader may already have
installed.

Both render on their native 1024-upm pixel grid (one design pixel = one system
pixel), scale with `--vf-scale`, and are registered with `ascent-override: 75%`
/ `descent-override: 25%` / `line-gap-override: 0%` so baselines land on whole
pixels. Re-theme with `--vf-font-family-display` / `--vf-font-family`, plus the
matching `--vf-font-size-display` / `--vf-font-smoothing-display` and
`--vf-line-height-display` / `--vf-line-height` — a swapped strike sets its
family, size and line height together.

Every strike renders at its native size; a different size is a different
strike. Fine print is the body face at its own size (`face="body" dim`).

**Your own text goes on the same faces with `vf-label` and `vf-paragraph`**,
which set their line boxes in whole system pixels — 16px for the chrome face,
12px for the body face — so a column of copy stays on whole-pixel offsets:

```html
<vf-label for="disk">Install Location:</vf-label>
<vf-select id="disk">…</vf-select>

<vf-paragraph>Click Install to place DragThing on your hard disk.</vf-paragraph>
<vf-paragraph dim>Approximate disk space needed: 4,584K</vf-paragraph>
```

`face="body"` / `face="display"` swaps either, the line box following the face;
`dim` greys the text. `for` does what a native `<label for>` does — click to
focus, plus the accessible name, which lands on the control's `label` property
without overwriting one you set.

```sh
npm run verify:text
npm run verify:baseline
```
