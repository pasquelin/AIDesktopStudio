import { describe, expect, it } from 'vitest'
import { ASSET_TYPES, PICTURES, type Asset } from '@shared/domain/asset'
import { workspaceOfType } from '@shared/domain/assetKind'
import { kindForWorkspace } from '@shared/domain/document'
import { IMPORTABLE_EXTENSIONS } from '@shared/domain/importFormat'
import { WORKSPACES } from './workspaces'
import {
  ASSET_INTENTS,
  editorIntent,
  intentsFor,
  opensAsCharacter,
  pixelEditorIntent,
} from './assetIntents'

const picture = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset_1',
  name: 'moss.png',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
  ...overrides,
})

describe('where an asset can be sent', () => {
  it('offers the montage for every kind, since that is where they all end up', () => {
    for (const type of ASSET_TYPES) {
      expect(intentsFor(type).map(intent => intent.id)).toContain('video.clip')
    }
  })

  it('offers a take only the places that take sound', () => {
    expect(intentsFor('audio').map(intent => intent.id)).toEqual(['audio.take', 'video.clip'])
  })

  it('offers a mesh the scene, and no picture slot', () => {
    const ids = intentsFor('mesh').map(intent => intent.id)

    expect(ids).toContain('3d.mesh')
    expect(ids).not.toContain('materials.channel')
    expect(ids).not.toContain('image.layer')
  })

  it('offers every picture kind the same destinations', () => {
    // A sky IS a picture: the sky slot takes one, and so does a layer.
    const picture = intentsFor('image').map(intent => intent.id)

    expect(intentsFor('skybox').map(intent => intent.id)).toEqual(picture)
    expect(picture).toContain('skyboxes.source')
    expect(picture).toContain('materials.channel')
  })

  it('gives every destination a distinct name', () => {
    const ids = ASSET_INTENTS.map(intent => intent.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The menu draws the label and reads the glyph off the workspace table, so a destination
  // naming a space that does not exist would render without one.
  it('names a label and a real workspace for each', () => {
    const spaces = WORKSPACES.map(workspace => workspace.id)

    for (const intent of ASSET_INTENTS) {
      expect(intent.labelKey).toMatch(/^intents\./)
      expect(spaces).toContain(intent.workspace)
    }
  })

  // Two fields for one pairing, and `KIND_BY_WORKSPACE` is the one that decides. A destination
  // whose kind belonged to another workspace would write into a tab it never brings forward.
  it('names the workspace its own kind opens in', () => {
    for (const intent of ASSET_INTENTS) {
      expect(kindForWorkspace(intent.workspace)).toBe(intent.kind)
    }
  })

  // The order is the MENU's, and the montage takes every kind: a row that answers for everything
  // reads last, or it reads as the answer.
  it('lists the take and the sky before the montage', () => {
    const catchAll = ASSET_INTENTS.findIndex(intent => intent.id === 'video.clip')
    const before = ASSET_INTENTS.slice(0, catchAll).map(intent => intent.id)

    expect(before).toContain('audio.take')
    expect(before).toContain('skyboxes.source')
    expect(before).toContain('image.layer')
  })
})

describe('where an asset is edited', () => {
  // The guard on the deduction: an editor is read off `workspaceOfType`, so a kind whose own
  // space takes nothing of it would answer null — and a double-click on it would say nothing.
  it('names an editor for every kind there is', () => {
    for (const type of ASSET_TYPES) {
      const intent = editorIntent(picture({ type }))

      expect(intent).not.toBeNull()
      expect(intent?.workspace).toBe(workspaceOfType(type))
    }
  })

  it('edits a picture in Images, whatever else would take it', () => {
    expect(editorIntent(picture())?.id).toBe('image.layer')
  })

  /**
   * A sky is told apart by its KIND; a channel is not, and cannot be — the studio files it as the
   * picture it is. `map` is what remains of the distinction, and it is what has to answer here.
   */
  it('edits a channel in Materials and a sky in Skyboxes', () => {
    expect(editorIntent(picture({ map: 'normal' }))?.id).toBe('materials.channel')
    expect(editorIntent(picture({ type: 'skybox' }))?.id).toBe('skyboxes.source')
  })

  it('edits a take in Audio and a mesh in 3D', () => {
    expect(editorIntent(picture({ type: 'audio' }))?.id).toBe('audio.take')
    expect(editorIntent(picture({ type: 'mesh' }))?.id).toBe('3d.mesh')
  })

  // Both live in 3D, and a motion is not a model: sending one to `3d.mesh` would land an
  // invisible node — the `SKELETON_ONLY` trap `rigState` was written for.
  it('tells a motion apart from a model, though both live in 3D', () => {
    expect(editorIntent(picture({ type: 'animation' }))?.id).toBe('3d.animation')
  })

  /** The one decision left in it: a row the cloud still holds has no pixels on this disk. */
  it('paints every local picture, and nothing that is not on disk', () => {
    for (const type of PICTURES) {
      expect(pixelEditorIntent(picture({ type }))?.workspace).toBe('image')
    }

    expect(pixelEditorIntent(picture({ location: 'cloud' }))).toBeNull()
    expect(pixelEditorIntent(picture({ type: 'mesh' }))).toBeNull()
  })
})

describe('what opens as a model', () => {
  const mesh = (name: string, overrides: Partial<Asset> = {}): Asset =>
    picture({ type: 'mesh', name, ...overrides })

  // One list, read rather than copied: the meshes the studio imports are the models it edits.
  it('opens every importable mesh on a model tab', () => {
    for (const extension of IMPORTABLE_EXTENSIONS.mesh) {
      expect(opensAsCharacter(mesh(`knight.${extension}`))).toBe(true)
    }
  })

  it('leaves a `.gltf` to the scene, since it is a document', () => {
    expect(opensAsCharacter(mesh('chair.gltf'))).toBe(false)
  })

  // MEASURED on a real project: a catalogued row is named `tripo-character`, and only the path
  // behind it carries the extension.
  it('reads the extension off the path when the name carries none', () => {
    expect(opensAsCharacter(mesh('tripo-character', { path: 'Models/tripo-character.glb' }))).toBe(
      true,
    )
  })

  it('opens nothing the cloud still holds, nor a picture', () => {
    expect(opensAsCharacter(mesh('knight.glb', { location: 'cloud' }))).toBe(false)
    expect(opensAsCharacter(picture())).toBe(false)
  })
})
