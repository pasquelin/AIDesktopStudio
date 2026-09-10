import { useTranslation } from 'react-i18next'
import type { CopyGroup } from '@shared/domain/fileCopies'
import type { FileUse } from '@shared/domain/fileUse'
import { PropertySection } from '@/components/PropertySection'
import { WindowNote } from '@/components/WindowNote'
import { WindowShell } from '@/components/WindowShell'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { useDerivedCache } from '@/hooks/useDerivedCache'
import { useFileCopies } from '@/hooks/useFileCopies'
import { CopiesWindowCache } from './CopiesWindowCache'
import { CopiesWindowGroup } from './CopiesWindowGroup'

/**
 * What the open project holds twice, and what it can give back — §16, in a window of its own.
 *
 * READ-ONLY over the user's files, by construction: nothing here deletes anything. The one
 * command that writes frees the studio's own rebuildable stores, and the one gesture that can
 * reach a file of the user's is the ordinary trash, one row at a time, which asks first.
 *
 * The word on the heading is CANDIDATES, and every row is built to keep it true: what is
 * established sits on the row, what is not is worded as a question.
 */
export function CopiesWindow() {
  const { t } = useTranslation()
  useAppliedSettings()

  const { groups, uses, reading, reload } = useFileCopies()
  const cache = useDerivedCache()

  return (
    <WindowShell title={t('copies.title')}>
      <CopiesWindowCache cache={cache} />
      <PropertySection
        title={t('copies.candidates')}
        description={t('copies.candidatesNote')}
        scId="copies.candidates"
        plate
      >
        {candidates(groups, uses, reading, reload, t)}
      </PropertySection>
    </WindowShell>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']

/**
 * The three states of the diagnosis, told apart in one place.
 *
 * « Nothing is held twice » is an ANSWER and reads as one; it must never be what a reading in
 * flight shows, which is why the two have their own sentences.
 */
function candidates(
  groups: readonly CopyGroup[],
  uses: ReadonlyMap<string, readonly FileUse[]>,
  reading: boolean,
  reload: () => void,
  t: Translate,
) {
  if (reading) return <WindowNote>{t('copies.reading')}</WindowNote>
  if (groups.length === 0) return <WindowNote>{t('copies.none')}</WindowNote>

  return groups.map(group => (
    <CopiesWindowGroup key={group.hash} group={group} uses={uses} onTrashed={reload} />
  ))
}
