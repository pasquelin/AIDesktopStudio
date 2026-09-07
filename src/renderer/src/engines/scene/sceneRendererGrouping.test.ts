import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'

/**
 * What decides whether the repeated shapes are drawn in one call or ten thousand.
 *
 * Read as text for the reason `sceneRendererRedraw` is: the engine cannot be built without a
 * WebGL context, and this is the ABSENCE of a call — the grouping used to live inside
 * `reportStats`, past its two early returns, so it ran only while the statistics overlay was on.
 * Every gate stayed green on that: the instances were correct whenever they existed at all.
 */
describe('SceneRenderer and the grouping of repeated shapes', () => {
  const body = (name: string): string =>
    new RegExp(`protected ${name}\\([^)]*\\): [\\w<>[\\]| ]+ \\{[\\s\\S]*?\\n {2}\\}`).exec(
      source,
    )?.[0] ?? ''
  const privateBody = (name: string): string =>
    new RegExp(`private ${name}\\([\\s\\S]*?\\): [\\w<>[\\]| ]+ \\{[\\s\\S]*?\\n {2}\\}`).exec(
      source,
    )?.[0] ?? ''

  it('groups outside the switch that only turns the counters off', () => {
    // Turning statistics off gives back a walk over every geometry. It must not also stop the
    // scene being drawn in one call, and it must not leave meshes hidden with nothing drawing
    // them — `rebuild` is the only thing that ever hands a mesh back to the camera.
    expect(body('reportStats')).not.toContain('instances.rebuild')
    expect(body('regroupInstances')).toContain('instances.rebuild')
    expect(body('regroupInstances')).not.toContain('view.stats')
  })

  it('uses the combined optimizer for the default spatial strategy', () => {
    expect(source).toContain(
      "if (!options.grouping && options.partition !== 'off') return createOptimizedGroups",
    )
  })

  it('groups against the visibility the viewport really shows', () => {
    // `asDocumented` puts an isolation aside for the length of a call. The grouping reads
    // `visible` off the objects, so run under it, an isolated scene would come back drawn.
    expect(body('regroupInstances')).not.toContain('asDocumented')
  })

  it('keeps timeline-driven nodes out of a static batch', () => {
    expect(body('regroupInstances')).toContain('drivenNodes(this.timeline)')
    expect(body('regroupInstances')).toContain('behavioralGroupingExclusions')
  })

  it('answers a node that only moved without grouping everything again', () => {
    // A rebuild of 40 000 nodes costs 32.7 ms; rewriting the slots that moved costs 3.5 µs. Both
    // paths live here, and a `regroupInstances` that lost one would silently take the other.
    expect(body('regroupInstances')).toContain('instances.rebuild')
    expect(body('regroupInstances')).toContain('this.writeMovedSlots')
  })

  it('dresses again whatever a move BUILT, on the gizmo path as on the document one', () => {
    // A drag never reaches `regroupInstances`: `onGizmoChange` writes the slots itself. A lot
    // born of a promotion mid-gesture wore the document's material through a whole solid view.
    expect(body('writeMovedSlots')).toContain('instances.moved')
    expect(body('writeMovedSlots')).toContain('builtAnew')
    expect(source).toContain('this.writeMovedSlots(this.descendantsOf(this.selectedIds))')
  })

  it('never lets a changed node mark neither the grouping nor its own slot', () => {
    // Marked as neither, a node keeps the matrix the last grouping wrote — it stands where it
    // stood, and nothing rebuilds it. `syncNode` is the one place that may tell the two apart.
    const settled = source
      .replace(body('markContentChanged'), '')
      .replace(body('syncNode'), '')
      .replace(privateBody('noteWhatMoved'), '')
      .split('\n')
      .map((line, at) => ({ line: line.trim(), at: at + 1 }))
      .filter(({ line }) => line === 'this.contentChanged = true')

    expect(settled).toEqual([])
    expect(body('syncNode')).toContain('this.noteWhatMoved(previous, node)')
    expect(privateBody('noteWhatMoved')).toContain('keepsItsGroup')
    expect(privateBody('noteWhatMoved')).toContain('this.movedNodes.add')
    expect(body('markContentChanged')).toContain('this.groupingStale = true')
  })

  it('leaves the grouping to choose what a click is cast against', () => {
    expect(body('nodeAt')).toContain('!this.instances.holdsSource(object)')
    expect(body('nodeAt')).toContain('this.instances.editorPickable()')
    expect(body('nodeAt')).not.toContain('this.instances.pickable()')
    expect(body('nodeAt')).toContain('this.instances.nodeIdOf(hit) ??')
    expect(body('nodeAt')).not.toContain('bakedSourceIdOf')
  })

  it('proves the LOTS in the runtime recipe, the one representation that can lie', () => {
    // Below the adaptive threshold `editorPickable()` answers the sources the unoptimised scene
    // already draws: aimed at those, the recipe would compare a thing to itself and pass.
    const samples = /private pickSamples\([\s\S]*?\n {2}\}/.exec(source)?.[0] ?? ''
    expect(samples).toContain('this.instances.pickable()')
    expect(samples).not.toContain('this.instances.editorPickable()')
  })

  it('tells the zone where the camera stands before the pane it is about to draw', () => {
    // The one call of the grouping contract a FRAME makes, and the answer is what asks for the
    // shadow maps again — a cell that just entered the zone was never drawn into them.
    // The throw goes with it: what the zone hides for the camera, it hides for the light too.
    expect(body('dressPane')).toContain('this.instances.follow?.(camera, this.shadowThrow)')
  })

  it('names its camera to the zone on every surface that is not a pane', () => {
    // The preview comes through `hideWorkshop` on EVERY frame it is shown. Opened in full for it,
    // the whole level went back into the scene and out of it again twice a frame, and its shadow
    // maps had been drawn for another zone. A film and a capture name none, and get every cell.
    expect(source).toContain('onInset: camera => this.hideWorkshop(camera)')
    expect(source).toContain('this.instances.follow?.(camera ?? null, this.shadowThrow)')
  })

  it('dresses the meshes it draws with, and not only the ones it stands for', () => {
    // A display mode REPLACES a mesh's material. The instance was left out of that walk, so
    // sixty-four copies drew shaded inside a solid view — and every gate stayed green.
    expect(body('dressPane')).toContain('this.dressable()')
    expect(source).toContain('yield* this.instances.drawn()')
    expect(body('regroupInstances')).toContain('forgetDress(this.paneMemory)')
  })
})
