import {
  CAPABILITIES_BY_FAMILY,
  LOCAL_RUNTIME,
  MODEL_ORIGINS,
  MODEL_PERIODS,
  MODEL_SORTS,
  PUBLISHERS_BY_FAMILY,
  studioCapability,
  tagLabel,
  TAGS_BY_FAMILY,
  type ModelFamily,
  type ModelPeriod,
  type ModelQuery,
  type ModelSort,
} from '@shared/domain/model'
import { CLOUD_PROVIDERS, SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import { providerOf, type AccountSummary } from '@shared/domain/account'
import {
  selectedValues,
  type CollectionState,
  type FacetDescriptor,
} from '@/helpers/collectionState'

export const RUNTIME_FACET = 'runtime'
export const ORIGIN_FACET = 'origin'
export const CAPABILITY_FACET = 'capability'
export const TAG_FACET = 'tag'
export const PUBLISHER_FACET = 'publisher'
export const PERIOD_FACET = 'period'

/**
 * What the panel may narrow by, which is not every employment a family has.
 *
 * A studio capability that narrows NOTHING is left out — `upscale`, `cutout` and `vectorize` are
 * the whole membership of their family, so the option would be ticked over a list it cannot
 * shorten. `rig` and `motion` stay: they cut nineteen models down to five and six, and so do the
 * two panorama employments, which `answers` tells apart.
 */
function filterCapabilitiesOf(family: ModelFamily): readonly string[] {
  return CAPABILITIES_BY_FAMILY[family].filter(capability => {
    const studio = studioCapability(capability)
    return studio === undefined || studio.answers !== undefined || studio.tags !== undefined
  })
}

/** Translates a key into user text. Taking it as an argument keeps this module renderless. */
type Translate = (key: string) => string

/**
 * The facets the API can actually answer, plus the one it cannot: WHERE a model runs.
 *
 * Category, author, rating and generation time are absent on purpose: measured over the 642 public
 * models, `class`, `performanceStats` and the author name come back empty on every single one.
 *
 * `clouds` is what an account is held for, and a cloud with none is not offered — a filter whose
 * only possible answer is "no result" is worse than no filter. The local option is always there:
 * this machine needs no account.
 */
export function facetsFor(
  family: ModelFamily,
  t: Translate,
  clouds: readonly string[],
): FacetDescriptor[] {
  const facets = baseFacets(t, clouds)
  const capabilities = filterCapabilitiesOf(family)
  if (capabilities.length) {
    facets.push({
      key: CAPABILITY_FACET,
      label: t('models.capability'),
      options: capabilities.map(value => ({ value, label: t(`capabilities.${value}`) })),
    })
  }

  const tags = TAGS_BY_FAMILY[family]
  if (tags.length) {
    facets.push({
      key: TAG_FACET,
      label: t('models.tag'),
      options: tags.map(value => ({ value, label: tagLabel(value, t) })),
    })
  }

  const publishers = PUBLISHERS_BY_FAMILY[family]
  if (publishers.length) {
    facets.push({
      key: PUBLISHER_FACET,
      label: t('models.publisher'),
      options: publishers.map(value => ({ value, label: value })),
    })
  }

  facets.push({
    key: PERIOD_FACET,
    label: t('models.period'),
    options: MODEL_PERIODS.map(value => ({ value, label: t(`periods.${value}`) })),
  })

  return facets
}

function baseFacets(t: Translate, clouds: readonly string[]): FacetDescriptor[] {
  return [
    {
      key: RUNTIME_FACET,
      label: t('models.runtime'),
      options: [
        { value: LOCAL_RUNTIME, label: t('models.runsLocally') },
        ...clouds.map(value => ({ value, label: t(`aiClouds.${value}`) })),
      ],
    },
    {
      key: ORIGIN_FACET,
      label: t('models.origin'),
      options: [
        { value: 'official', label: t('models.official') },
        { value: 'community', label: t('models.community') },
      ],
    },
  ]
}

/**
 * Cost and speed are missing on purpose: both live in `performanceStats`, which comes back
 * empty on every public model — through the listing, the search index and `GET /models/{id}`.
 */
export function sortOptions(t: Translate): { value: ModelSort; label: string }[] {
  return MODEL_SORTS.map(value => ({ value, label: t(`sorts.${value}`) }))
}

/** Keeps only what the facet still offers — see `queryFrom`. */
function offered(
  state: CollectionState,
  facet: string,
  options: readonly string[],
): readonly string[] {
  return selectedValues(state, facet).filter(value => options.includes(value))
}

/** A persisted state can hold a value the facet no longer offers; anything else is ignored. */
function chosen<T extends string>(
  state: CollectionState,
  facet: string,
  allowed: readonly T[],
): T | undefined {
  const [value] = selectedValues(state, facet)
  return allowed.find(candidate => candidate === value)
}

/**
 * The clouds this family may be listed from — those a key is actually held for.
 *
 * 🛑 Per CLOUD, and the Scenario probe alone cannot say it: `authenticated` reads that one key,
 * so a studio holding only a second cloud's key was offered nothing at all, and the models of
 * the service the person is paying for could not be reached from the panel. Scenario keeps the
 * probe — a stored key it refuses lists nothing — and every other cloud answers on its account.
 */
export function cloudsHeldFor(
  family: ModelFamily,
  authenticated: boolean,
  accounts: readonly AccountSummary[],
): string[] {
  return CLOUD_PROVIDERS.filter(
    cloud =>
      cloud.families.includes(family) &&
      (cloud.id === SCENARIO_CLOUD
        ? authenticated
        : accounts.some(account => account.active && providerOf(account) === cloud.id)),
  ).map(cloud => cloud.id)
}

/**
 * Turns what the bar holds into what the API is asked. `runsOn` defaults to this machine:
 * an account is not a reason to list billed models. Only some of it narrows server-side —
 * family and capability are applied by the registry, which is why walking is bounded there.
 *
 * Every value is checked against what THIS family offers. Not because the state travels between
 * spaces — it no longer does, `useModels` files one per family — but because a state PERSISTED
 * before a facet's options changed still holds what it offered then: the menu shows nothing
 * selected while the query carries a value, and the panel comes back empty with nothing on
 * screen to relax. That is the shape the crossing bug took, and it outlived the crossing.
 */
export function queryFrom(
  state: CollectionState,
  family: ModelFamily,
  search: string,
  clouds: readonly string[],
): ModelQuery {
  const runsOn = chosen(state, RUNTIME_FACET, [LOCAL_RUNTIME, ...clouds]) ?? LOCAL_RUNTIME
  const capabilities = offered(state, CAPABILITY_FACET, filterCapabilitiesOf(family))
  // One parameter for both: the API matches a publisher exactly as it matches any other tag.
  const tags = [
    ...offered(state, TAG_FACET, TAGS_BY_FAMILY[family]),
    ...offered(state, PUBLISHER_FACET, PUBLISHERS_BY_FAMILY[family]),
  ]
  const origin = chosen(state, ORIGIN_FACET, MODEL_ORIGINS)
  const since = chosen<ModelPeriod>(state, PERIOD_FACET, MODEL_PERIODS)
  const trimmed = search.trim()

  return {
    family,
    sort: MODEL_SORTS.find(candidate => candidate === state.sort) ?? 'relevance',
    runsOn,
    ...(trimmed ? { search: trimmed } : {}),
    ...(origin ? { origin } : {}),
    ...(capabilities.length ? { capabilities } : {}),
    ...(tags.length ? { tags } : {}),
    ...(since ? { since } : {}),
  }
}
