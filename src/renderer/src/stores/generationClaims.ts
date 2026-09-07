import type { AiRoleId } from '@shared/domain/aiRole'
import { DOCUMENT_KINDS, type DocumentKind } from '@shared/domain/document'
import type { Job } from '@shared/domain/job'
import { activeIdOfKind, useDocuments } from './documents'
import type { LandingTarget } from '@shared/domain/landingTarget'
import { claimAudioOnSubmit } from './audioGeneration'
import { claimImageOnSubmit } from './imageGeneration'
import { claimModelOnSubmit } from './modelGeneration'
import { claimSequenceOnSubmit } from './sequenceGeneration'
import { claimSkyboxOnSubmit } from './skyboxGeneration'
import { claimMaterialOnSubmit } from './materialGeneration'
import { claimScriptOnSubmit } from './codeGeneration'

/**
 * 🛑 Every workspace that has somewhere to put a result. A kind missing here is a generation that
 * lands nowhere — the result reaches the shelf, no document at all, and nothing says so.
 *
 * `Record<DocumentKind, …>` so the compiler asks for the seventh workspace's line rather than a
 * test noticing it later. The generator serves all of them and knows none.
 */
type Claim = (
  into: LandingTarget | undefined,
  role: AiRoleId | null,
  imageLayerId: string | undefined,
) => (job: Job | null) => void

/**
 * The employment is carried beside the destination because one workspace ACTS on it: a claim is
 * fanned out to all seven at once, so the Code space is told about an image generation too.
 */
const CLAIMS: Record<DocumentKind, Claim | null> = {
  skybox: claimSkyboxOnSubmit,
  image: claimImageOnSubmit,
  scene: claimModelOnSubmit,
  sequence: claimSequenceOnSubmit,
  audio: claimAudioOnSubmit,
  material: claimMaterialOnSubmit,
  script: claimScriptOnSubmit,
  // Nothing generates an interface: it is drawn, and what it SHOWS is claimed by the space the
  // picture belongs to.
  gui: null,
  // A generated model lands in the library, and a double-click on it opens a tab of its own:
  // nothing is ever poured INTO the character already open.
  character: null,
}

/**
 * Every workspace claimed in one call. Both halves are fanned out together, or a claim taken by
 * one space and settled by another would drop the result in the wrong tab.
 */
export function claimOnSubmit(
  into?: LandingTarget,
  role: AiRoleId | null = null,
  imageLayerId?: string,
): (job: Job | null) => void {
  const claims = Object.values(CLAIMS)
    .filter(claim => claim !== null)
    .map(claim => claim(into, role, imageLayerId))

  return job => {
    for (const claim of claims) claim(job)
  }
}

/**
 * Whether a result would have somewhere to go other than a tab of its own — the one condition
 * the question is worth asking under. With nothing open there is nothing to choose between.
 *
 * Read across every kind rather than for the one this generation serves: the generator serves
 * all six and knows none, which is the whole point of `CLAIMS` above.
 */
export function documentAwaits(): boolean {
  const state = useDocuments.getState()
  return DOCUMENT_KINDS.some(kind => activeIdOfKind(state, kind) !== null)
}
