import { mdiFormatPaint, mdiMinus, mdiPlus } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { PictureField } from '@/components/PictureField'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { ToolButton } from '@/components/ToolButton'
import { setTerrainGroundMaterials } from '@/engines/scene/reliefCommands'
import { TIP_TOP } from '@/helpers/tooltip'
import { useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import {
  GROUND_MATERIAL_CHANNELS,
  MAX_GROUND_MATERIALS,
  type GroundMaterialChannel,
  type ReliefLayer,
} from '@shared/domain/scene'

type Props = { documentId: string; terrain: ReliefLayer }

export function WorldToolsGroundMaterials({ documentId, terrain }: Props) {
  const { t } = useTranslation()
  const view = useSceneViews(state => sceneViewOf(state, documentId))
  const views = useSceneViews.getState()
  const run = useScenes.getState().runCommand
  const activeChannel = view.armedWorld?.materialChannel ?? terrain.groundMaterials[0]?.channel
  const active = terrain.groundMaterials.find(material => material.channel === activeChannel)
  const options = terrain.groundMaterials.map(material => ({
    value: material.channel,
    label: t(`world.groundChannel_${material.channel}`),
  }))
  const arm = (channel: GroundMaterialChannel): void => {
    views.setArmedWorld(documentId, {
      kind: 'relief',
      id: terrain.id,
      editId: null,
      materialChannel: channel,
    })
  }
  const patchActive = (patch: Partial<NonNullable<typeof active>>): void => {
    if (!active) return
    run(
      documentId,
      setTerrainGroundMaterials(
        terrain.id,
        terrain.groundMaterials.map(material =>
          material.channel === active.channel ? { ...material, ...patch } : material,
        ),
      ),
    )
  }
  const setAlbedo = (assetId: string | null): void => {
    if (!assetId) return
    if (active) {
      patchActive({ albedo: { assetId } })
      return
    }
    const channel = GROUND_MATERIAL_CHANNELS[0]
    if (!channel) return
    run(
      documentId,
      setTerrainGroundMaterials(terrain.id, [{ albedo: { assetId }, normal: null, channel }]),
    )
    arm(channel)
  }
  const add = (): void => {
    const channel = GROUND_MATERIAL_CHANNELS.find(
      candidate => !terrain.groundMaterials.some(material => material.channel === candidate),
    )
    const source = active ?? terrain.groundMaterials[0]
    if (!channel || !source) return
    run(
      documentId,
      setTerrainGroundMaterials(terrain.id, [...terrain.groundMaterials, { ...source, channel }]),
    )
    arm(channel)
  }
  const remove = (): void => {
    if (!active) return
    const remaining = terrain.groundMaterials.filter(
      material => material.channel !== active.channel,
    )
    run(documentId, setTerrainGroundMaterials(terrain.id, remaining))
    const next = remaining[0]?.channel
    if (next) arm(next)
    else views.setArmedWorld(documentId, { kind: 'relief', id: terrain.id, editId: null })
  }
  const paint = (): void => {
    if (!active) return
    arm(active.channel)
    views.setSculptTool(documentId, 'paintGround')
    views.setSculptMode(documentId, !(view.sculptMode && view.sculptTool === 'paintGround'))
  }

  return (
    <PropertySection title={t('world.groundMaterial')} scId="world.groundMaterial" defaultOpen>
      <SelectField
        label={t('world.groundMaterial')}
        value={activeChannel ?? null}
        options={options}
        unnamedLabel={t('world.noGroundMaterial')}
        onChange={arm}
        scId="world.groundMaterial"
      />
      <PictureField
        label={t('world.groundAlbedo')}
        value={active?.albedo.assetId ?? null}
        onChange={setAlbedo}
        scId="world.groundAlbedo"
      />
      <PictureField
        label={t('world.groundNormal')}
        value={active?.normal?.assetId ?? null}
        onChange={assetId => patchActive({ normal: assetId ? { assetId } : null })}
        scId="world.groundNormal"
      />
      <ToolButton
        icon={mdiPlus}
        label={t('world.addGroundMaterial')}
        tooltip={TIP_TOP}
        disabled={!active || terrain.groundMaterials.length >= MAX_GROUND_MATERIALS}
        onClick={add}
      />
      <ToolButton
        icon={mdiMinus}
        label={t('world.removeGroundMaterial')}
        tooltip={TIP_TOP}
        disabled={!active}
        onClick={remove}
      />
      <ToolButton
        icon={mdiFormatPaint}
        label={t('world.paintGroundWeights')}
        description={t('world.paintGroundWeightsHint')}
        tooltip={TIP_TOP}
        active={view.sculptMode && view.sculptTool === 'paintGround'}
        disabled={!active}
        onClick={paint}
      />
    </PropertySection>
  )
}
