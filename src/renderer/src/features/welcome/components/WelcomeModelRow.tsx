import type { AiOverview, ModelCandidate } from '@shared/domain/aiOverview'
import { modelThumbnailUrl } from '@shared/domain/localModel'
import { FIELD_THUMBNAIL } from '@/components/styles'
import { Thumbnail } from '@/components/Thumbnail'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import { AiModelActions } from '@/features/settings/components/Ai/AiModelActions'
import { cn } from '@/helpers/cn'
import { HINT_TOP } from '@/helpers/tooltip'
import { useBytes } from '@/hooks/useBytes'
import type { ModelFitSentence } from '@/hooks/useModelFit'

export type WelcomeModelRowProps = {
  candidate: ModelCandidate
  fit: ModelFitSentence
  /** The download in flight, wherever it was begun — the row reads whether it is its own. */
  installing: AiOverview['installing']
  busy: boolean
}

/**
 * One model a first launch can fetch. No radio, where the manager has one: an employment with a
 * model on the disk and no choice written falls to it by default.
 */
export function WelcomeModelRow({ candidate, fit, installing, busy }: WelcomeModelRowProps) {
  const bytes = useBytes()
  const line = [bytes(candidate.model.diskBytes), fit.verdict].join(' · ')

  return (
    // The card of the screen before, and for the same reason (Alban): one shape for everything
    // this window lists. Two lines, never three — the whole sentence stays on the tooltip.
    <li
      className="border-base-300 flex items-center gap-3 rounded-(--radius-sc-md) border p-3"
      {...HINT_TOP(line)}
    >
      {/* The same tile as the cards of the screen before: one shape for every picture here. */}
      <span className="bg-base-200 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-sc-md)">
        <Thumbnail url={modelThumbnailUrl(candidate.model)} className={FIELD_THUMBNAIL} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        {/* Data, not a word of the interface: a model is called what its publisher calls it. */}
        <span className="truncate text-sm">{candidate.model.name}</span>
        <span className={cn(WINDOW_CAPTION, 'truncate')}>{line}</span>
      </span>
      {/* One WIDTH, not a minimum (Alban): « Installer » and « Supprimer » are four letters apart,
          and down a column their edges drew a staircase. */}
      <span className="flex shrink-0 justify-end [&_button]:w-20">
        <AiModelActions
          size="row"
          candidate={candidate}
          progress={installing?.modelId === candidate.model.id ? installing.progress : null}
          loading={null}
          busy={busy}
        />
      </span>
    </li>
  )
}
