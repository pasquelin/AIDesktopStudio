import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { WELCOME_CLIP_NAMES, type WelcomeClipName } from '@shared/domain/welcome'
import type { GltfSource } from '../scene/gltfSource'
import type { Retarget } from '../scene/retarget'
import { WelcomeHero } from './WelcomeHero'

const DURATION = 1
const TRAVEL = 0.8
const TOE_REST = -1
const TOE_WALK = -0.7
const TOE_STAND = -0.4

function rig(): Object3D {
  const root = new Object3D()
  const hips = new Bone()
  hips.name = 'Hips'
  hips.position.set(0, 1, 0)
  const leftToes = new Bone()
  leftToes.name = 'LeftToes'
  leftToes.position.set(0.1, TOE_REST, 0)
  const rightToes = new Bone()
  rightToes.name = 'RightToes'
  rightToes.position.set(-0.1, TOE_REST, 0)
  hips.add(leftToes, rightToes)
  root.add(hips)
  root.add(new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial()))
  return root
}

function clipFile(name: WelcomeClipName, toeEnd = TOE_REST): Object3D {
  const file = rig()
  file.animations = [
    new AnimationClip(name, DURATION, [
      new VectorKeyframeTrack('Hips.position', [0, DURATION], [0, 1, 0, 0, 1, TRAVEL]),
      new QuaternionKeyframeTrack('Hips.quaternion', [0, DURATION], [0, 0, 0, 1, 0, 0, 0, 1]),
      new VectorKeyframeTrack(
        'LeftToes.position',
        [0, DURATION],
        [0.1, TOE_REST, 0, 0.1, toeEnd, 0],
      ),
    ]),
  ]
  return file
}

function clipsOf(
  overrides: Partial<Record<WelcomeClipName, Object3D>> = {},
): Record<WelcomeClipName, Object3D> {
  const file = (name: WelcomeClipName) =>
    overrides[name] ?? clipFile(name, name === 'WalkStop' ? TOE_STAND : TOE_WALK)

  return {
    Walk: file('Walk'),
    WalkStart: file('WalkStart'),
    WalkStop: file('WalkStop'),
    TurnLeft: file('TurnLeft'),
    TurnRight: file('TurnRight'),
    TurnAround: file('TurnAround'),
    StrafeLeft: file('StrafeLeft'),
    StrafeRight: file('StrafeRight'),
  }
}

function fileNamed(url: string, files: Record<WelcomeClipName, Object3D>): Object3D {
  const id = decodeURIComponent(url.split('/').pop() ?? '')
  for (const name of WELCOME_CLIP_NAMES) {
    if (name === id) return files[name]
  }
  return files.Walk
}

function gltfOf(
  body: Object3D,
  files: Record<WelcomeClipName, Object3D>,
  gate?: Promise<void>,
): GltfSource {
  return {
    load: async () => body,
    loadAnimation: async url => {
      if (gate) await gate
      return fileNamed(url, files)
    },
    dispose: () => {},
  }
}

function retargetOf(
  adapt: Retarget['adapt'] = async (_target, _source, clips) => (clips[0] ? [clips[0]] : null),
): Retarget {
  return {
    adapt,
    fitOf: () => ({ matched: [], missingInSource: [], missingInTarget: [] }),
    remember: () => {},
    dispose: () => {},
  }
}

function readyHero(
  files: Record<WelcomeClipName, Object3D>,
  extra: { roll?: () => number; adapt?: Retarget['adapt'] } = {},
): Promise<WelcomeHero> {
  const body = rig()
  return new Promise((resolve, reject) => {
    const hero = new WelcomeHero({
      gltf: gltfOf(body, files),
      retarget: retargetOf(extra.adapt),
      roll: extra.roll,
      onReady: () => resolve(hero),
      onFailure: reject,
    })
  })
}

function toesOf(hero: WelcomeHero): Object3D | undefined {
  return hero.group.getObjectByName('LeftToes')
}

function hipsOf(hero: WelcomeHero): Object3D | undefined {
  return hero.group.getObjectByName('Hips')
}

/** The welcome ticks a clamped frame, never a whole clip in one call. */
function tick(hero: WelcomeHero, seconds: number): void {
  const frame = 1 / 60
  for (let step = 0; step * frame < seconds; step += 1) hero.advance(frame)
}

describe('WelcomeHero', () => {
  it('reacts to a slide selected while the character is loading', async () => {
    const hero = await new Promise<WelcomeHero>((resolve, reject) => {
      const pending = new WelcomeHero({
        gltf: gltfOf(rig(), clipsOf()),
        retarget: retargetOf(),
        roll: () => 0.5,
        onReady: () => resolve(pending),
        onFailure: reject,
      })
      pending.faceSlide(0, 0)
    })
    const start = hero.group.position.clone()

    tick(hero, 0.6)

    expect(hero.group.position.distanceTo(start)).toBeGreaterThan(0.1)
    hero.dispose()
  })

  it('carries the clip’s root travel on the group, not on the hip', async () => {
    const hero = await readyHero(clipsOf(), { roll: () => 0 })
    const start = hero.group.position.clone()
    const hip = hipsOf(hero)?.position.clone()
    tick(hero, 0.8 + DURATION)

    expect(hero.group.position.distanceTo(start)).toBeGreaterThan(TRAVEL * 0.5)
    expect(hipsOf(hero)?.position.z).toBeCloseTo(hip?.z ?? 0, 3)
  })

  it('plays the clip’s pose, not the bind, once a walk is underway', async () => {
    const hero = await readyHero(clipsOf(), { roll: () => 0 })
    tick(hero, 0.8 + DURATION * 0.5)

    expect(toesOf(hero)?.position.y).not.toBeCloseTo(TOE_REST, 2)
  })

  it('holds the last frame of WalkStop when it settles, not the bind pose', async () => {
    const hero = await readyHero(clipsOf())
    hero.settle()

    expect(toesOf(hero)?.position.y).toBeCloseTo(TOE_STAND, 2)
  })

  it('fails to land when Walk never arrives, rather than strolling a T-pose', async () => {
    const outcome = await new Promise<'ready' | 'failure'>(resolve => {
      new WelcomeHero({
        gltf: gltfOf(rig(), clipsOf()),
        retarget: retargetOf(async (_target, _source, clips) =>
          clips[0]?.name === 'Walk' ? null : clips[0] ? [clips[0]] : null,
        ),
        onReady: () => resolve('ready'),
        onFailure: () => resolve('failure'),
      })
    })

    expect(outcome).toBe('failure')
  })

  it('skips a clip the retarget dropped, instead of posing bind every frame', async () => {
    const hero = await readyHero(clipsOf(), {
      roll: () => 0,
      adapt: async (_target, _source, clips) =>
        clips[0]?.name === 'WalkStart' ? null : clips[0] ? [clips[0]] : null,
    })
    const start = hero.group.position.clone()
    tick(hero, 0.8 + DURATION)

    expect(hero.group.position.distanceTo(start)).toBeGreaterThan(TRAVEL * 0.5)
  })

  it('disposes animation files that arrive after the welcome has been dropped', async () => {
    const files = clipsOf()
    const mesh = files.Walk.children.find(child => child instanceof Mesh)
    expect(mesh).toBeInstanceOf(Mesh)
    if (!(mesh instanceof Mesh)) return
    const spy = vi.spyOn(mesh.geometry, 'dispose')
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const hero = new WelcomeHero({
      gltf: gltfOf(rig(), files, gate),
      retarget: retargetOf(),
      onReady: () => {},
      onFailure: () => {},
    })
    hero.dispose()
    release()
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())
  })
})
