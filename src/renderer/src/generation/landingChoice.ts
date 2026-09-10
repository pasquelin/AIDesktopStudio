import { documentFileName } from '@shared/domain/documentName'
import { nameOf } from '@shared/domain/folder'
import { partsOfRole, type AiRoleId } from '@shared/domain/aiRole'
import { reworksItsOutput } from '@shared/domain/aiCapability'
import { landingOfRole, type LandingTarget } from '@shared/domain/landingTarget'
import type { ModelFamily } from '@shared/domain/model'
import type { LandingChoice as LandingPreference } from '@shared/domain/settings'
import { activeScriptId, documentById, type DocumentsRead } from '@/stores/documents'
import { takenDocumentNames, untitledDocumentName } from '@/stores/documentNames'

/**
 * Where a shot lands, and the file each choice names. Read on every render, so everything here
 * is cheap — the one field that is not lives in `landingCreatesOf` below.
 */
export type LandingChoice = {
  /** Where it goes if nothing is said. `null` ONLY where the studio would ask on screen. */
  target: LandingTarget | null
  /** What the OPERATION says, corrected for a document that is not there — `null` where the
   * family still asks. This is what a control may deviate from. */
  derived: LandingTarget | null
  /** The file a `document` landing writes into. */
  into: string | null
  /** The file that travels in the request — what `bodyExtras` adds to the body. */
  sends: string | null
}

/** The same, plus the file a `newTab` landing creates. Filled only where someone reads it. */
export type ArmedLanding = LandingChoice & { creates: string | null }

/**
 * What one workspace can say about where its result goes. A table rather than a branch, for
 * `bodyExtras`' reason: `Record<ModelFamily, …>` makes the compiler ask for the line of the
 * family that arrives.
 */
type LandingNames = {
  /** The file a `document` landing writes into, and what travels when the operation reworks one. */
  held: (role: AiRoleId, state: DocumentsRead) => { into: string | null; sends: string | null }
  /** The names the destination folder already holds — cheap, unlike what is built from them. */
  siblings: (state: DocumentsRead, folder: string) => readonly string[]
  creates: (siblings: readonly string[]) => string
}

const LANDINGS: Record<ModelFamily, LandingNames | null> = {
  image: null,
  video: null,
  '3d': null,
  audio: null,
  material: null,
  skybox: null,
  code: {
    held: (role, state) => {
      const open = activeScriptId(state)
      const into = open === null ? null : (documentById(state, open)?.path ?? null)

      return {
        into: into === null ? null : nameOf(into),
        // The condition `bodyExtras` sends under, or the panel names a file the model never sees.
        sends: reworksItsOutput(role) && into !== null ? nameOf(into) : null,
      }
    },
    siblings: (state, folder) =>
      takenDocumentNames(state, folder).map(document => document.fileName),
    creates: siblings =>
      documentFileName(
        untitledDocumentName(
          siblings.map(fileName => ({ fileName })),
          'script',
        ),
        'script',
      ),
  },
  upscale: null,
  'background-removal': null,
  vectorization: null,
  other: null,
}

const namesOf = (role: AiRoleId | null): LandingNames | null => {
  const family = role === null ? null : partsOfRole(role)?.family
  return family ? LANDINGS[family] : null
}

/**
 * Where this shot would land, said before the click.
 *
 * 🛑 `derived` and `target` are separate answers: the first is the operation's own, which a
 * control deviates from, and the second is what a caller naming nothing gets — including the
 * preference, and the `null` that means the studio would have asked.
 */
export function landingChoiceOf(
  role: AiRoleId | null,
  state: DocumentsRead,
  preference: LandingPreference,
  awaits: boolean,
): LandingChoice {
  const held = role === null ? null : (namesOf(role)?.held(role, state) ?? null)
  const derived = landingOfRole(role)
  // A `document` landing with nothing in front has no file to write into.
  const offered = derived === 'document' && held?.into == null ? 'newTab' : derived

  return {
    target: offered ?? (preference === 'ask' ? (awaits ? null : 'newTab') : preference),
    derived: offered,
    into: held?.into ?? null,
    sends: held?.sends ?? null,
  }
}

/**
 * The names the destination folder already holds — what the naming below memoises on.
 *
 * 🛑 The folder is PASSED, never composed: a project whose code folder has been renamed keeps its
 * scripts there, and a name counted against the default layout would clash with a real sibling.
 */
export function landingSiblingsOf(
  role: AiRoleId | null,
  state: DocumentsRead,
  folder: string,
): readonly string[] {
  return namesOf(role)?.siblings(state, folder) ?? []
}

/**
 * The file a `newTab` landing creates.
 *
 * 🛑 Takes the siblings rather than the store: `untitledDocumentName` calls i18next once per
 * candidate — 218 µs at twenty untitled scripts — so it is memoised on that list and never read
 * from a selector.
 */
export function landingCreatesOf(
  role: AiRoleId | null,
  siblings: readonly string[],
): string | null {
  return namesOf(role)?.creates(siblings) ?? null
}
