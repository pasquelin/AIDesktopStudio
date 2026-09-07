import { describe, expect, it } from 'vitest'
import { SCATTER_DISTANCE } from '@shared/domain/renderPolicy'
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera } from 'three'
import { reliefLayer, scatterLayer } from '@shared/domain/scene'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { NOTHING } from './game-fixtures'
import { buildGameScene } from './gameScene'

function namesOf(scene: { traverse: (fn: (object: { name: string }) => void) => void }): string[] {
  const names: string[] = []
  scene.traverse(object => {
    if (object.name) names.push(object.name)
  })
  return names
}

describe('a game scene draped with world layers', () => {
  it('draws a relief mesh instead of the studio ground when a heightmap is present', async () => {
    const terrain = reliefLayer({ assetId: 'height' }, { id: 'island' })
    const samples = { width: 5, height: 5, values: new Float32Array(25) }
    const built = await buildGameScene(
      { ...EMPTY_SCENE, world: { ...EMPTY_SCENE.world, layers: [terrain] } },
      NOTHING,
      undefined,
      undefined,
      undefined,
      new Map([['height', samples]]),
    )
    expect(namesOf(built.scene).some(name => name.includes('relief'))).toBe(true)
    built.dispose()
  })

  it('keeps a scatter group in the game scene when the world has a scatter layer', async () => {
    const built = await buildGameScene(
      {
        ...EMPTY_SCENE,
        world: {
          ...EMPTY_SCENE.world,
          layers: [scatterLayer({ id: 'trees', assets: [{ assetId: 'pine', weight: 1 }] })],
        },
      },
      NOTHING,
    )
    expect(namesOf(built.scene)).toContain('scene-scatter')
    built.dispose()
  })
})

/**
 * 🛑 The studio prunes its scatter every frame (`SceneRendererFrame.advance`); an exported game
 * draws its own way and asked for nothing, so every cell of a forest was drawn at every distance.
 */
describe('what an exported game asks of its scatter', () => {
  const treeAt = (): Object3D => {
    const tree = new Object3D()
    tree.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()))
    return tree
  }
  /** Effective visibility: a cell is hidden at its own root, and `traverse` walks under it anyway. */
  const drawnUnder = (root: Object3D): Set<string> => {
    const drawn = new Set<string>()
    root.traverse(object => {
      for (let walk: Object3D | null = object; walk; walk = walk.parent) {
        if (!walk.visible) return
      }
      if (object instanceof Mesh) drawn.add(object.uuid)
    })
    return drawn
  }

  it('draws the cells around its camera and drops the ones out of reach, as the camera moves', async () => {
    const built = await buildGameScene(
      {
        ...EMPTY_SCENE,
        world: {
          ...EMPTY_SCENE.world,
          layers: [
            scatterLayer({
              id: 'trees',
              assets: [{ assetId: 'pine', weight: 1 }],
              origin: { x: 0, z: 0 },
              size: { x: SCATTER_DISTANCE * 3, z: 256 },
              rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.01, spacing: 16 },
            }),
          ],
        },
      },
      { urlOf: () => 'asset://pine' },
      undefined,
      undefined,
      async () => treeAt(),
    )
    const scatter = built.scene.getObjectByName('scene-scatter')
    if (!scatter) throw new Error('the game scene grew no scatter to prune')
    // A layer three times what a scatter is drawn to, walked from one end to the other: the two
    // ends share no cell. The LENS is deliberately short of both — the reach is the scatter's own,
    // and reading it off `camera.far` is what made this pass unable to hide anything at all. No
    // `updateMatrixWorld` here on purpose: a stale matrix would answer the origin every time.
    const camera = new PerspectiveCamera(50, 1, 0.1, 60)
    camera.position.set(SCATTER_DISTANCE * 3 - 128, 10, 0)

    built.flush(camera)
    const far = drawnUnder(scatter)
    camera.position.set(0, 10, 0)
    built.flush(camera)
    const near = drawnUnder(scatter)

    expect(far.size).toBeGreaterThan(0)
    expect(near.size).toBeGreaterThan(0)
    expect([...far].some(uuid => near.has(uuid))).toBe(false)
    built.dispose()
  })
})
