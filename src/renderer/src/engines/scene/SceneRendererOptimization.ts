import { BatchedMesh, InstancedMesh, Mesh } from 'three'
import type { RuntimePerformance } from '@shared/domain/gameRuntime'
import { subtreesOf } from './sceneState'
import { geometryBytesOf, statsOf } from './sceneStats'
import { isDrawn } from './grouping'
import {
  analyzeOptimization,
  analyzeOptimizationAsync,
  type OptimizationPlan,
} from './worldAnalyzer'
import { SceneRendererSculpt } from './SceneRendererSculpt'

export abstract class SceneRendererOptimization extends SceneRendererSculpt {
  analyzeOptimization(ids: readonly string[]): OptimizationPlan {
    const nodes = ids.length === 0 ? this.documentOrder : subtreesOf(this.documentOrder, ids)
    return analyzeOptimization(
      { nodes, animation: this.timeline },
      this.viewport.scene,
      id => this.objects.get(id),
      undefined,
      this.documentOrder,
    )
  }

  async analyzeWorldOptimization(): Promise<OptimizationPlan> {
    return await analyzeOptimizationAsync(
      { nodes: this.documentOrder, animation: this.timeline },
      this.viewport.scene,
      id => this.objects.get(id),
      undefined,
      this.documentOrder,
    )
  }

  clearOptimizationCache(): void {
    this.instances.dispose()
    this.groupingStale = true
    this.redraw()
  }

  runtimePerformance(): Omit<RuntimePerformance, 'cpuFrameMs' | 'compilationMs'> {
    // Asking IS what arms the GPU timer: a query per frame is paid only while a panel reads it.
    this.viewport.wantsGpuTiming()
    this.refreshRuntimeProfile()
    const grouped = this.groupedPerformance()
    const ordinary = this.ordinaryPerformance()
    const visibleObjects = grouped.visible + ordinary.visible
    const totalObjects = grouped.total + ordinary.total
    return {
      drawCalls: this.viewport.stats.calls,
      renderMs: this.viewport.stats.renderMs,
      triangles: this.viewport.stats.triangles,
      vertices: this.runtimeModelStats.vertices,
      visibleObjects,
      culledObjects: Math.max(0, totalObjects - visibleObjects),
      instanceCount: grouped.instances,
      batchCount: grouped.batches,
      geometryBufferBytes: this.runtimeGeometryBytes,
      estimatedTextureBytes: this.runtimeModelStats.textureBytes,
      gpuFrameMs: this.viewport.stats.gpuFrameMs,
    }
  }

  private refreshRuntimeProfile(): void {
    if (!this.runtimeProfileStale) return
    this.runtimeModelStats = statsOf(this.objects.values())
    this.runtimeGeometryBytes = geometryBytesOf(this.objects.values())
    this.runtimeProfileStale = false
  }

  private groupedPerformance(): {
    visible: number
    total: number
    instances: number
    batches: number
  } {
    let visible = 0
    let total = 0
    let instances = 0
    let batches = 0
    this.updateProfileFrustum()
    for (const object of this.instances.drawn()) {
      const inField = this.isProfiledObjectVisible(object)
      if (object instanceof InstancedMesh) {
        instances += object.count
        total += object.count
        if (inField) visible += object.count
      } else if (object instanceof BatchedMesh) {
        batches += 1
        total += object.instanceCount
        if (inField) visible += object.instanceCount
      }
    }
    return { visible, total, instances, batches }
  }

  private ordinaryPerformance(): { visible: number; total: number } {
    let visible = 0
    let total = 0
    for (const object of this.objects.values()) {
      if (this.instances.holdsSource(object)) continue
      object.traverse(child => {
        if (!(child instanceof Mesh)) return
        total += 1
        if (this.isProfiledObjectVisible(child)) visible += 1
      })
    }
    return { visible, total }
  }

  private updateProfileFrustum(): void {
    const camera = this.viewport.camera
    this.profileFrustum.setFromProjectionMatrix(
      this.profileView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    )
  }

  /** Reads `profileFrustum`, which `runtimePerformance` refreshes before asking. */
  private isProfiledObjectVisible(object: Mesh): boolean {
    const camera = this.viewport.camera
    return (
      isDrawn(object, this.viewport.scene) &&
      object.layers.test(camera.layers) &&
      (!object.frustumCulled || this.profileFrustum.intersectsObject(object))
    )
  }
}
