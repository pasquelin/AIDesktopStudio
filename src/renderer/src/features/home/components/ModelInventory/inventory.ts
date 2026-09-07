import {
  servedBy,
  type AiOverview,
  type ModelCandidate,
  type RoleRow,
} from '@shared/domain/aiOverview'
import { CLOUD_IDS, type CloudProviderId } from '@shared/domain/aiCloud'
import { partsOfRole, type AiRoleId } from '@shared/domain/aiRole'
import { fitAllowsUse } from '@shared/domain/modelFit'
import { MODEL_FAMILIES, type ModelFamily } from '@shared/domain/model'
import { roleLabel } from '@/helpers/roleLabel'

/** What the band's blocks all need, and none owns. */
export type Translate = (key: string, values?: Record<string, string | number>) => string

export type LocalStanding = {
  installed: number
  /** What those installed weigh, added once each. */
  installedBytes: number
  /** Resident in memory right now, which is what "activate" means — ADR-21 § D. */
  loaded: number
  /** Not installed, and this machine could hold them. */
  offered: number
  /** Not installed, and it could not run them. Counted so the band can say so rather than hide it. */
  outOfReach: number
}

/**
 * What the machine holds, counted over DISTINCT models.
 *
 * 🛑 The overview is keyed by EMPLOYMENT and one download answers up to six of them, so a flat
 * walk of the candidate lists counts SSD-1B six times and its 4.47 GB with it.
 */
export function localStandingOf(overview: AiOverview): LocalStanding {
  const seen = new Map<
    string,
    { installed: boolean; loaded: boolean; usable: boolean; bytes: number }
  >()

  for (const row of overview.roles) {
    for (const one of row.candidates) {
      seen.set(one.model.id, {
        installed: one.installed,
        loaded: one.loaded,
        usable: fitAllowsUse(one.fit),
        bytes: one.model.diskBytes,
      })
    }
  }

  const standing: LocalStanding = {
    installed: 0,
    installedBytes: 0,
    loaded: 0,
    offered: 0,
    outOfReach: 0,
  }

  for (const model of seen.values()) {
    if (!model.installed) {
      if (model.usable) standing.offered += 1
      else standing.outOfReach += 1
      continue
    }

    standing.installed += 1
    standing.installedBytes += model.bytes
    if (model.loaded) standing.loaded += 1
  }

  return standing
}

/**
 * The clouds with an account behind them, in the registry's order. Read off the rows, where
 * `clouds` already means "serves this role AND has a key" — asking a second way is how two
 * answers drift.
 */
export function cloudIdsOf(overview: AiOverview): readonly CloudProviderId[] {
  const held = new Set(overview.roles.flatMap(row => row.clouds))

  return CLOUD_IDS.filter(id => held.has(id))
}

/** What a group is called on screen. Read by the home band and by the welcome, one reading. */
export function employmentLabelOf(group: EmploymentGroup, t: Translate): string {
  return group.family === null ? roleLabel(group.role, t) : t(`families.${group.family}`)
}

/** One line of the employment list: a whole family, or one of the roles no family holds. */
export type EmploymentGroup = {
  /** React key. The label comes from whichever of `family` and `role` is set. */
  key: string
  served: number
  total: number
  /**
   * The row itself where the group holds exactly ONE employment — that is where naming what
   * serves it says more than a tally. Always set on a standalone role, which is a group of one.
   */
  sole: RoleRow | null
} & ({ family: ModelFamily; role: null } | { family: null; role: AiRoleId })

/**
 * The list, families first in the registry's order and the standalone roles after them.
 *
 * The denominator is what the OVERVIEW offers rather than every employment the studio names: the
 * main process drops the roles nothing could serve, and counting those in would tell someone with
 * a full machine that they are two thirds of the way there.
 */
export function employmentGroupsOf(overview: AiOverview): readonly EmploymentGroup[] {
  const byFamily = new Map<ModelFamily, RoleRow[]>()
  const standalone: RoleRow[] = []

  for (const row of overview.roles) {
    const family = partsOfRole(row.role)?.family
    if (family === undefined) {
      standalone.push(row)
      continue
    }

    const held = byFamily.get(family) ?? []
    held.push(row)
    byFamily.set(family, held)
  }

  const families = MODEL_FAMILIES.flatMap(family => {
    const rows = byFamily.get(family)
    if (rows === undefined) return []

    return [
      {
        key: family,
        family,
        role: null,
        served: rows.filter(servedBy).length,
        total: rows.length,
        sole: rows.length === 1 ? (rows[0] ?? null) : null,
      },
    ]
  })

  return [
    ...families,
    ...standalone.map(row => ({
      key: row.role,
      family: null,
      role: row.role,
      served: servedBy(row) ? 1 : 0,
      total: 1,
      sole: row,
    })),
  ]
}

/** One model of the catalogue, weighed by what a single download would answer for. */
export type Coverage = {
  readonly id: string
  readonly name: string
  readonly diskBytes: number
  /** How many employments this ONE download serves, as the main process counted them. */
  readonly employments: number
  /** The families those employments span — what makes a model transverse rather than deep. */
  readonly families: readonly ModelFamily[]
  readonly installed: boolean
  /** Whether this machine could run it. Shown greyed rather than dropped. */
  readonly usable: boolean
}

/**
 * The catalogue ranked by what ONE download buys, most first.
 *
 * The question the manager cannot answer at a glance: twenty-five models for nineteen
 * employments, and the difference between them is not the quality — SSD-1B serves six for
 * 4.47 GB where Mochi serves one for 133. Ties go to the lighter one.
 *
 * The families come from the ROWS a model is a candidate of, not from its own `family`: a model
 * filed under Image that also serves Texture is exactly what this is looking for, and its own
 * field names only where its card is filed.
 */
export function coverageOf(overview: AiOverview, top: number): readonly Coverage[] {
  const held = new Map<string, { candidate: ModelCandidate; families: Set<ModelFamily> }>()

  for (const row of overview.roles) {
    const family = partsOfRole(row.role)?.family
    for (const candidate of row.candidates) {
      const entry = held.get(candidate.model.id) ?? { candidate, families: new Set<ModelFamily>() }
      if (family !== undefined) entry.families.add(family)
      held.set(candidate.model.id, entry)
    }
  }

  return [...held.values()]
    .map(({ candidate, families }) => ({
      id: candidate.model.id,
      name: candidate.model.name,
      diskBytes: candidate.model.diskBytes,
      employments: candidate.serves,
      families: MODEL_FAMILIES.filter(one => families.has(one)),
      installed: candidate.installed,
      usable: fitAllowsUse(candidate.fit),
    }))
    .sort((one, other) => other.employments - one.employments || one.diskBytes - other.diskBytes)
    .slice(0, top)
}

/**
 * What would change the most, said as a sentence the reader can act on.
 *
 * Ordered by what it COSTS, not by what it unlocks: choosing among models already on the disk
 * costs nothing, installing costs gigabytes, and a key costs money — so a studio is never told
 * to spend before it has been told it already holds the answer.
 */
export type Advice =
  | { readonly kind: 'choose'; readonly roles: readonly AiRoleId[] }
  | { readonly kind: 'install'; readonly coverage: Coverage }
  | { readonly kind: 'key' }

/**
 * Operations with a model already on the disk and nothing chosen to run it.
 *
 * The ROLES rather than their count: « 2 operations » says nothing about which two, and a reader
 * cannot act on a number. The sentence names them.
 */
function unchosen(overview: AiOverview): readonly AiRoleId[] {
  return overview.roles
    .filter(row => row.provider === null && row.candidates.some(one => one.installed))
    .map(row => row.role)
}

export function adviceOf(overview: AiOverview, clouds: readonly string[]): readonly Advice[] {
  const idle = unchosen(overview)
  const worth = coverageOf(overview, 8).find(one => !one.installed && one.usable)

  const choose: Advice = { kind: 'choose', roles: idle }
  const key: Advice = { kind: 'key' }

  return [
    ...(idle.length > 0 ? [choose] : []),
    ...(worth ? [{ kind: 'install', coverage: worth } satisfies Advice] : []),
    // Said only once nothing at all is connected: a studio with one key does not need telling
    // that keys exist.
    ...(clouds.length === 0 ? [key] : []),
  ].slice(0, 2)
}

/**
 * Every employment, and how many of them are served — the one figure that says where a studio
 * stands before any of the detail under it.
 *
 * Summed over the GROUPS rather than over the roles, so it agrees line for line with the list
 * beside it: two readings of one number that disagree is worse than one reading.
 */
export function servedTotalsOf(overview: AiOverview): { served: number; total: number } {
  return employmentGroupsOf(overview).reduce(
    (sum, group) => ({ served: sum.served + group.served, total: sum.total + group.total }),
    { served: 0, total: 0 },
  )
}
