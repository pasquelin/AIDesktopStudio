import {
  AnimationClip,
  Bone,
  NumberKeyframeTrack,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  VectorKeyframeTrack,
  type KeyframeTrack,
  type Object3D,
} from 'three'
import { isBoneObject } from './rigState'
import type { WireBone, WireClip, WireTrack, WireTrackKind } from './retargetMessage'

/**
 * Every named bone of a model, parents before children.
 *
 * Duplicate names are refused: both animation tracks and mapping profiles bind bones by name.
 */
export function wireBonesOf(root: Object3D): WireBone[] {
  const bones: WireBone[] = []
  const indexOf = new Map<string, number>()

  root.traverse(object => {
    if (!isBoneObject(object) || !object.name) return
    if (indexOf.has(object.name)) throw new Error(`duplicate bone name: ${object.name}`)

    indexOf.set(object.name, bones.length)
    bones.push({
      name: object.name,
      parent: parentIndexOf(object, indexOf),
      position: object.position.toArray(),
      quaternion: object.quaternion.toArray(),
      scale: object.scale.toArray(),
    })
  })

  return bones
}

function parentIndexOf(bone: Object3D, indexOf: ReadonlyMap<string, number>): number {
  let above = bone.parent
  while (above) {
    const known = above.name === '' ? undefined : indexOf.get(above.name)
    if (known !== undefined) return known
    above = above.parent
  }
  return -1
}

/** The skeleton three needs to sample a clip: a mesh, because `retargetClip` reads `.skeleton`. */
export function skinnedFromWire(bones: readonly WireBone[]): SkinnedMesh {
  const built = bones.map(wire => {
    const bone = new Bone()
    bone.name = wire.name
    bone.position.fromArray([...wire.position])
    bone.quaternion.fromArray([...wire.quaternion])
    bone.scale.fromArray([...wire.scale])
    return bone
  })

  const mesh = new SkinnedMesh()
  built.forEach((bone, index) => {
    const above = bones[index]?.parent ?? -1
    ;(above < 0 ? mesh : (built[above] ?? mesh)).add(bone)
  })

  mesh.updateMatrixWorld(true)
  mesh.bind(new Skeleton(built))
  return mesh
}

export function wireClipOf(clip: AnimationClip): WireClip {
  return {
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks.map(track => ({
      name: track.name,
      kind: trackKindOf(track),
      times: new Float32Array(track.times),
      values: new Float32Array(track.values),
    })),
  }
}

export function clipFromWire(wire: WireClip): AnimationClip {
  return new AnimationClip(wire.name, wire.duration, wire.tracks.map(trackFromWire))
}

function trackFromWire(track: WireTrack): KeyframeTrack {
  if (track.kind === 'quaternion')
    return new QuaternionKeyframeTrack(track.name, track.times, track.values)
  if (track.kind === 'vector') return new VectorKeyframeTrack(track.name, track.times, track.values)

  return new NumberKeyframeTrack(track.name, track.times, track.values)
}

function trackKindOf(track: KeyframeTrack): WireTrackKind {
  if (track.ValueTypeName === 'quaternion') return 'quaternion'
  return track.ValueTypeName === 'vector' ? 'vector' : 'number'
}

/**
 * `.bones[Hips].quaternion` read as `Hips.quaternion`.
 *
 * `retargetClip` writes the SKELETON spelling, which only binds against an object carrying a
 * `.skeleton`. Every clip this studio plays comes off `GLTFLoader` in the NODE spelling and is
 * bound against the model holder — so a retargeted clip left as three spells it would resolve to
 * nothing, silently, and the character would simply stand still.
 */
export function nodeTrackNameOf(name: string): string {
  const match = /^\.bones\[(.+)\]\.(.+)$/.exec(name)
  return match ? `${match[1]}.${match[2]}` : name
}
