import { useTranslation } from 'react-i18next'
import { NumberField } from '@/components/NumberField'
import { SelectField } from '@/components/SelectField'
import { SliderField } from '@/components/SliderField'
import { ToggleField } from '@/components/ToggleField'
import {
  setScatterCollision,
  setScatterFollowRelief,
  setScatterRules,
  setScatterSeed,
} from '@/engines/scene/scatterCommands'
import { useScenes } from '@/stores/scenes'
import { layerRegion } from '@shared/domain/scatterFollow'
import { scatterPosesOf } from '@shared/domain/scatterGenerate'
import { FLAT_SCATTER_GROUND } from '@shared/domain/scatterGround'
import {
  SCATTER_ALTITUDE,
  SCATTER_COLLISION_CAP,
  SCATTER_DENSITY,
  SCATTER_SCALE,
  SCATTER_SLOPE,
  SCATTER_SLOPE_ALIGN,
  SCATTER_SPACING,
  SCATTER_TILT,
  type ScatterLayer,
} from '@shared/domain/scene'

type Props = { documentId: string; scatter: ScatterLayer }

function collisionDemandOf(scatter: ScatterLayer): number {
  if (!scatter.collision) return 0
  return scatterPosesOf(scatter, layerRegion(scatter), FLAT_SCATTER_GROUND).length
}

export function WorldToolsScatterRules({ documentId, scatter }: Props) {
  const { t } = useTranslation()
  const run = useScenes.getState().runCommand
  const rules = scatter.rules
  const patch = (next: Partial<typeof rules>): void => {
    run(documentId, setScatterRules(scatter.id, { ...rules, ...next }))
  }
  const collisionEstimate = collisionDemandOf(scatter)

  return (
    <>
      <NumberField
        label={t('world.seed')}
        value={scatter.seed}
        min={0}
        max={2_147_483_647}
        step={1}
        onChange={seed => run(documentId, setScatterSeed(scatter.id, seed))}
        scId="world.seed"
      />
      <SliderField
        label={t('world.density')}
        value={rules.density}
        {...SCATTER_DENSITY}
        onChange={density => patch({ density })}
        scId="world.density"
      />
      <SliderField
        label={t('world.spacing')}
        value={rules.spacing}
        {...SCATTER_SPACING}
        onChange={spacing => patch({ spacing })}
        scId="world.spacing"
      />
      <SliderField
        label={t('world.minScale')}
        value={rules.minScale}
        {...SCATTER_SCALE}
        onChange={minScale => patch({ minScale })}
        scId="world.minScale"
      />
      <SliderField
        label={t('world.maxScale')}
        value={rules.maxScale}
        {...SCATTER_SCALE}
        onChange={maxScale => patch({ maxScale })}
        scId="world.maxScale"
      />
      <ToggleField
        label={t('world.randomRotation')}
        value={rules.randomRotation}
        onChange={randomRotation => patch({ randomRotation })}
        scId="world.randomRotation"
      />
      <SliderField
        label={t('world.slopeAlign')}
        value={rules.slopeAlign}
        {...SCATTER_SLOPE_ALIGN}
        onChange={slopeAlign => patch({ slopeAlign })}
        scId="world.slopeAlign"
      />
      <SliderField
        label={t('world.tilt')}
        value={rules.randomTilt}
        {...SCATTER_TILT}
        onChange={randomTilt => patch({ randomTilt })}
        scId="world.tilt"
      />
      <NumberField
        label={t('world.altitudeMin')}
        value={rules.altitudeMin}
        {...SCATTER_ALTITUDE}
        onChange={altitudeMin => patch({ altitudeMin })}
        scId="world.altitudeMin"
      />
      <NumberField
        label={t('world.altitudeMax')}
        value={rules.altitudeMax}
        {...SCATTER_ALTITUDE}
        onChange={altitudeMax => patch({ altitudeMax })}
        scId="world.altitudeMax"
      />
      <SliderField
        label={t('world.slopeMin')}
        value={rules.slopeMin}
        {...SCATTER_SLOPE}
        onChange={slopeMin => patch({ slopeMin })}
        scId="world.slopeMin"
      />
      <SliderField
        label={t('world.slopeMax')}
        value={rules.slopeMax}
        {...SCATTER_SLOPE}
        onChange={slopeMax => patch({ slopeMax })}
        scId="world.slopeMax"
      />
      <SelectField
        label={t('world.followRelief')}
        value={scatter.followRelief}
        options={[
          { value: 'none', label: t('world.followRelief_none') },
          { value: 'brush', label: t('world.followRelief_brush') },
          { value: 'layer', label: t('world.followRelief_layer') },
        ]}
        onChange={follow => run(documentId, setScatterFollowRelief(scatter.id, follow))}
        scId="world.followRelief"
      />
      {scatter.category === 'props' ? (
        <ToggleField
          label={t('world.collision')}
          value={scatter.collision}
          onChange={collision => run(documentId, setScatterCollision(scatter.id, collision))}
          scId="world.collision"
        />
      ) : null}
      {scatter.category === 'props' &&
      scatter.collision &&
      collisionEstimate > SCATTER_COLLISION_CAP ? (
        <p role="alert" className="text-warning text-tiny m-0">
          {t('world.collisionCapWarning', { cap: SCATTER_COLLISION_CAP })}
        </p>
      ) : null}
    </>
  )
}
