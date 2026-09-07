import { AnimationClip, Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_TIMELINE } from '@shared/domain/animation'
import type { ModelRef } from '@shared/domain/sceneModel'
import type { AssetPort } from '@game/ports/assetPort'
import { createSceneResources } from './gameSceneResources'
import { loadModelAnimations } from './gameSceneClips'

const assets = { urlOf: (ref: { id?: string }) => `asset://${ref.id}` } as unknown as AssetPort

/** A file bringing one clip, named after the asset it came from, so a case can tell them apart. */
const fileOf = (name: string): Object3D => {
  const root = new Object3D()
  root.animations = [new AnimationClip(name, 1, [])]
  return root
}

const modelWith = (...assetIds: string[]): ModelRef =>
  ({
    assetId: 'the-character',
    lanes: [
      {
        id: 'main',
        clips: assetIds.map(assetId => ({ source: { kind: 'asset', assetId } })),
      },
    ],
  }) as unknown as ModelRef

const scened = () => {
  const resources = createSceneResources(EMPTY_TIMELINE)
  const root = new Object3D()
  resources.animations.add('node-1', root, [])
  resources.animations.add('node-2', root, [])
  return resources
}

describe('the clips a game node plays beside its own file', () => {
  /**
   * 🛑 Read again for every node that named it, and never kept: ten characters sharing eight
   * animations paid eighty fetch-and-parses in a row before a scene drew.
   */
  it('reads a file once, however many nodes name it', async () => {
    const load = vi.fn(async (url: string) => fileOf(url))
    const resources = scened()

    await loadModelAnimations('node-1', modelWith('walk', 'run'), assets, load, resources)
    await loadModelAnimations('node-2', modelWith('walk', 'run'), assets, load, resources)

    expect(load).toHaveBeenCalledTimes(2)
    expect(Object.keys(resources.animations.lengthsOf('node-2'))).toHaveLength(2)
  })

  // 🛑 Per file: one animation that fails to load must not take the clips beside it down.
  it('files the clips beside one whose file never arrives', async () => {
    const load = vi.fn(async (url: string) => {
      if (url.endsWith('run')) throw new Error('no such file')
      return fileOf(url)
    })
    const resources = scened()

    await loadModelAnimations('node-1', modelWith('walk', 'run', 'jump'), assets, load, resources)

    expect(Object.keys(resources.animations.lengthsOf('node-1'))).toHaveLength(2)
  })

  // 🛑 What a node can play is a RECORD, and a band lists it in insertion order: awaited together,
  // the order the files came back in would otherwise decide what a person reads first.
  it('files them in the order the lanes name, not the order they came back', async () => {
    const slow = new Map([
      ['walk', 30],
      ['run', 0],
      ['jump', 10],
    ])
    const load = vi.fn(
      (url: string) =>
        new Promise<Object3D>(resolve => {
          setTimeout(() => resolve(fileOf(url)), slow.get(url.split('//')[1] ?? '') ?? 0)
        }),
    )
    const resources = scened()

    await loadModelAnimations('node-1', modelWith('walk', 'run', 'jump'), assets, load, resources)

    expect(Object.keys(resources.animations.lengthsOf('node-1'))).toEqual([
      'asset:walk',
      'asset:run',
      'asset:jump',
    ])
  })
})
