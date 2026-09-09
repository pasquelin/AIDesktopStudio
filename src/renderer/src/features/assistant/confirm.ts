import type { ActionCommitment, ActionName } from '@shared/domain/assistant'
import { createMountedHost } from '@/helpers/hostRegistry'

/**
 * The question asked before the assistant does anything that outlives the window.
 *
 * Registered by the shell, which outlives either host of the conversation — see `holdConfirmer`,
 * whose whole job is that the question lands somewhere the person is looking. A confirmation
 * shown where nobody is looking is not a confirmation.
 *
 * Deliberately not a `window.confirm`: it blocks the whole renderer, cannot say what a thing
 * costs in the studio's own type, and cannot be styled to look like anything but a browser.
 */
export type ConfirmRequest = {
  action: ActionName
  /**
   * What it was called WITH, already checked against the fields that declare it.
   *
   * 🛑 Shown, and that is why it is here: the question named the action and the level it engages
   * — « change ce qu'est le studio » over « Créer un dossier de projet » — and nothing said which
   * project. Approving without seeing the values is approving a category.
   */
  input: Record<string, unknown>
  commitment: ActionCommitment
  /**
   * What it will cost, in creative units. Absent when nothing is spent; `null` when the API
   * declined to say — which the question shows as such rather than filling in with a guess.
   */
  estimate?: number | null
}

/**
 * The yes, and the input as the person LEFT it — a folder they pointed at rather than the one the
 * model guessed. `input` is what runs; a refusal carries the request's own, unread.
 */
export type ConfirmAnswer = { granted: boolean; input: Record<string, unknown> }

type Confirmer = (request: ConfirmRequest) => Promise<ConfirmAnswer>

const host = createMountedHost<Confirmer>()

/** Declares where questions are asked. Returns the way to take it back down. */
export const registerConfirmer = host.hold

/** Whoever is able to ask, or `null` in a window with no shell — a settings window, a mirror. */
export const mountedConfirmer = host.get
