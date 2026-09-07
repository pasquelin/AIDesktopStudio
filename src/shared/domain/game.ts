import { FOLDER_ROOT, isUnder } from './folder'

/**
 * What makes a project a GAME — one project, one game, and no document kind of its own.
 *
 * The scenes stay `.gltf` documents and the scripts stay ordinary `.ts` files of the project;
 * this manifest is what names which of them the game starts on, and what resolves the two
 * reference kinds nothing else can resolve — see `domain/ref.ts`.
 *
 * Creative property of the project in the sense of ADR-24: it sits in the project folder, in the
 * open, versioned by git and readable by hand.
 */
export const GAME_VERSION = 1

/**
 * Not under a dot, unlike `.project.json` and `.project-context.json`: this one is the author's
 * file, not the machine's. It shows in the explorer and travels with the project.
 */
export const GAME_FILE = 'game.json'

/**
 * A script identifier bound to the path of its file.
 *
 * 🛑 **The one fragile point of the whole reference strategy**: everything else the studio
 * references carries an identifier renaming cannot break, and a script is a PATH.
 *
 * 🛑 Nothing FILLS this list yet, and the `Script` component holds the path rather than the id —
 * so `scriptPathOf` has no caller and a rename does not reach a scene. See `keepScriptPaths`.
 */
export type GameScript = { id: string; path: string }

/** What a script IS on disk, and the only extension the studio runs. */
export const SCRIPT_EXTENSION = '.ts'

/**
 * What a new script holds before anyone types in it. A working behaviour rather than an empty
 * file: the shape of a script — the import, the default export, `props` read by the inspector —
 * is what nobody can guess, and an empty buffer teaches none of it.
 */
export const SCRIPT_STARTER = `import { defineScript } from '@studio'

export default defineScript({
  onUpdate(self, ctx, dt) {
    // A named ACTION, never a key code: the same line answers a keyboard and a gamepad, and
    // rebinding it is a line of a control map rather than of this file.
    const wanted = ctx.input.axis2('move')
    // walk() asks the character controller, so gravity and walls still apply. moveBy() would
    // place the node instead — through the wall. It takes a DIRECTION: the pace is the
    // CharacterController's, so this walks whatever the scene says a walk is.
    self.walk(wanted.x, wanted.y)
  },
})
`

/** One script's file and its text — what a PLAY compiles, and what an editor opens. */
export type GameScriptFile = { path: string; source: string }

/**
 * A reusable piece, named, defined by the document it lives in.
 *
 * 🛑 A DOCUMENT id, not a path, unlike `GameScript`: a document keeps its id across a rename, so
 * nothing has to follow one here — which is the whole reason `DocumentDescriptor.id` exists.
 */
export type GamePrefab = { id: string; name: string; document: string }

/** Which document a `prefab:` reference lands on, or nothing when the manifest does not hold it. */
export function prefabDocumentOf(game: GameManifest, id: string): string | null {
  return game.prefabs.find(prefab => prefab.id === id)?.document ?? null
}

/**
 * The manifest with that piece named.
 *
 * 🛑 One entry per NAME and one per DOCUMENT: naming a document that already has an entry is a
 * RENAME, and giving a name that is taken to another document is a REBIND. Filtering on the name
 * alone left a renamed prefab listed twice, and the manifest could only ever grow.
 */
export function withPrefab(game: GameManifest, prefab: GamePrefab): GameManifest {
  const kept = game.prefabs.filter(
    one => one.name !== prefab.name && one.document !== prefab.document,
  )
  return { ...game, prefabs: [...kept, prefab] }
}

/**
 * The id that piece already had under that name or that document, so a reference already written
 * into a component or a script survives a rename. `null` for one the manifest has never held.
 */
export function prefabIdFor(game: GameManifest, name: string, document: string): string | null {
  const held = game.prefabs.find(one => one.name === name || one.document === document)
  return held?.id ?? null
}

/** What the author sets for the game as a whole rather than for one scene. */
export type GameSettings = { title: string }

export type GameManifest = {
  version: number
  /** Document identifiers, in the order the author arranged them. */
  scenes: readonly string[]
  /** Which of `scenes` the game opens on, or nothing while the author has not said. */
  entryScene: string | null
  scripts: readonly GameScript[]
  prefabs: readonly GamePrefab[]
  settings: GameSettings
}

/** Why a manifest could not be read: repair the file, or update the studio. */
export type GameTrouble = 'unreadable' | 'too-new'

export type GameState = { game: GameManifest; trouble: GameTrouble | null }

/** What a project that never declared a game answers — which is not a fault. */
export function emptyGame(): GameManifest {
  return {
    version: GAME_VERSION,
    scenes: [],
    entryScene: null,
    scripts: [],
    prefabs: [],
    settings: { title: '' },
  }
}

export function noGame(): GameState {
  return { game: emptyGame(), trouble: null }
}

/** Where a `script` reference lands, or nothing when the manifest does not hold it. */
export function scriptPathOf(game: GameManifest, id: string): string | null {
  return game.scripts.find(script => script.id === id)?.path ?? null
}

/**
 * The manifest after a file or a FOLDER moved. Both, because a folder rename moves every script
 * under it at once and each one would otherwise keep pointing at a path the disk no longer has.
 */
export function withScriptMoved(game: GameManifest, from: string, to: string): GameManifest {
  return { ...game, scripts: game.scripts.map(script => movedScript(script, from, to)) }
}

/** The manifest after a file or a folder went away — the same reach, and the same reason. */
export function withScriptForgotten(game: GameManifest, path: string): GameManifest {
  return { ...game, scripts: game.scripts.filter(script => !isPathOrUnder(script.path, path)) }
}

const movedScript = (script: GameScript, from: string, to: string): GameScript =>
  isPathOrUnder(script.path, from)
    ? { ...script, path: to + script.path.slice(from.length) }
    : script

/**
 * The path itself as well as what it holds — `isUnder` answers only for what is INSIDE, and
 * answers TRUE for every path when asked about the root, which no rename and no deletion names.
 */
const isPathOrUnder = (path: string, target: string): boolean =>
  target !== FOLDER_ROOT && (path === target || isUnder(path, target))
