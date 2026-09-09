import type { AskedAnswer, AskedQuestion } from '@shared/domain/assistantAsk'
import { createMountedHost } from '@/helpers/hostRegistry'

/**
 * A question the STUDIO puts to the person, on the card the model's own questions use.
 *
 * Registered rather than imported, for the reason `chatPanel.ts` gives: the conversation store
 * imports the executor, so nothing the executor reaches may import that store back.
 */
type StudioAsk = (
  questions: readonly AskedQuestion[],
  opening: { notice: string; chosen: readonly AskedAnswer[] },
) => Promise<readonly AskedAnswer[] | null>

const host = createMountedHost<StudioAsk>()

/** Declares where a question of the studio's own is asked. Returns the way to take it back down. */
export const registerStudioAsk = host.hold

/** Whoever is able to ask, or `null` in a window with no shell — a settings window, a mirror. */
export const mountedStudioAsk = host.get
