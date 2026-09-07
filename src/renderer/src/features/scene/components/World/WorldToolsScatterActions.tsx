import { mdiAutoFix, mdiBrush, mdiEraser, mdiFormatPaint, mdiRefresh } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { SelectField } from '@/components/SelectField'
import { ToolButton } from '@/components/ToolButton'
import { setScatterCategory, setScatterMask, setScatterSeed } from '@/engines/scene/scatterCommands'
import { deriveScatterMask } from '@/features/scene/deriveScatterMask'
import { TIP_TOP } from '@/helpers/tooltip'
import { useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import {
  GROUND_MATERIAL_CHANNELS,
  SCATTER_CATEGORIES,
  type GroundMaterialChannel,
  type ScatterLayer,
} from '@shared/domain/scene'

type ScatterTool = 'paint' | 'paintGround'
type Props = { documentId: string; scatter: ScatterLayer }

function toggleScatterTool(
  documentId: string,
  view: ReturnType<typeof sceneViewOf>,
  tool: ScatterTool,
): void {
  const views = useSceneViews.getState()
  if (view.sculptMode && view.sculptTool === tool) views.setSculptMode(documentId, false)
  else {
    views.setSculptTool(documentId, tool)
    views.setSculptMode(documentId, true)
  }
}

export function WorldToolsScatterActions({ documentId, scatter }: Props) {
  const { t } = useTranslation()
  const run = useScenes.getState().runCommand
  const view = useSceneViews(state => sceneViewOf(state, documentId))
  const channel = view.armedWorld?.materialChannel ?? 'r'
  const categories = SCATTER_CATEGORIES.map(category => ({
    value: category,
    label: t(`world.scatterCategory_${category}`),
    disabled: scatter.locked,
  }))

  return (
    <>
      <SelectField
        label={t('world.scatterCategory')}
        value={scatter.category}
        options={categories}
        onChange={category => run(documentId, setScatterCategory(scatter.id, category))}
        scId="world.scatterCategory"
      />
      <SelectField
        label={t('world.groundMaterial')}
        value={channel}
        options={GROUND_MATERIAL_CHANNELS.map(value => ({
          value,
          label: t(`world.groundChannel_${value}`),
        }))}
        onChange={(materialChannel: GroundMaterialChannel) =>
          useSceneViews
            .getState()
            .setArmedWorld(documentId, { kind: 'scatter', id: scatter.id, materialChannel })
        }
        scId="world.scatterGroundMaterial"
      />
      <div className="flex">
        <ToolButton
          icon={mdiFormatPaint}
          label={t('world.paintGround')}
          description={t('world.paintGroundHint')}
          tooltip={TIP_TOP}
          variant="bar"
          active={view.sculptMode && view.sculptTool === 'paintGround'}
          disabled={scatter.locked}
          onClick={() => toggleScatterTool(documentId, view, 'paintGround')}
        />
        <ToolButton
          icon={mdiBrush}
          label={t('world.paintMask')}
          description={t('world.paintScatterMaskHint')}
          tooltip={TIP_TOP}
          variant="bar"
          active={view.sculptMode && view.sculptTool === 'paint'}
          disabled={scatter.locked}
          onClick={() => toggleScatterTool(documentId, view, 'paint')}
        />
        <ToolButton
          icon={mdiEraser}
          label={t('world.clearMask')}
          description={t('world.clearMaskHint')}
          tooltip={TIP_TOP}
          variant="bar"
          disabled={scatter.locked || !scatter.mask}
          onClick={() => run(documentId, setScatterMask(scatter.id, undefined))}
        />
        <ToolButton
          icon={mdiAutoFix}
          label={t('world.generateAutomatically')}
          description={t('world.generateAutomaticallyHint')}
          tooltip={TIP_TOP}
          variant="bar"
          disabled={scatter.locked}
          onClick={() => void deriveScatterMask(documentId, scatter.id, undefined, channel)}
        />
        <ToolButton
          icon={mdiRefresh}
          label={t('world.regenerate')}
          description={t('world.regenerateHint')}
          tooltip={TIP_TOP}
          variant="bar"
          disabled={scatter.locked}
          onClick={() => run(documentId, setScatterSeed(scatter.id, scatter.seed + 1))}
        />
      </div>
    </>
  )
}
