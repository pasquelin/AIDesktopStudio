import type { AiOverview, ChoiceScope } from '@shared/domain/aiOverview'
import type { AiRoleId, RoleProvider } from '@shared/domain/aiRole'
import { modelRefusalOf, type LocalModel } from '@shared/domain/localModel'
import type { ManagerDeps } from './managerTypes'
import { withWrites } from './managerHelpers'

export function assertProvidersAdmitted(
  writes: readonly { provider: RoleProvider | null }[],
  modelOf: (modelId: string) => LocalModel | null,
): void {
  for (const { provider } of writes) {
    if (provider?.kind !== 'local') continue
    const model = modelOf(provider.modelId)
    if (!model || modelRefusalOf(model) !== null) throw new Error('model is not admitted')
  }
}

export async function chooseProviders(
  deps: ManagerDeps,
  announce: () => Promise<AiOverview>,
  compose: () => Promise<AiOverview>,
  writes: readonly { role: AiRoleId; provider: RoleProvider | null }[],
  scope: ChoiceScope,
): Promise<AiOverview> {
  const stored = deps.settings()
  if (scope === 'app') {
    await deps.writeSettings({ ai: { ...stored.ai, roles: withWrites(stored.ai.roles, writes) } })
    return announce()
  }
  const path = deps.currentProjectPath()
  if (path === null) return compose()
  await deps.writeSettings({
    ai: {
      ...stored.ai,
      projectRoles: {
        ...stored.ai.projectRoles,
        [path]: withWrites(stored.ai.projectRoles[path] ?? {}, writes),
      },
    },
  })
  return announce()
}
