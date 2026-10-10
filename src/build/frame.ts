/**
 * The kit's frame: the picture every app file's box is drawn on, and its
 * slots, in the picture's px. A placeholder: a white card on 160 × 205
 * system px drawn at 3×, the artwork's slot on a gray backdrop inside a
 * black rule, then the name, the version and the author, centered.
 *
 * The picture is box/frame.png (`npm run embed:frame`). A redrawn picture
 * moves its slots here.
 */

import { BOX_SCALE } from '../shell/app-file.js'
import { VF_BODY_STRIKE } from '../styles/body-strike.js'
import { VF_DISPLAY_STRIKE } from '../styles/display-strike.js'
import type { BoxFrame } from './box.js'
import { FRAME_PNG } from './frame-picture.js'

/** One system px of the frame, in its picture's px: the format's rule. */
const S = BOX_SCALE

const line = { left: 16 * S, width: 128 * S, scale: S, ink: '#000000', align: 'center' } as const

export const FRAME: BoxFrame = {
  picture: FRAME_PNG,
  artwork: { left: 16 * S, top: 16 * S, width: 128 * S, height: 128 * S, stamp: 8 },
  text: [
    { ...line, top: 152 * S, strike: VF_DISPLAY_STRIKE, text: '{name}' },
    { ...line, top: 170 * S, strike: VF_BODY_STRIKE, text: 'Version {version}' },
    { ...line, top: 182 * S, strike: VF_BODY_STRIKE, text: 'by {author}' },
  ],
}
