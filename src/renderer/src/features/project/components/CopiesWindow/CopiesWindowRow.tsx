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
 * One file of a group, in two registers: the path, the store, the size and the date are
 * MEASURED and stated flatly, while the citations over-report — so the line says these
 * documents MENTION the file.
 *
 * 🛑 The trash is the ordinary `trashFiles`, which asks only when the file is cited or when
 * several go at once: a single uncited file leaves without a question, into the SYSTEM trash
 * it can be pulled back from. `files.undo` does not cover a trash.
 */
export function CopiesWindowRow({ copy, uses, onTrashed }: CopiesWindowRowProps) {
  const { t, i18n } = useTranslation()

  const trash = async (): Promise<void> => {
    const outcome = await getBridge()?.project.trashFiles([copy.path])
    if (outcome && outcome.done.length > 0) onTrashed()
  }

  // The studio's own copies refuse the gesture in the main process (`planTrash`, `isPrivatePath`)
  // — refused rather than absent, so the row still shows what would happen and why it will not.
  const mine = copy.store === 'visible'

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
        disabled={!mine}
        onClick={() => {
          void trash()
        }}
      >
        {t('copies.trash')}
      </WindowButton>
    </div>
  )
}
