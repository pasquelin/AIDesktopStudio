import { confirmKey, type ActionCommitment } from '@shared/domain/assistant'
import { formatUnits } from '@/helpers/format'

/** How a sentence is read — the one thing the two doors do differently: the window has i18next
 * and a locale, the wire has the English bundle. */
export type Translate = (key: string, holes?: Record<string, string | number>) => string

/**
 * What a call engages, in one sentence, for whichever door is asking.
 *
 * 🛑 Shared because the two must say the SAME thing: written twice, the modal quoted "~4 CU." and
 * the wire refusal "4." for one call. Keyed off the commitment rather than branched on, so a
 * fifth level cannot fall silently into the wrong sentence.
 */
export function confirmSentence(
  commitment: ActionCommitment,
  estimate: number | null | undefined,
  translate: Translate,
  language: string,
): string {
  if (commitment !== 'credits') return translate(confirmKey(commitment))
  if (typeof estimate !== 'number') return translate('assistant.confirm.unknownCost')
  if (estimate === 0) return translate('assistant.confirm.noCost')

  return translate(confirmKey(commitment), {
    cost: translate('generation.estimatedCost', { units: formatUnits(estimate, language) }),
  })
}
