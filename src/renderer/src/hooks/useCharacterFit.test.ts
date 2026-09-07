import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { aiOverview, roleRow } from '@shared/domain/aiOverview-fixtures'
import type { ModelCandidate, RoleRow } from '@shared/domain/aiOverview'
import { AUTO_RIG_ROLE, type RoleProvider } from '@shared/domain/aiRole'
import { localModel } from '@shared/domain/localModel-fixtures'
import { queryHost } from '@/features/shell/components/query-fixtures'
import { useAiModels } from '@/stores/aiModels'
import { useCharacterFit, type CharacterFit } from './useCharacterFit'

const rigger = (id: string, over: Partial<ModelCandidate> = {}): ModelCandidate => ({
  model: localModel({ id, name: id, backendId: id }),
  installed: true,
  loaded: false,
  holdable: true,
  unverified: false,
  supplied: false,
  serves: 1,
  fit: 'compatible',
  obstacle: null,
  ...over,
})

const local = (modelId: string): RoleProvider => ({ kind: 'local', modelId })

const inspector = (
  candidates: readonly ModelCandidate[],
  serving: string | null,
  chosen: Partial<RoleRow['chosen']> = {},
): CharacterFit => {
  useAiModels.setState({
    overview: aiOverview({
      roles: [
        roleRow({
          role: AUTO_RIG_ROLE,
          candidates,
          provider: serving === null ? null : local(serving),
          chosen: { app: null, project: null, ...chosen },
        }),
      ],
    }),
  })
  const { result } = renderHook(() => useCharacterFit('asset', 'document', 'node', null), {
    wrapper: queryHost(),
  })
  return result.current
}

const offered = (candidates: readonly ModelCandidate[], serving: string | null): string[] =>
  inspector(candidates, serving).rigBackends.map(one => one.backendId)

beforeEach(() => {
  useAiModels.setState({ overview: null })
})

describe('the rig backends the inspector offers', () => {
  /** `canServe` is the repo's answer to « may this be OFFERED », and the machine is half of it. */
  it('drops a backend the machine refuses, unless it is the one serving today', () => {
    const refused = rigger('make-it-animatable', { fit: 'insufficient-memory' })

    expect(offered([refused], null)).toEqual([])
    expect(offered([refused], 'make-it-animatable')).toEqual(['make-it-animatable'])
  })
})

describe('the backend the inspector says it will use', () => {
  /** Silently rigging in simple over a chosen engine was the defect; the field has to name it. */
  it('names the chosen engine while it is missing from the disk, so Create can refuse', () => {
    const absent = rigger('make-it-animatable', { installed: false })

    const state = inspector([absent], null, { app: local('make-it-animatable') })

    expect(state.selectedBackend).toBe('make-it-animatable')
    expect(state.needsDownload).toBe(true)
    expect(state.rigBackends.map(one => one.backendId)).toEqual(['make-it-animatable'])
  })
})
