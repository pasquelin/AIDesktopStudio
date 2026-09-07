import {
  CAPABILITIES_BY_FAMILY,
  currentModelFamily,
  LOCAL_RUNTIME,
  type ModelFamily,
} from './model'

/**
 * What an AI is FOR — see `docs/ci/adr/ADR-21-le-fournisseur-se-choisit-par-emploi.md`.
 *
 * A space does not have "an AI": image alone has six roles, and `inpaint` is not `txt2img`. Two
 * roles belong to no space at all. The vocabulary is the one the Scenario catalogue already uses,
 * so the local side plugs into it rather than opening a second catalogue nothing could reconcile.
 */

/**
 * `<family>/<capability>` for generation, or one of the standalone roles.
 *
 * Branded like `RuntimeEndpointId`, and for the same reason: it keys the stored preference, and a
 * malformed key in a record reads as "no choice made" rather than reddening anywhere.
 */
export type AiRoleId = string & { readonly brand: unique symbol }

/** Answers questions, and is the one role a person converses with. */
export const ASSISTANT_ROLE = 'assistant' as AiRoleId

/** Turns speech into text. The only role already served locally today. */
export const DICTATION_ROLE = 'dictation' as AiRoleId

/**
 * Turns a sentence into a vector, for the assistant's memory and nothing else.
 *
 * A role of its own rather than the assistant's model doing double duty: measured 2026-08-28, the
 * chat model scored 0.812 between a matching pair and 0.818 between an unrelated one — it does not
 * discriminate at all. And llama.cpp holds ONE model at a time, so indexing a sentence on the
 * assistant's model would evict the weights the conversation is running on.
 */
export const EMBEDDING_ROLE = 'embedding' as AiRoleId

/** Turns a composite image and a point or box into a raster selection. */
export const SMART_SELECTION_ROLE = 'smart-selection' as AiRoleId

/** The Auto Rig employment; no selected provider means the integrated geometric backend. */
export const AUTO_RIG_ROLE = aiRoleId('3d', 'rig')

/** The roles no space holds. Exported because they are the only ones a bundle NAMES. */
export const STANDALONE_ROLES: readonly AiRoleId[] = [
  ASSISTANT_ROLE,
  DICTATION_ROLE,
  EMBEDDING_ROLE,
  SMART_SELECTION_ROLE,
]

/**
 * The only way to name a generation role. It throws rather than answering null: a role is composed
 * from constants at a call site, so a malformed one is a programming error.
 */
export function aiRoleId(family: ModelFamily, capability: string): AiRoleId {
  if (!CAPABILITIES_BY_FAMILY[family].includes(capability)) {
    throw new Error(`not a capability of ${family}: ${capability}`)
  }

  // The one cast of this module beyond the standalone constants: a brand is unforgeable here alone.
  return `${family}/${capability}` as AiRoleId
}

/**
 * A role key off disk, its family brought up to date.
 *
 * A key with no slash is a FAMILY on its own — what the model browser filed a choice under before
 * ADR-23, and what its own migration still reads — or a standalone role, which no rename touches.
 */
export function currentAiRoleKey(stored: string): string {
  const slash = stored.indexOf('/')

  return slash < 0
    ? currentModelFamily(stored)
    : `${currentModelFamily(stored.slice(0, slash))}${stored.slice(slash)}`
}

/**
 * Every role the studio has, generation and standalone.
 *
 * Derived from `CAPABILITIES_BY_FAMILY` rather than listed: a family that gains a capability gains
 * its role, and a list written here would drift the day one is added. Built ONCE: it is walked on
 * every compose, so on every assistant turn.
 */
const ALL_ROLES: readonly AiRoleId[] = [
  ...STANDALONE_ROLES,
  ...Object.entries(CAPABILITIES_BY_FAMILY).flatMap(([family, capabilities]) =>
    capabilities.map(capability => `${family}/${capability}` as AiRoleId),
  ),
]

export function allRoles(): readonly AiRoleId[] {
  return ALL_ROLES
}

/** Whether the role belongs to a space, as opposed to being one of the standalone ones. */
export function isGenerationRole(role: AiRoleId): boolean {
  return partsOfRole(role) !== null
}

/**
 * The employment a workspace generates with when it only names a family.
 *
 * `null` when the family has no employment (upscale, cutout, vectorize).
 */
export function primaryRoleOf(family: ModelFamily): AiRoleId | null {
  const [capability] = CAPABILITIES_BY_FAMILY[family]
  return capability === undefined ? null : aiRoleId(family, capability)
}

/**
 * Who serves an employment, given the model picked for it — the one reading of `runsOn`.
 *
 * It is what `familyChoiceWrites` held before ADR-23 § C narrowed a pick to one employment: the
 * local/cloud rule is domain, and leaving it to each panel produced two copies of it at once.
 */
export function providerOfModel(model: { id: string; runsOn: string }): RoleProvider {
  return model.runsOn === LOCAL_RUNTIME
    ? { kind: 'local', modelId: model.id }
    : { kind: 'cloud', providerId: model.runsOn }
}

/** What the role is made of, for a caller that needs to label it. `null` for a standalone one. */
export function partsOfRole(role: AiRoleId): { family: ModelFamily; capability: string } | null {
  const [family, capability, ...rest] = role.split('/')
  if (rest.length > 0 || family === undefined || capability === undefined) return null
  if (!(family in CAPABILITIES_BY_FAMILY)) return null

  return { family: family as ModelFamily, capability }
}

/**
 * Who serves a role: a model on this machine, or one of the clouds `aiCloud.ts` lists.
 *
 * A cloud is named by its ID, never by a member of this union — decided 21/08, amending ADR-21
 * § C: one cloud is registered today, and a second must arrive as an entry in a list rather than
 * as a branch everything already written has to learn about.
 */
export type RoleProvider =
  | { readonly kind: 'local'; readonly modelId: string }
  | { readonly kind: 'cloud'; readonly providerId: string }

/**
 * What the person chose, per role. Absent means none: nothing is billed, nothing answers,
 * until they pick. `providerFor` does not fill the gap.
 */
export type RoleChoices = Readonly<Partial<Record<AiRoleId, RoleProvider>>>

/**
 * The choices that apply, the default overlaid by what one project overrides.
 *
 * A shallow merge, per ROLE: overriding the assistant in a project leaves every other role on the
 * default rather than resetting them. `null` for no project open — the default then stands alone.
 */
export function roleChoicesFor(
  defaults: RoleChoices,
  byProject: Readonly<Record<string, RoleChoices>>,
  projectPath: string | null,
): RoleChoices {
  return projectPath === null ? defaults : { ...defaults, ...byProject[projectPath] }
}

/**
 * What a role can actually be served by on this machine, right now.
 *
 * Lists rather than one id each: a choice was made among several, and comparing it to a default
 * alone would drop it in silence. There is no default — see `providerFor`.
 */
export type RoleOffer = {
  /** Every model installed AND usable, in the order the catalogue offers them. */
  readonly localModelIds: readonly string[]
  /**
   * Every model installed, whatever this machine thinks of it. A superset of the above, and it is
   * what an explicit CHOICE is honoured against — see `providerFor`.
   */
  readonly installedModelIds: readonly string[]
  /** Every cloud that both serves this role and has an account behind it. */
  readonly cloudIds: readonly string[]
}

/**
 * What serves a role — only an explicit choice, never a fill-in.
 *
 * 🛑 A key present is not a subscription to spend. Scenario is offered, never assumed: a role
 * with no choice answers nothing, even when an account is ready and even when a local model
 * is installed. Billing is a radio the person ticks.
 *
 * 🛑 A chosen local model is honoured while it is INSTALLED, not while the machine judges it
 * comfortable. Where it cannot stand, it falls back LOCALLY or not at all — never to a cloud.
 */
export function providerFor(
  role: AiRoleId,
  choices: RoleChoices,
  offer: RoleOffer,
): RoleProvider | null {
  const chosen = choices[role]

  if (chosen?.kind === 'local' && offer.installedModelIds.includes(chosen.modelId)) return chosen
  if (chosen?.kind === 'cloud' && offer.cloudIds.includes(chosen.providerId)) return chosen

  // 🛑 A local choice falls back to another LOCAL model, never to a cloud — decided 21/08, and
  // measured before it was: a runtime that stopped answering reads as "not installed" here, so an
  // Ollama nobody started moved the next sentence to a BILLED cloud without a word.
  if (chosen?.kind === 'local') {
    const model = offer.localModelIds[0]
    return model === undefined ? null : { kind: 'local', modelId: model }
  }

  return null
}
