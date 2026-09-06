import { useTranslation } from 'react-i18next'
import { QuietNote } from '@/components/QuietNote'
import { Button } from '@/components/Button'
import type { RetargetWorkspaceState } from '../../hooks/useRetargetWorkspace'

export function RetargetStatus({ session, target, failure, preview }: RetargetWorkspaceState) {
  const { t } = useTranslation()
  return (
    <>
      {session.stale && (
        <>
          {session.status !== 'saved' && <QuietNote>{t('character.retarget.stale')}</QuietNote>}
          <Button onClick={session.refresh}>{t('character.retarget.refresh')}</Button>
        </>
      )}
      {target && target.bones.length === 0 && (
        <>
          <QuietNote>{t('character.retarget.noRig')}</QuietNote>
          <Button disabled={session.gone} onClick={session.editRig}>
            {t('character.retarget.editRig')}
          </Button>
        </>
      )}
      {(failure || preview.failed || session.status === 'failed') && (
        <QuietNote>{t('character.retarget.failed')}</QuietNote>
      )}
      {session.status === 'saved' && <QuietNote>{t('character.retarget.saved')}</QuietNote>}
    </>
  )
}
