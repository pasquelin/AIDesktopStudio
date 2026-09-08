import { canServe, type AiOverview } from '@shared/domain/aiOverview'
import type { AiRoleId } from '@shared/domain/aiRole'
import { ASSET_CLOUDS } from '@shared/domain/aiCloud'
import { cloudModelId } from '@shared/domain/codeGeneration'
import { useAiModels } from '@/stores/aiModels'
import { useModels } from '@/stores/models'

/**
 * The model an employment generates with — ADR-23. `RoleRow.provider` has already settled WHO
 * serves it: a local choice names its model, a cloud names only the account that pays, so the
 * model itself is then the one picked in the panel.
 */
export function resolveModelForCapability(
  role: AiRoleId,
  selected: string | undefined,
  overview: AiOverview | null,
): string | undefined {
  const row = overview?.roles.find(one => one.role === role)
  const provider = row?.provider ?? null

  if (provider?.kind === 'local') return provider.modelId

  // 🛑 A cloud with no catalogue IS the model: there is no row for the browser to have picked.
  if (provider?.kind === 'cloud' && !ASSET_CLOUDS.includes(provider.providerId)) {
    return cloudModelId(provider.providerId)
  }

  // 🛑 A model of THIS machine is never sent to a cloud: the employment is served by an account,
  // and a leftover local id would be asked of a catalogue that has never heard of it.
  const local = new Set(row?.candidates.map(one => one.model.id) ?? [])
  if (provider?.kind === 'cloud') return selected && !local.has(selected) ? selected : undefined

  return selected
}

/** Whether this id is a model of THIS machine — no account, no browser, no other app. */
export function modelIsOnThisMachine(modelId: string, overview: AiOverview | null): boolean {
  if (overview === null) return false

  return overview.roles.some(
    row =>
      (row.provider?.kind === 'local' && row.provider.modelId === modelId) ||
      row.candidates.some(one => one.model.id === modelId),
  )
}

/** Same answer as `useModelForCapability`, read once, for callers outside React. */
export function modelForCapability(role: AiRoleId): string | undefined {
  return resolveModelForCapability(
    role,
    useModels.getState().selected[role],
    useAiModels.getState().overview,
  )
}

/**
 * Whether a model of THIS machine is on the disk and usable — what a tool that RUNS one needs to
 * know, where `modelForCapability` answers which model an employment generates with. The two part
 * company the moment a cloud serves that employment: the gesture still runs the local one.
 */
export function localModelReady(modelId: string, overview: AiOverview | null): boolean {
  return (overview?.roles ?? []).some(row =>
    row.candidates.some(one => one.model.id === modelId && canServe(one)),
  )
}
