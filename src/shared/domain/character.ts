import { isRecord } from '../guards'
import { isHumanoidRole, type HumanoidRole } from './humanoid'
import { isTransform, type Transform } from './transform'
import { STUDIO_METADATA_KEY } from './studioMetadata'
import { modelDressRefOf, type ModelDressRef } from './sceneModel'

/**
 * What a character IS, as far as rigging goes.
 *
 * `auto` and `human` are the two the local rigger will lay a skeleton on — it fits a humanoid and
 * says so. The other two exist because a service can rig them, and because saying « animal » is
 * what makes the studio's own refusal readable.
 */
export type CharacterKind = 'auto' | 'human' | 'animal' | 'other'

export const CHARACTER_KINDS: readonly CharacterKind[] = ['auto', 'human', 'animal', 'other']

/** The kinds this studio lays a skeleton on itself. A quadruped is a service's business. */
export const HUMANOID_KINDS: readonly CharacterKind[] = ['auto', 'human']

/**
 * A named point hung on a bone: a grip, a scabbard, a muzzle.
 *
 * It belongs to the CHARACTER and travels in its file — a scene says what is hung in one, never
 * where one is. `bone` is a name, the very address a track uses, so a renamed bone loses its
 * points exactly as it loses its keys, and says so rather than moving them silently.
 */
export type CharacterSocket = {
  id: string
  /** The author's own word, untranslated: it goes into the file. */
  name: string
  bone: string
  /** Where it stands in that bone's frame. */
  rest: Transform
}

/**
 * A motion this character knows how to play, filed in the project's `animations` folder.
 *
 * A REFERENCE and never a copy: the same file plays on every character whose bones carry the same
 * names, which is the whole reason motions are files rather than something a `.glb` swallows.
 */
export type MotionRef = { id: string; name: string; assetId: string }

const WORKSHOP_PREFIX = 'character:'

/** The scene document a character tab lays its model on — one per asset, never a file. */
export function workshopIdOf(assetId: string): string {
  return `${WORKSHOP_PREFIX}${assetId}`
}

export function isWorkshopId(documentId: string): boolean {
  return documentId.startsWith(WORKSHOP_PREFIX)
}

/** The asset a workshop id was minted for, or `null` for any other document id. */
export function workshopAssetOf(documentId: string): string | null {
  return isWorkshopId(documentId) ? documentId.slice(WORKSHOP_PREFIX.length) : null
}

/**
 * What the studio writes into a character's own `.glb`, under `extras[STUDIO_METADATA_KEY]`.
 *
 * The skeleton itself is NOT here: glTF carries bones, joints and skins in standard, and writing
 * them twice would let the two disagree. What rides here is only what the standard has no place
 * for — the role a bone fills where its name does not spell it, the points one hangs things on,
 * and the motions this character knows.
 */
export type CharacterExtras = {
  roles?: Readonly<Record<string, HumanoidRole>>
  sockets?: readonly CharacterSocket[]
  motions?: readonly MotionRef[]
  /** Non-destructive material documents worn when this model is opened on its own. */
  dress?: ModelDressRef
}

/**
 * What a loaded model carries of the studio's own, or nothing.
 *
 * Field by field: a file written by another version, or by a hand, must not cost the character
 * its skeleton. What does not parse is simply absent.
 */
export function characterExtrasOf(userData: unknown): CharacterExtras | null {
  if (!isRecord(userData)) return null

  const held = userData[STUDIO_METADATA_KEY]
  if (!isRecord(held)) return null

  const character = isRecord(held.character) ? held.character : held
  const roles = rolesOf(character.roles)
  const sockets = socketsOf(character.sockets)
  const motions = motionsOf(character.motions)
  const dress = modelDressRefOf(character.dress)

  const extras: CharacterExtras = {
    ...(roles && { roles }),
    ...(sockets && { sockets }),
    ...(motions && { motions }),
    ...(dress && { dress }),
  }

  return Object.keys(extras).length > 0 ? extras : null
}

/** Why these points cannot be held, or nothing. */
export type SocketFault = 'duplicate-id' | 'duplicate-name'

export function socketsFaultOf(sockets: readonly CharacterSocket[]): SocketFault | null {
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const socket of sockets) {
    if (ids.has(socket.id)) return 'duplicate-id'
    // Two points a person cannot tell apart in a menu are two points nobody can choose between.
    if (names.has(socket.name)) return 'duplicate-name'
    ids.add(socket.id)
    names.add(socket.name)
  }

  return null
}

function isCharacterSocket(value: unknown): value is CharacterSocket {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id === '') return false
  if (typeof value.name !== 'string' || typeof value.bone !== 'string') return false

  return isTransform(value.rest)
}

function isMotionRef(value: unknown): value is MotionRef {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    value.id !== '' &&
    typeof value.name === 'string' &&
    typeof value.assetId === 'string'
  )
}

function rolesOf(value: unknown): Readonly<Record<string, HumanoidRole>> | null {
  if (!isRecord(value)) return null

  const roles: Record<string, HumanoidRole> = {}
  for (const [bone, role] of Object.entries(value)) if (isHumanoidRole(role)) roles[bone] = role

  return Object.keys(roles).length > 0 ? roles : null
}

function socketsOf(value: unknown): readonly CharacterSocket[] | null {
  if (!Array.isArray(value)) return null

  const sockets = value.filter(isCharacterSocket)
  return sockets.length > 0 && socketsFaultOf(sockets) === null ? sockets : null
}

function motionsOf(value: unknown): readonly MotionRef[] | null {
  if (!Array.isArray(value)) return null

  const motions = value.filter(isMotionRef)
  return motions.length > 0 ? motions : null
}
