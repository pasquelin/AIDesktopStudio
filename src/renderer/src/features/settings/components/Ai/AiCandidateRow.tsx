import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModelCandidate } from '@shared/domain/aiOverview'
import { aiRoleId, type AiRoleId } from '@shared/domain/aiRole'
import {
  catalogueLineOf,
  modelThumbnailUrl,
  type DownloadProgress,
} from '@shared/domain/localModel'
import { FIELD_THUMBNAIL } from '@/components/styles'
import { Thumbnail } from '@/components/Thumbnail'
import { useBytes } from '@/hooks/useBytes'
import type { ModelFitSentence } from '@/hooks/useModelFit'
import { AiChoiceRow } from './AiChoiceRow'
import { AiModelActions } from './AiModelActions'
import { AiPublisherLink } from './AiPublisherLink'

export type AiCandidateRowProps = {
  role: AiRoleId
  candidate: ModelCandidate
  chosen: boolean
  fit: ModelFitSentence
  /** The download in flight, when it is this model's. */
  progress: DownloadProgress | null
  /** How far this model's load has got, from 0 to 1 — `null` when it is not the one loading. */
  loading: number | null
  /** Whether some install already holds the disk — a second would compete with it. */
  busy: boolean
  onChoose: () => void
}

/**
 * One model a role could run on, with the machine's verdict. Shown even when it cannot run: a
 * model too heavy stays visible and greyed, with its figure, rather than vanishing from the list.
 */
export const AiCandidateRow = memo(function AiCandidateRow({
  role,
  candidate,
  chosen,
  fit,
  progress,
  loading,
  busy,
  onChoose,
}: AiCandidateRowProps) {
  const { t } = useTranslation()
  const bytes = useBytes()

  return (
    <AiChoiceRow
      role={role}
      choice={candidate.model.id}
      // Data, not a word of the interface: a model is called what its publisher calls it.
      label={candidate.model.name}
      // What one download answers for, and it is said only when it is more than one: a figure
      // on every row would be noise, where "serves six employments" beside 4.47 GB is the whole
      // difference between this catalogue's lightest entry and its heaviest.
      caption={[
        candidate.model.diskBytes > 0 ? bytes(candidate.model.diskBytes) : undefined,
        catalogueLineOf(candidate.model),
        candidate.model.licence,
        candidate.serves > 1 ? t('aiModels.servesRoles', { count: candidate.serves }) : undefined,
        fit.verdict,
      ]
        .filter(part => part)
        .join(' · ')}
      // The provenance comes FIRST when there is one to say: it qualifies everything after it.
      hint={
        candidate.unverified
          ? [t('aiModels.unverifiedProvenance'), fit.note].filter(part => part).join(' · ')
          : fit.note
      }
      checked={chosen}
      disabled={!fit.usable}
      onChoose={onChoose}
      // The gauge is NAMED, and it has to be: `Thumbnail` fills the box a `Row` gives it, and
      // these windows have no `Row` at all — left to the default it asks for the whole width of
      // the line and refuses to shrink, which drew a 256px picture over the name beside it.
      picture={<Thumbnail url={modelThumbnailUrl(candidate.model)} className={FIELD_THUMBNAIL} />}
    >
      {(chosen || role === aiRoleId('3d', 'motion')) && (
        <AiPublisherLink url={candidate.model.source} />
      )}
      <AiModelActions candidate={candidate} progress={progress} loading={loading} busy={busy} />
    </AiChoiceRow>
  )
})
