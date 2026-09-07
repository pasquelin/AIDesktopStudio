import type { FileKind } from '@shared/domain/folder'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { barrelDocument } from '@/engines/scene/prefab-fixtures'

/** One stamp for everything the bench dates: nothing in it reads a clock. */
export const WHEN = '2026-01-01T00:00:00.000Z'

/**
 * The folders a real project is given, then files named as the studio really names them: after
 * the prompt that made them. A bench built on tidy names passes on what the studio gets wrong,
 * and a tree spelt out by hand drifts from the one `create` lays down — it had, twice.
 */
type Seeded = { path: string; kind: FileKind }

const seededFolder = (path: string): Seeded => ({ path, kind: 'folder' })

export const PROJECT: readonly Seeded[] = [
  ...Object.values(DEFAULT_ROLE_PATHS).map(seededFolder),
  { path: 'Images/a beautiful sailing ship, sailboat, on the open sea, green.png', kind: 'file' },
  { path: 'Images/a beautiful sailing ship, sailboat, on the open sea.png', kind: 'file' },
  { path: 'Images/fais moi un chateau.png', kind: 'file' },
  { path: 'Images/fais moi un bateau.png', kind: 'file' },
  { path: 'Images/a bicycle.png', kind: 'file' },
  { path: 'Images/a red sports car in a paris street.png', kind: 'file' },
  { path: 'Modelling/Models/a medieval stone castle with towers.glb', kind: 'file' },
  { path: 'Modelling/Models/a knight in plate armour, character.glb', kind: 'file' },
  { path: 'Video/a drone shot over the sea.mp4', kind: 'file' },
  { path: 'Video/a slow pan across the harbour.mp4', kind: 'file' },
  { path: 'Audio/a calm ambient pad, loopable.wav', kind: 'file' },
  { path: 'Audio/waves on a wooden hull.wav', kind: 'file' },
  { path: 'Skyboxes/a clear blue sky at noon.png', kind: 'file' },
  { path: 'Skyboxes/an overcast sky at dusk.png', kind: 'file' },
  { path: 'Materials/weathered oak planks, seamless.png', kind: 'file' },
  { path: 'Materials/weathered oak planks, seamless, normal.png', kind: 'file' },
  { path: 'Modelling/Scenes/Charge 2000 blocs.gltf', kind: 'file' },
  { path: 'Modelling/Scenes/Scène 1.gltf', kind: 'file' },
  { path: 'Images/demo image.ora', kind: 'file' },
]

/**
 * What one document of the project really HOLDS. Every other seeded file is a name on the disk.
 *
 * 🛑 Section 63 instances this one as a prefab, and no oracle could tell the gesture from a
 * refusal if the file carried nothing: a scene with no nodes instances no nodes.
 */
export const DOCUMENT_SOURCES: readonly { path: string; source: string }[] = [
  // 🛑 The path the document LIVES at, which `documents.read` looks the content up by: written
  // under `documents/` it was nowhere the reader goes, so instancing it refused `notFound` twelve
  // times over — 63.4 and 63.5 could not be won by any model, measured 2026-09-01.
  { path: 'Modelling/Scenes/Scène 1.gltf', source: barrelDocument().content },
]
