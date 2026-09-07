import type { CameraShot, Keyframe, TrackProperty } from '@shared/domain/animation'
import { commitmentOfCall } from '@shared/domain/assistant'
import type { Asset } from '@shared/domain/asset'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { ModelFamily } from '@shared/domain/model'
import { isRecord } from '@shared/guards'
import type { Job } from '@shared/domain/job'
import type { WorkspaceId } from '@shared/domain/workspace'
import { allLayers, type Layer } from '@/engines/canvas/canvasState'
import type { SceneNode } from '@/engines/scene/sceneState'
import { clipEnd, type Clip, type Track } from '@/engines/timeline/timelineState'
import { isNeutral } from '@shared/domain/adjustments'
import type { CsgOperation } from '@shared/domain/csg'
import { wornMaterials } from '@shared/domain/scene'
import { toRadians } from '@shared/domain/angles'
import { SECOND } from '@shared/domain/time'
import { foldForSearch, matchesWords, searchWords } from '@shared/text'
import type { SkyboxContent } from '@shared/domain/skybox'
import {
  EMPTY_STACK,
  type CameraPostMode,
  type PostEffectId,
  type PostStack,
} from '@shared/domain/postProcessing'
import type { MaterialState } from '@/engines/material/materialState'
import { toDb } from '@/engines/audio/audioData'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { usePostPresets } from '@/stores/postPresets'
import { useSettings } from '@/stores/settings'
import { useCharacters } from '@/stores/character'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { skyboxViewOf, useSkyboxViews } from '@/stores/skyboxViews'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { skyboxOf, useSkyboxes } from '@/stores/skyboxes'
import { materialOf, useMaterials } from '@/stores/materials'
import type { AnimationTimeline } from '@shared/domain/animation'
import type { Run } from './run'
import { generationCommentsOf, useGenerationComments } from '@/stores/generationComments'

export { SECOND }
export { answerOf, declined, ranStudioCommand, searched, tried } from './oracleActions'

/**
 * 🛑 An oracle reads the STATE, never the words the model wrote: every failure this bench exists
 * for was announced as a success by the model itself. The units are the state's, not the
 * action's — a node's rotation and a LAYER's are both in radians here.
 */

/** The shelf of recent projects, as the home draws it — a list of shortcuts, not of folders. */
export const shelvedPaths = (): readonly string[] =>
  useSettings.getState().settings.storage.recentProjects.map(one => one.path)

/** The project folders sent to the system's trash — the FOLDER half, which the shelf never says. */
export const trashedProjects = (run: Run): readonly string[] => run.studio.shell.trashedProjects()

export const documents = (run: Run): readonly DocumentDescriptor[] => run.studio.documents()

export const inSpace = (run: Run, space: WorkspaceId): readonly DocumentDescriptor[] =>
  documents(run).filter(one => one.workspace === space)

/** The studio's own rule for « does this name answer this word » — it folds the diacritics. */
const answersTo = (name: string, wanted: string): boolean => matchesWords(name, searchWords(wanted))

export const titled = (run: Run, title: string): DocumentDescriptor | undefined =>
  documents(run).find(one => answersTo(one.title, title))

/**
 * 🛑 Title OR path, never `path || title`: opening a PICTURE makes an image document, whose path
 * is `Images/<name>.ora`. Written the other way, `2.1` could not pass — the studio did exactly
 * what was asked and the path ended in `.ora`. Measured on the bench pass of 2026-08-25.
 */
export const openedFile = (run: Run, ending: string): boolean =>
  documents(run).some(one => one.title.endsWith(ending) || (one.path ?? '').endsWith(ending))

export const front = (run: Run): DocumentDescriptor | null => run.studio.front()

export const generationComments = (run: Run) =>
  generationCommentsOf(useGenerationComments.getState(), front(run)?.id ?? null)

export const nodes = (run: Run): readonly SceneNode[] =>
  inSpace(run, '3d').flatMap(one => sceneOf(useScenes.getState(), one.id).nodes)

/**
 * The node called exactly that, before one whose name merely CONTAINS it: « Sphere » answered
 * `HemisphereLight` first, and 6.7 could not pass whatever the model did (2026-09-06).
 */
export function nodeNamed(run: Run, name: string): SceneNode | undefined {
  const wanted = foldForSearch(name)
  const all = nodes(run)
  return (
    all.find(one => foldForSearch(one.name) === wanted) ??
    all.find(one => answersTo(one.name, name))
  )
}

/**
 * What a node was ADDED as — the word `node.add` takes, which the state spells across two
 * fields: a box is a MESH carrying a box geometry, and a sun a LIGHT carrying a directional one.
 */
const kindOf = (node: SceneNode): string =>
  node.type === 'mesh' ? node.geometry.kind : node.type === 'light' ? node.light.kind : node.type

export const nodesOfKind = (run: Run, ...kinds: string[]): readonly SceneNode[] =>
  nodes(run).filter(one => kinds.includes(kindOf(one)))

/**
 * The one solid a fold produced, and BY WHICH verb — three buttons that all leave « a solid »
 * behind are three scenarios one wrong answer would pass. Read off the graph's own steps.
 */
export const carvedBy = (run: Run, operation: CsgOperation): boolean => {
  const solids = nodes(run).filter(one => one.type === 'carved')
  const only = solids.length === 1 ? solids[0] : undefined
  return only?.type === 'carved' && only.carved.steps.every(one => one.operation === operation)
}

/** Whether a shape is MARKED as a tool. `undefined` for a node that could not carry the mark. */
export const isNegative = (node?: SceneNode): boolean | undefined =>
  node?.type === 'mesh' || node?.type === 'carved' ? node.negative === true : undefined

/** The same word, for the node a sentence names — « renomme-la Soleil Test » scores on both. */
export const kindNamed = (run: Run, name: string): string | null => {
  const node = nodeNamed(run, name)
  return node ? kindOf(node) : null
}

/**
 * The half of a node its TYPE carries — a light's intensity, a solid's material, a rail's points.
 * `SceneNode` is a union, and every oracle that reads one of these has to narrow first.
 */
export const lightOf = (node?: SceneNode) => (node?.type === 'light' ? node.light : null)

export const nodeMaterialOf = (node?: SceneNode) =>
  node && (node.type === 'mesh' || node.type === 'text') ? node.material : null

export const pathOf = (node?: SceneNode) => (node?.type === 'path' ? node.path : null)

export const spriteOf = (node?: SceneNode) => (node?.type === 'sprite' ? node.sprite : null)

export const wordsOf = (node?: SceneNode) => (node?.type === 'text' ? node.text : null)

/** What a layer of words reads. `null` on every other kind, which carries none. */
export const captionOf = (layer?: Layer) => (layer?.kind === 'text' ? layer.text : null)

/** The shots of the open scene — where a camera's target lives, since a node carries none. */
export const shots = (run: Run): readonly CameraShot[] =>
  inSpace(run, '3d').flatMap(one => sceneOf(useScenes.getState(), one.id).animation.shots)

/**
 * Whether a camera is AIMED rather than left free. A target is set on a SHOT — `camera.addShot`
 * then `camera.aimShotAt` — which is exactly what « fais-la regarder » has to find out.
 */
export const aimsAt = (run: Run, at?: string): boolean =>
  shots(run).some(
    one =>
      one.target !== undefined &&
      (at === undefined || (one.target.kind === 'node' && one.target.nodeId === at)),
  )

/** The state of the FIRST document of a space, or `null` when none is open. */
const firstOf = <T>(run: Run, space: WorkspaceId, read: (documentId: string) => T): T | null => {
  const document = inSpace(run, space)[0]
  return document ? read(document.id) : null
}

/** The scene the batterie talks about — the first 3D document, which every decor opens alone. */
const openScene = (run: Run) => firstOf(run, '3d', id => sceneOf(useScenes.getState(), id))

/** How the open scene is being LOOKED at — the display mode and the panes, which no file holds. */
export const sceneView = (run: Run) =>
  firstOf(run, '3d', id => sceneViewOf(useSceneViews.getState(), id))

/** How the open sky is being looked at — its probes, its shape, its background. */
export const skyView = (run: Run) =>
  firstOf(run, 'skyboxes', id => skyboxViewOf(useSkyboxViews.getState(), id))

/** The open montage — where its head stands, and the rows it holds. */
export const montage = (run: Run) => {
  const shown = front(run)
  return shown && (shown.kind === 'sequence' || shown.kind === 'audio')
    ? sequenceOf(useSequences.getState(), shown.id)
    : null
}

/** How the open scene's animation band is set — where automatic keying is held. */
export const animationView = (run: Run) =>
  firstOf(run, '3d', id => animationViewOf(useAnimationViews.getState(), id))

/**
 * The skeleton of the character the window holds.
 *
 * 🛑 Not a node's: a rig belongs to a FILE now, and the studio keeps no document for one — the
 * skeleton window is where it is read and edited.
 */
export const rig = (_run: Run) => {
  const open = Object.values(useCharacters.getState().states).find(one => one.assetId !== '')
  return open?.rig ?? null
}

/** The attachment points that character carries — they live in its file, never in the scene. */
export const sockets = (_run: Run) => {
  const open = Object.values(useCharacters.getState().states).find(one => one.assetId !== '')
  return open?.sockets ?? []
}

/**
 * The MATERIAL an imported model wears, by the id of its document — a reference, so nothing of it
 * is on the node to read. `null` means the model wears what its own file carries.
 */
export const modelWears = (run: Run, name: string, slot = 0): string | null => {
  const node = nodeNamed(run, name)
  if (node?.type !== 'model') return null

  return wornMaterials(node.model.dress)[slot] || null
}

/** The one picture covering a model whole — the simple mode, exclusive with the materials. */
export const modelCoveredBy = (run: Run, name: string): string | null => {
  const node = nodeNamed(run, name)
  if (node?.type !== 'model' || node.model.dress?.kind !== 'image') return null

  return node.model.dress.assetId || null
}

/** The open picture itself — its size and its guides, which no layer carries. */
export const canvas = (run: Run) =>
  firstOf(run, 'image', id => canvasOf(useCanvases.getState(), id))

/** How many cells a call laid down — see `canvasSurface`, which records them as the port does. */
export const paintedCells = (run: Run): number => run.studio.painted().size

/** What a cell holds: a packed colour, `null` where it was erased, `undefined` if untouched. */
export const painted = (run: Run, x: number, y: number): number | null | undefined =>
  run.studio.painted().get(`${x},${y}`)

/** Whether a generation of that family was sent a prompt CARRYING a word. */
export const promptSent = (run: Run, family: ModelFamily, word: string): boolean =>
  jobs(run).some(
    one =>
      run.studio.familyOf(one.targetId) === family &&
      Object.values(run.studio.sentBodies()[one.id] ?? {}).some(
        value => typeof value === 'string' && value.includes(word),
      ),
  )

/**
 * What the document in front DESIGNATES, and of what kind — « sélectionne le calque » is not
 * « pointe quelque chose », and only the kind tells the two apart.
 */
export const aimed = (run: Run): { kind: string; ids: readonly string[] } => {
  const shown = front(run)
  if (!shown) return { kind: 'none', ids: [] }

  if (shown.kind === 'scene') {
    return { kind: 'node', ids: sceneOf(useScenes.getState(), shown.id).selectedIds }
  }

  if (shown.kind === 'image') {
    const active = canvasOf(useCanvases.getState(), shown.id).activeLayerId
    return { kind: 'layer', ids: active === null ? [] : [active] }
  }

  if (shown.kind === 'sequence' || shown.kind === 'audio') {
    const montage = sequenceOf(useSequences.getState(), shown.id)
    return montage.selectedId === null
      ? { kind: 'track', ids: montage.selectedTrackId === null ? [] : [montage.selectedTrackId] }
      : { kind: 'clip', ids: [montage.selectedId] }
  }

  return { kind: 'none', ids: [] }
}

/** What lights the open scene and what hangs behind it — the world belongs to no node. */
export const world = (run: Run) => openScene(run)?.world ?? null

/** How long the open scene's timeline runs, in the microseconds it counts in. */
export const sceneLasts = (run: Run): number => openScene(run)?.animation.duration ?? 0

/** The scene's own composition — what the viewport draws through, and what a camera inherits. */
export const post = (run: Run): PostStack => openScene(run)?.world.post ?? EMPTY_STACK

/** The composition a camera OWNS, `null` while it inherits or is switched off. */
export const cameraPost = (run: Run, name: string): PostStack | null => {
  const camera = cameraNamed(run, name)
  return camera?.camera.post?.mode === 'override' ? camera.camera.post.stack : null
}

/** How a camera answers the scene's composition — `inherit` where it says nothing. */
export const cameraPostMode = (run: Run, name: string): CameraPostMode | null => {
  const camera = cameraNamed(run, name)
  return camera ? (camera.camera.post?.mode ?? 'inherit') : null
}

const cameraNamed = (
  run: Run,
  name: string,
): Extract<SceneNode, { type: 'camera' }> | undefined => {
  const found = nodeNamed(run, name)
  return found?.type === 'camera' ? found : undefined
}

/** Whether the composition holds an effect of that kind at all, on or off. */
export const composes = (run: Run, effect: PostEffectId): boolean =>
  post(run).effects.some(one => one.effect === effect)

/** What one parameter of the first instance of that effect stands at. `null` where there is none. */
export const postParam = (run: Run, effect: PostEffectId, param: string): number | null => {
  const found = post(run).effects.find(one => one.effect === effect)
  const value = found?.params[param]
  return typeof value === 'number' ? value : null
}

/**
 * The composition channels the scene's own band holds, named by what they DRIVE rather than by
 * the instance id — an id is minted per run, so a scenario could never assert one.
 */
export const postChannels = (run: Run): { effect: PostEffectId; param: string }[] => {
  const stack = post(run)
  return (openScene(run)?.animation.tracks ?? []).flatMap(track => {
    const aimed = track.target.post
    const effect = stack.effects.find(one => one.id === aimed?.effectId)
    return aimed && effect ? [{ effect: effect.effect, param: aimed.param }] : []
  })
}

/** How many keys stand on the channel driving that parameter. Zero where no channel does. */
export const postKeys = (run: Run, effect: PostEffectId, param: string): number => {
  const instance = post(run).effects.find(one => one.effect === effect)
  const track = (openScene(run)?.animation.tracks ?? []).find(
    one => one.target.post?.effectId === instance?.id && one.target.post?.param === param,
  )
  return track?.keys.length ?? 0
}

/** The looks saved on this MACHINE — no document holds them, so no scene answers for them. */
export const savedPresets = (): readonly { id: string; name: string }[] =>
  usePostPresets.getState().saved

/** The sky the open skybox document holds. */
export const sky = (run: Run): SkyboxContent | null =>
  firstOf(run, 'skyboxes', id => skyboxOf(useSkyboxes.getState(), id))

/** Whether the sky's colour stack has been moved off neutral — `isNeutral` is what says so. */
export const adjusted = (run: Run): boolean => {
  const content = sky(run)
  return content !== null && !isNeutral(content.adjustments)
}

/** The matter the open material document assembles — its channels and its surface settings. */
export const surface = (run: Run): MaterialState | null =>
  firstOf(run, 'materials', id => materialOf(useMaterials.getState(), id))

/** Every layer of every open picture, groups opened out — a stack nests, an oracle does not. */
export const layers = (run: Run): readonly Layer[] =>
  inSpace(run, 'image').flatMap(one => allLayers(canvasOf(useCanvases.getState(), one.id).layers))

export const layerNamed = (run: Run, name: string): Layer | undefined =>
  layers(run).find(one => answersTo(one.name, name))

/** The tracks of every open montage — the video space and the audio one both edit one. */
export const tracks = (run: Run): readonly Track[] =>
  documents(run)
    .filter(one => one.kind === 'sequence' || one.kind === 'audio')
    .flatMap(one => sequenceOf(useSequences.getState(), one.id).tracks)

/**
 * Every clip of every open montage, each carrying the track it sits on: a track HOLDS its clips,
 * and half the montage oracles are about which row something landed on.
 */
export const clips = (run: Run): readonly (Clip & { trackId: string })[] =>
  tracks(run).flatMap(track => track.clips.map(clip => ({ ...clip, trackId: track.id })))

export const files = (run: Run): readonly string[] => run.studio.files()

export const holds = (run: Run, path: string): boolean => files(run).includes(path)

export const assets = (run: Run): readonly Asset[] => run.studio.assets()

export const jobs = (run: Run): readonly Job[] => run.studio.jobs()

/** Whether a generation ran at all, which is what every section-20 scenario turns on. */
export const generated = (run: Run, family?: ModelFamily): boolean =>
  jobs(run).some(
    one =>
      one.status === 'succeeded' &&
      (family === undefined || run.studio.familyOf(one.targetId) === family),
  )

/** Whether a generation of that family was SENT a field — read off the body, never off the call. */
export const sentWith = (run: Run, family: ModelFamily, key: string): boolean =>
  jobs(run).some(
    one =>
      run.studio.familyOf(one.targetId) === family &&
      typeof run.studio.sentBodies()[one.id]?.[key] === 'string',
  )

/**
 * Read off what the generator SENT, never off the call's text: an id quoted in a prompt is not a
 * reference, and which fields hold a picture is the model's schema to say.
 */
export const referenced = (run: Run, assetId: string): boolean =>
  run.studio.references().includes(assetId)

/** A turn the person named in DEGREES, in the RADIANS the state holds — a layer's included. */
export const radians = toRadians

/** Roughly equal, because a model answering 2 m as 2.0 has answered. */
export const near = (value: number, wanted: number, slack = 0.001): boolean =>
  Math.abs(value - wanted) <= slack

/** What a read-only turn is allowed to do: look, and say. Nothing that outlives the looking. */
export const changedNothing = (run: Run): boolean => !run.studio.changed()

/** Looked and said, and nothing more: no call that commits, and nothing left changed. */
export const lookedOnly = (run: Run): boolean =>
  run.called.every(one => commitmentOfCall(one.action, one.input) === 'none') && changedNothing(run)

/** Where a montage ends: the last frame any clip reaches, which is what « exactly » reads on. */
export const endOf = (of: readonly Clip[]): number =>
  of.reduce((last, one) => Math.max(last, clipEnd(one)), 0)

/** What the model answered a question WITH — a sentence, not an empty turn. */
export const spoke = (run: Run): boolean => run.said.trim().length > 0

export const askedBack = (run: Run): boolean => /\?/.test(run.said)

/** It STOPPED and asked — the defect measured is a model that asks and acts in one breath. */
export const asked = (run: Run): boolean => run.asks.length > 0

/** The data an action answered, for the rare oracle that must read a reply rather than a state. */
export const answeredWith = (run: Run, action: string): boolean =>
  run.called.some(one => one.action === action && one.answer?.startsWith('refused') === false)

/** Roughly this many seconds, read off a value the montage keeps in microseconds. */
export const lasts = (value: number, seconds: number): boolean =>
  near(value, seconds * SECOND, SECOND / 100)

/**
 * A gain the person named as a percentage, in the DECIBELS the state holds — `20·log₁₀`. Half
 * volume is −6 dB and not 0.5, and a bench reading fractions passed the wrong answer.
 */
export const quietedTo = (value: number, percent: number): boolean =>
  near(value, toDb(percent / 100), 0.6)

/**
 * Every key of the open 3D scenes, each carrying the channel it drives: the channel is the
 * track's, and nine oracles ask which of the three moved.
 */
export const keys = (run: Run): readonly (Keyframe & { channel: TrackProperty })[] =>
  inSpace(run, '3d')
    .flatMap(one => sceneOf(useScenes.getState(), one.id).animation.tracks)
    .flatMap(track => track.keys.map(key => ({ ...key, channel: track.target.property })))

/** The sound row of the open montage, which eight oracles reach for. */
export const audioRow = (run: Run): Track | undefined =>
  tracks(run).find(one => one.kind === 'audio')

export const audioTrack = (run: Run): string | undefined => audioRow(run)?.id

/** Looked and said, and nothing more — what every read-only request of the batterie asks. */
export const idle = (run: Run): boolean => spoke(run) && lookedOnly(run)

/** Whether this node stands somewhere other than where the decor left it. */
export const moved = (run: Run, of: string | SceneNode): boolean => {
  const node = typeof of === 'string' ? nodeNamed(run, of) : of
  return node !== undefined && run.studio.wasAt(node.id) !== JSON.stringify(node.transform)
}

/**
 * Aimed by a shot, or MOVED since the person spoke. 🛑 Not « off the origin »: a fresh camera
 * stands at (0, 2, 6), so that reading was true of every camera a decor had just added.
 */
export const framing = (run: Run, name?: string): boolean => {
  const camera = name === undefined ? nodesOfKind(run, 'camera')[0] : nodeNamed(run, name)
  return camera !== undefined && (aimsAt(run) || moved(run, camera))
}

/**
 * A settings write naming a section AND a key of it: the grid and the shadows have no action of
 * their own, and « any settings.write » would pass on one about something else.
 */
export const wrote = (run: Run, section: string, key: string): boolean =>
  run.called.some(one => {
    if (one.action !== 'settings.write') return false

    const asked = one.input['settings']
    const written = isRecord(asked) ? asked[section] : undefined
    // BOTH sides lowered: folded on the written name alone, a key in camelCase could never
    // match, and the scenario failed whatever the model did.
    const wanted = key.toLowerCase()
    return isRecord(written) && Object.keys(written).some(n => n.toLowerCase().includes(wanted))
  })

/** The timeline of the scene in front — what a game CUES, as the document holds it. */
export const animation = (run: Run): AnimationTimeline | null => openScene(run)?.animation ?? null
