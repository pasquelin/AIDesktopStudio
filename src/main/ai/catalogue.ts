import {
  aiRoleId,
  ASSISTANT_ROLE,
  DICTATION_ROLE,
  partsOfRole,
  type AiRoleId,
} from '@shared/domain/aiRole'
import { STT_MODEL } from '@shared/domain/dictation'
import { CAPABILITIES_BY_FAMILY } from '@shared/domain/model'
import { modelRefusalOf, type LocalModel } from '@shared/domain/localModel'
import localModels from '@shared/domain/localModels.json'

/**
 * The shipped list, read off the JSON and keyed by the role each entry serves.
 *
 * Cast once, here: a JSON import widens every union to `string`, and the shape is held by
 * `catalogue.test.ts` rather than by a parser nothing else would use.
 */
function catalogueEntries(): readonly { role: AiRoleId; model: LocalModel }[] {
  return Object.entries(localModels).flatMap(([role, models]) =>
    (models as LocalModel[]).flatMap(model =>
      rolesOf(model, role as AiRoleId).map(one => ({
        role: one,
        model,
      })),
    ),
  )
}

/**
 * Every employment one entry serves — its JSON key, plus one per capability it declares.
 *
 * ONE entry and not three, and the difference is gigabytes: `img2img` and `inpaint` run on the
 * weights `txt2img` already downloaded, so three entries would fetch the same 4.47 GB three
 * times, show three cards, and let deleting one take the other two's files. What tells the three
 * apart is the FORM — a starting image, a mask — never a second manifest.
 */
function rolesOf(model: LocalModel, key: AiRoleId): readonly AiRoleId[] {
  const family = model.family
  const withinFamily =
    family && model.capabilities ? model.capabilities.map(one => aiRoleId(family, one)) : []

  // `serves` is already `<family>/<capability>`, and `partsOfRole` is what refuses a malformed
  // one — a role composed from data cannot be trusted the way one composed from constants is.
  const elsewhere = (model.serves ?? []).flatMap(role => {
    const parts = partsOfRole(role as AiRoleId)
    return parts ? [aiRoleId(parts.family, parts.capability)] : []
  })

  return [...new Set([key, ...withinFamily, ...elsewhere])]
}

/**
 * The models the application ships the MANIFEST of — rank 1 of ADR-20, versioned with the binary.
 *
 * The list is DATA (`localModels.json`), so a model is added without recompiling anything and its
 * digests are written by `pin-models.mjs` rather than by hand. The recognition model joins from
 * `dictation.ts`, which owns it: its files are what the engine there loads by name.
 *
 * 🛑 A download is offered only once the runtime is wired. An unwired engine may still be
 * listed (`unsupported`, no files): the choice is visible, nothing is fetched.
 */
const SHIPPED: readonly { readonly role: AiRoleId; readonly model: LocalModel }[] = [
  { role: DICTATION_ROLE, model: STT_MODEL },
  ...catalogueEntries(),
]

/**
 * The same list, indexed the two ways it is ever read — built ONCE.
 *
 * `[M]` `shippedModelsFor` used to `filter` and `map` the frozen list per role, and a compose asks
 * it once per role: twenty-two arrays allocated to answer a question whose answer cannot change.
 */
const BY_ROLE: ReadonlyMap<AiRoleId, readonly LocalModel[]> = (() => {
  const map = new Map<AiRoleId, LocalModel[]>()
  for (const entry of SHIPPED) {
    const held = map.get(entry.role) ?? []
    held.push(entry.model)
    map.set(entry.role, held)
  }

  // Lightest first, HERE and not in the order the JSON happens to be written: an entry reaching a
  // role through `serves` lands after the ones filed under it, whatever it weighs — and the first
  // usable entry is what a role takes on its own.
  for (const held of map.values()) held.sort((one, other) => one.diskBytes - other.diskBytes)

  return map
})()

const BY_ID: ReadonlyMap<string, LocalModel> = new Map(
  SHIPPED.map(entry => [entry.model.id, entry.model]),
)

/** ONCE each, however many employments it serves: one manifest is one card and one download. */
const ALL: readonly LocalModel[] = [...new Map(SHIPPED.map(e => [e.model.id, e.model])).values()]

const NONE: readonly LocalModel[] = []

/**
 * How many employments one model answers for — the inverse of `BY_ROLE`, built with it.
 *
 * What it is FOR: a person choosing between twenty-five downloads has no way to see that one of
 * them serves six employments and another serves one, and the difference is 4 GB against 133.
 */
const ROLES_BY_MODEL: ReadonlyMap<string, number> = (() => {
  const counted = new Map<string, number>()
  for (const [, models] of BY_ROLE) {
    for (const model of models) counted.set(model.id, (counted.get(model.id) ?? 0) + 1)
  }

  return counted
})()

/** How many employments this model serves, of those the catalogue files it under. */
export function rolesServedBy(modelId: string): number {
  return ROLES_BY_MODEL.get(modelId) ?? 0
}

/** Every shipped model, whatever role it serves. */
export function shippedModels(): readonly LocalModel[] {
  return ALL
}

/** What the shipped catalogue offers for a role, in the order it offers them. */
export function shippedModelsFor(role: AiRoleId): readonly LocalModel[] {
  return BY_ROLE.get(role) ?? NONE
}

/** A shipped model by id, or nothing. Ids come from manifests, so an unknown one is expected. */
export function shippedModel(id: string): LocalModel | null {
  return BY_ID.get(id) ?? null
}

/** Which roles the shipped catalogue can serve at all, before any machine has a say. */
export function rolesWithLocalOption(): readonly AiRoleId[] {
  return [...BY_ROLE.keys()]
}

/** The only loader a supplied file reaches today is llama.cpp, and it serves the conversation. */
const OWN_MODEL_ROLE: AiRoleId = ASSISTANT_ROLE

/** The catalogue as a whole — shipped, supplied, and whatever a runtime discovered (Ollama). */
export function catalogueWith(
  own: readonly LocalModel[],
  discovered: readonly LocalModel[] = [],
): readonly LocalModel[] {
  if (own.length === 0 && discovered.length === 0) return ALL

  const seen = new Set(ALL.map(model => model.id))
  const extra = [...own, ...discovered].filter(model => {
    if (seen.has(model.id)) return false
    seen.add(model.id)
    return true
  })
  return extra.length === 0 ? ALL : [...ALL, ...extra]
}

/**
 * Whether a discovered model (no family) or a declared one actually serves this role.
 *
 * 🛑 `serves` FIRST, and outside the family test: a discovered tag declares no family and no
 * capabilities, so reading it only inside that branch made the field dead for exactly the models
 * it exists for — an Ollama conversation that writes scripts was offered to the assistant alone.
 */
function discoveredServes(model: LocalModel, role: AiRoleId): boolean {
  if ((model.serves ?? []).includes(role)) return true

  const family = model.family
  const capabilities = model.capabilities
  if (family && capabilities) {
    const known = CAPABILITIES_BY_FAMILY[family]
    return capabilities.some(
      capability => known.includes(capability) && aiRoleId(family, capability) === role,
    )
  }

  return role === OWN_MODEL_ROLE
}

/** What a role can be served by, from the shipped list, the supplied one, and discoveries. */
export function modelsForWith(
  role: AiRoleId,
  own: readonly LocalModel[],
  discovered: readonly LocalModel[] = [],
): readonly LocalModel[] {
  const shipped = shippedModelsFor(role)
  const extra = [
    ...own.filter(model => discoveredServes(model, role)),
    ...discovered.filter(model => discoveredServes(model, role)),
  ]
  return extra.length === 0 ? shipped : [...shipped, ...extra]
}

/** One model by id, from either list. An unknown id is expected: manifests come and go. */
export function modelWith(
  id: string,
  own: readonly LocalModel[],
  discovered: readonly LocalModel[] = [],
): LocalModel | null {
  return (
    BY_ID.get(id) ??
    own.find(model => model.id === id) ??
    discovered.find(model => model.id === id) ??
    null
  )
}

/**
 * Every shipped model passes the whitelist, checked here rather than trusted.
 *
 * A guard rather than a comment: the catalogue is where a model enters the studio, and ADR-20 puts
 * the whitelist at the point of INSTALL and not at the point of load.
 */
export function catalogueRefusals(): readonly { model: string; refusal: string }[] {
  return SHIPPED.flatMap(entry => {
    const refusal = modelRefusalOf(entry.model)
    return refusal === null || refusal === 'distribution-blocked'
      ? []
      : [{ model: entry.model.id, refusal }]
  })
}
