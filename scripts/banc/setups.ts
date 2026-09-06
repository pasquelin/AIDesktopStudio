import type { RecentProject } from '@shared/domain/project'
import type { WorkspaceId } from '@shared/domain/workspace'
import { workshopIdOf } from '@shared/domain/character'
import { workshopScene } from '@/character/characterStage'
import { drawing } from '@/game/game-fixtures'
import { registerSceneEngine } from '@/stores/sceneEngines'
import { rigFit } from '@/engines/scene/rigFit'
import { seedCharacter, useCharacters } from '@/stores/character'
import { useJobs } from '@/stores/jobs'
import { useSettings } from '@/stores/settings'
import { useTasks } from '@/stores/tasks'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { useModelFiles } from '@/stores/modelFiles'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useDocuments } from '@/stores/documents'
import { useSceneViews } from '@/stores/sceneViews'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { SECOND } from './oracle'
import type { Studio } from './studio'

/**
 * The decors a section names in prose, laid out by the BENCH and never by the model: a scenario
 * scores ONE request, and making the model rebuild its section would score the same step forty
 * times. `batterie.test.ts` makes a decor the studio refuses red.
 */

const frontId = (studio: Studio): string => studio.front()?.id ?? ''

/**
 * 🛑 The shelf of recent projects, which the MAIN process writes and the bench fakes: seeded here
 * or `projects.list` answers an empty list, and the scenario measures nothing at all.
 */
export const shelved = (recent: readonly RecentProject[]): void => {
  useSettings.setState(state => ({
    settings: {
      ...state.settings,
      storage: { ...state.settings.storage, recentProjects: [...recent] },
    },
  }))
}

/** The id `assets.searchProjectCatalogue` would hand back for a file, so a decor can name one. */
export const assetOf = (studio: Studio, ending: string): string =>
  studio.assets().find(one => (one.path ?? '').endsWith(ending))?.id ?? ''

/** A document of that space, made and brought forward — what every decor starts from. */
export const opened =
  (workspace: WorkspaceId, title: string, more: Record<string, unknown> = {}) =>
  async (studio: Studio): Promise<void> => {
    await studio.run('workspace.open', { workspace, createDocument: true, title, ...more })
  }

/**
 * 🛑 `empty`, the batterie's own word. `basic` seeds a floor, a box, two lights and a camera, so
 * every decor that counted nodes was counting the template's.
 */
export const scene = (title = 'Test MCP') => opened('3d', title, { template: 'empty' })

/** A scene holding the objects a section talks about, in the order it names them. */
const sceneWith =
  (...added: readonly { kind: string; name: string }[]) =>
  async (studio: Studio): Promise<void> => {
    await scene()(studio)
    for (const one of added) await studio.run('node.add', one)
  }

const CUBE = { kind: 'box', name: 'Cube Test' }

/** A scene with a plain block in it, which the six material scenarios of section 12 act on. */
export const blockScene = sceneWith({ kind: 'box', name: 'Bloc' })

/** A scene holding the cube every section from 6 onwards talks about. */
export const cubeScene = sceneWith(CUBE)

/** The cube scene with three.js settings written over it — what a scenario lowers before asking. */
export const cubeSceneWith =
  (three: Record<string, unknown>) =>
  async (studio: Studio): Promise<void> => {
    await cubeScene(studio)
    await studio.run('settings.write', { settings: { three } })
  }

export const withSphere = sceneWith(CUBE, { kind: 'sphere', name: 'Sphere Droite' })

/** A wall with a cube standing inside it — what a window is cut out of. */
export const wallAndCube = sceneWith({ kind: 'box', name: 'Mur' }, { kind: 'box', name: 'Cube' })

export const twoSpheres = sceneWith(
  CUBE,
  { kind: 'sphere', name: 'Sphere Droite' },
  { kind: 'sphere', name: 'Sphere Gauche' },
)

export const litScene = sceneWith(CUBE, { kind: 'directional', name: 'Soleil Test' })

export const cameraScene = sceneWith(CUBE, { kind: 'camera', name: 'Camera Test' })

/** A scene with the project's knight in it — sections 11 and 12 act on an imported model. */
export const modelScene = async (studio: Studio): Promise<void> => {
  await scene()(studio)
  await studio.run('node.addModel', {
    assetId: assetOf(studio, 'knight in plate armour, character.glb'),
    name: 'Knight',
  })
  measured(studio, named(studio, 'Knight'))
  // 🛑 The skeleton window, opened on the same file: `rig.*` acts on a CHARACTER now, and with
  // none open the whole of section 50 would be scored on a refusal. Its workshop scene is
  // measured too — a fit proportions itself off a height, and reads it from that scene alone.
  const character = assetOf(studio, 'knight in plate armour, character.glb')
  seedCharacter(character, null, {})
  const documentId = workshopIdOf(character)
  const bounds = { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } }
  useScenes.getState().ensure(documentId, () => workshopScene(character))
  const nodeId = sceneOf(useScenes.getState(), documentId).nodes[0]?.id ?? ''
  registerSceneEngine(
    documentId,
    drawing({
      meshSample: () => ({ bounds, points: new Float32Array() }),
      autoRigTargets: () => [{ mesh: 0, primitive: 0, vertexCount: 1 }],
      simpleAutoRig: () =>
        Promise.resolve({
          rig: rigFit(bounds),
          bindings: [
            {
              mesh: 0,
              primitive: 0,
              skinIndex: new Uint16Array([0, 0, 0, 0]),
              skinWeight: new Float32Array([1, 0, 0, 0]),
            },
          ],
          metadata: {
            backendId: 'simple',
            sourceInfluences: 4,
            outputInfluences: 4,
            fingers: false,
          },
        }),
    }),
  )
  measured(studio, nodeId, documentId)
}

/**
 * The same, with a material of the project to dress it in — a model WEARS a material now, so a
 * decor that offers none leaves the request nothing to name.
 */
export const modelSceneWithMaterial = async (studio: Studio): Promise<void> => {
  await opened('materials', 'Pierre')(studio)
  await modelScene(studio)
}

/** The bones the model in front carries, for a decor that has to name the one it just added. */
export const bonesOf = (studio: Studio): readonly string[] => {
  void studio
  const open = Object.values(useCharacters.getState().states).find(one => one.assetId !== '')
  return open?.rig?.bones.map(one => one.name) ?? []
}

/**
 * 🛑 What the ENGINE measures of a model, which a headless run has none of: without it `rig.fit`
 * refuses `notFound` and the whole of section 50 is scored on a model nobody could have rigged.
 */
const measured = (studio: Studio, nodeId: string, documentId = frontId(studio)): void => {
  useModelFiles.getState().reportRig(documentId, nodeId, {
    status: 'staticMesh',
    bones: [],
    boneNames: [],
    boneCount: 0,
    // A character of about 1.8 m, standing — `rigFitFaultOf` refuses anything flat or lying.
    bounds: { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } },
    // No vertex to read, so the fit keeps the joints its proportions placed — which is exactly
    // what a run with no viewport can be scored on.
    points: new Float32Array(),
  })
}

/** A video montage carries a video row and a sound row; an audio one carries sound rows alone. */
export const montage =
  (title = 'Test Video', workspace: 'video' | 'audio' = 'video') =>
  async (studio: Studio): Promise<void> => {
    await opened(workspace, title)(studio)
    if (workspace === 'video') await studio.run('track.add', { kind: 'video' })
    await studio.run('track.add', { kind: 'audio' })
    if (workspace === 'audio') await studio.run('track.add', { kind: 'audio' })
  }

/** One clip of the project laid on a row — `start` in the MICROSECONDS the montage counts in. */
export const laid = async (
  studio: Studio,
  track: string,
  ending: string,
  start: number,
): Promise<void> => {
  await studio.run('clip.add', { trackId: track, assetId: assetOf(studio, ending), start })
}

/**
 * 🛑 The node a decor NAMES, never the nth: a template seeds three lights and an import three
 * more, so indexing to « the cube » wrote on whatever the studio had put there first.
 */
export const named = (studio: Studio, name: string): string =>
  sceneOf(useScenes.getState(), frontId(studio)).nodes.find(one => one.name.includes(name))?.id ??
  ''

/** The first instance of the composition in front — a decor cannot name an id minted per run. */
export const effectAt = (studio: Studio, at: number): string =>
  sceneOf(useScenes.getState(), frontId(studio)).world.post.effects[at]?.id ?? ''

/** The nth layer, row or clip of the document in front — what a decor names one by. */

export const layerAt = (studio: Studio, at: number): string =>
  canvasOf(useCanvases.getState(), frontId(studio)).layers[at]?.id ?? ''

export const trackAt = (studio: Studio, at: number): string =>
  sequenceOf(useSequences.getState(), frontId(studio)).tracks[at]?.id ?? ''

export const clipAt = (studio: Studio, at: number): string =>
  sequenceOf(useSequences.getState(), frontId(studio)).tracks.flatMap(one => one.clips)[at]?.id ??
  ''

/** A montage carrying the project's two videos back to back on V1 — each six seconds long. */
export const cutMontage = async (studio: Studio): Promise<void> => {
  await montage()(studio)
  const track = trackAt(studio, 0)
  await laid(studio, track, 'a drone shot over the sea.mp4', 0)
  await laid(studio, track, 'a slow pan across the harbour.mp4', 6 * SECOND)
}

/** That montage with a sound bed under it, which five scenarios of section 16 and 24 want. */
export const soundBed = async (studio: Studio): Promise<void> => {
  await cutMontage(studio)
  await laid(studio, trackAt(studio, 1), 'a calm ambient pad, loopable.wav', 0)
}

/** Two sounds on two rows of an audio montage — the decor of section 17. */
export const twoSounds = async (studio: Studio): Promise<void> => {
  await montage('Test Audio', 'audio')(studio)
  await laid(studio, trackAt(studio, 0), 'a calm ambient pad, loopable.wav', 0)
  await laid(studio, trackAt(studio, 1), 'waves on a wooden hull.wav', 0)
}

/**
 * 🛑 RENAMED, never added to: opening a picture makes a document that IS the picture, one layer
 * holding it, and a second one left every « combien de calques » oracle counting one too many.
 */
export const boatImage = async (studio: Studio): Promise<void> => {
  await studio.run('file.open', { path: 'Images/fais moi un bateau.png' })
  await studio.run('layer.rename', { layerId: layerAt(studio, 0), name: 'Bateau' })
}

/** That picture on a 32 × 32 grid, which is what section 68 draws on. */
export const pixelArtBoat = async (studio: Studio): Promise<void> => {
  await boatImage(studio)
  await studio.run('canvas.setPixelArt', { enabled: true, columns: 32, rows: 32, cell: 1 })
}

/** A red cell already laid, so an erasure has something to take away. */
export const paintedDot = async (studio: Studio): Promise<void> => {
  await pixelArtBoat(studio)
  await studio.run('canvas.drawPixels', { shape: 'points', cells: ['3,4'], color: '#ff0000' })
}

/** That picture with a second layer over it, which five scenarios of section 19 act on. */
export const overlay = async (studio: Studio): Promise<void> => {
  await boatImage(studio)
  await studio.run('layer.add', { name: 'Overlay Test', kind: 'pixel' })
}

/**
 * What the studio names a duplicate — its own answer, never a spelling written here. `planFiles`
 * numbers a copy the way the explorer shows it, and the bench used to invent « copie de … ».
 */
const COPY = 'Images/fais moi un bateau 2.png'

/** The folders section 4 builds, and the copy it renames — laid out step by step. */
export const testFolders = async (studio: Studio): Promise<void> => {
  await studio.run('folder.new', { folder: '', name: 'Tests Assistant' })
  await studio.run('folder.new', { folder: 'Tests Assistant', name: 'Images' })
}

/**
 * 🛑 In `Tests Assistant`, never `Images/`: « déplace-le dans le sous-dossier Images » named a
 * folder the file was already in, and three passes answered « il y est déjà » — which was true.
 */
export const namedCopy = async (studio: Studio): Promise<void> => {
  await testFolders(studio)
  await studio.run('files.duplicate', { paths: ['Images/fais moi un bateau.png'] })
  await studio.run('files.move', { paths: [COPY], folder: 'Tests Assistant' })
  await studio.run('file.rename', {
    path: 'Tests Assistant/fais moi un bateau 2.png',
    name: 'bateau-test.png',
  })
}

/** A generation already run — what sections 20 to 22 build the NEXT request on. */
export const generated =
  (family: string, modelId: string, prompt: string) =>
  async (studio: Studio): Promise<void> => {
    await studio.run('generator.prepare', { family, modelId, parameters: { prompt } })
    // 🛑 Named, as a call from outside now has to be when the studio would have ASKED: the decor
    // wants the result in the document it just laid out, and a refusal here lays out nothing.
    await studio.run('generator.submit', { landing: 'document' })
  }

export const madeCar = generated('image', 'model-image', 'a red sports car')
export const madeBoat = generated('image', 'model-image', 'the boat at night')
export const madeChest = generated('3d', 'model-3d', 'a wooden chest')

/**
 * 🛑 A generation still RUNNING, which the cloud port cannot make: it answers a finished job, so
 * « annule la génération en cours » had nothing under way to cancel and no model could win it.
 */
export const generating = async (studio: Studio): Promise<void> => {
  await madeCar(studio)
  // The NEWEST alone — the store keeps it first — and with nothing filed: a job still running
  // has produced no asset, and no end to be dated by.
  useJobs.setState(state => ({
    jobs: state.jobs.map((job, at) =>
      at > 0
        ? job
        : { ...job, status: 'running', progress: 0.4, assetIds: [], finishedAt: undefined },
    ),
  }))
}

/** A long task of THIS window under way — what `task.cancelLocalTask` stops, by the id it mints. */
export const indexing = (studio: Studio): Promise<void> => {
  useTasks.getState().begin({ id: 'task-index', label: 'Indexation du projet', ratio: 0.4 })
  return Promise.resolve(void studio)
}

/** That montage carrying BOTH of the project's sounds, one after the other on the sound row. */
export const twoBeds = async (studio: Studio): Promise<void> => {
  await soundBed(studio)
  await laid(studio, trackAt(studio, 1), 'waves on a wooden hull.wav', 6 * SECOND)
}

/** A model in a scene with a camera by it — what four « imprecise sentence » scenarios act on. */
export const framedModel = async (studio: Studio): Promise<void> => {
  await modelScene(studio)
  await studio.run('node.add', { kind: 'camera', name: 'Camera' })
}

/** The cube standing three metres up, which the read-then-write scenarios of 26 start from. */
export const raisedCube = async (studio: Studio): Promise<void> => {
  await cubeScene(studio)
  await studio.run('node.transform', { nodeId: named(studio, 'Cube Test'), positionY: 3 })
}

/** Soleil Test at an intensity worth doubling — the other half of section 26. */
export const namedSun = async (studio: Studio): Promise<void> => {
  await litScene(studio)
  await studio.run('node.setLightSettings', { nodeId: named(studio, 'Soleil Test'), intensity: 3 })
}

/** A scene with a cube, PLAYED: every reading taken on it is taken on a game that is running. */
export const playedScene = async (studio: Studio): Promise<void> => {
  await cubeScene(studio)
  await studio.run('play.start', {})
  await studio.playing()
}

/**
 * The knight opened on its own model tab, in front: what section 71 asks of the VIEW of a model.
 * The tab is a document of the window and not of the project, so it is laid in the store the way
 * `openCharacter` lays it, on top of the scene `modelScene` measured.
 */
export const characterTab = async (studio: Studio): Promise<void> => {
  await modelScene(studio)
  const assetId = assetOf(studio, 'knight in plate armour, character.glb')
  const id = `character-${assetId}`
  useDocuments.setState(state => ({
    documents: {
      ...state.documents,
      [id]: {
        id,
        kind: 'character',
        workspace: '3d',
        title: 'Knight',
        path: 'Modelling/Models/knight in plate armour, character.glb',
        sourceAssetId: assetId,
      },
    },
    activeId: id,
  }))
  // Armed as the real tab arms it at mount: a request to HIDE the bones has to find them shown.
  useSceneViews.getState().setSkeletons(workshopIdOf(assetId), true)
}
