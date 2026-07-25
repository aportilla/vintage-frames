/**
 * Shared numeric helpers for the stepped controls (`vf-number-field`,
 * `vf-slider`), which both snap a value to a `step` grid and then fix the
 * floating-point residue with `toFixed()`.
 */

/** `toFixed()` accepts 0…100 fraction digits and throws a RangeError beyond. */
const MAX_DECIMALS = 100

/**
 * Fraction digits implied by a `step`, i.e. the precision a stepped value
 * should be rounded to.
 *
 * Naively counting the digits after `String(step)`'s decimal point is wrong for
 * steps the runtime stringifies in exponential notation: `String(1e-7)` is
 * `'1e-7'`, which has no dot at all, so a digit count reports 0 and
 * `toFixed(0)` then snaps every stepped value to a whole number. Steps at or
 * below `1e-7` (and, in the other direction, at or above `1e21`) take that
 * form, so both branches are handled here:
 *
 *   0.25   → 2      1e-7    → 7
 *   1      → 0      1.5e-7  → 8
 *   0.001  → 3      1e21    → 0
 *
 * The result is clamped to `[0, MAX_DECIMALS]` so a subnormal step (down to
 * `5e-324`) can't hand `toFixed()` an out-of-range argument.
 */
export function decimalsOf(step: number): number {
  if (!Number.isFinite(step)) return 0
  const s = String(Math.abs(step))
  const e = s.indexOf('e')
  if (e < 0) {
    const dot = s.indexOf('.')
    return dot < 0 ? 0 : Math.min(MAX_DECIMALS, s.length - dot - 1)
  }
  // Exponential form: the mantissa's own decimals shifted by the exponent.
  // `1.5e-7` = 0.00000015 → 1 mantissa decimal + 7 = 8.
  const mantissa = s.slice(0, e)
  const power = Number(s.slice(e + 1))
  const dot = mantissa.indexOf('.')
  const mantissaDecimals = dot < 0 ? 0 : mantissa.length - dot - 1
  return Math.min(MAX_DECIMALS, Math.max(0, mantissaDecimals - power))
}
