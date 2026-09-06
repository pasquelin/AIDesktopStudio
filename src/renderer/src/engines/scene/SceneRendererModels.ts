import { Object3D, type AnimationClip } from 'three'
import { type ClipLane } from '@shared/domain/scene'
import { receivesShadow, type ModelNode } from './sceneState'
import { createModelTextures } from './modelTextures'
import { reportFailure } from '@/services/diagnostics'
import { clipLengthsOf, clipNamesOf, clipsOf, foreignClipsOf, type ForeignClip } from './animation'
import { rigStateOf } from './rigState'
import { instanceableOf, markInstanceable } from './instanceableModel'
import { instanceOf, modelKeyOf } from './modelCache'
import { morphNamesOf, setMorphInfluencesOn } from './modelMorphs'
import { applyShadowFlags } from './shadows'
import type { Rig } from '@shared/domain/rig'
import type { HumanoidRole } from '@shared/domain/humanoid'
import { skeletonTopologySignatureOf } from '@shared/domain/skeletonProfile'
import { clipFromWire, rigProfileOf, wireBonesOf, wireClipOf } from './retarget'
import type { WireBone, WireClip } from './retargetMessage'
import { characterOf } from './rigRead'
import { meshSampleOf } from './rigSnap'
import './bvhPatches'
import { SceneRendererGeometry } from './SceneRendererGeometry'
export abstract class SceneRendererModels extends SceneRendererGeometry {
  /** A copy of the loaded motion data; callers cannot pose the live skeleton through it. */
  inspectMotion(nodeId: string): { bones: WireBone[]; clips: WireClip[] } | null {
    const object = this.objects.get(nodeId)
    if (!object || !this.animations.has(nodeId)) return null
    return { bones: wireBonesOf(object), clips: this.animations.clipsOf(nodeId).map(wireClipOf) }
  }

  /** Installs a session clip under a revision-specific key, on the model's existing mixer. */
  installMotion(nodeId: string, key: string, clip: WireClip): boolean {
    if (!this.animations.has(nodeId)) return false
    this.animations.addClip(nodeId, key, clipFromWire(clip))
    return true
  }

  removeMotion(nodeId: string, key: string): void {
    this.animations.removeClip(nodeId, key)
  }

  protected abstract tuneShadowsIfMoved(): void
  protected abstract applyDisplay(object: Object3D): void
  protected abstract accelerateOrReport(object: Object3D, subject: string): Promise<void>
  /** Weighs the morph targets of a model, by name — a preview. Answers how many the model carries. */
  setMorphInfluences(nodeId: string, weights: Readonly<Record<string, number>>): number {
    const holder = this.objects.get(nodeId)
    const written = holder === undefined ? 0 : setMorphInfluencesOn(holder, weights)
    if (written > 0) this.redraw()
    return written
  }

  /**
   * A model arrives long after the frame that asked for it, so what goes into the scene now is
   * an empty holder the file fills in. The alternative — adding nothing until it lands — leaves
   * a node the outliner lists, the gizmo cannot find, and a click cannot select.
   */
  protected buildModel(node: ModelNode): Object3D {
    const holder = new Object3D()
    const { assetId } = node.model
    void this.loadModelInto(node, holder, assetId)
    return holder
  }

  private async loadModelInto(node: ModelNode, holder: Object3D, assetId: string): Promise<void> {
    const key = modelKeyOf(assetId, this.options.assetVersion?.(assetId))
    // Noted BEFORE the acquire: released while the read is in flight, `release` must know the key.
    this.modelKeys.set(node.id, key)
    const [source] = await Promise.all([
      this.modelCache.acquire(key),
      this.options.prepareModelDress?.(assetId),
    ])
    // A freshness test and nothing more: `release` owns the reference, as `clear` does in
    // `material-textures`. Letting go here too would drop the count twice, and free a source
    // another node is still cloning.
    if (this.objects.get(node.id) !== holder || !source) return
    holder.add(instanceOf(source))
    // Here rather than in `syncNode`: what arrives lands after the sync that built the holder,
    // and the next one skips an unchanged node — the model would throw nothing until edited.
    const applied = this.applied.get(node.id) ?? node
    const sceneTask1Step1 = () => {
      const sceneTask1Step1 = () => {
        // The instance, never the cached source: its materials are shared with every other node
        // built from the same file, and `createModelTextures` is what clones them before writing.
        const maps = createModelTextures(
          this.textureCache,
          holder,
          () => this.redraw(),
          () =>
            reportFailure(
              'scene.texture',
              assetId,
              new Error('this model carries no material a map can be written into'),
            ),
        )
        this.modelMaps.set(node.id, maps)
        this.options.onMaterials?.(
          node.id,
          maps.count(),
          maps.names(),
          maps.parts(),
          maps.hasFileTextures(),
          maps.sourceIndices(),
        )
        this.options.onMorphs?.(node.id, morphNamesOf(holder))
        const sceneTask1Step2 = () => {
          this.dressModel(node.id)
          // The clips come from the cached SOURCE rather than the clone: `Object3D.copy` does not
          // carry them, and a clip addresses its targets by name — so the source's drive any
          // instance built from it.
          this.animations.add(node.id, holder, clipsOf(source))
          if (applied.type === 'model') {
            this.animations.apply(node.id, applied.model.lanes ?? [])
            this.ensureBundled(node.id, applied.model.lanes ?? [])
          }
          const sceneTask1Step3 = () => {
            this.options.onClips?.(node.id, clipNamesOf(source), clipLengthsOf(source))
            // The document's own rig, put back on. Its weights are NOT saved with it — they are derived
            // from mesh and rig, like a BVH — so they are worked out again on every load. The skeleton
            // is reported before that finishes: a rig that takes a minute to bind still has bones the
            // inspector can name at once.
            // Read once and used twice: whether this model has bones at all is the same question the
            // helper asks, and answering it in two places is how the two came to disagree. The COUNT
            // and not the named ones — an export that stripped joint names still has a rig to draw.
            const clips = clipsOf(source)
            const rig = rigStateOf(holder, clips)
            const sceneTask1Step4 = () => {
              if (applied.type === 'model')
                markInstanceable(holder, instanceableOf(applied, rig, clips))
              this.bindSkeleton(node.id, holder, rig.boneCount > 0)
              this.options.onRig?.(node.id, rig)
              const sceneTask1Step5 = () => {
                // Read off the very object that just landed: the skeleton window edits the FILE, and
                // decoding it a second time to read its bones would pay for a million triangles twice.
                const { rig: carried, extras } = characterOf(holder)
                this.options.onCharacter?.(node.id, carried, extras, meshSampleOf(rig))
                // 🛑 Before anything is retargeted onto it: the FILE is where a bone's role was put right,
                // and a motion laid on a skeleton nobody has read plays on the wrong joints.
                if (carried) this.learnRig(carried, extras?.roles)
                const sceneTask1Step6 = () => {
                  // The bones arrive a tick after the sync that laid the timeline over the scene, so a track
                  // on one of them would drive nothing at all until the next edit.
                  this.applyPoses()
                  applyShadowFlags(
                    holder,
                    applied.castShadow,
                    receivesShadow(applied),
                    this.belongsToAnotherNode,
                  )
                  // The count is a count of what is really there: a model's triangles arrive with its file,
                  // which is a tick after the `apply` that asked for it. It is also what the scene now
                  // OCCUPIES, so the lights are re-cut against a set that just grew by a whole model.
                  this.markContentChanged()
                  const sceneTask1Step7 = () => {
                    this.placementChanged = true
                    this.tuneShadowsIfMoved()
                    this.regroupInstances()
                    const sceneTask1Step8 = () => {
                      this.reportStats()
                      // Same reason, same place: what the file brought was not there when the mode was applied,
                      // and a model landing into a wireframe scene would be the one thing still drawn shaded.
                      if (this.needsEdges()) this.applyDisplay(holder)
                      // A dense model is what makes a click cost a frame — measured in `scenePicking.bench.ts`.
                      // Off the UI thread, and after the render: the viewport shows the file before the tree.
                      this.redraw()
                      const sceneTask1Step9 = () => {
                        void this.accelerateOrReport(holder, assetId)
                      }
                      return sceneTask1Step9()
                    }
                    return sceneTask1Step8()
                  }
                  return sceneTask1Step7()
                }
                return sceneTask1Step6()
              }
              return sceneTask1Step5()
            }
            return sceneTask1Step4()
          }
          return sceneTask1Step3()
        }
        return sceneTask1Step2()
      }
      return sceneTask1Step1()
    }
    return sceneTask1Step1()
  }
  /** Loads again every model whose file moved since it was read — the door `useShelfRefresh` pushes. */
  refreshModels(): void {
    const stale = this.staleModels()
    if (stale.length === 0) return
    for (const node of stale) {
      this.release(node.id)
      this.syncNode(node)
    }
    // `release` unhung the old holder with the children under it, and `syncNode` hangs the new one
    // from the scene: the second pass of `apply` — for the reloaded models and their children only.
    const reloaded = new Set(stale.map(node => node.id))
    for (const node of this.applied.values()) {
      if (reloaded.has(node.id) || (node.parentId !== null && reloaded.has(node.parentId)))
        this.hangFromParent(node)
    }
    this.hangAll = false
    // The gizmo holds the OBJECT it was aimed at, and a selected model's holder just went.
    this.attachGizmo()
  }

  /**
   * The models whose file moved since they were read. Pushed on every relisting of the shelf, so
   * the common case allocates nothing: the version is asked once per asset, the stale alone kept.
   */
  private staleModels(): ModelNode[] {
    const fresh = new Map<string, string>()
    const stale: ModelNode[] = []
    for (const [id, held] of this.modelKeys) {
      const node = this.applied.get(id)
      if (node?.type !== 'model') continue
      const { assetId } = node.model
      const key = fresh.get(assetId) ?? modelKeyOf(assetId, this.options.assetVersion?.(assetId))
      fresh.set(assetId, key)
      if (key !== held) stale.push(node)
    }
    return stale
  }
  /** Told once per skeleton, not per model: it is filed by what its bones ARE. */
  protected learnRig(rig: Rig, corrected?: Readonly<Record<string, HumanoidRole>>): void {
    const roles: Record<string, HumanoidRole> = { ...corrected }
    for (const bone of rig.bones) if (bone.role) roles[bone.name] = bone.role
    if (Object.keys(roles).length === 0) return
    const signature = skeletonTopologySignatureOf(rig.bones)
    const profile = rigProfileOf(signature, roles, this.retarget.profileOf(signature))
    this.retarget.remember(profile)
    // Out to whoever keeps them: a mapping put right in one document is the same mapping the
    // next document of this project needs, and the port dies with the viewport.
    this.options.onProfile?.(profile)
  }
  /**
   * The clips a running game's state machine needs on this model, beside whatever its band names.
   * An empty list gives them back, which is what stopping a game does.
   *
   * 🛑 Asked before the mixer exists, `ensureBundled` waits: a key taken then was never adopted,
   * and the later load skipped it as already held.
   */
  useGraphClips(nodeId: string, clips: readonly ForeignClip[]): void {
    if (clips.length === 0) this.graphClips.delete(nodeId)
    else this.graphClips.set(nodeId, clips)
    this.ensureBundled(nodeId, this.animations.lanesOf(nodeId))
  }

  /**
   * Loads whatever clips a model's blocks name that its own file did not bring, once each, and
   * lets go of the ones no block names any more. Called wherever lanes are applied: a block can
   * be dropped long after the file it plays on landed.
   */
  protected ensureBundled(nodeId: string, lanes: readonly ClipLane[]): void {
    // Mixer not here yet: keep the asked keys, load them from `buildModel` once it is.
    if (!this.animations.has(nodeId)) return
    const held = this.bundled.get(nodeId) ?? new Map<string, string>()
    this.bundled.set(nodeId, held)
    // 🛑 The band's clips AND the state machine's, in one list: they share this node's holdings,
    // and either one asked for on its own would release what the other had just taken.
    const wanted = new Map(
      [...foreignClipsOf(lanes), ...(this.graphClips.get(nodeId) ?? [])].map(clip => [
        clip.key,
        clip,
      ]),
    )
    for (const clip of wanted.values()) {
      if (held.has(clip.key)) continue
      // Acquired HERE and not inside the adoption: released while the read is still in flight,
      // a reference taken afterwards would never be given back.
      held.set(clip.key, clip.url)
      const requests = this.retargeting.get(nodeId) ?? new Map<string, AbortController>()
      this.retargeting.set(nodeId, requests)
      const stop = new AbortController()
      requests.set(clip.key, stop)
      void this.adopt(nodeId, clip, this.clipSources.acquire(clip.url), stop)
    }
    for (const [key, url] of [...held]) {
      if (wanted.has(key)) continue
      this.retargeting.get(nodeId)?.get(key)?.abort()
      this.retargeting.get(nodeId)?.delete(key)
      held.delete(key)
      this.animations.removeClip(nodeId, key)
      this.clipSources.release(url)
    }
  }
  /**
   * Replays a clip the model's own file never held on THIS model's skeleton, which is the whole
   * point: it was authored for a rig nobody here has.
   */
  protected async adopt(
    nodeId: string,
    clip: ForeignClip,
    loading: Promise<Object3D | null>,
    stop: AbortController,
  ) {
    const holder = this.objects.get(nodeId)
    if (!holder) return
    try {
      // Nothing of the source ever enters the scene: a file dropped for its animation carries a
      // whole character with it, and only its skeleton is any use here.
      const source = await loading
      if (!source || stop.signal.aborted || this.objects.get(nodeId) !== holder) return
      const selected = clipsOf(source)[clip.clipIndex ?? 0]
      if (!selected) throw new Error('the selected animation does not exist in this file')
      // Before the retarget and not after: it is the only moment both skeletons are in hand, and
      // it is what lets the screen say WHICH joint the motion has nothing to drive.
      this.options.onClipFit?.(nodeId, clip.key, this.retarget.fitOf(holder, source))
      const adapted = await this.retarget.adapt(holder, source, [selected], { signal: stop.signal })
      if (!adapted?.[0] || stop.signal.aborted || this.objects.get(nodeId) !== holder) return
      this.publishMotion(nodeId, clip, adapted[0])
    } catch (error) {
      // Under a scope of its own: a failing animation must not swallow what a failing model says.
      if (!stop.signal.aborted) reportFailure('scene.animation', clip.url, error)
    } finally {
      const requests = this.retargeting.get(nodeId)
      if (requests?.get(clip.key) === stop) requests.delete(clip.key)
    }
  }
  private publishMotion(nodeId: string, clip: ForeignClip, adapted: AnimationClip): void {
    const named = adapted.clone()
    named.name = clip.label
    this.animations.addClip(nodeId, clip.key, named)
    this.options.onClips?.(
      nodeId,
      this.animations.fileNamesOf(nodeId),
      this.animations.lengthsOf(nodeId),
    )
    this.redraw()
  }
}
