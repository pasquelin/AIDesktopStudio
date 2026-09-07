import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiOverview, ModelCandidate, RoleRow } from '@shared/domain/aiOverview'
import { DICTATION_ROLE } from '@shared/domain/aiRole'
import { GIBI, localModel } from '@shared/domain/localModel-fixtures'
import type { ModelFamily } from '@shared/domain/model'
import { installFakeBridge } from '@/services/fakeBridge'
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

describe('AiSettings', () => {
  beforeEach(() => {
    installFakeBridge({})
    useAiModels.setState({ overview: null })
  })

  it('writes the choice for the role the candidate belongs to', () => {
    const choose = vi.fn(() => Promise.resolve(overview()))
    installFakeBridge({ ai: { choose } })
    show()

    fireEvent.click(screen.getByRole('radio', { name: /Parakeet/ }))

    expect(choose).toHaveBeenCalledWith(
      DICTATION_ROLE,
      { kind: 'local', modelId: 'parakeet' },
      'app',
    )
  })

  it('offers the publisher card on the chosen model, not on the others', () => {
    show(
      overview({
        roles: [
          row({
            chosen: { app: { kind: 'local', modelId: 'parakeet' }, project: null },
          }),
        ],
      }),
    )

    const cards = screen.getAllByRole('link', { name: 'Fiche éditeur' })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveAttribute('href', 'https://example.invalid/model')
    expect(cards[0]).toHaveAttribute('target', '_blank')
  })

  it('hides the publisher card when the model has no https page', () => {
    const own = { ...PARAKEET, model: localModel({ source: '' }) }
    show(overview({ roles: [row({ candidates: [own] })] }))

    expect(screen.queryByRole('link', { name: 'Fiche éditeur' })).not.toBeInTheDocument()
  })

  // Through the manager, so a download begun here and one begun elsewhere cannot compete for the
  // same files: the manager holds the only install lock.
  it('installs a candidate through the manager', () => {
    const install = vi.fn(() => Promise.resolve(overview()))
    installFakeBridge({ ai: { install } })
    show(overview({ roles: [row({ candidates: [{ ...PARAKEET, installed: false }] })] }))

    fireEvent.click(screen.getByRole('button', { name: 'Installer' }))

    expect(install).toHaveBeenCalledWith('parakeet')
  })

  it('does not offer Install on a catalogue entry with nothing to fetch', () => {
    show(
      overview({
        roles: [
          row({
            candidates: [
              {
                ...PARAKEET,
                installed: false,
                obstacle: 'plugin',
                fit: 'incompatible',
                model: localModel({ id: 'panfusion', name: 'PanFusion', files: [] }),
              },
            ],
          }),
        ],
      }),
    )

    expect(screen.getByText('PanFusion')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Installer' })).not.toBeInTheDocument()
  })

  // The empty choice has to be reachable again: without it, a choice made once could never
  // be given back, and a billed provider would stay selected.
  it('offers a way back to no provider', () => {
    const choose = vi.fn(() => Promise.resolve(overview()))
    installFakeBridge({ ai: { choose } })
    show(
      overview({
        roles: [row({ chosen: { app: { kind: 'local', modelId: 'parakeet' }, project: null } })],
      }),
    )

    fireEvent.click(screen.getByRole('radio', { name: /Aucun/ }))

    expect(choose).toHaveBeenCalledWith(DICTATION_ROLE, null, 'app')
  })

  it('does not offer to load or unload by hand', () => {
    show(overview({ roles: [row({ candidates: [{ ...PARAKEET, loaded: true }] })] }))

    expect(screen.queryByRole('button', { name: 'Charger' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Décharger' })).not.toBeInTheDocument()
  })

  /**
   * 🛑 A failure the person can act on: the two figures the admission weighed, said in words —
   * never a freeze, and never a stack trace.
   */
  it('says what a load asked for and what was left when it could not happen', () => {
    show(
      overview({
        loadFailure: {
          reason: 'beyond-machine',
          modelId: 'parakeet',
          neededBytes: 8 * GIBI,
          availableBytes: 3 * GIBI,
        },
      }),
    )

    expect(screen.getByRole('status')).toHaveTextContent(/8,0 Gio.*3,0 Gio/)
  })

  it('says to reinstall when the files on disk cannot be opened', () => {
    show(overview({ loadFailure: { reason: 'incomplete', modelId: 'parakeet' } }))

    expect(screen.getByRole('status')).toHaveTextContent(/Réinstallez/)
  })

  it('says a dropped download can be resumed', () => {
    show(overview({ installFailure: { reason: 'network', modelId: 'parakeet' } }))

    expect(screen.getByRole('status')).toHaveTextContent(/interrompu/)
  })

  // Their file, their disk: the word differs from "Supprimer" because the gesture does.
  it('offers to forget a supplied model rather than to delete it, and says it is unvouched for', () => {
    const supplied = { ...PARAKEET, unverified: true, supplied: true }
    show(overview({ roles: [row({ candidates: [supplied] })] }))

    expect(screen.getByRole('button', { name: 'Retirer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument()
    expect(screen.getByText(/provenance non vérifiée/)).toBeInTheDocument()
  })

  /**
   * Rank 3 of ADR-20: the gesture is theirs, and so is its refusal — the studio cannot word a
   * failure about a file it never saw anywhere but in the window that asked.
   */
  it('asks the main process for a weights file, and says when it cannot read one', async () => {
    const addOwnModel = vi.fn(() => Promise.reject(new Error('not a GGUF')))
    installFakeBridge({ ai: { addOwnModel } })
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un fichier…' }))

    expect(addOwnModel).toHaveBeenCalledOnce()
    expect(await screen.findByText(/n’est pas un modèle/)).toBeInTheDocument()
  })

  /**
   * 🛑 An employment with no local candidate shows the clouds and nothing else, and silence there
   * reads as a screen that is broken. What is missing is a MANIFEST and no longer an engine: the
   * engine serves five modalities, and the catalogue is what has nothing to offer for this one.
   */
  it('says why an employment offers no local model rather than leaving a gap', () => {
    show(overview({ roles: [row({ candidates: [], clouds: ['scenario'] })] }))

    expect(screen.getByText(/le catalogue n’en propose aucun/)).toBeInTheDocument()
  })

  // A scope with nothing to scope to would be a control that answers a question nobody asked.
  it('does not ask where a choice lands while no project is open', () => {
    show(overview({ projectPath: null }))

    expect(screen.queryByText(/Ces choix valent pour/)).not.toBeInTheDocument()
  })

  it('asks where a choice lands once a project is open', () => {
    show(overview({ projectPath: '/work/here' }))

    expect(screen.getByText(/Ces choix valent pour/)).toBeInTheDocument()
  })
})
