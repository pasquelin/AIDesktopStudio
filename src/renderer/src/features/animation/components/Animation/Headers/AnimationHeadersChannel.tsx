import { mdiDeleteOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { ToolButton } from '@/components/ToolButton'
import { removeAnimationTrack } from '@/engines/scene/animationCommands'
import type { ChannelRow } from '@/engines/timeline/bandRows'
import { HINT_RIGHT, TIP_RIGHT } from '@/helpers/tooltip'
import { useScenes } from '@/stores/scenes'
import { TimelineRow } from '../../../../timeline/components/Timeline/Row/TimelineRow'

export function AnimationHeadersChannel({
  documentId,
  row,
}: {
  documentId: string
  row: ChannelRow
}) {
  const { t } = useTranslation()

  return (
    <TimelineRow height={row.height} nested level={2} data-testid={`anim-channel-${row.id}`}>
      <div className="flex items-center gap-0.5">
        <span className="text-muted text-tiny min-w-0 flex-1 truncate" {...HINT_RIGHT(row.name)}>
          {row.name}
        </span>
        <ToolButton
          icon={mdiDeleteOutline}
          label={t('animation.removeTrack', { name: row.name })}
          tooltip={TIP_RIGHT}
          variant="header"
          onClick={() =>
            useScenes.getState().runCommand(documentId, removeAnimationTrack(row.track.id))
          }
        />
      </div>
    </TimelineRow>
  )
}
