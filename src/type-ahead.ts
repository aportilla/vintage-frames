/**
 * Classic Finder first-letter type-ahead, as a shared buffer.
 *
 * Keystrokes accumulate into a prefix; {@link TypeAheadBuffer.feed} returns
 * the index of the next entry whose text starts with it. The search wraps,
 * skips disabled entries, re-tests the current entry while the prefix grows,
 * and cycles the entries sharing a first letter when one character is
 * repeated. The prefix resets after {@link TYPEAHEAD_TIMEOUT_MS} of silence.
 *
 * Lifted out of `vf-list` so `vf-select` and the menus run the same model
 * (the way `runSelectionBlink` was lifted into src/motion.ts): each host keeps
 * its own buffer and decides what a match does — select, highlight, or focus.
 */

/**
 * How long a type-ahead prefix stays open before the buffer resets, so the
 * next keystroke starts a fresh search.
 */
export const TYPEAHEAD_TIMEOUT_MS = 1000

/** One searchable row, in the caller's own order. */
export interface TypeAheadEntry {
  text: string
  disabled: boolean
}

export class TypeAheadBuffer {
  #prefix = ''
  #timer?: number

  /**
   * Feeds one printable key and returns the index of the entry the grown
   * prefix now matches, or -1 for none. `current` is the caller's keyboard
   * cursor (-1 for no cursor): a fresh prefix looks past it, a growing prefix
   * re-tests it so the match can hold as the user keeps typing.
   */
  feed(
    key: string,
    current: number,
    entries: readonly TypeAheadEntry[]
  ): number {
    if (entries.length === 0) return -1
    this.#prefix += key.toLowerCase()
    if (this.#timer !== undefined) window.clearTimeout(this.#timer)
    this.#timer = window.setTimeout(() => this.reset(), TYPEAHEAD_TIMEOUT_MS)

    const prefix = this.#prefix
    // Repeating one character cycles the entries starting with it, rather
    // than hunting for a literal "aaa" that no label has.
    const cycling =
      prefix.length > 1 && [...prefix].every((c) => c === prefix[0])
    const needle = cycling ? (prefix[0] as string) : prefix
    // A fresh prefix (or a cycle step) looks past the cursor; a growing one
    // re-tests the current entry. Clamped so a cursorless caller starts at 0.
    const from =
      prefix.length === 1 || cycling ? current + 1 : Math.max(current, 0)

    for (let i = 0; i < entries.length; i++) {
      const index = (from + i) % entries.length
      const entry = entries[index]
      if (!entry || entry.disabled) continue
      if (entry.text.trim().toLowerCase().startsWith(needle)) return index
    }
    return -1
  }

  /** Clears the pending prefix and its timer. */
  reset(): void {
    if (this.#timer !== undefined) window.clearTimeout(this.#timer)
    this.#timer = undefined
    this.#prefix = ''
  }
}
