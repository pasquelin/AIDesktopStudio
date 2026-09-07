import {
  SCENE_SUBJECT_ID,
  type AnimationTimeline,
  type AnimationTrack,
} from '@shared/domain/animation'
import {
  postEffect,
  readParams,
  type PostEffect,
  type PostEffectId,
} from '@shared/domain/postProcessing'
import { SECOND, type Us } from '@shared/domain/time'
import type { MaterialDescriptor, SceneWorld, Vector3 } from '@shared/domain/scene'
import { presetPatch } from './environmentPresets'
import { meshNode, pathNode, transformAt } from './nodeFactory'
import type { SceneNode } from './sceneState'

type Template = {
  nodes: readonly SceneNode[]
  world: Partial<SceneWorld>
  animation: Partial<AnimationTimeline>
}

type Parts = {
  floor: (size: number) => SceneNode
  sun: (intensity: number, position?: Vector3) => SceneNode
  ambient: (intensity: number) => SceneNode
  pointLight: (intensity: number, position: Vector3) => SceneNode
  aimedCamera: (height: number, distance: number, targetHeight?: number) => SceneNode
  backdrop: MaterialDescriptor
}

const DEMO = { defocus: 'demo-dof', bloom: 'demo-bloom', grade: 'demo-grade' }

export function postProcessingTemplate(parts: Parts): Template {
  const rail = pathNode()
  const camera = parts.aimedCamera(1.5, 9, 1)
  return {
    nodes: demonstrationNodes(parts, camera, rail),
    world: demonstrationWorld(),
    animation: demonstrationAnimation(camera.id, rail.id),
  }
}

function demonstrationNodes(parts: Parts, camera: SceneNode, rail: SceneNode): SceneNode[] {
  const metal = { ...parts.backdrop, color: '#dfe3ea', roughness: 0.14, metalness: 1 }
  return [
    parts.floor(40),
    meshNode(
      { kind: 'sphere', radius: 1, widthSegments: 48, heightSegments: 32 },
      { transform: transformAt({ x: 0, y: 1, z: 0 }), material: metal, name: 'Metal Sphere' },
    ),
    meshNode(
      { kind: 'cylinder', radiusTop: 0.12, radiusBottom: 0.12, height: 2.4, segments: 24 },
      { transform: transformAt({ x: -1.6, y: 1.2, z: 5 }), name: 'Foreground Post' },
    ),
    meshNode(
      { kind: 'plane', width: 60, height: 16 },
      {
        transform: transformAt({ x: 0, y: 7, z: -9 }),
        material: { ...parts.backdrop, color: '#8c8c92' },
        castShadow: false,
        name: 'Backdrop',
      },
    ),
    parts.sun(1.6, { x: -6, y: 7, z: 5 }),
    parts.ambient(0.2),
    parts.pointLight(12, { x: 1.8, y: 2.2, z: 1.6 }),
    camera,
    rail,
  ]
}

function demonstrationWorld(): Partial<SceneWorld> {
  return {
    ...presetPatch('studio'),
    post: {
      enabled: true,
      effects: [
        tuned('demo-gtao', 'gtao', { radius: 0.3, blend: 0.85 }),
        tuned(DEMO.defocus, 'dof', { focusDistance: 15, aperture: 0.004, maxBlur: 0.012 }),
        tuned(DEMO.bloom, 'bloom', { strength: 0.35, radius: 0.5, threshold: 0.9 }),
        tuned(DEMO.grade, 'colorGrading', { contrast: 1.15, saturation: 0.98 }),
        tuned('demo-vignette', 'vignette', { offset: 0.9, darkness: 1.1 }),
        postEffect('demo-smaa', 'smaa'),
      ],
    },
  }
}

function demonstrationAnimation(cameraId: string, pathId: string): Partial<AnimationTimeline> {
  return {
    duration: 5 * SECOND,
    shots: [
      {
        id: 'demo-shot',
        cameraId,
        start: 0,
        duration: 5 * SECOND,
        motion: { pathId, easing: 'easeInOut', from: 0, to: 1 },
        target: { kind: 'point', at: { x: 0, y: 1, z: 0 } },
      },
    ],
    tracks: [
      demoTrack('demo-focus', DEMO.defocus, 'focusDistance', [
        { time: 0, value: 0 },
        { time: 3 * SECOND, value: -13 },
      ]),
      demoTrack('demo-flash', DEMO.bloom, 'strength', [
        { time: 0, value: 0 },
        { time: 1.5 * SECOND, value: 1.15 },
        { time: 3 * SECOND, value: 0 },
      ]),
      demoTrack('demo-exposure', DEMO.grade, 'exposure', [
        { time: 0, value: 0 },
        { time: 5 * SECOND, value: -1.32 },
      ]),
    ],
  }
}

function tuned(
  id: string,
  effect: PostEffectId,
  params: Record<string, number | string | boolean>,
): PostEffect {
  return { ...postEffect(id, effect), params: readParams(effect, params) }
}

function demoTrack(
  id: string,
  effectId: string,
  param: string,
  keys: readonly { time: Us; value: number }[],
): AnimationTrack {
  return {
    id,
    name: id,
    index: 0,
    muted: false,
    solo: false,
    locked: false,
    target: { nodeId: SCENE_SUBJECT_ID, property: 'post', post: { effectId, param } },
    keys: keys.map(one => ({ time: one.time, value: { x: one.value, y: 0, z: 0 } })),
  }
}
