/**
 * What crosses to the glb-writing worker and back, on `skinMessage`'s pattern.
 *
 * The file itself travels, and it is TRANSFERRED rather than copied: a character of a million
 * triangles is tens of megabytes, and a structured clone of it would cost the very frame this
 * worker exists to protect.
 */
import type { CharacterExtras } from '@shared/domain/character'
import type { RigBone } from '@shared/domain/rig'

export type GlbSkinWire = {
  mesh: number
  primitive: number
  joints: Uint16Array
  weights: Float32Array
}

export type GlbWriteRequest = {
  id: number
  file: Uint8Array
  bones: readonly RigBone[]
  skins: readonly GlbSkinWire[]
  extras: CharacterExtras
}

export type GlbWriteCancel = { id: number; cancel: true }
export type GlbWriteIncoming = GlbWriteRequest | GlbWriteCancel

export type GlbWriteResponse =
  | { id: number; done: true; ok: true; file: Uint8Array }
  | { id: number; done: true; ok: false; error: string }

export function isGlbWriteCancel(message: GlbWriteIncoming): message is GlbWriteCancel {
  return 'cancel' in message
}

/** Everything a request hands over, so nothing of it is copied on the way out. */
export function writeBuffers(request: GlbWriteRequest): Transferable[] {
  return [
    request.file.buffer as ArrayBuffer,
    ...request.skins.flatMap(skin => [skin.joints.buffer, skin.weights.buffer] as ArrayBuffer[]),
  ]
}
