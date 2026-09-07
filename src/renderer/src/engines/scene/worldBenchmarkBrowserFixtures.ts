import {
  AnimationClip,
  BoxGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
} from 'three'
import type { SceneState } from './sceneState'
import type { RuntimeRenderCamera } from './runtimeRepresentationValidation'

const VALIDATION_FRAME_SIZE = 128

export function benchmarkModel(): Group {
  const model = new Group()
  model.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial({ color: '#888888' })))
  model.animations.push(
    new AnimationClip('idle', 1, [new NumberKeyframeTrack('.rotation[y]', [0, 1], [0, Math.PI])]),
  )
  return model
}

export function benchmarkTexture(): DataTexture {
  const texture = new DataTexture(
    new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
    2,
    2,
  )
  texture.needsUpdate = true
  return texture
}

export function camerasFor(state: SceneState): readonly RuntimeRenderCamera[] {
  const points = state.nodes.map(node => node.transform.position)
  const minimum = {
    x: Math.min(...points.map(point => point.x)),
    y: Math.min(...points.map(point => point.y)),
    z: Math.min(...points.map(point => point.z)),
  }
  const maximum = {
    x: Math.max(...points.map(point => point.x)),
    y: Math.max(...points.map(point => point.y)),
    z: Math.max(...points.map(point => point.z)),
  }
  const target = {
    x: (minimum.x + maximum.x) / 2,
    y: (minimum.y + maximum.y) / 2,
    z: (minimum.z + maximum.z) / 2,
  }
  const distance = Math.max(20, maximum.x - minimum.x, maximum.z - minimum.z) * 1.6
  return [
    camera('front', target, target.x, target.y + distance / 2, target.z + distance),
    camera('side', target, target.x + distance, target.y + distance / 2, target.z),
    camera(
      'top',
      target,
      target.x,
      target.y + distance,
      target.z + distance / 100,
      'orthographic',
      distance,
    ),
  ]
}

function camera(
  id: string,
  target: { x: number; y: number; z: number },
  x: number,
  y: number,
  z: number,
  projection: RuntimeRenderCamera['projection'] = 'perspective',
  orthographicSize?: number,
): RuntimeRenderCamera {
  return {
    id,
    position: { x, y, z },
    target,
    projection,
    fieldOfView: 50,
    orthographicSize,
    near: 0.1,
    far:
      Math.max(1_000, Math.abs(x - target.x), Math.abs(y - target.y), Math.abs(z - target.z)) * 4,
    width: VALIDATION_FRAME_SIZE,
    height: VALIDATION_FRAME_SIZE,
    cameraMask: 1,
  }
}
