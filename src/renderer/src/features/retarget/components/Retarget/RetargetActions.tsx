import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import type { RetargetWorkspaceState } from '../../hooks/useRetargetWorkspace'
import { RetargetStatus } from './RetargetStatus'

export function RetargetActions(props: RetargetWorkspaceState) {
  const { session, source, target, preview, name, exporting, apply, sourceLoading } = props
  const { t } = useTranslation()
  const canApply =
    preview.result !== null &&
    preview.current(preview.result) &&
    name.trim() !== '' &&
    !sourceLoading &&
    !session.stale &&
    !exporting &&
    session.status !== 'saving' &&
    session.status !== 'saved'
  return (
    <div className="flex flex-col gap-(--sc-gutter) p-(--sc-gutter)">
      <RetargetStatus {...props} />
      <Button
        disabled={!source?.clips.length || !target?.bones.length || session.stale}
        onClick={() => {
          if (preview.busy) preview.cancel()
          else {
            session.idle()
            void preview.preview()
          }
        }}
      >
        {t(preview.busy ? 'character.retarget.cancel' : 'character.retarget.preview')}
      </Button>
      <Button variant="primary" disabled={!canApply} onClick={() => void apply()}>
        {t('character.retarget.apply')}
      </Button>
    </div>
  )
}
