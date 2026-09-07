import { type BufferGeometry } from 'three'
import { forgetDress } from './paneDress'
import { EMPTY_STATS, statsOf } from './sceneStats'
import { drivenNodes } from './animationEval'
import { behavioralGroupingExclusions, groupingExclusions } from './grouping'
import './bvhPatches'
import { SceneRendererViews } from './SceneRendererViews'

export abstract class SceneRendererGrouping extends SceneRendererViews {
  protected abstract asDocumented<T>(run: () => T): T

  protected abstract syncSourceWalk(): void

  protected abstract readChildNodes(): void

  /**
   * Counts what the scene holds and what is selected, and says so.
   *
   * Called from `apply` and after a model lands: those are the two moments the count can change,
   * and counting per frame would walk every geometry sixty times a second for a number that
   * moves when a document is edited.
   */
  protected reportStats(): void {
    const report = this.options.onStats
    if (!report) return

    // Turned off means not COUNTED, never merely not shown: walking every geometry of the scene
    // is the cost this switch exists to give back.
    if (!this.view.stats) {
      report(EMPTY_STATS, EMPTY_STATS)
      return
    }

    // What the MODEL costs, so an isolation does not make the triangle count drop — `statsOf`
    // skips an invisible mesh, and hiding something to look past it is not making it cheaper.
    this.asDocumented(() => {
      // Sources of a grouped MODEL sit out of `holder.children`. Hung for the walk, then put
      // back: counting the lots as well would double the draws.
      this.instances.hangSources()
      try {
        // Only when the set moved. `apply` runs on every state change, a selection included, and
        // walking every geometry of the scene again for a number no selection can move was 12 % of
        // the CPU of one click on 8 000 nodes — measured 20/08. The selected side is walked every
        // time on purpose: it is bounded by what is selected, which is usually one thing.
        if (this.contentChanged) {
          this.modelStats = statsOf(this.objects.values())
          this.contentChanged = false
        }
        const selected = this.selectedIds.flatMap(id => this.objects.get(id) ?? [])
        report(this.modelStats, statsOf(selected))
      } finally {
        this.syncSourceWalk()
      }
    })
  }

  /**
   * Gives a geometry back to whichever cache lends it, and disposes it when none does.
   *
   * Two of them lend the same class of buffers — the shapes and the solids — and the same node
   * wears one then the other as it is carved. Disposing what a cache lends empties every
   * neighbour of the same shape, with every gate green.
   */
  protected freeGeometry(geometry: BufferGeometry): void {
    if (this.csg.owns(geometry)) return
    if (this.shapes.owns(geometry)) {
      this.shapes.release(geometry)
      return
    }
    geometry.dispose()
  }

  /**
   * Both passes a change of CONTENT makes stale — what the counters read, and how the repeated
   * shapes are grouped for drawing. One gesture because forgetting the second is silent: the
   * grouping is the only thing that ever gives a mesh back to the camera's layer.
   */
  protected markContentChanged(): void {
    this.contentChanged = true
    this.runtimeProfileStale = true
    this.groupingStale = true
    this.hangAll = true
    // Only a node leaving or being rebuilt can make the scene SMALLER, so that is the one event
    // the held box cannot survive.
    this.shadowBounds = null
  }

  /**
   * Draws the repeated shapes through one `InstancedMesh` per region.
   *
   * Its own pass, and out of `reportStats`: it lived past that method's two early returns, so
   * ten thousand copies were drawn one by one unless the statistics overlay happened to be on —
   * and a node moved while it was off left stale instances with the real meshes still hidden.
   *
   * Outside `asDocumented`, on purpose: the grouping reads `visible` off the objects, which is
   * exactly what that helper sets aside.
   */
  protected regroupInstances(): void {
    if (this.groupingStale) {
      this.groupingStale = false
      this.movedNodes.clear()
      // The world matrices are what a group COPIES, and nothing before here refreshes them: the
      // one pass that did is `tuneShadows`, which only runs when a light casts. Without this a
      // body of a fresh group was drawn at the origin.
      this.viewport.scene.updateMatrixWorld()
      // The sources that walk no longer reaches, composed against the parents it just wrote.
      this.instances.refreshSources()
      this.readChildNodes()
      const nodes = [...this.applied.values()]
      const excluded = this.options.grouping
        ? groupingExclusions(
            nodes,
            drivenNodes(this.timeline),
            this.options.grouping === 'batched' ? 'batch' : 'instance',
          )
        : behavioralGroupingExclusions(nodes, drivenNodes(this.timeline))
      const instanced = this.instances.rebuild(
        nodes,
        id => this.objects.get(id),
        excluded,
        this.runtimeArtifacts,
      )
      this.syncSourceWalk()
      // Read before the test, since asking CLEARS it: a lot the rebuild made must not leave the
      // flag standing for the next move to find.
      const built = this.instances.builtAnew?.() === true
      // Only when there are instances to dress: they are new objects wearing what their sources
      // wore, so a pane that believed the scene already dressed would leave them out of a solid
      // or a material view. An ordinary scene reaches no group and must pay nothing.
      if (instanced > 0 || built) forgetDress(this.paneMemory)
      return
    }
    if (this.movedNodes.size === 0) return

    // The moved nodes and what hangs from them, never the whole scene: refreshing all of it costs
    // the traversal of every source — 15 ms against 3 on 50 000 nodes, per typed placement,
    // measured 02/09.
    const moved = this.movedWithWhatHangsFromThem()
    for (const id of moved) this.objects.get(id)?.updateWorldMatrix(true, false)

    // Only the slots that moved. Their region's bounds are widened rather than recut, so the
    // culling stays conservative until the next real change of content puts them back exact.
    this.writeMovedSlots(moved)
    this.movedNodes.clear()
  }

  /**
   * Writes the slots of what moved, and dresses again if a promotion BUILT a lot doing it.
   *
   * 🛑 Both paths go through here, and the gizmo's is the one that matters: a drag never reaches
   * `regroupInstances`, so a lot born mid-gesture wore the document's material in a solid view
   * for the whole drag.
   */
  protected writeMovedSlots(ids: Iterable<string>): void {
    this.instances.moved(ids, id => this.objects.get(id))
    if (this.instances.builtAnew?.() === true) forgetDress(this.paneMemory)
  }

  /**
   * Every node whose place in the world the move changed — the moved ones, and their offspring.
   * `subtreesOf` answers the same question over the document; this one holds its index between
   * two moves, which is what a drag pays for at every pointer event.
   */
  protected movedWithWhatHangsFromThem(): Iterable<string> {
    if (this.childNodes.size === 0) return this.movedNodes
    return this.descendantsOf(this.movedNodes)
  }

  /**
   * These nodes and everything hanging under them, read off the DOCUMENT: since a body a group
   * draws for is held out of its parent's children, no walk of the objects can answer.
   *
   * Each id once, which is also what stops a `parentId` cycle from growing the list for ever.
   */
  protected descendantsOf(ids: Iterable<string>): string[] {
    const found = [...new Set(ids)]
    const seen = new Set(found)
    // Grown while it is walked, so a whole branch is reached without a second structure.
    for (let at = 0; at < found.length; at += 1) {
      const id = found[at]
      for (const child of (id && this.childNodes.get(id)) || []) {
        if (seen.has(child)) continue
        seen.add(child)
        found.push(child)
      }
    }
    return found
  }
}
