import { beforeEach, describe, expect, it } from 'vitest'
import { workshopIdOf } from '@shared/domain/character'
import { workshopScene } from '@/character/characterStage'
import { installFakeBridge } from '@/services/fakeBridge'
import { installCharacterDocument } from '@/stores/character-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { runAction } from './executor'

const ASSET = 'asset-hero'
const WORKSHOP = workshopIdOf(ASSET)

/**
 * A model tab in front: the scene actions of the VIEW reach its workshop, the ones that EDIT are
 * refused — the workshop is drawn and never saved, so a node added there would be lost in silence.
 */
describe('the scene actions over a model tab', () => {
  beforeEach(() => {
    installFakeBridge()
    useSceneViews.setState({ views: {} })
    installCharacterDocument('doc-hero', ASSET)
    useScenes.getState().ensure(WORKSHOP, () => workshopScene(ASSET))
  })

  it('describes the workshop — one model and nothing else', async () => {
    const answer = await runAction('scene.state', {})

    expect(answer.ok).toBe(true)
    // Narrowed by the assertion above; the cast names the field `scene.state` publishes.
    const nodes = answer.ok ? (answer.data as { nodes: readonly { type: string }[] }).nodes : []
    expect(nodes.map(node => node.type)).toEqual(['model'])
  })

  it('draws the workshop the way the view action names', async () => {
    const answer = await runAction('view.setDisplayMode', { mode: 'wireframe' })

    expect(answer.ok).toBe(true)
    expect(sceneViewOf(useSceneViews.getState(), WORKSHOP).displays[0]).toBe('wireframe')
  })

  it('refuses to add a node, and says where a node can go', async () => {
    const answer = await runAction('node.add', { kind: 'box', name: 'Cube' })

    expect(answer).toMatchObject({ ok: false, refusal: 'wrongSurface' })
    expect(answer.ok ? '' : answer.detail).toContain('model tab')
    expect(sceneOf(useScenes.getState(), WORKSHOP).nodes).toHaveLength(1)
  })

  // Every door that writes opens on `mountedScene`: a world patch or a boolean mark used to slip by.
  it('refuses the scene edits that never went through the node doors', async () => {
    const [model] = sceneOf(useScenes.getState(), WORKSHOP).nodes
    const world = await runAction('world.setBackground', { kind: 'color', color: '#112233' })
    const mark = await runAction('node.markAsCuttingTool', { nodeIds: [model?.id ?? ''] })

    expect(world).toMatchObject({ ok: false, refusal: 'wrongSurface' })
    expect(mark).toMatchObject({ ok: false, refusal: 'wrongSurface' })
  })

  it('refuses to edit the model node itself', async () => {
    const [model] = sceneOf(useScenes.getState(), WORKSHOP).nodes
    const answer = await runAction('node.remove', { nodeId: model?.id ?? '' })

    expect(answer).toMatchObject({ ok: false, refusal: 'wrongSurface' })
    expect(sceneOf(useScenes.getState(), WORKSHOP).nodes).toHaveLength(1)
  })
})
