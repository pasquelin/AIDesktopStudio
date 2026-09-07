/// <reference lib="webworker" />
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js'
import { messageOf } from '@shared/guards'
import {
  buffersOfGeometry,
  geometryOfBuffers,
  transferablesOfBuffers,
  type LossyModelRequest,
  type LossyModelResponse,
  type ModelGeometryBuffers,
} from './lossyModelMessage'

declare const self: DedicatedWorkerGlobalScope

const modifier = new SimplifyModifier()

self.addEventListener('message', (event: MessageEvent<LossyModelRequest>) => {
  const { id, geometry: buffers, ratios } = event.data
  try {
    self.postMessage({ id, done: false, progress: 0.1 } satisfies LossyModelResponse)
    // Built once for every level: `modify` clones its input, so the source survives each pass.
    const geometry = geometryOfBuffers(buffers)
    const vertices = geometry.getAttribute('position').count
    const geometries: ModelGeometryBuffers[] = []
    for (const ratio of ratios) {
      const reduced = modifier.modify(
        geometry,
        Math.min(vertices - 3, Math.floor(vertices * ratio)),
      )
      const answer = buffersOfGeometry(reduced, false)
      reduced.dispose()
      if (!answer) throw new Error('simplified positions are not floats')
      geometries.push(answer)
    }
    geometry.dispose()
    self.postMessage(
      { id, done: true, ok: true, geometries } satisfies LossyModelResponse,
      transferablesOfBuffers(geometries),
    )
  } catch (error) {
    self.postMessage({
      id,
      done: true,
      ok: false,
      error: messageOf(error),
    } satisfies LossyModelResponse)
  }
})
