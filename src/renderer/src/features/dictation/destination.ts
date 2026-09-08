import { createMountedHost } from '@/helpers/hostRegistry'

/**
 * Where a settled sentence goes, when it is not going to the caret.
 *
 * The caret is the default and always was — it is what makes dictation work in every field of
 * the studio without a single one of them being rewritten. This is the way out of that, and it
 * is declared BY the surface that wants the words rather than reached for by the session.
 *
 * The direction matters: dictation is an input service, and a service that had to know which
 * feature is on screen would gain a branch per feature. Here it knows only that somebody may
 * have claimed the words, and asks.
 */
type DictationTarget = (text: string) => void

const host = createMountedHost<DictationTarget>()

/** Claims the settled sentences while the surface is up. Returns the way to give them back. */
export const registerDictationTarget = host.hold

/** Whoever claimed them, or `null` — which means the caret, as it always did. */
export const mountedDictationTarget = host.get
