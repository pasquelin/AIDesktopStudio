/**
 * What crosses to the skinning worker and back, on `bvhMessage`'s pattern — extended on two
 * points that build never needed: a request answers MANY times, and a caller may take one back.
 *
 * Numbers only, never a three object: a geometry is not structured-cloneable.
 */

/**
 * Which part of a body a bone drives. A limb bone weights only vertices of its own limb, which is
 * what keeps a hip vertex off the hand bone when the arm hangs beside it.
 */
export type SkinRegion =
  | 'trunk'
  | 'head'
  | 'armLeft'
  | 'armRight'
  | 'legLeft'
  | 'legRight'
  /** 🛑 A handle one pulls, and no part of the body: `mayDrive` allows it for nothing. */
  | 'handle'
  /**
   * 🛑 One region per FINGER, and the reason is measured: fingers stand a centimetre apart on a
   * hand, so a vertex of the index was within reach of the middle's bones and bending one moved
   * two. An arm alone is not a fine enough grain to hold a hand together.
   */
  | `${'thumb' | 'index' | 'middle' | 'ring' | 'little'}${'Left' | 'Right'}`

/** The order is the wire format: a region crosses as its index in this list. Append only. */
export const SKIN_REGIONS: readonly SkinRegion[] = [
  'trunk',
  'head',
  'armLeft',
  'armRight',
  'legLeft',
  'legRight',
  'handle',
  'thumbLeft',
  'indexLeft',
  'middleLeft',
  'ringLeft',
  'littleLeft',
  'thumbRight',
  'indexRight',
  'middleRight',
  'ringRight',
  'littleRight',
]

/**
 * Which region a region is PART of. A finger belongs to its arm, so the hand and the forearm
 * still reach a knuckle, while the finger beside it never does.
 */
export const SKIN_REGION_WITHIN: Partial<Record<SkinRegion, SkinRegion>> = {
  thumbLeft: 'armLeft',
  indexLeft: 'armLeft',
  middleLeft: 'armLeft',
  ringLeft: 'armLeft',
  littleLeft: 'armLeft',
  thumbRight: 'armRight',
  indexRight: 'armRight',
  middleRight: 'armRight',
  ringRight: 'armRight',
  littleRight: 'armRight',
}

/** How many bones may drive one vertex. Four, because that is what a `SkinnedMesh` reads. */
export const INFLUENCES = 4

export type SkinRequest = {
  id: number
  /** Three floats per vertex, in the mesh's own space. */
  position: Float32Array
  /** Six floats per bone — head then tail — in the same space. A bone is a SEGMENT, not a point. */
  segments: Float32Array
  /** One region index per bone, in the order the segments are spelled. */
  regions: Uint8Array
}

/** Takes a request back. The worker stops where it is and says nothing more about it. */
export type SkinCancel = { id: number; cancel: true }

export type SkinIncoming = SkinRequest | SkinCancel

export type SkinResponse =
  /** Still working. `progress` runs 0 to 1 and never reaches it — `done` is what says so. */
  | { id: number; done: false; progress: number }
  | { id: number; done: true; ok: true; skinIndex: Uint16Array; skinWeight: Float32Array }
  | { id: number; done: true; ok: false; error: string }

export function isCancel(message: SkinIncoming): message is SkinCancel {
  return 'cancel' in message
}
