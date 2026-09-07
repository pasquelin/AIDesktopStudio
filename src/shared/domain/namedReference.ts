import { foldForSearch, searchWords } from '../text'

export type NamedReferenceResolution<T> =
  { kind: 'resolved'; value: T } | { kind: 'ambiguous'; values: readonly T[] } | { kind: 'missing' }

function containsWords(sentence: readonly string[], name: readonly string[]): boolean {
  if (name.length === 0 || name.length > sentence.length) return false
  return sentence.some((_, start) => name.every((word, at) => sentence[start + at] === word))
}

export function resolveNamedReference<T>(
  given: string,
  candidates: readonly T[],
  identity: (candidate: T) => string,
  names: (candidate: T) => readonly string[],
): NamedReferenceResolution<T> {
  const exact = candidates.filter(candidate => identity(candidate) === given)
  if (exact.length === 1) return { kind: 'resolved', value: exact[0]! }
  if (exact.length > 1) return { kind: 'ambiguous', values: exact }

  const folded = foldForSearch(given.trim())
  if (folded === '') return { kind: 'missing' }
  const matches = candidates.filter(candidate =>
    [identity(candidate), ...names(candidate)].some(name => foldForSearch(name) === folded),
  )
  if (matches.length === 1) return { kind: 'resolved', value: matches[0]! }
  if (matches.length > 1) return { kind: 'ambiguous', values: matches }

  const givenWords = searchWords(given)
  const contained = candidates.filter(candidate =>
    [identity(candidate), ...names(candidate)].some(name =>
      containsWords(givenWords, searchWords(name)),
    ),
  )
  if (contained.length === 1) return { kind: 'resolved', value: contained[0]! }
  return contained.length > 1 ? { kind: 'ambiguous', values: contained } : { kind: 'missing' }
}
