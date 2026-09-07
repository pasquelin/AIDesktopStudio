import {
  Camera,
  OrthographicCamera,
  PerspectiveCamera,
  type Object3D,
  Raycaster,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three'
import type { ViewportCamera } from '../viewport/ViewportEngine'
import type { VisualFrame } from './visualRegression'
import type { RuntimeRenderCamera } from './runtimeRepresentationValidation'
import {
  sceneRuntimeSnapshot,
  type RenderedRuntimeSnapshot,
  type RuntimeValidationPick,
} from './sceneRuntimeSnapshot'
import { nodeIdOf, withEveryLayer } from './sceneRendererSupport2'
import { SceneRendererOptimization } from './SceneRendererOptimization'
import { readRenderPixels } from './readRenderPixels'

const VALIDATION_PICK_SAMPLES = 32

export abstract class SceneRendererValidation extends SceneRendererOptimization {
  private readonly runtimeValidationPicks = new Map<string, RuntimeValidationPick[]>()

  async captureRuntimeValidationFrame(spec: RuntimeRenderCamera): Promise<VisualFrame> {
    const gl = this.viewport.gl
    if (!gl) throw new Error('this scene has no viewport mounted for runtime validation')
    this.regroupInstances()
    const camera = validationCamera(spec)
    const target = new WebGLRenderTarget(spec.width, spec.height)
    const restore = this.hideWorkshop(camera)
    try {
      this.viewport.drawScene({
        scene: this.viewport.scene,
        camera,
        surface: 'offscreen',
        paneIndex: 0,
        cameraNodeId: spec.id,
        target,
        rect: null,
        width: spec.width,
        height: spec.height,
      })
      const pixels = readRenderPixels(gl, target, spec.width, spec.height)
      this.observeRuntimeValidationPicks(spec.id, camera)
      return { width: spec.width, height: spec.height, pixels }
    } finally {
      gl.setRenderTarget(null)
      target.dispose()
      this.post?.releaseSurface('offscreen')
      restore()
    }
  }

  runtimeValidationSnapshot(): RenderedRuntimeSnapshot {
    this.regroupInstances()
    this.viewport.scene.updateMatrixWorld(true)
    const logical = sceneRuntimeSnapshot({
      nodes: this.documentOrder,
      selectedIds: [],
      world: this.world,
      animation: this.timeline,
    })
    return {
      ...logical,
      picking: { logical: logical.picking, rendered: [...this.runtimeValidationPicks] },
      shadows: {
        logical: logical.shadows,
        rendered: this.documentOrder.map(node => ({
          id: node.id,
          cast: this.objects.get(node.id)?.castShadow ?? false,
          receive: this.objects.get(node.id)?.receiveShadow ?? false,
        })),
      },
      cameras: {
        logical: logical.cameras,
        rendered: this.documentOrder.flatMap(node => {
          const object = this.objects.get(node.id)
          return node.type === 'camera' && object instanceof Camera
            ? [{ id: node.id, projection: object.projectionMatrix.toArray() }]
            : []
        }),
      },
      visibility: {
        logical: logical.visibility,
        rendered: this.documentOrder.map(node => ({
          id: node.id,
          visible: this.objects.get(node.id)?.visible ?? false,
        })),
      },
      transforms: {
        logical: logical.transforms,
        rendered: this.documentOrder.map(node => ({
          id: node.id,
          matrix: this.objects.get(node.id)?.matrixWorld.toArray() ?? null,
        })),
      },
    }
  }

  private observeRuntimeValidationPicks(id: string, camera: ViewportCamera): void {
    const objects = [...this.objects].map(([nodeId, object]) => ({
      id: nodeId,
      object,
      point: object.getWorldPosition(new Vector3()),
    }))
    const occupancy = new Map<string, number>()
    for (const { point } of objects) {
      const key = `${point.x}:${point.y}:${point.z}`
      occupancy.set(key, (occupancy.get(key) ?? 0) + 1)
    }
    const unambiguous = objects.filter(
      ({ point }) => occupancy.get(`${point.x}:${point.y}:${point.z}`) === 1,
    )
    this.runtimeValidationPicks.set(id, this.pickSamples(unambiguous, camera))
  }

  private pickSamples(
    objects: readonly { id: string; object: unknown; point: Vector3 }[],
    camera: ViewportCamera,
  ): RuntimeValidationPick[] {
    const stride = Math.max(1, Math.floor(objects.length / VALIDATION_PICK_SAMPLES))
    const targets = [
      ...[...this.objects.values()].filter(object => !this.instances.holdsSource(object)),
      // The LOTS, never `editorPickable()`: below the adaptive threshold that answers the very
      // sources the unoptimised scene draws, so the recipe would compare a thing to itself. What
      // can lie is a slot standing for a node, and this is the only proof of it on a real scene.
      ...this.instances.pickable(),
    ]
    const raycaster = withEveryLayer(new Raycaster())
    return objects
      .filter((_entry, index) => index % stride === 0)
      .slice(0, VALIDATION_PICK_SAMPLES)
      .flatMap(({ id, point }) => this.pickedNode(id, point, camera, raycaster, targets))
  }

  private pickedNode(
    sample: string,
    point: Vector3,
    camera: ViewportCamera,
    raycaster: Raycaster,
    targets: Object3D[],
  ): RuntimeValidationPick[] {
    const ndc = point.clone().project(camera)
    if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || Math.abs(ndc.z) > 1) return []
    raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera)
    const hit = raycaster.intersectObjects(targets, true)[0]
    const resolved = hit
      ? (this.instances.nodeIdOf(hit) ?? nodeIdOf(hit.object, name => this.objects.has(name)))
      : null
    return [{ sample, resolved }]
  }
}

function validationCamera(spec: RuntimeRenderCamera): ViewportCamera {
  const aspect = spec.width / spec.height
  const size = spec.orthographicSize ?? 10
  const camera =
    spec.projection === 'orthographic'
      ? new OrthographicCamera(
          -(size * aspect) / 2,
          (size * aspect) / 2,
          size / 2,
          -size / 2,
          spec.near,
          spec.far,
        )
      : new PerspectiveCamera(spec.fieldOfView ?? 50, aspect, spec.near, spec.far)
  camera.position.set(spec.position.x, spec.position.y, spec.position.z)
  camera.lookAt(spec.target.x, spec.target.y, spec.target.z)
  return camera
}
