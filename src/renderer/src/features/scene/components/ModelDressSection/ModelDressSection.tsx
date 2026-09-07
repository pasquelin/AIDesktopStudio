import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PICTURES, type Asset, type ModelTextureUse } from '@shared/domain/asset'
import {
  MATERIAL_SLOTS,
  NOTHING_WORN,
  wornMaterials,
  type ModelDressRef,
} from '@shared/domain/scene'
import { mdiImageMultipleOutline, mdiMinus, mdiPlus } from '@mdi/js'
import { PictureField } from '@/components/PictureField'
import { ToolButton } from '@/components/ToolButton'
import { TIP_LEFT } from '@/helpers/tooltip'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { getBridge } from '@/services/bridge'
import { useProjectPictures } from '@/hooks/useProjectPictures'
import { useProjectPictureAssets } from '@/hooks/useProjectPictureAssets'
import { openModelMaterial } from '@/features/material/openModelMaterial'
import { wearExtractedModelMaterial } from '@/features/material/wearExtractedModelMaterial'
import { reportFailure } from '@/services/diagnostics'
import { useAssets } from '@/stores/assets'
import { detachModelFileTexturesInScenes } from '@/stores/sceneEngines'
import { ModelDressSectionMaterials } from './ModelDressSectionMaterials'

type DressMode = Exclude<ModelDressRef['kind'], 'plain'> | 'own'

export type ModelDressSectionProps = {
  /** The model's own asset — what the pictures an assembled material is made of came out of. */
  assetId: string
  /** The node's name, which is what a material assembled from those pictures is called. */
  name: string
  dress: ModelDressRef | undefined
  /** How many materials this model's own file carries — see `ModelTextures.count`. */
  slots: number
  /** Only a local model has a file the main process can extract from. */
  extractable: boolean
  /** Whether the loaded file still carries textures that can be extracted or restored. */
  ownTextures?: boolean
  /** Material names read from the model file, in slot order. */
  names?: readonly string[]
  /** glTF material indices in runtime slot order. */
  sourceIndices?: readonly (number | null)[]
  slotIndices?: readonly number[]
  /** The active dress and the inactive mode's remembered selection. */
  onChange: (dress: ModelDressRef | null) => void
  /** Applies an assembled material to the latest document state after assembly. */
  onWearAt: (slot: number, documentId: string) => void
}

/** What covers a model: one picture, or the materials it wears — never both at once. */
export function ModelDressSection({
  assetId,
  name,
  dress,
  slots,
  extractable,
  ownTextures,
  names = [],
  sourceIndices = [],
  slotIndices,
  onChange,
  onWearAt,
}: ModelDressSectionProps) {
  const { t } = useTranslation()
  const pictures = useProjectPictures(PICTURES)
  const pictureAssets = useProjectPictureAssets(PICTURES)
  const [extractedAssetId, setExtractedAssetId] = useState<string | null>(null)
  const hasOwnTextures = ownTextures !== false && extractedAssetId !== assetId
  const mode = dressMode(dress, hasOwnTextures)
  const imageAssetId = imageAssetIdOf(dress)

  const extract = async (): Promise<readonly Asset[] | null> => {
    try {
      const extractedPictures = await (getBridge()?.assets.extractTextures(assetId) ?? [])
      return extractedPictures
    } catch (error) {
      reportFailure('assets.extract', name, error)
      return null
    } finally {
      useAssets.getState().invalidate()
    }
  }

  const assembleMaterial = async (
    pictures: readonly Asset[],
    material: { id: string; name: string; settings?: ModelTextureUse['settings'] },
  ): Promise<string | null> => {
    const own = pictures.filter(asset => asset.derivedFrom === assetId)
    try {
      return await openModelMaterial(material, own)
    } catch (error) {
      reportFailure('assets.open', name, error)
      return null
    }
  }

  const assemble = async (slot: number): Promise<void> => {
    const materialId = await assembleMaterial(pictureAssets, { id: assetId, name })
    if (materialId) onWearAt(slot, materialId)
  }

  const extractFromHeader = async (): Promise<void> => {
    const own = await extract()
    if (own === null) return
    if (own.length > 0) {
      const groups = extractedMaterialGroups(assetId, name, names, sourceIndices, own)
      const documentIds = Array.from({ length: slots }, () => NOTHING_WORN)
      const assembled: { slot: number; materialId: string }[] = []
      for (const group of groups) {
        const materialId = await assembleMaterial(group.pictures, group.material)
        if (!materialId) return
        documentIds[group.slot] = materialId
        assembled.push({ slot: group.slot, materialId })
      }
      const bridge = getBridge()
      if (bridge) {
        try {
          await bridge.assets.update(assetId, { modelMaterialIds: documentIds })
          await bridge.assets.extractTextures(assetId)
        } catch (error) {
          reportFailure('assets.extract', assetId, error)
          return
        }
      }
      for (const material of assembled) {
        wearExtractedModelMaterial(assetId, material.slot, material.materialId)
      }
      setExtractedAssetId(assetId)
      detachModelFileTexturesInScenes(assetId)
      return
    }
    detachModelFileTexturesInScenes(assetId)
    onChange(imageDress(null, dress))
  }
  const appliesImage = slots === 1
  const modes = dressModes(
    hasOwnTextures,
    t('inspector.modelOwnMaterial'),
    t('inspector.modelDressImage'),
    t('inspector.modelDressMaterials'),
  )

  return (
    <PropertySection
      title={t('inspector.modelDress')}
      scId="modelDress"
      // Blender's `+` and `−`, where every other list of the studio keeps them: on the heading of
      // the group they act on, never one per row.
      actions={
        <>
          {dress?.kind === 'materials' && slotIndices === undefined && (
            <>
              <ToolButton
                icon={mdiMinus}
                label={t('inspector.modelDressRemoveSlot')}
                description={t('inspector.modelDressRemoveSlotHint')}
                tooltip={TIP_LEFT}
                variant="header"
                disabled={wornMaterials(dress).length <= 1}
                onClick={() => onChange(withSlots(dress, -1))}
              />
              <ToolButton
                icon={mdiPlus}
                label={t('inspector.modelDressAddSlot')}
                description={t('inspector.modelDressAddSlotHint')}
                tooltip={TIP_LEFT}
                variant="header"
                // The list GROWS to reach the slot named, so `withMaterialAt` refuses past this —
                // a row it would refuse is a row that redraws itself empty, saying nothing.
                disabled={wornMaterials(dress).length >= MATERIAL_SLOTS}
                onClick={() => onChange(withSlots(dress, 1))}
              />
            </>
          )}
        </>
      }
    >
      <SelectField
        label={t('inspector.modelDressMode')}
        scId="modelDressMode"
        value={mode}
        compactActions
        actions={
          mode === 'own' ? (
            <ToolButton
              icon={mdiImageMultipleOutline}
              label={t('assets.extractTextures')}
              description={t(
                appliesImage ? 'inspector.modelExtractTextureHint' : 'assets.extractTexturesHint',
              )}
              tooltip={TIP_LEFT}
              disabled={!extractable}
              onClick={() => void extractFromHeader()}
            />
          ) : undefined
        }
        options={modes}
        // A mode with nothing in it yet, rather than nothing at all: what says which mode a model
        // is in is the dress being there, so an empty one is what makes the choice stick.
        onChange={next => onChange(dressFor(next, dress))}
      />

      {mode === 'image' && (
        <PictureField
          label={t('inspector.modelDressImageField')}
          value={imageAssetId}
          onChange={assetId => onChange(imageDress(assetId, dress))}
          emptyLabel={t('inspector.modelDressNoImage')}
          scId="model.dressImage"
        />
      )}

      {dress?.kind === 'materials' && (
        <ModelDressSectionMaterials
          worn={wornMaterials(dress)}
          pictures={pictures}
          slots={slots}
          names={names}
          indices={slotIndices}
          onChange={documentIds => onChange(materialsDress(documentIds, dress))}
          onAssemble={slot => void assemble(slot)}
        />
      )}
    </PropertySection>
  )
}

type ExtractedMaterialGroup = {
  slot: number
  pictures: readonly Asset[]
  material: { id: string; name: string; settings?: ModelTextureUse['settings'] }
}

function extractedMaterialGroups(
  assetId: string,
  modelName: string,
  materialNames: readonly string[],
  sourceIndices: readonly (number | null)[],
  pictures: readonly Asset[],
): readonly ExtractedMaterialGroup[] {
  const uses = pictures.flatMap(picture =>
    (picture.modelTextureUses ?? []).map(use => ({ picture, use })),
  )
  if (uses.length === 0) {
    return [{ slot: 0, pictures, material: { id: assetId, name: modelName } }]
  }

  const indices = [...new Set(uses.map(({ use }) => use.materialIndex))].sort((a, b) => a - b)
  return indices.map((materialIndex, groupIndex) => {
    const held = uses.filter(({ use }) => use.materialIndex === materialIndex)
    const first = held[0]?.use
    const sourceSlot = sourceIndices.indexOf(materialIndex)
    const namedSlot = first ? materialNames.indexOf(first.materialName) : -1
    const slot = sourceSlot >= 0 ? sourceSlot : namedSlot >= 0 ? namedSlot : groupIndex
    return {
      slot,
      pictures: held.map(({ picture, use }) => pictureForUse(picture, use)),
      material: {
        id: `${assetId}:material:${materialIndex}`,
        name: first?.materialName ?? `${modelName} ${slot + 1}`,
        ...(first ? { settings: first.settings } : {}),
      },
    }
  })
}

function pictureForUse(picture: Asset, use: ModelTextureUse): Asset {
  return {
    ...picture,
    map: use.channel,
    packedSlot: use.channel ? undefined : use.slot,
    textureTransform: {
      tiling: use.settings.tiling,
      offset: use.settings.offset,
      rotation: use.settings.rotation,
    },
    textureSampling: use.sampling,
  }
}

function dressModes(
  hasOwnTextures: boolean,
  own: string,
  image: string,
  materials: string,
): Array<{ value: DressMode; label: string }> {
  const modes: Array<{ value: DressMode; label: string }> = [
    { value: 'image', label: image },
    { value: 'materials', label: materials },
  ]
  if (hasOwnTextures) modes.unshift({ value: 'own', label: own })
  return modes
}

function dressMode(dress: ModelDressRef | undefined, hasOwnTextures: boolean): DressMode {
  if (dress?.kind === 'plain') return 'image'
  if (dress) return dress.kind
  return hasOwnTextures ? 'own' : 'image'
}

function imageAssetIdOf(dress: ModelDressRef | undefined): string | null {
  if (dress?.kind === 'image') return dress.assetId || null
  return dress?.imageAssetId || null
}

function materialDocumentIdsOf(dress: ModelDressRef | undefined): readonly string[] {
  if (dress?.kind === 'materials') return dress.documentIds
  return dress?.materialDocumentIds ?? []
}

function imageDress(assetId: string | null, previous: ModelDressRef | undefined): ModelDressRef {
  const materialDocumentIds = materialDocumentIdsOf(previous)
  return assetId
    ? {
        kind: 'image',
        assetId,
        ...(materialDocumentIds.length > 0 ? { materialDocumentIds } : {}),
      }
    : { kind: 'plain', ...(materialDocumentIds.length > 0 ? { materialDocumentIds } : {}) }
}

function materialsDress(
  documentIds: readonly string[],
  previous: ModelDressRef | undefined,
): ModelDressRef {
  const imageAssetId = imageAssetIdOf(previous)
  return { kind: 'materials', documentIds, ...(imageAssetId ? { imageAssetId } : {}) }
}

/** One slot more, empty — or the last one gone, which is what `−` takes off. */
function withSlots(dress: ModelDressRef, by: number): ModelDressRef {
  const worn = wornMaterials(dress)
  const documentIds = by > 0 ? [...worn, NOTHING_WORN] : worn.slice(0, -1)
  return materialsDress(documentIds, dress)
}

function dressFor(mode: DressMode, previous: ModelDressRef | undefined): ModelDressRef | null {
  if (mode === 'image') return imageDress(imageAssetIdOf(previous), previous)
  if (mode === 'materials') {
    const documentIds = materialDocumentIdsOf(previous)
    return materialsDress(documentIds.length > 0 ? documentIds : [NOTHING_WORN], previous)
  }
  return null
}
