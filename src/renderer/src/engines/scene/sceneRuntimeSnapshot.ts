import type {
  AnimationTrack,
  CameraShot,
  TimelineEvent,
  TimelineMedia,
  TimelineTransition,
} from '@shared/domain/animation'
import type { Component } from '@shared/domain/component'
import type { CameraPost, PostStack } from '@shared/domain/postProcessing'
import type { CameraDescriptor, Transform } from '@shared/domain/scene'
import type { BakedInstance, SceneNode, SceneState } from './sceneState'

/** The components a scene declares to be simulated — what the `physics` check observes. */
export const PHYSICS_COMPONENT_TYPES: readonly Component['type'][] = [
  'Collider',
  'RigidBody',
  'CharacterController',
  'Vehicle',
  'Aircraft',
]

/** The nodes a scene declares one of these components on — what a check has to observe. */
export function nodesDeclaring(
  state: SceneState,
  types: readonly Component['type'][],
): readonly SceneNode[] {
  return state.nodes.filter(node =>
    (node.components ?? []).some(component => types.includes(component.type)),
  )
}

export type SceneComponentRef = { nodeId: string; component: Component }
export type SceneRuntimePick = { sourceId: string; runtimeId: string }
export type RuntimeValidationPick = { sample: string; resolved: string | null }

/** What a scene DECLARES, per SAFE check — the half a mounted engine is compared against. */
export type SceneLogicalSnapshot = {
  picking: readonly SceneRuntimePick[]
  animation: readonly AnimationTrack[]
  timeline: {
    shots: readonly CameraShot[]
    events: readonly TimelineEvent[]
    audio: readonly TimelineMedia[]
    video: readonly TimelineMedia[]
    transitions: readonly TimelineTransition[]
  }
  scripts: readonly SceneComponentRef[]
  physics: readonly SceneComponentRef[]
  shadows: readonly { id: string; cast: boolean; receive: boolean }[]
  cameras: readonly { id: string; camera: CameraDescriptor }[]
  visibility: readonly { id: string; visible: boolean }[]
  postProcessing: {
    world: PostStack
    cameras: readonly { id: string; post: CameraPost | null }[]
  }
  transforms: readonly { id: string; transform: Transform; instances: readonly BakedInstance[] }[]
  duplication: readonly string[]
  undoRedo: readonly SceneNode[]
}

type Compared<Check extends keyof SceneLogicalSnapshot, Rendered> = {
  logical: SceneLogicalSnapshot[Check]
  rendered: readonly Rendered[]
}

/** The five checks a mounted engine answers twice: what the document says, and what it built. */
export type RenderedRuntimeSnapshot = Omit<
  SceneLogicalSnapshot,
  'picking' | 'shadows' | 'cameras' | 'visibility' | 'transforms'
> & {
  picking: Compared<'picking', readonly [string, readonly RuntimeValidationPick[]]>
  shadows: Compared<'shadows', { id: string; cast: boolean; receive: boolean }>
  cameras: Compared<'cameras', { id: string; projection: readonly number[] }>
  visibility: Compared<'visibility', { id: string; visible: boolean }>
  transforms: Compared<'transforms', { id: string; matrix: readonly number[] | null }>
}

const componentsOf = (
  state: SceneState,
  types: readonly Component['type'][],
): readonly SceneComponentRef[] =>
  state.nodes.flatMap(node =>
    (node.components ?? [])
      .filter(component => types.includes(component.type))
      .map(component => ({ nodeId: node.id, component })),
  )

const pickingOf = (nodes: readonly SceneNode[]): readonly SceneRuntimePick[] =>
  nodes.flatMap(node => [
    { sourceId: node.id, runtimeId: node.id },
    ...(node.type === 'mesh' && node.instances
      ? node.instances.map(instance => ({ sourceId: instance.sourceId, runtimeId: node.id }))
      : []),
  ])

export function sceneRuntimeSnapshot(state: SceneState): SceneLogicalSnapshot {
  return {
    picking: pickingOf(state.nodes),
    animation: state.animation.tracks,
    timeline: {
      shots: state.animation.shots,
      events: state.animation.events ?? [],
      audio: state.animation.audio ?? [],
      video: state.animation.video ?? [],
      transitions: state.animation.transitions ?? [],
    },
    scripts: componentsOf(state, ['Script']),
    physics: componentsOf(state, PHYSICS_COMPONENT_TYPES),
    shadows: state.nodes.map(node => ({
      id: node.id,
      cast: node.castShadow,
      receive: node.receiveShadow,
    })),
    cameras: state.nodes.flatMap(node =>
      node.type === 'camera' ? [{ id: node.id, camera: node.camera }] : [],
    ),
    visibility: state.nodes.map(node => ({ id: node.id, visible: node.visible })),
    postProcessing: {
      world: state.world.post,
      cameras: state.nodes.flatMap(node =>
        node.type === 'camera' ? [{ id: node.id, post: node.camera.post ?? null }] : [],
      ),
    },
    transforms: state.nodes.map(node => ({
      id: node.id,
      transform: node.transform,
      instances: node.type === 'mesh' ? (node.instances ?? []) : [],
    })),
    duplication: state.nodes.flatMap(node => [
      node.id,
      ...(node.type === 'mesh' && node.instances
        ? node.instances.map(instance => instance.sourceId)
        : []),
    ]),
    undoRedo: state.nodes,
  }
}
