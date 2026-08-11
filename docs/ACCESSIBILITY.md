# Accessibility

**Keyboard focus** is drawn in the 1-bit idiom rather than left to the
browser's ring. Where a control can carry the mark itself it does, as a 1px
dashed rule on the system-pixel grid (`vfFocusUnderline`) — inside the control
under the ink it marks (`vf-button` its label, `vf-checkbox` its box, `vf-radio`
its circle, the three fields their well, `vf-menu` its bar title), or below the
whole box where there is no room inside (`vf-select` clear of its shadow,
`vf-swatch` clear of its shadow when it casts one, `vf-slider` under the full
rail so the mark stays put as the handle travels). Only the controls with no
face to draw on — a window's close and zoom boxes, a list row, a scroll
viewport — keep the dotted ring. `vf-menu` and `vf-select` mark only while
closed.

Either way it is **keyboard-only**: a mouse click never draws it. The four
controls where `:focus-visible` is true after a pointer — the three fields, and
`vf-select`/`vf-menu`/`vf-slider`, which suppress mouse focus to run a
press-drag gesture — gate on the page's last input modality
(`FocusRuleController`, `src/focus-modality.ts`).

**Forced-colors mode** (Windows High Contrast) re-declares the palette in
system colors — black ink becomes `CanvasText`, white faces `Canvas`, the
selection inversion the `Highlight` pair — and keeps drawing the kit's own
artwork: stepped silhouettes, the dashed focus rule, racing stripes, windoid
dither and barber stripes all survive on the user's palette (SPEC §1).

**The platform's form vocabulary works**, including on controls whose focusable
element lives inside a shadow root: `<label for>`, `aria-label` /
`aria-labelledby` / `aria-describedby`, and `required` with real constraint
validation — `form.reportValidity()` blocks, `:invalid` matches on the host,
`setCustomValidity()` works, and Enter can't submit past a failing constraint.

The host-to-shadow name bridge covers only the controls that need one — the
three fields, `vf-select`, `vf-swatch` and `vf-button`. Those six also take a
`description` property, which reaches assistive tech alongside the name and
carries the validation error while there is one. The controls whose role sits
on the host (`vf-checkbox`, `vf-radio-group`, `vf-slider`) have neither: your
own `aria-describedby` reaches them natively.

`vf-button` participates in forms like a native button:
`type="submit"`/`"reset"` (with
`formaction`, `formmethod`, `formtarget`, `formenctype`, `formnovalidate`),
`name`/`value` in the submission, and a submission that runs at the *end* of
the click's propagation so `preventDefault()` cancels it. One platform limit: a
form-associated custom element can never be a form's `event.submitter`. The
submitter is an internal proxy parented to the button, so read the submitting
control as `event.submitter.closest('vf-button')` and tell buttons apart by
`submitter.name`/`.value`.

```sh
npm run verify:focus
npm run verify:forced-colors
npm run verify:names
npm run verify:button
```
