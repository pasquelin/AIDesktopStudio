import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Bone,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  LoopOnce,
  Mesh,
  OrthographicCamera,
  Quaternion,
  SRGBColorSpace,
  Scene,
  SkinnedMesh,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { Object3D } from 'three'
import { createGltfSource } from './gltfSource'
import { disposeTree } from './modelCache'
import { retargetPlanOf, wireBonesOf, skeletonScaleOf } from './retarget'
import { poseFractionOf, yawOf } from './animationPose'
import type { AnimationThumbnailRequest } from './animationThumbnailMessage'

/** What a clip nobody has described is scored on: a step is read in the legs. */
const STEP_JOINTS: readonly string[] = ['LeftUpperLeg', 'RightUpperLeg']

const preset = {
  size: 512,
  background: '#151921',
  camera: [9, 8, 22],
  margin: 1.27,
  exposure: 1.05,
  samples: 17,
}
export async function createAnimationThumbnailRenderer(model: ArrayBuffer, decoderRoot?: string) {
  const canvas = new OffscreenCanvas(preset.size, preset.size)
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(1)
  renderer.setSize(preset.size, preset.size, false)
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = preset.exposure
  renderer.outputColorSpace = SRGBColorSpace
  const scene = new Scene()
  scene.background = new Color(preset.background)
  scene.add(new HemisphereLight(0xffffff, 0x777777, 1.3))
  const key = new DirectionalLight(0xffffff, 3)
  key.position.set(3, 12, 8)
  scene.add(key)
  const rim = new DirectionalLight(0xffffff, 1.5)
  rim.position.set(-5, 4, -6)
  scene.add(rim)
  const loader = createGltfSource(() => renderer, undefined, decoderRoot)
  if (!loader.parse) throw new Error('The model parser is unavailable')
  const character = await loader.parse(model, '')
  scene.add(character)
  scene.updateMatrixWorld(true)
  const bones: Bone[] = []
  character.traverse(o => {
    if (o instanceof Bone) bones.push(o)
  })
  const rest = new Map(
    bones.map(b => [
      b.name,
      {
        local: b.quaternion.clone(),
        pos: b.position.clone(),
        world: b.getWorldQuaternion(new Quaternion()),
      },
    ]),
  )
  const foundHip = bones.find(b => b.name === 'Hips')
  if (!foundHip) throw new Error('The character must have a Hips bone')
  const hip = foundHip
  const bounds = () => {
    scene.updateMatrixWorld(true)
    const box = new Box3()
    const point = new Vector3()
    character.traverse(o => {
      if (!(o instanceof Mesh)) return
      if (o instanceof SkinnedMesh) o.skeleton.update()
      for (let i = 0; i < o.geometry.attributes.position.count; i++) {
        o.getVertexPosition(i, point)
        box.expandByPoint(point.applyMatrix4(o.matrixWorld))
      }
    })
    return box
  }
  const restBounds = bounds(),
    restHeight = restBounds.max.y - restBounds.min.y
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.001, restHeight * 100)
  // Held rather than allocated per pose: `framePose` fills it before every read.
  const direction = new Vector3()
  const restore = () => {
    for (const b of bones) {
      const saved = rest.get(b.name)
      if (!saved) continue
      b.quaternion.copy(saved.local)
      b.position.copy(saved.pos)
    }
    scene.updateMatrixWorld(true)
  }

  async function render({ animationUrl, name, poster }: AnimationThumbnailRequest) {
    const shown = poster ?? {}
    restore()
    const source = await loader.loadAnimation(animationUrl)
    let mixer: AnimationMixer | undefined
    try {
      source.updateMatrixWorld(true)
      const refs = new Map<string, { o: Object3D; world: Quaternion }>()
      source.traverse(o => {
        if (o.name) refs.set(o.name, { o, world: o.getWorldQuaternion(new Quaternion()) })
      })
      const names = retargetPlanOf(wireBonesOf(character), wireBonesOf(source), []).names
      const clip = source.animations[0]
      if (!clip) throw new Error(`No clip in ${name}`)
      const sourceHip = refs.get(names.Hips ?? 'Hips')
      if (!sourceHip) throw new Error(`Hips missing in ${name}`)
      // Aliased, as `hip` is above: the narrowing is what the nested pose helpers read.
      const sh = sourceHip

      const scale = skeletonScaleOf(character, source)
      mixer = new AnimationMixer(source)
      const action = mixer.clipAction(clip)
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
      action.play()
      const playing = mixer
      const sample = (f: number) => {
        playing.setTime(Math.min(Math.max(0, f) * clip.duration, clip.duration - 1e-6))
        source.updateMatrixWorld(true)
      }
      const yaw = () => yawOf(sh.o.getWorldQuaternion(new Quaternion()), sh.world)
      sample(0)
      const initialYaw = yaw(),
        startY = sh.o.getWorldPosition(new Vector3()).y
      const start = new Map(
        [...refs].map(([n, r]) => [n, r.o.getWorldQuaternion(new Quaternion())]),
      )
      // 🛑 Reached only by a clip NOBODY has described: a shipped one settles where to stop, and
      // is never sampled. A step is read in the legs — scoring a walk on its head would pick the
      // frame where it looks around rather than the one where it strides.
      function poseScore(): number {
        let score = 0
        for (const joint of STEP_JOINTS) {
          // `refs` and `start` are keyed by SOURCE names, a poster's joints by the character's:
          // read one of them untranslated and a Mixamo clip scores against its bind pose.
          const from = names[joint] ?? joint
          const r = refs.get(from)
          if (r)
            score += r.o.getWorldQuaternion(new Quaternion()).angleTo(start.get(from) ?? r.world)
        }
        return score
      }
      const chosen = poseFractionOf(shown.at, preset.samples, fraction => {
        sample(fraction)
        return poseScore()
      })
      sample(chosen)
      function applyPose(): void {
        const correction = new Quaternion().setFromAxisAngle(
          new Vector3(0, 1, 0),
          shown.square ? -initialYaw : 0,
        )
        const desired = new Map<string, Quaternion>()
        for (const b of bones) {
          const saved = rest.get(b.name)
          if (!saved) continue
          const r = refs.get(names[b.name] ?? b.name),
            parent =
              (b.parent instanceof Bone
                ? desired.get(b.parent.name)
                : b.parent?.getWorldQuaternion(new Quaternion())) ?? new Quaternion()
          const world = r
            ? correction
                .clone()
                .multiply(r.o.getWorldQuaternion(new Quaternion()))
                .multiply(r.world.clone().invert())
                .multiply(saved.world)
            : parent.clone().multiply(saved.local)
          desired.set(b.name, world)
          b.quaternion.copy(parent.clone().invert().multiply(world))
        }
        hip.position.y =
          (rest.get('Hips')?.pos.y ?? 0) + (sh.o.getWorldPosition(new Vector3()).y - startY) * scale
      }
      applyPose()
      function framePose(): void {
        const box = bounds(),
          center = box.getCenter(new Vector3())
        direction.fromArray(shown.camera ?? preset.camera).normalize()
        camera.position.copy(center).addScaledVector(direction, restHeight * 5)
        camera.lookAt(center)
        camera.updateMatrixWorld(true)
        const span = Math.max(box.max.y - box.min.y, box.max.x - box.min.x) * preset.margin
        camera.left = camera.bottom = -span / 2
        camera.right = camera.top = span / 2
        camera.updateProjectionMatrix()
      }
      framePose()
      renderer.render(scene, camera)
      return {
        png: new Uint8Array(
          await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
        ),
      }
    } finally {
      mixer?.stopAllAction()
      if (mixer) mixer.uncacheRoot(source)
      disposeTree(source)
      restore()
    }
  }
  return {
    render,
    dispose() {
      disposeTree(character)
      loader.dispose()
      renderer.dispose()
    },
    canvas,
  }
}
