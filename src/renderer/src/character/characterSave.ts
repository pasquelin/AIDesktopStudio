import type { CharacterExtras } from '@shared/domain/character'
import type { CharacterState } from '@/engines/character/characterState'
import { createGlbWriter, type GlbWriter } from '@/engines/scene/glbWriter'
import type { StudioBridge } from '@shared/ipc'
import { orElse } from '@shared/promises'
import { assetBytes } from '@/helpers/assetFetch'
import { getBridge } from '@/services/bridge'
import { characterOf, characterStore } from '@/stores/character'
import { characterAssetOf, useDocuments } from '@/stores/documents'
import { characterSkinsOf, type CharacterSkinning } from './characterSkins'
import GlbWriteWorker from '@/engines/scene/glbWrite.worker?worker'

/**
 * Writing a character back: its own file, patched with the skeleton it now carries.
 *
 * 🛑 The container is patched rather than re-exported — see `glbSkin`. Off the UI thread, because
 * a character of a million triangles is tens of megabytes of container to rebuild.
 */
export async function saveCharacter(
  assetId: string,
  /** Read when the write STARTS: one held back reweighs against the skeleton then on screen. */
  skins: () => CharacterSkinning,
): Promise<boolean> {
  const bridge = getBridge()
  if (!bridge) return false

  const running = writing.get(assetId)
  if (!running) return hold(assetId, write(bridge, assetId, skins))

  // 🛑 One save at a time, but never one SKIPPED: answered with the first one's promise, a
  // second ⌘S wrote nothing and still said `true`. It waits its turn — and a third joins that
  // one slot, a write with another behind it being superseded before it lands.
  const waiting = queued.get(assetId)
  if (waiting) return waiting

  const next = behind(running, assetId, () => write(bridge, assetId, skins))
  queued.set(assetId, next)
  return next
}

const writing = new Map<string, Promise<boolean>>()
const queued = new Map<string, Promise<boolean>>()

/** The one write in flight for this character, cleared only by itself. */
async function hold(assetId: string, done: Promise<boolean>): Promise<boolean> {
  writing.set(assetId, done)

  try {
    return await done
  } finally {
    if (writing.get(assetId) === done) writing.delete(assetId)
  }
}

/** Held back until the write in flight has landed, whichever way it landed — never beside it. */
async function behind(
  running: Promise<boolean>,
  assetId: string,
  next: () => Promise<boolean>,
): Promise<boolean> {
  await orElse(running, false)
  // Let go of the slot as this one STARTS: the ⌘S after it queues behind this write, not with it.
  queued.delete(assetId)

  return hold(assetId, next())
}

/** The port, kept: its worker drags all of three.js, and a ⌘S paid for that parse every time. */
let writer: GlbWriter | null = null

async function write(
  bridge: StudioBridge,
  assetId: string,
  skins: () => CharacterSkinning,
): Promise<boolean> {
  // 🛑 Bones and weights read TOGETHER, as the write starts: a write held back behind another
  // wrote the skeleton of now with the weights of before, and `JOINTS_0` indexes those bones.
  const current = characterStore.use.getState()
  const state = characterOf(current, assetId)

  // The mark BEFORE the write, handed back after it — `documentStore.markSaved` spells the rule
  // and `documentIo` follows it: rebuilding tens of megabytes takes seconds, and a joint dragged
  // during them is in no file.
  const mark = characterStore.markOf(current, assetId)
  const file = await assetBytes(assetId)
  writer ??= createGlbWriter(() => new GlbWriteWorker())

  const written = await writer.write(file, {
    bones: state.rig?.bones ?? [],
    skins: state.rig ? skins() : [],
    extras: extrasOf(state),
  })
  if (!written) return false

  await bridge.assets.saveMesh({ replaces: assetId, glb: written })

  characterStore.use.getState().markSaved(assetId, mark)
  return true
}

/** What glTF has no place for: a corrected role, a point of attachment, a motion this one plays. */
export function extrasOf(state: CharacterState): CharacterExtras {
  const roles = Object.fromEntries(
    (state.rig?.bones ?? []).flatMap(bone => (bone.role ? [[bone.name, bone.role]] : [])),
  )

  return {
    ...(Object.keys(roles).length > 0 && { roles }),
    ...(state.sockets.length > 0 && { sockets: state.sockets }),
    ...(state.motions.length > 0 && { motions: state.motions }),
    ...(state.dress && { dress: state.dress }),
  }
}

/**
 * ⌘S on a character tab: the model's own container, patched with the skeleton the tab now holds.
 *
 * Here rather than in `documentIo`, which knows documents and not characters — and it is the
 * whole of what saving one means: there is no file in the project to write beside it.
 */
export async function saveCharacterDocument(documentId: string): Promise<boolean> {
  const assetId = characterAssetOf(useDocuments.getState(), documentId)
  if (!assetId) return false

  return await saveCharacter(assetId, () => characterSkinsOf(assetId))
}
