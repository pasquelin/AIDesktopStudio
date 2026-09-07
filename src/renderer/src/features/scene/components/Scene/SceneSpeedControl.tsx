import { mdiRun } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { boundsOf } from '@shared/domain/settingsRegistry'
import { ToggleMenu } from '@/components/ToggleMenu/ToggleMenu'
import { tipFor } from '@/helpers/tooltip'
import { useSpeedReading } from '@/hooks/useSpeedReading'
import { useViewportSetting } from '@/hooks/useViewportSetting'
import { SceneSpeedMenu } from './SceneSpeedMenu'

// Read once: the registry answers by walking every descriptor, and this sits on a render path.
const FLY_SPEED = boundsOf('three.flySpeed')

export type SceneSpeedControlProps = {
  /** The session speed the wheel writes in flight, or `null` while nothing has moved it. */
  speed: number | null
  onSpeed: (speed: number) => void
}

/**
 * How fast the camera travels. Shared rather than mounted twice: the skeleton window flies the
 * same engine, and a second control would be a second reading of one session speed.
 */
export function SceneSpeedControl({ speed, onSpeed }: SceneSpeedControlProps) {
  const { t } = useTranslation()
  const { view } = useViewportSetting()
  const speedReading = useSpeedReading()
  const flying = speed ?? view.flySpeed

  return (
    <ToggleMenu
      icon={mdiRun}
      scId="snapBar.speed"
      label={t('snapBar.speed')}
      description={t('snapBar.speedHint')}
      tooltip={tipFor('horizontal')}
      value={speedReading(flying)}
      widest={speedReading(FLY_SPEED.max)}
      valueName={t('snapBar.speed')}
      rowCount={2}
      rows={close => <SceneSpeedMenu speed={flying} onChoose={onSpeed} onClose={close} />}
    />
  )
}
