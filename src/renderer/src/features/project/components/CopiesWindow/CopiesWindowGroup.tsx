import { useTranslation } from 'react-i18next'
import { redundantBytesOf, type CopyGroup } from '@shared/domain/fileCopies'
import type { FileUse } from '@shared/domain/fileUse'
import { WINDOW_CAPTION, WINDOW_GROUP_LABEL } from '@/components/windowStyles'
import { formatBytes } from '@/helpers/format'
import { CopiesWindowRow } from './CopiesWindowRow'

export type CopiesWindowGroupProps = {
  group: CopyGroup
  /** Every path's citations, shared by the whole window — see `useFileCopies`. */
  uses: ReadonlyMap<string, readonly FileUse[]>
  onTrashed: () => void
}

/**
 * One fingerprint, and the files carrying it.
 *
 * The heading says what is ESTABLISHED — these bytes are the same — and the figure beside it is
 * conditional in its words: what ONE copy kept would give back. Not a recommendation, and never
 * a total across groups: added up, it would read as a number the studio is offering to reclaim.
 */
export function CopiesWindowGroup({ group, uses, onTrashed }: CopiesWindowGroupProps) {
  const { t, i18n } = useTranslation()
  const spare = redundantBytesOf(group)

  return (
    <section className="py-2">
      <h3 className={WINDOW_GROUP_LABEL}>
        {t('copies.sameBytes', { count: group.copies.length })}
      </h3>
      <p className={WINDOW_CAPTION}>
        {spare === null
          ? t('copies.sizeUnknown')
          : t('copies.wouldFree', {
              size: formatBytes(spare, unit => t(`units.${unit}`), i18n.language),
            })}
      </p>
      {group.copies.map(copy => (
        <CopiesWindowRow
          key={copy.assetId}
          copy={copy}
          uses={uses.get(copy.path) ?? []}
          onTrashed={onTrashed}
        />
      ))}
    </section>
  )
}
