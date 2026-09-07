import type { AiOverview, ModelCandidate } from '@shared/domain/aiOverview'
import { ASSISTANT_ROLE, partsOfRole, type AiRoleId } from '@shared/domain/aiRole'
import {
  employmentGroupsOf,
  type EmploymentGroup,
} from '@/features/home/components/ModelInventory/inventory'

/**
 * The sections a first launch picks between — the home's own employment groups, the assistant
 * first: it is the one employment the studio offers for ITSELF.
 */
export function welcomeSections(overview: AiOverview): readonly EmploymentGroup[] {
  return [...employmentGroupsOf(overview)].sort((one, other) => rank(one) - rank(other))
}

function rank(group: EmploymentGroup): number {
  return group.role === ASSISTANT_ROLE ? 0 : 1
}

/**
 * What one section can download, lightest first and each model ONCE — 🛑 the overview is keyed by
 * employment and one model answers several, so a flat walk offers the same download three times.
 */
export function sectionModels(
  overview: AiOverview,
  group: EmploymentGroup,
  top: number,
): readonly ModelCandidate[] {
  const held = new Map<string, ModelCandidate>()

  for (const row of overview.roles) {
    if (!holds(group, row.role)) continue
    for (const candidate of row.candidates) {
      if (!held.has(candidate.model.id)) held.set(candidate.model.id, candidate)
    }
  }

  return [...held.values()]
    .sort((one, other) => one.model.diskBytes - other.model.diskBytes)
    .slice(0, top)
}

function holds(group: EmploymentGroup, role: AiRoleId): boolean {
  if (group.family === null) return group.role === role
  return partsOfRole(role)?.family === group.family
}
