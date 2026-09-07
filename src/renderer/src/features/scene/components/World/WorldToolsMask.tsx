import { mdiFormatPaint } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { PropertySection } from '@/components/PropertySection'
import { ToolButton } from '@/components/ToolButton'
import { setTerrainEditMask } from '@/engines/scene/reliefCommands'
import { TIP_TOP } from '@/helpers/tooltip'
import { useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import type { ReliefMask } from '@shared/domain/relief'
import type { ReliefLayer, TerrainEditLayer } from '@shared/domain/scene'
import { WorldToolsMaskMenu } from './WorldToolsMaskMenu'
import { WorldToolsMaskRange } from './WorldToolsMaskRange'

export function WorldToolsMask({
  documentId,
  terrain,
  edit,
}: {
  documentId: string
  terrain: ReliefLayer
  edit: TerrainEditLayer
}) {
  const { t } = useTranslation()
  const sculptMode = useSceneViews(state => sceneViewOf(state, documentId).sculptMode)
  const sculptTool = useSceneViews(state => sceneViewOf(state, documentId).sculptTool)
  const heightMask = edit.mask?.kind === 'height' ? edit.mask : undefined
  const slopeMask = edit.mask?.kind === 'slope' ? edit.mask : undefined
  const setMask = (mask: ReliefMask | undefined): void => {
    if (mask?.kind !== 'painted' && sculptTool === 'paint') {
      const views = useSceneViews.getState()
      views.setSculptTool(documentId, 'raise')
      views.setSculptMode(documentId, false)
    }
    useScenes.getState().runCommand(documentId, setTerrainEditMask(terrain.id, edit.id, mask))
  }
  const views = useSceneViews.getState()

  return (
    <PropertySection title={t('world.mask')} scId="world.mask" defaultOpen>
      <WorldToolsMaskMenu terrain={terrain} edit={edit} setMask={setMask} />
      {edit.mask?.kind === 'painted' ? (
        <ToolButton
          icon={mdiFormatPaint}
          label={t('world.paintMask')}
          description={t('world.paintMaskHint')}
          tooltip={TIP_TOP}
          variant="bar"
          active={sculptMode && sculptTool === 'paint'}
          onClick={() => {
            if (sculptMode && sculptTool === 'paint') views.setSculptMode(documentId, false)
            else {
              views.setSculptTool(documentId, 'paint')
              views.setSculptMode(documentId, true)
            }
          }}
        />
      ) : null}
      {heightMask ? (
        <WorldToolsMaskRange
          minScId="world.maskHeightMin"
          maxScId="world.maskHeightMax"
          value={heightMask}
          min={terrain.elevation.min}
          max={terrain.elevation.max}
          step={0.01}
          onChange={mask => setMask({ kind: 'height', ...mask })}
          onReset={edge =>
            setMask({
              kind: 'height',
              min: edge === 'min' ? terrain.elevation.min : heightMask.min,
              max: edge === 'max' ? terrain.elevation.max : heightMask.max,
            })
          }
        />
      ) : null}
      {slopeMask ? (
        <WorldToolsMaskRange
          minScId="world.maskSlopeMin"
          maxScId="world.maskSlopeMax"
          value={slopeMask}
          min={0}
          max={90}
          step={1}
          onChange={mask => setMask({ kind: 'slope', ...mask })}
          onReset={edge =>
            setMask({
              kind: 'slope',
              min: edge === 'min' ? 0 : slopeMask.min,
              max: edge === 'max' ? 90 : slopeMask.max,
            })
          }
        />
      ) : null}
    </PropertySection>
  )
}
