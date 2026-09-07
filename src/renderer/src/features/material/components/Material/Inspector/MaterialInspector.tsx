import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { EnvironmentRef } from '@shared/domain/scene'
import { ColorField } from '@/components/ColorField'
import { PropertySection } from '@/components/PropertySection'
import { RangeField } from '@/components/RangeField'
import { SelectField } from '@/components/SelectField'
import { SliderField } from '@/components/SliderField'
import { resetTo } from '@/helpers/resetTo'
import { HINT_LEFT } from '@/helpers/tooltip'
import { ToggleField } from '@/components/ToggleField'
import { VectorField } from '@/components/VectorField'
import { setMaterialSetting, setPreview } from '@/engines/material/commands'
import {
  DEFAULT_PREVIEW,
  PREVIEW_BOUNDS,
  PREVIEW_SHAPES,
  TILING_PREVIEWS,
} from '@/engines/material/materialState'
import { SHAPE_LABELS } from '@/features/material/components/Material/materialTools'
import { toDegrees, toRadians } from '@shared/domain/angles'
import { DEFAULT_TEXTURE_MATERIAL, MATERIAL_BOUNDS } from '@shared/domain/material'
import { materialOf, useMaterials } from '@/stores/materials'
import { EnvironmentSection } from '../../../../scene/components/Environment/EnvironmentSection'
import { useDocumentEdit } from '@/hooks/useDocumentEdit'
import { ChannelsSection } from '../../ChannelsSection/ChannelsSection'
import { StylesSection } from '../../StylesSection/StylesSection'
import { MaterialInspectorSeamReading } from './MaterialInspectorSeamReading'
import { MaterialInspectorReliefSection } from './MaterialInspectorReliefSection'

export type TextureInspectorProps = { documentId: string }

/**
 * Everything a material is made of, and everything the shape it sits on is judged under.
 *
 * A face of the one inspector rather than a panel of its own — the studio has a single answer to
 * "what am I looking at". It reads the document in front, so nothing here has to be selected.
 *
 * Roughness, not glossiness: the file stores roughness, three calls it roughness, and the 3D
 * inspector already says roughness. One word for one quantity, with the tooltip carrying the
 * reading for whoever arrives from Substance.
 */
export function MaterialInspector({ documentId }: TextureInspectorProps) {
  const { t } = useTranslation()
  const material = useMaterials(state => materialOf(state, documentId).material)
  const preview = useMaterials(state => materialOf(state, documentId).preview)
  const edit = useDocumentEdit(useMaterials, documentId)

  const onMaterial = <K extends keyof typeof material>(key: K, value: (typeof material)[K]): void =>
    edit.run(setMaterialSetting(key, value))
  const onPreview = <K extends keyof typeof preview>(key: K, value: (typeof preview)[K]): void =>
    edit.run(setPreview(key, value))

  const resetMaterial = <K extends keyof typeof material>(key: K): (() => void) | undefined =>
    resetTo(material[key], DEFAULT_TEXTURE_MATERIAL[key], value => onMaterial(key, value))

  const resetPreview = <K extends keyof typeof preview>(key: K): (() => void) | undefined =>
    resetTo(preview[key], DEFAULT_PREVIEW[key], value => onPreview(key, value))

  const changeEnvironment = useCallback(
    (next: EnvironmentRef) => edit.run(setPreview('environment', next)),
    [edit],
  )

  return (
    <>
      <ChannelsSection key={documentId} documentId={documentId} />

      <StylesSection documentId={documentId} />

      <PropertySection title={t('inspector.material')} scId="material.material">
        <ColorField
          label={t('material.baseTint')}
          scId="material.baseTint"
          value={material.color}
          onChange={value => onMaterial('color', value)}
          {...edit.gesture}
        />

        <SliderField
          label={t('material.roughness')}
          scId="material.roughness"
          value={material.roughness}
          min={0}
          max={1}
          step={0.01}
          onChange={value => onMaterial('roughness', value)}
          onReset={resetMaterial('roughness')}
          {...edit.gesture}
        />
        <RangeField
          label={t('material.roughnessRange')}
          value={material.roughnessRange}
          min={0}
          max={1}
          step={0.01}
          fromLabel={t('material.roughnessFrom')}
          toLabel={t('material.roughnessTo')}
          scId="material.roughnessRange"
          onChange={value => onMaterial('roughnessRange', value)}
          {...edit.gesture}
        />

        <SliderField
          label={t('material.metalness')}
          scId="material.metalness"
          value={material.metalness}
          min={0}
          max={1}
          step={0.01}
          onChange={value => onMaterial('metalness', value)}
          onReset={resetMaterial('metalness')}
          {...edit.gesture}
        />
        <RangeField
          label={t('material.metalnessRange')}
          value={material.metalnessRange}
          min={0}
          max={1}
          step={0.01}
          fromLabel={t('material.metalnessFrom')}
          toLabel={t('material.metalnessTo')}
          scId="material.metalnessRange"
          onChange={value => onMaterial('metalnessRange', value)}
          {...edit.gesture}
        />

        <SliderField
          label={t('material.aoIntensity')}
          scId="material.aoIntensity"
          value={material.aoIntensity}
          min={0}
          max={1}
          step={0.01}
          onChange={value => onMaterial('aoIntensity', value)}
          onReset={resetMaterial('aoIntensity')}
          {...edit.gesture}
        />
        <SliderField
          label={t('material.edgeIntensity')}
          scId="material.edgeIntensity"
          value={material.edgeIntensity}
          min={0}
          max={1}
          step={0.01}
          onChange={value => onMaterial('edgeIntensity', value)}
          onReset={resetMaterial('edgeIntensity')}
          {...edit.gesture}
        />
      </PropertySection>

      <MaterialInspectorReliefSection
        material={material}
        onChange={onMaterial}
        onReset={resetMaterial}
        {...edit.gesture}
      />

      <PropertySection title={t('material.emission')} scId="material.emission">
        <ColorField
          label={t('material.emissive')}
          scId="material.emissive"
          value={material.emissive}
          onChange={value => onMaterial('emissive', value)}
          {...edit.gesture}
        />
        <SliderField
          label={t('material.emissiveIntensity')}
          scId="material.emissiveIntensity"
          value={material.emissiveIntensity}
          {...MATERIAL_BOUNDS.emissiveIntensity}
          onChange={value => onMaterial('emissiveIntensity', value)}
          onReset={resetMaterial('emissiveIntensity')}
          {...edit.gesture}
        />
      </PropertySection>

      <PropertySection title={t('material.tiling')} defaultOpen={false} scId="material.tiling">
        <VectorField
          label={t('material.repeat')}
          scId="material.repeat"
          value={material.tiling}
          {...MATERIAL_BOUNDS.tiling}
          onChange={value => onMaterial('tiling', value)}
          {...edit.gesture}
        />
        <VectorField
          label={t('material.offset')}
          scId="material.offset"
          value={material.offset}
          step={0.01}
          onChange={value => onMaterial('offset', value)}
          {...edit.gesture}
        />
        <SliderField
          label={t('material.rotation')}
          scId="material.rotation"
          value={toDegrees(material.rotation)}
          min={0}
          max={360}
          step={1}
          onChange={value => onMaterial('rotation', toRadians(value))}
          onReset={resetMaterial('rotation')}
          {...edit.gesture}
        />

        <SelectField
          label={t('material.tilingPreview')}
          scId="material.tilingPreview"
          value={String(preview.tilingPreview)}
          options={TILING_PREVIEWS.map(times => ({
            value: String(times),
            label: t('material.tilingPreviewTimes', { count: times }),
          }))}
          onChange={value => {
            const times = TILING_PREVIEWS.find(candidate => String(candidate) === value)
            if (times) onPreview('tilingPreview', times)
          }}
          hint={HINT_LEFT(t('material.tilingPreviewHint'))}
        />
        <ToggleField
          label={t('material.showSeam')}
          scId="material.showSeam"
          value={preview.showSeam}
          onChange={value => onPreview('showSeam', value)}
        />
        <MaterialInspectorSeamReading documentId={documentId} />
      </PropertySection>

      <PropertySection title={t('material.preview')} scId="material.preview">
        <SelectField
          label={t('material.previewShape')}
          scId="material.previewShape"
          value={preview.shape}
          options={PREVIEW_SHAPES.map(shape => ({
            value: shape,
            label: t(SHAPE_LABELS[shape]),
          }))}
          onChange={shape => onPreview('shape', shape)}
          hint={HINT_LEFT(t('material.previewShapeHint'))}
        />

        <SliderField
          label={t('material.envIntensity')}
          scId="material.envIntensity"
          value={preview.envIntensity}
          {...PREVIEW_BOUNDS.envIntensity}
          onChange={value => onPreview('envIntensity', value)}
          onReset={resetPreview('envIntensity')}
          {...edit.gesture}
        />
        <SliderField
          label={t('material.envRotation')}
          scId="material.envRotation"
          value={toDegrees(preview.envRotation)}
          min={0}
          max={360}
          step={1}
          onChange={value => onPreview('envRotation', toRadians(value))}
          onReset={resetPreview('envRotation')}
          {...edit.gesture}
        />
        <ToggleField
          label={t('material.showBackground')}
          scId="material.showBackground"
          value={preview.showBackground}
          onChange={value => onPreview('showBackground', value)}
        />
        <ToggleField
          label={t('material.autoSpin')}
          scId="material.autoSpin"
          value={preview.autoSpin}
          onChange={value => onPreview('autoSpin', value)}
        />
      </PropertySection>

      <EnvironmentSection environment={preview.environment} onChange={changeEnvironment} />
    </>
  )
}
