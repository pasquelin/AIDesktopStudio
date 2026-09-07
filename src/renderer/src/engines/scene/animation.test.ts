import { AnimationClip, AnimationMixer, Bone, Object3D, VectorKeyframeTrack } from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  assetClip,
  bundledClip,
  clipLane,
  embeddedClip,
  type ClipLane,
  type ClipRef,
} from '@shared/domain/scene'
import { SECOND } from '@shared/domain/time'
import { assetUrl } from '@shared/domain/asset'
import { bundledAnimationUrl } from '@shared/domain/animationLibrary'
import { animationTrack, timelineWith } from './animation-fixtures'
import { SceneAnimations, clipNamesOf, foreignClipsOf } from './animation'

function walkClip(name = 'walk', to = 1): AnimationClip {
  const track = new VectorKeyframeTrack('cube.position', [0, 1], [0, 0, 0, to, 0, 0])
  return new AnimationClip(name, 1, [track])
}

function scene(): Object3D {
  const root = new Object3D()
  const cube = new Object3D()
  cube.name = 'cube'
  root.add(cube)
  return root
}

const ref = ({
  name = 'walk',
  id = 'block-1',
  ...extra
}: Partial<ClipRef> & { name?: string } = {}) => embeddedClip(id, name, extra)

describe('the clips a model brought', () => {
  it('reads the names off the loaded root', () => {
    const source = scene()
    source.animations = [walkClip('walk'), walkClip('run')]

    expect(clipNamesOf(source)).toEqual(['walk', 'run'])
  })

  it('answers an empty list for a model carrying no clip at all', () => {
    expect(clipNamesOf(scene())).toEqual([])
  })
})

function limbRig(): Object3D {
  const root = new Object3D()
  const hips = new Bone()
  hips.name = 'Hips'
  const leg = new Bone()
  leg.name = 'LeftUpperLeg'
  const spine = new Bone()
  spine.name = 'Spine'
  const arm = new Bone()
  arm.name = 'LeftUpperArm'

  spine.add(arm)
  hips.add(leg)
  hips.add(spine)
  root.add(hips)
  return root
}

const limbClip = (name: string, to: number): AnimationClip =>
  new AnimationClip(name, 1, [
    new VectorKeyframeTrack('LeftUpperLeg.position', [0, 1], [0, 0, 0, to, 0, 0]),
    new VectorKeyframeTrack('LeftUpperArm.position', [0, 1], [0, 0, 0, to, 0, 0]),
  ])

const limbOf = (root: Object3D, name: string): Object3D => {
  const bone = root.getObjectByName(name)
  if (!bone) throw new Error('the fixture builds that bone')
  return bone
}

const applyTo = (animations: SceneAnimations, clips: readonly ClipRef[]): void =>
  animations.apply('node-1', [clipLane('main', clips)])

describe('SceneAnimations', () => {
  const withWalk = (): { animations: SceneAnimations; root: Object3D } => {
    const animations = new SceneAnimations()
    const root = scene()
    animations.add('node-1', root, [walkClip()])
    return { animations, root }
  }

  const cubeOf = (root: Object3D): Object3D => {
    const cube = root.children[0]
    if (!cube) throw new Error('the fixture builds one child')
    return cube
  }

  it('registers a model bringing no clip, with nothing to play until one is filed', () => {
    const animations = new SceneAnimations()
    animations.add('node-1', scene(), [])

    expect(animations.has('node-1')).toBe(true)
    expect(animations.clipsOf('node-1')).toEqual([])
  })

  it('does not evaluate a mixer that has no block to place', () => {
    const { animations } = withWalk()
    const update = vi.spyOn(AnimationMixer.prototype, 'update')

    animations.seek(0.5 * SECOND)

    expect(update).not.toHaveBeenCalled()
    update.mockRestore()
  })

  it('plays a clip filed after the file landed, at the width that clip really runs', () => {
    const animations = new SceneAnimations()
    const root = scene()
    animations.add('node-1', root, [])
    animations.addClip('node-1', 'bundled:Capoeira', walkClip())

    applyTo(animations, [bundledClip('block-1', 'Capoeira')])
    animations.seek(0.5 * SECOND)

    expect(animations.lengthsOf('node-1')['bundled:Capoeira']).toBe(1)
    expect(cubeOf(root).position.x).toBeCloseTo(0.5)
  })

  it('keeps a shipped animation apart from a clip of the file bearing the same name', () => {
    const animations = new SceneAnimations()
    const root = scene()
    animations.add('node-1', root, [walkClip()])
    animations.addClip('node-1', 'bundled:walk', walkClip('walk', 0))

    applyTo(animations, [bundledClip('block-1', 'walk')])
    animations.seek(0.5 * SECOND)

    expect(cubeOf(root).position.x).toBe(0)
  })

  it('places the model where the head says, without playing to get there', () => {
    const { animations, root } = withWalk()
    applyTo(animations, [ref()])
    animations.seek(0.75 * SECOND)

    expect(cubeOf(root).position.x).toBeCloseTo(0.75, 5)
  })

  it('runs at the speed the document asks for, which shortens the block', () => {
    const { animations, root } = withWalk()
    applyTo(animations, [ref({ speed: 2 })])
    animations.seek(0.25 * SECOND)

    expect(cubeOf(root).position.x).toBeCloseTo(0.5, 5)
  })

  it('wraps a looping block rather than running off its end', () => {
    const { animations, root } = withWalk()
    applyTo(animations, [ref({ loop: true, duration: 3 * SECOND })])
    animations.seek(1.25 * SECOND)

    expect(cubeOf(root).position.x).toBeCloseTo(0.25, 5)
  })

  it('holds the last pose of a block that does not loop, rather than snapping back', () => {
    const { animations, root } = withWalk()
    applyTo(animations, [ref({ loop: false })])
    animations.seek(5 * SECOND)

    expect(cubeOf(root).position.x).toBeCloseTo(1, 5)
  })

  it('ignores a clip name the file no longer holds, rather than throwing', () => {
    const { animations, root } = withWalk()
    applyTo(animations, [ref({ name: 'moonwalk' })])
    animations.seek(0.5 * SECOND)

    expect(cubeOf(root).position.x).toBe(0)
  })

  it('puts the model back to its rest pose when the last block is taken off', () => {
    const { animations, root } = withWalk()
    applyTo(animations, [ref()])
    animations.seek(0.5 * SECOND)
    applyTo(animations, [])

    expect(cubeOf(root).position.x).toBe(0)
  })

  it('drives the model from the blocks of every lane at once', () => {
    const animations = new SceneAnimations()
    const root = scene()
    animations.add('node-1', root, [walkClip('walk', 1), walkClip('slide', 3)])
    animations.apply('node-1', [
      clipLane('a', [ref()]),
      clipLane('b', [ref({ id: 'block-2', name: 'slide' })]),
    ])
    animations.seek(0.5 * SECOND)

    // Halfway through each: 0.5 and 1.5, shared evenly.
    expect(cubeOf(root).position.x).toBeCloseTo(1, 5)
  })

  it('poses a model from its own clock, leaving the head where it was', () => {
    const { animations, root } = withWalk()
    applyTo(animations, [ref()])
    animations.seek(0)

    animations.preview('node-1', 'block-1', 0.5)

    expect(cubeOf(root).position.x).toBeCloseTo(0.5, 5)
  })

  it('answers how long the clip runs, so a caller knows when a pass is over', () => {
    const { animations } = withWalk()
    applyTo(animations, [ref()])

    expect(animations.preview('node-1', 'block-1', 0)).toBe(1)
  })

  it('gives the model back to the head when nothing is being watched', () => {
    const { animations, root } = withWalk()
    applyTo(animations, [ref()])
    animations.seek(0.25 * SECOND)
    animations.preview('node-1', 'block-1', 0.9)

    animations.preview('node-1', null, 0)

    expect(cubeOf(root).position.x).toBeCloseTo(0.25, 5)
  })

  // The watched block alone drives the model: the others would blend their own pose into it.
  it('lets no other block weigh in while one is being watched', () => {
    const animations = new SceneAnimations()
    const root = scene()
    animations.add('node-1', root, [walkClip('walk', 1), walkClip('slide', 3)])
    animations.apply('node-1', [
      clipLane('a', [ref()]),
      clipLane('b', [ref({ id: 'block-2', name: 'slide' })]),
    ])

    animations.preview('node-1', 'block-1', 0.5)

    // The walk alone: shared with the slide it would have read 1.
    expect(cubeOf(root).position.x).toBeCloseTo(0.5, 5)
  })

  it('drives nothing once a node is removed', () => {
    const { animations, root } = withWalk()
    applyTo(animations, [ref()])
    animations.remove('node-1')
    animations.seek(0.5 * SECOND)

    expect(animations.has('node-1')).toBe(false)
    expect(cubeOf(root).position.x).toBe(0)
  })

  it('lets go of every node at once', () => {
    const animations = new SceneAnimations()
    animations.add('node-1', scene(), [walkClip()])
    animations.add('node-2', scene(), [walkClip()])
    animations.clear()

    expect(animations.has('node-1')).toBe(false)
    expect(animations.has('node-2')).toBe(false)
  })
})

describe('several blocks on one model', () => {
  const twoClips = (): { animations: SceneAnimations; root: Object3D; cube: Object3D } => {
    const animations = new SceneAnimations()
    const root = new Object3D()
    const cube = new Object3D()
    cube.name = 'cube'
    root.add(cube)
    animations.add('node-1', root, [walkClip('walk'), walkClip('run', 2)])
    return { animations, root, cube }
  }

  const walk = (extra: Partial<ClipRef> = {}): ClipRef => embeddedClip('walk', 'walk', extra)
  const run = (extra: Partial<ClipRef> = {}): ClipRef => embeddedClip('run', 'run', extra)

  it('plays the block the head is inside, and no other', () => {
    const { animations, cube } = twoClips()
    applyTo(animations, [walk(), run({ start: SECOND })])

    animations.seek(0.5 * SECOND)
    expect(cube.position.x).toBeCloseTo(0.5, 5)

    // Half a second into `run`, which travels twice as far in the same time.
    animations.seek(1.5 * SECOND)
    expect(cube.position.x).toBeCloseTo(1, 5)
  })

  it('shows a mix of both blocks halfway through a fade, rather than one then the other', () => {
    const { animations, cube } = twoClips()
    const spans = { duration: 2 * SECOND }

    applyTo(animations, [walk(spans)])
    animations.seek(1.5 * SECOND)
    const walkAlone = cube.position.x

    applyTo(animations, [run({ ...spans, start: SECOND })])
    animations.seek(1.5 * SECOND)
    const runAlone = cube.position.x

    applyTo(animations, [
      walk({ ...spans, fadeOut: SECOND }),
      run({ ...spans, start: SECOND, fadeIn: SECOND }),
    ])
    animations.seek(1.5 * SECOND)

    expect(cube.position.x).toBeCloseTo((walkAlone + runAlone) / 2, 5)
  })

  it('answers the same pose for one head however the head got there', () => {
    const { animations, cube } = twoClips()
    applyTo(animations, [
      walk({ duration: 2 * SECOND, fadeOut: SECOND }),
      run({ start: SECOND, duration: 2 * SECOND, fadeIn: SECOND }),
    ])

    animations.seek(1.5 * SECOND)
    const forwards = cube.position.x
    animations.seek(2.4 * SECOND)
    animations.seek(0.2 * SECOND)
    animations.seek(1.5 * SECOND)

    expect(cube.position.x).toBe(forwards)
  })

  it('gives two blocks of the SAME clip two heads of their own', () => {
    const { animations, cube } = twoClips()
    applyTo(animations, [
      embeddedClip('first', 'walk'),
      embeddedClip('second', 'walk', { start: 4 * SECOND }),
    ])

    animations.seek(4.25 * SECOND)

    // The second block is a quarter of the way in; sharing one action would have shown the first
    // block's own head, four seconds past its end.
    expect(cube.position.x).toBeCloseTo(0.25, 5)
  })
})

describe('a block that carries its character across the floor', () => {
  const rigged = (): { animations: SceneAnimations; hip: Object3D } => {
    const animations = new SceneAnimations()
    const root = new Object3D()
    const hip = new Bone()
    hip.name = 'Hip'
    const spine = new Bone()
    spine.name = 'Spine'
    hip.add(spine)
    root.add(hip)

    const clip = new AnimationClip('walk', 1, [
      new VectorKeyframeTrack('Hip.position', [0, 1], [0, 0, 0, 4, 0, 0]),
      new VectorKeyframeTrack('Spine.position', [0, 1], [0, 0, 0, 0, 1, 0]),
    ])
    animations.add('node-1', root, [clip])
    return { animations, hip }
  }

  const trajectory = () =>
    timelineWith([
      animationTrack(
        'move',
        'position',
        [
          { time: 0, value: { x: 0, y: 0, z: 0 } },
          { time: SECOND, value: { x: 4, y: 0, z: 0 } },
        ],
        { target: { nodeId: 'node-1', property: 'position' } },
      ),
    ])

  it('travels on its own when the band drives the node nowhere', () => {
    const { animations, hip } = rigged()
    applyTo(animations, [embeddedClip('block-1', 'walk', { rootMotion: 'auto' })])
    animations.seek(0.5 * SECOND)

    expect(hip.position.x).toBeCloseTo(2, 5)
  })

  it('walks on the spot as soon as the band carries the node, so nothing moves twice', () => {
    const { animations, hip } = rigged()
    animations.setTimeline(trajectory())
    applyTo(animations, [embeddedClip('block-1', 'walk', { rootMotion: 'auto' })])
    animations.seek(SECOND)

    expect(hip.position.x).toBe(0)
  })

  it('keeps everything the travel is not, so a neutralised walk still walks', () => {
    const { animations, hip } = rigged()
    animations.setTimeline(trajectory())
    applyTo(animations, [embeddedClip('block-1', 'walk', { rootMotion: 'auto' })])
    animations.seek(0.5 * SECOND)

    const spine = hip.children[0]
    expect(spine?.position.y).toBeCloseTo(0.5, 5)
  })

  it('stops travelling the moment a trajectory is keyed under it', () => {
    const { animations, hip } = rigged()
    applyTo(animations, [embeddedClip('block-1', 'walk', { rootMotion: 'auto' })])
    animations.seek(0.5 * SECOND)
    expect(hip.position.x).toBeCloseTo(2, 5)

    animations.setTimeline(trajectory())

    // No node of the document changed, so nothing else would have told this block to give up
    // its own travel.
    expect(hip.position.x).toBe(0)
  })

  it('travels anyway when the document says so plainly', () => {
    const { animations, hip } = rigged()
    animations.setTimeline(trajectory())
    applyTo(animations, [embeddedClip('block-1', 'walk', { rootMotion: 'travel' })])
    animations.seek(0.5 * SECOND)

    expect(hip.position.x).toBeCloseTo(2, 5)
  })
})

describe('two blocks stacked on a body', () => {
  const withLimbs = (): { animations: SceneAnimations; root: Object3D } => {
    const animations = new SceneAnimations()
    const root = limbRig()
    animations.add('node-1', root, [limbClip('walk', 1), limbClip('wave', 2)])
    return { animations, root }
  }

  const laneOn = (id: string, clip: ClipRef): ClipLane => clipLane(id, [clip])

  it('leaves the bones a block does not drive exactly where they were', () => {
    const { animations, root } = withLimbs()

    animations.apply('node-1', [laneOn('a', ref({ name: 'walk', part: 'upper' }))])
    animations.seek(0.5 * SECOND)

    expect(limbOf(root, 'LeftUpperArm').position.x).toBeCloseTo(0.5, 5)
    expect(limbOf(root, 'LeftUpperLeg').position.x).toBe(0)
  })

  it('gives each half its own block whole, where a mean is all two whole bodies can give', () => {
    const { animations, root } = withLimbs()

    animations.apply('node-1', [
      laneOn('a', ref({ id: 'block-1', name: 'walk', part: 'lower' })),
      laneOn('b', ref({ id: 'block-2', name: 'wave', part: 'upper' })),
    ])
    animations.seek(0.5 * SECOND)

    expect(limbOf(root, 'LeftUpperLeg').position.x).toBeCloseTo(0.5, 5)
    expect(limbOf(root, 'LeftUpperArm').position.x).toBeCloseTo(1, 5)
  })

  it('still averages two blocks that both drive the whole body', () => {
    const { animations, root } = withLimbs()

    animations.apply('node-1', [
      laneOn('a', ref({ id: 'block-1', name: 'walk' })),
      laneOn('b', ref({ id: 'block-2', name: 'wave' })),
    ])
    animations.seek(0.5 * SECOND)

    expect(limbOf(root, 'LeftUpperLeg').position.x).toBeCloseTo(0.75, 5)
    expect(limbOf(root, 'LeftUpperArm').position.x).toBeCloseTo(0.75, 5)
  })
})

describe('the clips a model has to be given', () => {
  it('names every file to read, and only the ones the model did not bring', () => {
    const lanes = [
      clipLane('a', [embeddedClip('block-1', 'walk'), bundledClip('block-2', 'Capoeira')]),
      clipLane('b', [assetClip('block-3', 'asset-7', 'jig')]),
    ]

    expect(foreignClipsOf(lanes)).toEqual([
      { key: 'bundled:Capoeira', url: bundledAnimationUrl('Capoeira'), label: 'Capoeira' },
      { key: 'asset:asset-7', url: assetUrl('asset-7'), label: 'jig' },
    ])
  })

  // Four blocks of one walk are one file to read, and the kind is what stops a shipped `walk`
  // and a project asset of the same name being taken for one another.
  it('asks for one file per source, however many blocks play it', () => {
    const lanes = [
      clipLane('a', [bundledClip('block-1', 'walk'), bundledClip('block-2', 'walk')]),
      clipLane('b', [assetClip('block-3', 'asset-7', 'walk')]),
    ]

    expect(foreignClipsOf(lanes).map(clip => clip.key)).toEqual(['bundled:walk', 'asset:asset-7'])
  })
})
