import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Asset } from '@shared/domain/asset'
import { createSkyboxContent } from '@shared/domain/skybox'
import { newMaterial } from '@/engines/material/materialState'
import { installFakeBridge } from '@/services/fakeBridge'
import { installDocuments, installIn } from '@/stores/document-fixtures'
import { useDocuments } from '@/stores/documents'
import { skyboxOf, skyboxStore, useSkyboxes } from '@/stores/skyboxes'
import { materialOf, materialStore, useMaterials } from '@/stores/materials'
import { runAction } from './executor'

const SKY = 'doc-skybox'
const MATERIAL = 'doc-texture'

const PICTURE: Asset = {
  id: 'asset-sky',
  name: 'Coucher',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-08-17T10:00:00.000Z',
  width: 4096,
  height: 2048,
}

const sky = () => skyboxOf(useSkyboxes.getState(), SKY)
const material = () => materialOf(useMaterials.getState(), MATERIAL)

function withSky(): void {
  installIn(skyboxStore, SKY, createSkyboxContent(), 'skyboxes')
}

function withMaterial(): void {
  installIn(materialStore, MATERIAL, newMaterial(), 'materials')
}

beforeEach(() => {
  installFakeBridge({ assets: { search: vi.fn(async () => [PICTURE]) } })
  withSky()
})

describe('the sky', () => {
  it('answers its source, its dials, its sun and what it lights', async () => {
    const outcome = await runAction('skybox.state', {})

    expect(outcome).toMatchObject({
      ok: true,
      data: { documentId: SKY, source: null, adjustments: { exposure: 0 } },
    })
  })

  it('changes only the dials it was given, and puts them all back at once', async () => {
    await runAction('skybox.adjustImage', { exposure: 1.5, blur: 0.25 })
    expect(sky().adjustments).toMatchObject({ exposure: 1.5, blur: 0.25, contrast: 1 })

    await runAction('skybox.resetAdjustments', {})
    expect(sky().adjustments).toMatchObject({ exposure: 0, blur: 0 })
  })

  it('places the sun and sets what the image lights', async () => {
    await runAction('skybox.setSun', { elevation: 0.4, intensity: 2, color: '#ffddaa' })
    expect(sky().sun).toMatchObject({ elevation: 0.4, intensity: 2, color: '#ffddaa' })

    await runAction('skybox.setPreviewLighting', { intensity: 0.5, showBackground: false })
    expect(sky().environment).toEqual({ intensity: 0.5, showBackground: false })
  })

  it('answers the dials it turned, and only those', async () => {
    expect(await runAction('skybox.adjustImage', { exposure: 1.5 })).toEqual({
      ok: true,
      data: { exposure: 1.5 },
    })
    expect(await runAction('skybox.setSun', { elevation: 0.4, color: '#ffddaa' })).toEqual({
      ok: true,
      data: { elevation: 0.4, color: '#ffddaa' },
    })
  })

  it('hangs a picture of the library in the sky', async () => {
    expect(await runAction('skybox.setSourceImage', { assetId: PICTURE.id })).toEqual({ ok: true })
    expect(sky().source).toEqual({ assetId: PICTURE.id })
  })

  /**
   * `setSkyboxSource` refuses a picture with no local file in SILENCE — the guard a drop meets —
   * so the source is read back to tell a refusal from a hanging.
   */
  it('refuses a picture that is still in the cloud', async () => {
    const inCloud: Asset = { ...PICTURE, location: 'cloud' }
    installFakeBridge({ assets: { search: vi.fn(async () => [inCloud]) } })

    expect(await runAction('skybox.setSourceImage', { assetId: PICTURE.id })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(sky().source).toBeNull()
  })

  // A call that names no dial at all would be an empty history entry.
  it('refuses a call that changes nothing', async () => {
    expect(await runAction('skybox.adjustImage', {})).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('refuses every action of the family while no sky is in front', async () => {
    useDocuments.setState({ documents: {}, activeId: null })

    expect(await runAction('skybox.state', {})).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })
})

describe('the material', () => {
  beforeEach(() => {
    withMaterial()
  })

  /**
   * A preview judged under a different world than the scene it is headed for decided nothing —
   * so it names a sky the way a scene does: a picture by asset id, a DOCUMENT by title.
   */
  it('lights the preview by a sky document named by its title', async () => {
    // Both tabs: `installIn` replaces the whole list, so the sky the decor opened is gone by here.
    installDocuments({ [SKY]: 'skyboxes', [MATERIAL]: 'materials' }, MATERIAL)

    expect(await runAction('material.setPreviewEnvironment', { sky: SKY })).toEqual({ ok: true })
    expect(material().preview.environment).toEqual({ kind: 'sky', documentId: SKY })
  })

  it('hangs a picture of the project instead, and puts both out', async () => {
    expect(await runAction('material.setPreviewEnvironment', { assetId: PICTURE.id })).toEqual({
      ok: true,
    })
    expect(material().preview.environment).toEqual({ kind: 'skybox', assetId: PICTURE.id })

    await runAction('material.setPreviewEnvironment', { kind: 'studio' })

    expect(material().preview.environment).toEqual({ kind: 'studio' })
  })

  it('refuses a sky document the project does not hold', async () => {
    expect(await runAction('material.setPreviewEnvironment', { sky: 'Nulle part' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  // A preview is lit by ONE prefiltered map, so naming both is a request with two answers.
  it('refuses a picture and a sky document at once', async () => {
    expect(
      await runAction('material.setPreviewEnvironment', { assetId: PICTURE.id, sky: SKY }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
  })

  it('answers its channels, its render settings and its preview', async () => {
    expect(await runAction('material.state', {})).toMatchObject({
      ok: true,
      data: { documentId: MATERIAL, channels: {} },
    })
  })

  it('answers the settings it wrote, a vector under the stem its axes carry', async () => {
    expect(await runAction('material.setSurfaceSettings', { roughness: 0.2, tilingX: 4 })).toEqual({
      ok: true,
      data: { roughness: 0.2, tiling: { x: 4, y: 1 } },
    })
  })

  it('changes only the settings it was given', async () => {
    await runAction('material.setSurfaceSettings', { roughness: 0.2, color: '#334455' })

    expect(material().material).toMatchObject({ roughness: 0.2, color: '#334455' })
    expect(material().material.metalness).toBe(newMaterial().material.metalness)
  })

  /** `tiling` is one vector, so a call naming one axis has to carry the other one through. */
  it('keeps the axis a tiling call did not name', async () => {
    await runAction('material.setSurfaceSettings', { tilingX: 4 })

    expect(material().material.tiling).toEqual({ x: 4, y: newMaterial().material.tiling.y })
  })

  it('sets how the preview is presented', async () => {
    await runAction('material.setPreviewDisplay', {
      envIntensity: 2,
      showSeam: true,
      autoSpin: false,
    })

    expect(material().preview).toMatchObject({ envIntensity: 2, showSeam: true, autoSpin: false })
  })

  it('fills a channel from the library and empties it again', async () => {
    expect(
      await runAction('material.setChannelImage', { channel: 'normal', assetId: PICTURE.id }),
    ).toEqual({
      ok: true,
    })
    expect(material().channels.normal).toMatchObject({ assetId: PICTURE.id, width: 4096 })

    await runAction('material.setChannelImage', { channel: 'normal' })
    expect(material().channels.normal).toBeUndefined()
  })

  it('refuses a channel the material does not have', async () => {
    expect(await runAction('material.setChannelImage', { channel: 'gloss' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /**
   * A style is a material kept aside, so it is saved FROM the one in front rather than from
   * values a client restates — a second way of building one is a second set of defaults.
   */
  it('saves the material in front as a style, and refuses with none in front', async () => {
    const save = vi.fn(async () => [])
    installFakeBridge({ styles: { save } })

    expect(await runAction('style.save', { name: 'Pierre' })).toMatchObject({
      ok: true,
    })
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ values: material().material, name: expect.any(String) }),
    )

    useDocuments.setState({ documents: {}, activeId: null })
    expect(await runAction('style.save', { name: 'Pierre' })).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })

  it('renames and removes a style through their own channels', async () => {
    const rename = vi.fn(async () => [])
    const remove = vi.fn(async () => [])
    installFakeBridge({ styles: { rename, remove } })

    await runAction('style.rename', { styleId: 'style-1', name: 'Béton' })
    await runAction('style.remove', { styleId: 'style-1' })

    expect(rename).toHaveBeenCalledWith('style-1', 'Béton')
    expect(remove).toHaveBeenCalledWith('style-1')
  })
})

describe('how a sky is looked at', () => {
  it('writes the projection, the lens and the probes, and reads them back', async () => {
    withSky()

    expect(
      await runAction('skybox.setViewportOptions', { view: 'equirect', probes: false }),
    ).toEqual({
      ok: true,
    })

    const outcome = await runAction('skybox.state', {})
    expect(outcome).toMatchObject({
      ok: true,
      data: { view: { view: 'equirect', probes: false } },
    })
  })

  it('refuses a call that names nothing at all', async () => {
    withSky()

    expect(await runAction('skybox.setViewportOptions', {})).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

describe('the two halves of a material nothing could write', () => {
  it('remaps a channel one bound at a time, keeping the other', async () => {
    withMaterial()

    expect(await runAction('material.setSurfaceSettings', { roughnessMin: 0.2 })).toEqual({
      ok: true,
      data: { roughnessRange: { min: 0.2, max: 1 } },
    })
    expect(material().material.roughnessRange).toEqual({ min: 0.2, max: 1 })

    await runAction('material.setSurfaceSettings', { roughnessMax: 0.8, metalnessMin: 0.1 })
    expect(material().material.roughnessRange).toEqual({ min: 0.2, max: 0.8 })
    expect(material().material.metalnessRange).toEqual({ min: 0.1, max: 1 })
  })

  /** The invariant `RangeField` holds on a drag: a floor above its ceiling is a remap nothing undoes. */
  it('keeps the two handles in order when one is pushed past the other', async () => {
    withMaterial()

    await runAction('material.setSurfaceSettings', { roughnessMax: 0.2 })
    await runAction('material.setSurfaceSettings', { roughnessMin: 0.9 })

    expect(material().material.roughnessRange).toEqual({ min: 0.2, max: 0.9 })
  })

  it('judges the material on another shape, at another repeat', async () => {
    withMaterial()

    expect(
      await runAction('material.setPreviewDisplay', { shape: 'plane', tilingPreview: 4 }),
    ).toEqual({
      ok: true,
    })
    expect(material().preview).toMatchObject({ shape: 'plane', tilingPreview: 4 })
  })

  /** One, two or four: a bound cannot say « three is not offered », so the handler does. */
  it('refuses a repeat the panel does not offer', async () => {
    withMaterial()

    expect(await runAction('material.setPreviewDisplay', { tilingPreview: 3 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})
