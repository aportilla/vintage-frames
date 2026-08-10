/**
 * Renders glyph-proof.html from the generated manifest: one compact card per
 * backfilled glyph — the embedded face's own rasterization at 12x plus a
 * realistic native-size specimen in the same face — grouped by face first
 * (display, then body), then by provenance kind, "drawn" (wants feedback
 * most) first within each face.
 */
import '../src/styles/body-font.js'
import '../src/styles/display-font.js'
import { BACKFILL_GLYPHS, type BackfillGlyph } from './glyph-proof-manifest.js'

const KIND_ORDER = ['drawn', 'composed', 'derived', 'traced'] as const
const KIND_BLURB: Record<string, string> = {
  drawn:
    'No source exists anywhere in the strikes — these are original 1-bit drawings, and the group that most wants design feedback.',
  composed:
    'The strike’s own capital under the strike’s own accent, at the placement its native É / Ñ / Å establish.',
  derived: 'Strike ink rearranged — the donor glyphs are named on each card.',
  traced: 'Another glyph’s ink, verbatim.',
}

const NATIVE: Record<string, string> = {
  euro: 'Total: 1.234,56 € — about US$25',
  currency: 'Total: 1.234,56 € — about US$25',
  minus: 'ΔT = −40° … 5 − 3 = 2, x−y',
  periodcentered: 'May 3 · 4 min read · 98 pt',
  checkmark: '✓ Done — 3 of 3 checks passed',
  onehalf: '½ cup — about 2½ hours',
  onequarter: '¼ turn, ¼ + ¼ = ½',
  threequarters: '¾ of respondents said yes',
  onesuperior: 'footnote¹ and E = mc²',
  twosuperior: '10² = 100, area in m²',
  threesuperior: '10³ = 1000, volume in cm³',
  prime: '5′10″ tall, 40°26′46″ N',
  doubleprime: 'a 13″ display, 46″ of rain',
  quotesinglbase: '‚einfach‘ gesagt',
  quotedblbase: '„Guten Tag“, sagte sie.',
  daggerdbl: 'first† and second‡ notes',
  guilsinglleft: '‹voilà› within «guillemets»',
  guilsinglright: 'see ‹the notes› for more',
  fraction: '5⁄8 in, 3⁄4 time',
  perthousand: 'a 4,5 ‰ grade — 45 ‰o',
  fi: 'the ﬁne print — ﬁrst ﬁles',
  fl: 'a ﬂat ﬂoor — ﬂowing text',
  arrowleft: '← Back … see p. 4 →',
  arrowright: 'Next → (or press ⌘→)',
  arrowup: 'sort ↑ ascending, ↓ descending',
  arrowdown: 'scroll ↓ for more',
  multiplicationx: '✕ close — ✓ or ✕',
  blackstar: '★★★☆ — 3-star rating',
  whitestar: '★★★☆☆ — 3 of 5 stars',
  shift: 'press ⇧⌘S to Save As…',
  option: '⌥⌘Esc force-quits',
  control: '⌃C to interrupt',
  multiply: 'a 3×5 card, 640×480 at 72 dpi',
  command: '⌘N New, ⌘Q Quit',
  escape: '⎋ cancels — ⌥⌘⎋ force-quits',
  deleteleft: '⌘⌫ moves it to the Trash',
  returnsymbol: '⏎ confirms, ⇧⏎ a soft break',
  tabright: '⇥ next field, ⇧⇥ previous',
  tableft: '⇤ back one field',
  hookarrowleft: 'press Enter ↩ to submit',
  diamond: '◆ modified · ◆ vs ◊',
  apple: ' menu — About This Macintosh…',
  blackcircle: '● Recording — ● On ○ Off',
  whitecircle: '○ idle · ● busy',
  blacksquare: '■ Stop — press ▶ to play',
  whitesquare: '□ to do, ■ done',
  whitebullet: '• item — ◦ sub-item',
  ballotx: '✗ failed — ✓ passed',
  smalltriangleright: 'File ▸ Export ▸ PDF…',
  smalltriangleleft: '◂ prev · next ▸',
  smalltriangleup: 'sort ▴ ascending, ▾ descending',
  smalltriangledown: 'More ▾',
  triangleright: '▶ Play · ◀◀ Rewind',
  triangleleft: '◀ Back · ▶ Play',
  nonbreakinghyphen: 'anti‑aliasing stays one word',
  softhyphen: 'in­vis­ible till a line breaks',
  figurespace: '1 234 567 stays columnar',
  thinspace: 'a — thin-spaced dash',
  hairspace: 'hair thin gaps',
}
const NATIVE_ACCENT =
  'À la carte — ÉCOLE, ÈVE, ÎLE FLOTTANTE, HÔTEL, OÙ, DÉJÀ VU, SEÑOR (native: É Ñ Ã Õ Ö Ü)'

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function card(g: BackfillGlyph): HTMLElement {
  const faceClass = g.face === 'VF Body' ? 'body-face' : 'display-face'
  const node = el('div', 'card')
  const cp = `U+${g.codepoint.toString(16).toUpperCase().padStart(4, '0')}`
  node.appendChild(el('h3', '', `${g.char}  ${g.name}`))
  node.appendChild(
    el(
      'p',
      'meta',
      `${cp} · x0 ${g.x0} · y0 ${g.y0} · advance ${g.advance}px · ` +
        `${g.rows.length}×${Math.max(...g.rows.map((r) => r.length))}`,
    ),
  )
  node.appendChild(el('div', `big ${faceClass}`, g.char))
  const native = NATIVE[g.name] ?? (/\p{Lu}/u.test(g.char) ? NATIVE_ACCENT : g.char)
  node.appendChild(el('div', `native ${faceClass}`, native))
  node.appendChild(el('p', 'source', g.source))
  return node
}

const root = document.getElementById('root')!
for (const face of ['VF Display', 'VF Body']) {
  const ofFace = BACKFILL_GLYPHS.filter((g) => g.face === face)
  root.appendChild(el('h2', 'face-head', `${face} — ${ofFace.length} glyphs`))
  for (const kind of KIND_ORDER) {
    const group = ofFace.filter((g) => g.source.startsWith(kind))
    if (!group.length) continue
    root.appendChild(el('h3', 'kind-head', `${kind} — ${group.length}`))
    root.appendChild(el('p', 'intro', KIND_BLURB[kind]))
    const cards = el('div', 'cards')
    for (const g of group) cards.appendChild(card(g))
    root.appendChild(cards)
  }
}

// Running copy: the whole backfill working at native size in real sentences.
const specimens = document.getElementById('specimens')!
const lines: Array<[string, string]> = [
  ['body-face', 'Prices: 45 € · 3×5 − 2 = 13 · 98,6 % vs 4,5 ‰ · 5′10″ · 21 °C · ½ ¼ ¾ · x¹ x² x³'],
  ['body-face', '« ‹Voilà› » — ‚einfach‘ „doppelt“ — the ﬁne print ﬂows · 5⁄8 · notes† and second‡'],
  ['body-face', NATIVE_ACCENT],
  ['body-face', '← ↑ → ↓ · ✓ done, ✕ close, ★★★ · ⌘Q ⇧⌘S ⌥⌘Esc ⌃C · a·b − c'],
  ['display-face', 'Chrome: ⌘N ⇧⌘S ⌥⌘Esc ⌃C · ← Back / Next → · 45 € · 5⁄8 ½ ¾ · ‹Voilà› ﬁne ﬂoor'],
  ['display-face', 'ÉCOLE, ÈVE, ÎLE, HÔTEL, OÙ, DÉJÀ VU · ✓ ✕ ★ · 3×5 − 2 · a·b · 5′10″ · 4,5 ‰'],
]
for (const [cls, text] of lines) {
  specimens.appendChild(el('div', cls, text))
}
