import { unsafeCSS } from 'lit'

// Register the embedded body face on document.fonts so it applies inside
// every component's shadow root — an @font-face rule can't cross that boundary
// (see ../register-embedded-font.ts). The import lives beside the recipe that
// needs the face, not in the barrel, so a bundler drops the file with the
// recipe: see the note at the top of ../base.ts for why module boundaries are
// the only granularity a `css` tagged template can be shaken at.
import '../body-font.js'

/**
 * The three declarations that put text on the *body* face — the family via
 * --vf-font-family, 16px so its 1024-upm pixel grid lands exactly, and the
 * body smoothing token. The mirror image of {@link vfDisplayDecls}, and the
 * body face's single definition: {@link vfBase} applies it to every host, and
 * the handful of places that switch *back* to it from the display face
 * (vf-button's small size, vf-label/vf-paragraph's `face="body"`) compose this
 * rather than repeating the family stack.
 *
 * 'VF Body' is the embedded face (../body-font.ts); 'Geneva' after it is the
 * installed one a real Mac already has. See {@link vfDisplayDecls}.
 */
export const vfBodyDecls = unsafeCSS(`
  font-family: var(
    --vf-font-family,
    'VF Body',
    'Geneva',
    'Helvetica Neue',
    Helvetica,
    Arial,
    sans-serif
  );
  font-size: calc(var(--vf-scale, 1) * var(--vf-font-size, 16px));
  -webkit-font-smoothing: var(--vf-font-smoothing, antialiased);
`)
