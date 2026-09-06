import type { AnimationTimeline } from '@shared/domain/animation'
import { SCENE_SUBJECT_ID } from '@shared/domain/animation'
import { glbChunksOf, glbJson } from '@shared/domain/glbContainer'
import { gltfStudioMetadata } from '@shared/domain/gltf'
import { STUDIO_METADATA_KEY } from '@shared/domain/studioMetadata'
import { isRecord } from '@shared/guards'
import { assetBytes } from '@/helpers/assetFetch'
import { getBridge } from '@/services/bridge'
import { loadAnimation } from '@/engines/scene/animationCommands'
import { readTimeline } from '@/engines/scene/sceneDocument'
import { linkCharacterMotion } from '@/engines/character/characterCommands'
import { useAnimationViews } from '@/stores/animationView'
import { useCharacters } from '@/stores/character'
import { useScenes } from '@/stores/scenes'
import { newId } from '@/helpers/ids'
import i18next from 'i18next'
import { animationViewOf } from '@/stores/animationView'
import { scenePayload } from '@/engines/scene/sceneDocument'
import { sceneOf } from '@/stores/scenes'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { workshopIdOf } from '@shared/domain/character'

/** What the band has to hold before there is a motion to file: one key on one channel. */
export function hasMotion(timeline: AnimationTimeline): boolean {
  return timeline.tracks.some(track => track.keys.length > 0)
}

/**
 * 🛑 ONE file, and the `.glb` IS the motion: the clip it bakes is what every other reader plays,
 * and these tracks are the keys a hand actually posed, where the standard says a reader may
 * ignore them.
 */
export function motionExtras(timeline: AnimationTimeline): Record<string, unknown> {
  return { [STUDIO_METADATA_KEY]: { animation: timeline } }
}

/**
 * The band a motion file was posed from, put back on the node that plays it here — or `null` for
 * a `.glb` written by anything but this studio, which carries a clip and no keys.
 */
export function motionTimelineOf(file: Uint8Array, nodeId: string): AnimationTimeline | null {
  const chunks = glbChunksOf(file)
  if (!chunks) return null

  const written = gltfStudioMetadata(glbJson(chunks.json)).animation
  return isRecord(written) ? onNode(readTimeline(written, []), nodeId) : null
}

/**
 * A filed motion back on the band, with the very keys that were posed — never the baked clip.
 *
 * Throws for a file this studio wrote no band into, which every motion of a library is: the
 * caller says so rather than emptying the workbench over it.
 */
export async function reopenCharacterMotion(
  documentId: string,
  nodeId: string,
  assetId: string,
): Promise<void> {
  const timeline = motionTimelineOf(await assetBytes(assetId), nodeId)
  if (!timeline) throw new Error('this motion carries no band of this studio')

  useScenes.getState().runCommand(documentId, loadAnimation(timeline))
  useAnimationViews.getState().openMotion(documentId, assetId)
}

/**
 * Files what the band plays as a motion of the project, and teaches it to this character.
 *
 * A FILE and never something the character's `.glb` swallows: the same motion plays on every
 * character whose bones carry the same names. `replaces` names the file a workbench reopened.
 */
export async function saveCharacterMotion(
  assetId: string,
  name: string,
  glb: Uint8Array,
  replaces?: string,
  canLink: () => boolean = () => true,
  expectedProjectPath?: string,
): Promise<string | null> {
  const bridge = getBridge()
  if (!bridge) return null

  const asset = await bridge.assets.saveAnimation({
    name,
    derivedFrom: assetId,
    glb,
    ...(replaces ? { replaces } : {}),
  })
  if (!canLink()) {
    if (!replaces) {
      if (expectedProjectPath === undefined) await bridge.assets.remove([asset.id], false)
      else await bridge.assets.remove([asset.id], false, expectedProjectPath)
    }
    return null
  }
  // Already known when the file was rewritten: a second entry would list the same motion twice.
  if (!replaces) {
    useCharacters
      .getState()
      .runCommand(
        assetId,
        linkCharacterMotion({ id: newId(), name: asset.name, assetId: asset.id }),
      )
  }

  return asset.id
}

/**
 * The same band, aimed at the model this workshop holds: the id a motion was written with means
 * nothing here — a workshop mints a fresh node at every open — where the bone NAMES travel.
 */
function onNode(timeline: AnimationTimeline, nodeId: string): AnimationTimeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map(track =>
      track.target.nodeId === SCENE_SUBJECT_ID
        ? track
        : { ...track, target: { ...track.target, nodeId } },
    ),
    sheet: [...new Set(timeline.sheet.map(id => (id === SCENE_SUBJECT_ID ? id : nodeId)))],
  }
}

/**
 * The workshop exported with the clip the band bakes, the band itself riding in its `extras` —
 * one file, and a second save lands on that same one.
 *
 * Reads the engine off the registry rather than taking one: the inspector that offers this sits
 * in a DOCK, outside the tab holding it.
 */
export async function saveWorkshopMotion(assetId: string, asNew: boolean): Promise<void> {
  const documentId = workshopIdOf(assetId)
  const engine = sceneEngineOf(documentId)
  if (!engine) return

  // Through `scenePayload`, as a save of the document is: it purges the sheet of the ids of
  // objects the scene has lost, which a band written raw would carry into the file for ever.
  const written = scenePayload(sceneOf(useScenes.getState(), documentId)).animation
  const saved = await saveCharacterMotion(
    assetId,
    i18next.t('character.motionNew'),
    await engine.exportTo('glb', 'scene', motionExtras(written)),
    asNew
      ? undefined
      : (animationViewOf(useAnimationViews.getState(), documentId).openMotion ?? undefined),
  )
  if (saved) useAnimationViews.getState().openMotion(documentId, saved)
}
