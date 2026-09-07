import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiOverview, ModelCandidate, RoleRow } from '@shared/domain/aiOverview'
import { aiRoleId, ASSISTANT_ROLE } from '@shared/domain/aiRole'
import { GIBI, localModel } from '@shared/domain/localModel-fixtures'
import { EMPTY_AI_OVERVIEW } from '@/services/fakeAiOverview'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAiModels } from '@/stores/aiModels'
import { WelcomeSlideModels } from './WelcomeSlideModels'

const candidate = (id: string, name: string, diskBytes = GIBI): ModelCandidate => ({
  model: localModel({ id, name, diskBytes }),
  installed: false,
  loaded: false,
  holdable: true,
  unverified: false,
  supplied: false,
  serves: 1,
  fit: 'compatible',
  obstacle: null,
})

const row = (role: RoleRow['role'], candidates: readonly ModelCandidate[]): RoleRow => ({
  role,
  provider: null,
  chosen: { app: null, project: null },
  candidates,
  clouds: [],
})

const overview = (over: Partial<AiOverview> = {}): AiOverview => ({
  ...EMPTY_AI_OVERVIEW,
  roles: [
    row(ASSISTANT_ROLE, [candidate('qwen', 'Qwen2.5 0.5B Instruct')]),
    row(aiRoleId('image', 'txt2img'), [candidate('sdxl', 'SDXL', 4 * GIBI)]),
    // The same download answers a second employment of the family: the section names it once.
    row(aiRoleId('image', 'img2img'), [candidate('sdxl', 'SDXL', 4 * GIBI)]),
  ],
  machine: { ...EMPTY_AI_OVERVIEW.machine, availableBytes: 32 * GIBI },
  ...over,
})

const show = (one: AiOverview | null = overview()): void => {
  useAiModels.setState({ overview: one })
  render(<WelcomeSlideModels />)
}

describe('WelcomeSlideModels', () => {
  beforeEach(() => {
    installFakeBridge()
    useAiModels.setState({ overview: null })
  })

  it('waits for the machine rather than showing an empty catalogue', () => {
    show(null)
    expect(screen.getByText('Lecture de la machine…')).toBeInTheDocument()
  })

  it('opens on the assistant, whatever order the employments arrive in', () => {
    show()
    expect(screen.getByText('Qwen2.5 0.5B Instruct')).toBeInTheDocument()
    expect(screen.queryByText('SDXL')).toBeNull()
  })

  it('shows the models of the section that is picked', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Image' }))

    // Once, though two employments of the family both hold it.
    expect(screen.getAllByText('SDXL')).toHaveLength(1)
    expect(screen.queryByText('Qwen2.5 0.5B Instruct')).toBeNull()
  })

  it('offers optional motion without starting a download', async () => {
    const install = vi.fn()
    installFakeBridge({ ai: { install } })
    show(overview({ roles: [row(aiRoleId('3d', 'motion'), [candidate('motion', 'Motion')])] }))
    expect(screen.getByText(/La génération de mouvements est optionnelle/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Installer' })).toBeEnabled()
    expect(install).not.toHaveBeenCalled()
  })

  it('downloads the model the reader asks for', async () => {
    const install = vi.fn().mockResolvedValue(overview())
    installFakeBridge({ ai: { install } })
    show()

    await userEvent.click(screen.getByRole('button', { name: 'Installer' }))

    expect(install).toHaveBeenCalledWith('qwen')
  })
})
