/**
 * The shape a text is searched by: accents dropped and case folded, so `thème` answers to
 * `theme` and `Forêt` to `foret`. A search box that demands a circumflex is a search box
 * nobody uses — and the hand that types into it is looking, not spelling.
 *
 * Decomposing first is what makes it work on either side: `é` typed as one character and `é`
 * typed as `e` plus an accent both come out as `e`, so a name pasted from elsewhere is found
 * by a name typed here.
 *
 * A no-break space folds to an ordinary one for the same reason: the bundles bind a figure to
 * its unit with U+00A0, and the hand searching for `700 MB` types the space its keyboard has.
 */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\p{Zs}/gu, ' ')
    .toLowerCase()
}

/**
 * The words a search is made of — folded, then matched against every name by `matchesWords`.
 *
 * Punctuation is not part of a word: a dictated `le voilier.` ends in a full stop, and a search
 * that kept it attached answered nothing for a file plainly there. Letters and NUMBERS by their
 * Unicode class, never `[a-z0-9]`: « génération » shattered into `g`, `n` and `ration`, and the
 * one-letter tokens scored against dozens of actions in `findActions`.
 */
export function searchWords(term: string): readonly string[] {
  return foldForSearch(term).match(/[\p{Letter}\p{Number}]+/gu) ?? []
}

/**
 * Whether a name answers those words: EVERY one of them is in it, in any order.
 *
 * A substring was what this used to be, and it failed the search a person actually types —
 * `green sailboat` finds nothing in `a beautiful sailing ship, sailboat, on the open sea, green`.
 * The words are PREPARED by the caller: a walk crosses a hundred thousand entries, and folding
 * one term per entry is that work done a hundred thousand times.
 */
export function matchesWords(name: string, words: readonly string[]): boolean {
  if (words.length === 0) return false

  const folded = foldForSearch(name)
  return words.every(word => folded.includes(word))
}

/**
 * What is left of `sentence` once `typed` has been written, or nothing when the sentence does not
 * begin that way — the grey tail an inline completion paints ahead of the caret.
 *
 * The cut is SEARCHED for rather than taken at `typed.length`: folding drops characters, so a
 * decomposed `é` typed as two makes the two lengths disagree, and the tail came out a letter short.
 */
export function completionFor(sentence: string, typed: string): string | undefined {
  if (typed.trim() === '') return undefined

  const written = foldForSearch(typed)
  for (let cut = 0; cut < sentence.length; cut++) {
    if (foldForSearch(sentence.slice(0, cut)) === written) return sentence.slice(cut)
  }

  return undefined
}

/**
 * The order of two strings nothing DISPLAYS in that order — an ISO stamp, a schema key, an id.
 *
 * `localeCompare` is the wrong tool twice over here. It answers in the locale the OS happens to
 * run in, so the same data would order differently on two machines; and it builds an ICU collator
 * per comparison, which a sort pays n·log n times for an order no reader ever sees. Code units
 * are what these strings mean: an ISO stamp sorts chronologically by construction.
 *
 * Text a person DOES read never takes its DISPLAYED order here — that one is `localeCompare` with
 * the language the reader chose, which `no-bare-locale-compare.test.ts` is what makes sure of. A
 * port with no language may still come here for a STABLE one, and `catalog.ts` does for its asset
 * tags: what it owes its callers is the same answer twice, not an order anybody reads.
 */
export function byCodeUnit(one: string, other: string): number {
  return one < other ? -1 : one > other ? 1 : 0
}

/**
 * A text cut to a length, with an ellipsis saying it was cut — never a silent truncation.
 *
 * Here rather than beside its callers: four other places hand-roll it — a contact sheet caption,
 * a memory summary, an action's result, a history block — and each RESERVES the ellipsis inside
 * its bound, which this does not. They are worth folding in the day that difference is settled.
 */
export const clipped = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}…`

/**
 * Where the object opening at `opens` closes, strings and escapes skipped; `-1` when it never does.
 *
 * Shared because both sides walk JSON they did not parse: the main process reads the head of a
 * document, and the assistant reads a reply a model wrote around it. Written twice, an escaping
 * fix landed in one of them only.
 */
export function closingBrace(text: string, opens: number): number {
  let depth = 0
  let quoted = false

  for (let at = opens; at >= 0 && at < text.length; at += 1) {
    const char = text[at]
    if (quoted) {
      if (char === '\\') at += 1
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{') depth += 1
    else if (char === '}' && (depth -= 1) === 0) return at
  }

  return -1
}
