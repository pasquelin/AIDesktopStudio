import { describe, expect, it } from 'vitest'
import { SUITE_SOURCES, WRITTEN_SOURCES } from '@/components/testHarness'

const SCENE = [...WRITTEN_SOURCES, ...SUITE_SOURCES].filter(
  ([path]) => path.startsWith('../engines/scene/') && !path.endsWith('no-layer-for-a-line.test.ts'),
)

// The noun only: a move IS laid over another, and condemning the participle would condemn
// correct English.
const NOUN = /\blayer(s|ing)?\b/i

// Backticks name the vanished shot field rather than use the word. **Blind**: a lone backtick
// on a line pairs with the next one and could swallow a real offender — none exists today.
const stripQuoted = (source: string): string => source.replace(/`[^`\n]*`/g, '``')

/**
 * Where the word answers for something else, each with what it answers for. An entry joins WITH
 * its reason, never to make this green. **Blind**: the key is the STEM, so the suite beside a
 * spared module is spared too, and the drift can be written in any of them unread.
 */
const OTHER_SENSES: Record<string, string> = {
  sceneView: 'three.js `Layers`: which camera draws the overlays',
  paneDress: "a camera's own layer mask, read per pass",
  sceneDocument: 'the shot field that no longer exists, sorted once on read',
  sceneDocumentAnimation: 'the shot field that no longer exists, sorted once on read',
  gltfDocument: 'a layer of software — the file layer, and what MaterialX had one down',
  instancing: 'three.js `Layers`: the one the camera skips once an instance draws the mesh',
  batching: 'three.js `Layers`: the same one, once a lot draws the mesh',
  cellInstancing: 'three.js `Layers`: the same one again, once a cell of the world draws it',
  cellInstancingDynamics:
    'three.js `Layers`: the same one again, once a cell of the world draws it',
  grouping: 'three.js `Layers`: the constant itself, which both strategies share',
  groupingPicking: 'three.js `Layers`: grouped sources remain available to the editor raycaster',
  optimizedGrouping: 'three.js render layers used by both runtime grouping strategies',
  modelInstancing: 'three.js `Layers`: the one the camera skips once an instance draws the mesh',
  SceneRendererGrouping:
    'three.js `Layers`: the raycasters read the one instancing hides meshes on',
  SceneRendererState: 'three.js `Layers`: the raycasters read the one instancing hides meshes on',
  SceneRendererWorld: 'three.js `Layers`: the raycasters read the one instancing hides meshes on',
  sceneRendererSupport2:
    'three.js `Layers`: the raycasters read the one instancing hides meshes on',
  sceneTimeline: 'the shot field that no longer exists, sorted once on read',
  worldAnalyzer: 'three.js `Layers`: the analyzer excludes a source another representation draws',
  sceneWorld: 'World relief: a heightmap the scene holds, not a timeline line',
  reliefSurface: 'World relief: a heightmap the scene holds, not a timeline line',
  reliefCommands: 'World relief: sculpt deltas on a heightmap, not a timeline line',
  scatterCommands: 'World scatter: a placement layer, not a timeline line',
  worldLayerCommands: 'World scatter: the shared layer list, not a timeline line',
  scatterSurface: 'World scatter: instanced props, not a timeline line',
  scatterSurfaceRewrite: 'World scatter: a prop model rewritten under a layer, not a timeline line',
  reliefSculptor: 'World relief: sculpt deltas on a heightmap, not a timeline line',
  reliefReadCost: 'World relief: the heightmap layer a surface is built from, not a timeline line',
  sceneRendererRelief: 'World relief: applyWorld reads world.layers, not a timeline line',
  SceneRendererLifecycle:
    'World relief: `apply` compares world.layers to know a shadow pass is owed',
  SceneRendererSculpt: 'World relief: which heightmap a stroke writes, not a timeline line',
  sceneSurfacePaint: 'World relief and scatter surfaces, not timeline lines',
  sceneGroundPaintSession: 'World relief ground paint, not a timeline line',
  reliefGroundMaterial: 'World relief ground material, not a timeline line',
  reliefMaskOverlay: 'World relief: painted mask on a heightmap, not a timeline line',
  reliefSplatShader: 'World relief material layers, not timeline lines',
  SceneRendererOptimization: 'Three.js visibility layers shared by objects and cameras',
  'scene-renderer-relief':
    'World relief: the edit layers a sculptor is held for, not a timeline line',
  'scene-renderer-sculpt': 'World relief: the terrain a stroke is armed on, not a timeline line',
  clipSources: 'An animation GRAPH stacks layers — the state machine word, not a band line',
  reliefStroke: 'World relief: which heightmap a stroke writes, not a timeline line',
  sceneRendererStroke: 'World relief: the terrain a drag paints, not a timeline line',
}

const stemOf = (path: string): string => (path.split('/').pop() ?? '').split('.')[0] ?? ''

const spared = (path: string): boolean => stemOf(path) in OTHER_SENSES

// Cameras stack on a `line`, a model's blocks lie in a `lane`; the word this studio spends on
// the image stack and on three.js is neither.
describe('a band has lines and lanes', () => {
  it('never calls one a layer', () => {
    const offenders = SCENE.filter(
      ([path, source]) => !spared(path) && NOUN.test(stripQuoted(source)),
    ).map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('keeps no reason for a file that has stopped saying it', () => {
    const stale = Object.keys(OTHER_SENSES).filter(
      stem => !SCENE.some(([path, source]) => stemOf(path) === stem && NOUN.test(source)),
    )

    expect(stale).toEqual([])
  })
})
