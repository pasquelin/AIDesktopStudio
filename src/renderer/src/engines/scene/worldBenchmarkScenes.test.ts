import { describe, expect, it } from 'vitest'
import { EMPTY_TIMELINE } from '@shared/domain/animation'
import { newComponent } from '@shared/domain/componentRegistry'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import { meshNode } from './scene-fixtures'
import { benchmarkExpectations, worldBenchmarkScenes } from './worldBenchmarkScenes.fixture'
import { runtimeArtifactsOf } from './runtimeWorldCompiler'

describe('the reproducible world benchmark suite', () => {
  it('holds the five documented workloads at their declared scale', () => {
    const scenes = worldBenchmarkScenes()

    expect(scenes.map(scene => scene.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5'])
    expect(scenes.slice(0, 4).map(scene => scene.state.nodes.length)).toEqual([
      50, 10_000, 10_000, 20_000,
    ])
    const mixed = scenes[4]?.state
    expect(
      mixed?.nodes.some(node =>
        node.components?.some(component => component.type === 'Script' && component.script),
      ),
    ).toBe(true)
    expect(
      mixed?.nodes.some(node => node.components?.some(component => component.type === 'RigidBody')),
    ).toBe(true)
    expect(mixed?.animation.events).not.toHaveLength(0)
    expect(mixed?.animation.transitions).not.toHaveLength(0)
  })

  it('asks of each workload only what the workload declares', () => {
    const expects = new Map(worldBenchmarkScenes().map(scene => [scene.id, scene.expects]))

    expect(expects.get('S1')).toEqual(['successfulDuplications', 'successfulUndoRedo'])
    expect(expects.get('S5')).toEqual([
      'executedScriptHooks',
      'successfulScriptEffects',
      'simulatedPhysicsBodies',
      'simulatedPhysicsSteps',
      'simulatedPhysicsEffects',
      'executedTimelineActions',
      'successfulDuplications',
      'successfulUndoRedo',
    ])
  })

  it('claims the script and physics measures for a workload it has never seen', () => {
    const scripted = {
      ...meshNode('sixth'),
      components: [{ ...newComponent('Script'), script: 'script:Sixth.ts' }],
    }

    expect(
      benchmarkExpectations({
        nodes: [scripted],
        selectedIds: [],
        world: DEFAULT_WORLD,
        animation: EMPTY_TIMELINE,
      }),
    ).toEqual([
      'executedScriptHooks',
      'successfulScriptEffects',
      'successfulDuplications',
      'successfulUndoRedo',
    ])
  })

  it('rebuilds identical deterministic inputs', () => {
    expect(worldBenchmarkScenes()).toEqual(worldBenchmarkScenes())
  })

  it('partitions the props workload into bounded spatial batches', () => {
    const props = worldBenchmarkScenes().find(scene => scene.id === 'S3')
    if (!props) throw new Error('S3 benchmark scene is missing')

    const artifacts = runtimeArtifactsOf(props.state.nodes, props.state.animation)

    expect(artifacts).toHaveLength(16)
    expect(Math.max(...artifacts.map(artifact => artifact.sourceIds.length))).toBe(1_024)
  })
})
