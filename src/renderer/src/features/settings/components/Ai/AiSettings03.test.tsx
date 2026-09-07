import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AiOverview, ModelCandidate, RoleRow } from '@shared/domain/aiOverview'
import { DICTATION_ROLE } from '@shared/domain/aiRole'
import { GIBI, localModel } from '@shared/domain/localModel-fixtures'
import type { ModelFamily } from '@shared/domain/model'
import { useAiModels } from '@/stores/aiModels'
import { AiSettings } from './AiSettings'

const PARAKEET: ModelCandidate = {
  model: localModel(),
  installed: true,
  loaded: false,
  holdable: true,
  unverified: false,
  supplied: false,
  serves: 1,
  fit: 'compatible',
  obstacle: null,
}

const HUGE: ModelCandidate = {
  model: localModel({ id: 'hidream', name: 'HiDream', reservationBytes: 48 * GIBI }),
  installed: false,
  loaded: false,
  holdable: true,
  unverified: false,
  supplied: false,
  serves: 1,
  fit: 'insufficient-memory',
  obstacle: 'memory',
}

const row = (over: Partial<RoleRow> = {}): RoleRow => ({
  role: DICTATION_ROLE,
  provider: { kind: 'local', modelId: 'parakeet' },
  chosen: { app: null, project: null },
  candidates: [PARAKEET, HUGE],
  clouds: [],
  ...over,
})

const overview = (over: Partial<AiOverview> = {}): AiOverview => ({
  roles: [row()],
  machine: {
    physicalBytes: 96 * GIBI,
    availableBytes: 34 * GIBI,
    diskFreeBytes: 500 * GIBI,
    gpu: 'Apple M2 Max',
    vram: null,
  },
  projectPath: null,
  installing: null,
  loading: null,
  loadFailure: null,
  installFailure: null,
  ollama: { ready: false, installed: false, names: [], progress: null, failed: false },
  engine: { known: false, missing: [], progress: null, failed: false },
  ...over,
})

const show = (one: AiOverview = overview(), family?: ModelFamily) => {
  useAiModels.setState({ overview: one })
  render(<AiSettings family={family} />)
}

describe('a summary written before a field existed', () => {
  /**
   * 🛑 Measured on screen: `AiSettings: Cannot read properties of undefined (reading
   * 'totalBytes')`, and the whole panel went with it. The type says `vram: … | null`, but this
   * crosses IPC — a summary that simply has no key is not `null`, and `=== null` let it through.
   */
  it('draws the machine even when a figure it expected is absent', () => {
    const machine = { physicalBytes: GIBI, availableBytes: GIBI, diskFreeBytes: GIBI, gpu: null }
    // Cast: the point is exactly a payload the type says cannot arrive, and does.
    show(overview({ machine: machine as AiOverview['machine'] }))

    expect(screen.getByText(/libres sur/)).toBeInTheDocument()
  })
})
