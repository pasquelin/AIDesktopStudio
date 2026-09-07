import { glbFrom } from '@shared/domain/glbContainer'

/**
 * A `.glb` as an exporter writes one, carrying whatever the studio asked to ride on its scene —
 * which is the very place `GLTFExporter` puts a scene's `userData`.
 */
export function motionFile(extras: Record<string, unknown>): Uint8Array {
  const json = JSON.stringify({ scene: 0, scenes: [{ extras }] })
  return glbFrom({ json: new TextEncoder().encode(json), bin: new Uint8Array() })
}
