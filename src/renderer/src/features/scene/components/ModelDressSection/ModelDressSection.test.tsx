import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { AssetPicker } from '@/features/shell/components/AssetPicker/AssetPicker'
import { installFakeBridge } from '@/services/fakeBridge'
import { ModelDressSection } from './ModelDressSection'
import type { ModelDressRef } from '@shared/domain/scene'

const openModelMaterial = vi.hoisted(() => vi.fn())
const wearExtractedModelMaterial = vi.hoisted(() => vi.fn())
vi.mock('@/features/material/openModelMaterial', () => ({ openModelMaterial }))
vi.mock('@/features/material/wearExtractedModelMaterial', () => ({ wearExtractedModelMaterial }))

const PICTURES: Asset[] = [
  {
    id: 'current',
    name: 'Current texture',
    type: 'image',
    location: 'local',
    path: 'Textures/current.png',
    derivedFrom: 'model',
    map: 'baseColor',
    tags: [],
    createdAt: '2026-09-04T10:00:00.000Z',
  },
  {
    id: 'replacement',
    name: 'Replacement texture',
    type: 'image',
    location: 'local',
    path: 'Textures/replacement.png',
    derivedFrom: 'model',
    map: 'normal',
    tags: [],
    createdAt: '2026-09-04T10:00:00.000Z',
  },
]

const MODEL_SETTINGS = {
  color: '#ffffff',
  roughness: 0.8,
  metalness: 0.2,
  normalScale: 1,
  aoIntensity: 1,
  emissive: '#000000',
  emissiveIntensity: 1,
  tiling: { x: 1, y: 1 },
  offset: { x: 0, y: 0 },
  rotation: 0,
}

describe('model image dress', () => {
  beforeEach(() => {
    openModelMaterial.mockReset()
    wearExtractedModelMaterial.mockReset()
  })

  function RememberingDress() {
    const [dress, setDress] = useState<ModelDressRef>({ kind: 'image', assetId: 'current' })
    return (
      <ModelDressSection
        assetId="model"
        name="Model"
        dress={dress}
        slots={1}
        extractable
        onChange={next => next && setDress(next)}
        onWearAt={vi.fn()}
      />
    )
  }

  it('offers neither the file nor extraction once no embedded texture remains', () => {
    installFakeBridge({ assets: { search: () => Promise.resolve([]) } })

    render(
      <ModelDressSection
        assetId="model"
        name="Model"
        dress={undefined}
        slots={1}
        extractable
        ownTextures={false}
        onChange={vi.fn()}
        onWearAt={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Recouvert par' })).toHaveValue('image')
    expect(screen.queryByRole('option', { name: 'Celle de son fichier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Extraire/ })).not.toBeInTheDocument()
  })

  it('chooses its texture through the shared picture picker', async () => {
    installFakeBridge({ assets: { search: () => Promise.resolve(PICTURES) } })
    const onChange = vi.fn()

    render(
      <>
        <ModelDressSection
          assetId="model"
          name="Model"
          dress={{ kind: 'image', assetId: 'current' }}
          slots={1}
          extractable
          onChange={onChange}
          onWearAt={vi.fn()}
        />
        <AssetPicker />
      </>,
    )

    await userEvent.click(screen.getByRole('button', { name: /Parcourir les images/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Replacement texture/ }))

    expect(onChange).toHaveBeenCalledWith({ kind: 'image', assetId: 'replacement' })
  })

  it('remembers its image while materials are being edited', async () => {
    installFakeBridge({ assets: { search: () => Promise.resolve(PICTURES) } })
    render(<RememberingDress />)
    const mode = screen.getByRole('combobox', { name: 'Recouvert par' })

    await userEvent.selectOptions(mode, 'materials')
    await userEvent.selectOptions(mode, 'image')

    expect(screen.getByRole('combobox', { name: 'Couleur de base' })).toHaveValue('current')
  })

  it('remembers its image after adding a material slot', async () => {
    installFakeBridge({ assets: { search: () => Promise.resolve(PICTURES) } })
    render(<RememberingDress />)
    const mode = screen.getByRole('combobox', { name: 'Recouvert par' })

    await userEvent.selectOptions(mode, 'materials')
    await userEvent.click(screen.getByRole('button', { name: /Ajouter.*emplacement/i }))
    await userEvent.selectOptions(mode, 'image')

    expect(screen.getByRole('combobox', { name: 'Couleur de base' })).toHaveValue('current')
  })

  it('assembles several extracted maps into the material the model wears', async () => {
    openModelMaterial.mockResolvedValue('material-document')
    installFakeBridge({
      assets: {
        search: () => Promise.resolve(PICTURES),
        extractTextures: () => Promise.resolve(PICTURES),
        update: () => Promise.resolve(PICTURES[0]!),
      },
    })
    const onChange = vi.fn()
    const onWearAt = vi.fn()
    render(
      <ModelDressSection
        assetId="model"
        name="Model"
        dress={undefined}
        slots={1}
        extractable
        onChange={onChange}
        onWearAt={onWearAt}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Extraire/ }))

    expect(openModelMaterial).toHaveBeenCalledWith({ id: 'model', name: 'Model' }, PICTURES)
    expect(wearExtractedModelMaterial).toHaveBeenCalledWith('model', 0, 'material-document')
    expect(screen.queryByRole('option', { name: 'Celle de son fichier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Extraire/ })).not.toBeInTheDocument()
  })

  it('assembles one extracted map into a material instead of image mode', async () => {
    const extracted = PICTURES.slice(0, 1)
    openModelMaterial.mockResolvedValue('material-document')
    installFakeBridge({
      assets: {
        search: () => Promise.resolve(extracted),
        extractTextures: () => Promise.resolve(extracted),
        update: () => Promise.resolve(extracted[0]!),
      },
    })
    const onChange = vi.fn()
    const onWearAt = vi.fn()
    render(
      <ModelDressSection
        assetId="model"
        name="Model"
        dress={undefined}
        slots={1}
        extractable
        onChange={onChange}
        onWearAt={onWearAt}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Extraire/ }))

    expect(openModelMaterial).toHaveBeenCalledWith({ id: 'model', name: 'Model' }, extracted)
    expect(wearExtractedModelMaterial).toHaveBeenCalledWith('model', 0, 'material-document')
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'image' }))
  })

  it('assembles each glTF material into its matching model slot', async () => {
    const materialIndices = [3, 1]
    const extracted: Asset[] = PICTURES.map((picture, index) => ({
      ...picture,
      map: 'baseColor',
      modelTextureUses: [
        {
          materialIndex: materialIndices[index] ?? index,
          materialName: `Material ${index + 1}`,
          slot: 'baseColorTexture',
          channel: 'baseColor',
          sampling: { channel: 0, wrapS: 10497, wrapT: 10497, minFilter: 9987, magFilter: 9729 },
          settings: MODEL_SETTINGS,
        },
      ],
    }))
    openModelMaterial.mockResolvedValueOnce('material-1').mockResolvedValueOnce('material-2')
    installFakeBridge({
      assets: {
        extractTextures: () => Promise.resolve(extracted),
        update: () => Promise.resolve(extracted[0]!),
      },
    })
    const onWearAt = vi.fn()
    render(
      <ModelDressSection
        assetId="model"
        name="Model"
        dress={undefined}
        slots={2}
        names={['Material', 'Material']}
        sourceIndices={[3, 1]}
        extractable
        onChange={vi.fn()}
        onWearAt={onWearAt}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Extraire/ }))

    expect(openModelMaterial).toHaveBeenCalledTimes(2)
    expect(wearExtractedModelMaterial).toHaveBeenNthCalledWith(1, 'model', 1, 'material-1')
    expect(wearExtractedModelMaterial).toHaveBeenNthCalledWith(2, 'model', 0, 'material-2')
  })

  it('keeps the model file intact when one extracted material cannot be assembled', async () => {
    const extracted: Asset[] = PICTURES.map((picture, materialIndex) => ({
      ...picture,
      modelTextureUses: [
        {
          materialIndex,
          materialName: `Material ${materialIndex + 1}`,
          slot: 'baseColorTexture',
          channel: 'baseColor',
          sampling: { channel: 0, wrapS: 10497, wrapT: 10497, minFilter: 9987, magFilter: 9729 },
          settings: MODEL_SETTINGS,
        },
      ],
    }))
    const extractTextures = vi.fn(() => Promise.resolve(extracted))
    const update = vi.fn(() => Promise.resolve(extracted[0]!))
    openModelMaterial.mockResolvedValueOnce('material-1').mockResolvedValueOnce(null)
    installFakeBridge({ assets: { extractTextures, update } })
    render(
      <ModelDressSection
        assetId="model"
        name="Model"
        dress={undefined}
        slots={2}
        extractable
        onChange={vi.fn()}
        onWearAt={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Extraire/ }))

    expect(extractTextures).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
    expect(wearExtractedModelMaterial).not.toHaveBeenCalled()
  })
})
