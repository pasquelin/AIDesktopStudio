import {
  BoxGeometry,
  Group,
  LOD,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  type BufferGeometry,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { NO_LOSSY_OPTIMIZATION } from '@shared/domain/gameExport'
import { compileLossyModels } from './lossyModelCompiler'

async function reducedLevels(
  _geometry: BufferGeometry,
  ratios: readonly number[],
): Promise<BufferGeometry[]> {
  return ratios.map(() => new BoxGeometry())
}

describe('LOSSY imported models compiled for an export', () => {
  it('does not duplicate model buffers when SAFE mode has no measured storage benefit', async () => {
    const load = vi.fn()
    const dispose = vi.fn()

    const compiled = await compileLossyModels(
      [{ id: 'tree', url: 'ai-desktop-studio://master/tree?v=1' }],
      NO_LOSSY_OPTIMIZATION,
      undefined,
      { load, simplify: vi.fn(), dispose },
    )

    expect(compiled.size).toBe(0)
    expect(load).not.toHaveBeenCalled()
    expect(dispose).not.toHaveBeenCalled()
  })

  it('passes cancellation to the model read', async () => {
    const controller = new AbortController()
    const load = vi.fn(async () => null)

    await compileLossyModels(
      [{ id: 'tree', url: 'ai-desktop-studio://master/tree?v=1' }],
      { ...NO_LOSSY_OPTIMIZATION, generateLods: true },
      { signal: controller.signal },
      { load, simplify: vi.fn(), dispose: vi.fn() },
    )

    expect(load).toHaveBeenCalledWith('ai-desktop-studio://master/tree?v=1', controller.signal)
  })

  it('keeps exact LOD0 outside the plan and compiles only distant levels', async () => {
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
    const simplify = vi.fn(reducedLevels)

    const compiled = await compileLossyModels(
      [{ id: 'tree', url: 'ai-desktop-studio://master/tree?v=1' }],
      { ...NO_LOSSY_OPTIMIZATION, generateLods: true },
      undefined,
      { load: async () => root, simplify, dispose: vi.fn() },
    )

    expect(compiled.get('tree')?.[0]).toMatchObject({ meshIndex: 0 })
    expect(compiled.get('tree')?.[0]?.geometry).toBeUndefined()
    expect(compiled.get('tree')?.[0]?.lodMeshes).toHaveLength(2)
    expect(simplify).toHaveBeenCalledTimes(1)
    expect(simplify.mock.calls[0]?.[1]).toEqual([0.35, 0.65])
  })

  it('uploads a mesh once for every level it is asked for', async () => {
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
    const onProgress = vi.fn()
    const simplify = vi.fn(reducedLevels)

    await compileLossyModels(
      [
        { id: 'tree', url: 'ai-desktop-studio://master/tree?v=1' },
        { id: 'tree', url: 'ai-desktop-studio://master/tree?v=1' },
      ],
      { ...NO_LOSSY_OPTIMIZATION, generateLods: true, geometrySimplification: 'aggressive' },
      { onProgress },
      { load: async () => root, simplify, dispose: vi.fn() },
    )

    expect(simplify).toHaveBeenCalledTimes(1)
    expect(simplify.mock.calls[0]?.[1]).toEqual([0.6, 0.65])
    expect(onProgress.mock.calls).toEqual([[1, 1]])
  })

  it('does not simplify skinned geometry whose animation attributes must survive', async () => {
    const root = new Group()
    root.add(new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial()))
    const simplify = vi.fn()

    const compiled = await compileLossyModels(
      [{ id: 'character', url: 'ai-desktop-studio://master/character?v=1' }],
      { ...NO_LOSSY_OPTIMIZATION, geometrySimplification: 'aggressive' },
      undefined,
      { load: async () => root, simplify, dispose: vi.fn() },
    )

    expect(compiled.size).toBe(0)
    expect(simplify).not.toHaveBeenCalled()
  })

  it('uses existing LODs instead of generating nested replacements', async () => {
    const root = new LOD()
    root.addLevel(new Mesh(new BoxGeometry(), new MeshStandardMaterial()), 0)
    root.addLevel(new Mesh(new BoxGeometry(), new MeshStandardMaterial()), 20)
    const simplify = vi.fn()

    const compiled = await compileLossyModels(
      [{ id: 'tree', url: 'ai-desktop-studio://master/tree?v=1' }],
      { ...NO_LOSSY_OPTIMIZATION, generateLods: true },
      undefined,
      { load: async () => root, simplify, dispose: vi.fn() },
    )

    expect(compiled.size).toBe(0)
    expect(simplify).not.toHaveBeenCalled()
  })
})
