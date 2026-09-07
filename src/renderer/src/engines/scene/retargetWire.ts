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
import type { WireBone, WireClip, WireTrack, WireTrackKind, WireTransform } from './retargetMessage'

/**
 * Every named bone of a model, parents before children.
 *
 * Duplicate names are refused: both animation tracks and mapping profiles bind bones by name.
 */
const virtualFrames = new WeakSet<Object3D>()

export function wireBonesOf(root: Object3D): WireBone[] {
  const bones: WireBone[] = []
  const indexOf = new Map<Object3D, number>()
  const names = new Set<string>()
  root.traverse(object => {
    if (!isBoneObject(object) || virtualFrames.has(object) || !object.name) return
    // 🛑 SKIPPED, never refused, as `rigStateOf` skips it: a second bone of one name is one
    // nothing can address, and a merged rig carries them. Refusing made every foreign clip of
    // such a model fail to load, and its transfer window refuse to open at all — while the rig
    // panel, which skips, showed it as ordinary. Its subtree hangs from the bone above it.
    if (names.has(object.name)) return
    names.add(object.name)
    const ancestors = parentFramesOf(object, root, indexOf)
    indexOf.set(object, bones.length)
    bones.push({ name: object.name, ...ancestors, ...transformOf(object) })
  })
  return bones
}

function transformOf(object: Object3D): WireTransform {
  return {
    position: object.position.toArray(),
    quaternion: object.quaternion.toArray(),
    scale: object.scale.toArray(),
  }
}

function parentFramesOf(
  object: Object3D,
  root: Object3D,
  known: ReadonlyMap<Object3D, number>,
): Pick<WireBone, 'parent' | 'parentFrames'> {
  const frames: WireTransform[] = []
  let above = object.parent
  while (above && above !== root && !known.has(above)) {
    if (
      above.position.lengthSq() !== 0 ||
      above.quaternion.x !== 0 ||
      above.quaternion.y !== 0 ||
      above.quaternion.z !== 0 ||
      above.quaternion.w !== 1 ||
      above.scale.x !== 1 ||
      above.scale.y !== 1 ||
      above.scale.z !== 1
    )
      frames.unshift(transformOf(above))
    above = above.parent
  }
  return {
    parent: above ? (known.get(above) ?? -1) : -1,
    ...(frames.length > 0 && { parentFrames: frames }),
  }
}

/** Virtual parent bones let Skeleton.pose restore the same local frames on every sample. */
export function skinnedFromWire(bones: readonly WireBone[]): SkinnedMesh {
  const built: Bone[] = []
  const joints: Bone[] = []
  const mesh = new SkinnedMesh()
  const names = new Set(bones.map(bone => bone.name))
  for (const [index, wire] of bones.entries()) {
    let parent: Object3D = joints[wire.parent] ?? mesh
    for (const [frameIndex, frame] of (wire.parentFrames ?? []).entries()) {
      let name = `__retarget_frame_${index}_${frameIndex}`
      while (names.has(name)) name += '_'
      const helper = boneFromTransform(name, frame)
      virtualFrames.add(helper)
      parent.add(helper)
      built.push(helper)
      parent = helper
    }
    const bone = boneFromTransform(wire.name, wire)
    parent.add(bone)
    built.push(bone)
    joints.push(bone)
  }
  mesh.updateMatrixWorld(true)
  mesh.bind(new Skeleton(built))
  return mesh
}

function boneFromTransform(name: string, wire: WireTransform): Bone {
  const bone = new Bone()
  bone.name = name
  bone.position.fromArray(wire.position)
  bone.quaternion.fromArray(wire.quaternion)
  bone.scale.fromArray(wire.scale)
  return bone
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
