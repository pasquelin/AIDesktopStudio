import { useTranslation } from 'react-i18next'
import type { FileCopy } from '@shared/domain/fileCopies'
import type { FileUse } from '@shared/domain/fileUse'
import { WindowButton } from '@/components/WindowButton'
import { WindowTag } from '@/components/WindowTag'
import { WINDOW_CAPTION, WINDOW_ROW } from '@/components/windowStyles'
import { formatBytes, formatMoment } from '@/helpers/format'
import { getBridge } from '@/services/bridge'

export type CopiesWindowRowProps = {
  copy: FileCopy
  /** Documents that MENTION this path. Empty means none does — that half is established. */
  uses: readonly FileUse[]
  onTrashed: () => void
}

/**
 * One file of a group: where it is, which store owns it, what it weighs, and who names it.
 *
 * Two registers on purpose. The path, the store, the size and the date are MEASURED and stated
 * flatly. The citations are not: the reader over-reports, so the line says these documents
 * MENTION the file, and the caution under it says why that is not the same as needing it.
 *
 * The trash goes through the ordinary `trashFiles`, one path at a time: it raises the same
 * question every deletion raises, names the documents that would notice, and lands somewhere
 * the system can put back. Nothing here removes a file of the user's on its own.
 */
export function CopiesWindowRow({ copy, uses, onTrashed }: CopiesWindowRowProps) {
  const { t, i18n } = useTranslation()

  const trash = async (): Promise<void> => {
    const outcome = await getBridge()?.project.trashFiles([copy.path])
    if (outcome && outcome.done.length > 0) onTrashed()
  }

  return (
    <div className={WINDOW_ROW}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs" dir="ltr">
          {copy.path}
        </p>
        <p className={WINDOW_CAPTION}>
          {copy.bytes === null
            ? t('copies.sizeUnknown')
            : formatBytes(copy.bytes, unit => t(`units.${unit}`), i18n.language)}
          {' · '}
          {t('copies.added', { date: formatMoment(copy.addedAt, i18n.language, 'local') })}
        </p>
        <p className={WINDOW_CAPTION}>
          {uses.length === 0
            ? t('copies.mentionsNone')
            : t('copies.mentions', { count: uses.length })}
        </p>
      </div>
      <WindowTag>{t(`copies.store.${copy.store}`)}</WindowTag>
      <WindowButton
        variant="danger"
        size="row"
        onClick={() => {
          void trash()
        }}
      >
        {t('copies.trash')}
      </WindowButton>
    </div>
  )
}
