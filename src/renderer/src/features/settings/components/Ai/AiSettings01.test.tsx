import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiOverview, ModelCandidate, RoleRow } from '@shared/domain/aiOverview'
import { aiRoleId, DICTATION_ROLE } from '@shared/domain/aiRole'
import { GIBI, localModel } from '@shared/domain/localModel-fixtures'
import type { ModelFamily } from '@shared/domain/model'
import { FIELD_THUMBNAIL } from '@/components/styles'
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

  it('imports a motion bundle through the shared model manager', async () => {
    const addOwnModel = vi.fn().mockResolvedValue(overview())
    installFakeBridge({ ai: { addOwnModel } })
    show(overview(), '3d')
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un dossier de mouvement' }))
    await vi.waitFor(() => expect(addOwnModel).toHaveBeenCalledWith('motion', expect.any(String)))
  })

  it('shows progress and stops verification of a supplied folder', async () => {
    let report = (_progress: { id: string; ratio: number }) => {}
    let resolve!: (value: AiOverview) => void
    const addOwnModel = vi.fn(
      (_profile, _taskId) =>
        new Promise<AiOverview>(done => {
          resolve = done
        }),
    )
    const cancel = vi.fn().mockResolvedValue(true)
    installFakeBridge({
      ai: { addOwnModel },
      tasks: {
        cancel,
        onProgress: callback => {
          report = callback
          return () => {}
        },
      },
    })
    show(overview(), '3d')
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un dossier de mouvement' }))
    const id = addOwnModel.mock.calls[0]?.[1]
    expect(typeof id).toBe('string')
    act(() => report({ id, ratio: 0.5 }))
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await vi.waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
    expect(cancel).toHaveBeenCalledWith(id)
    expect(screen.getByRole('button', { name: 'Ajouter un dossier de mouvement' })).toBeEnabled()
    await act(async () => resolve(overview()))
  })

  it('shows local engine setup beside motion models before choosing one', async () => {
    const installEngine = vi.fn().mockResolvedValue(overview())
    installFakeBridge({ ai: { installEngine } })
    show(
      overview({
        roles: [
          row({
            role: aiRoleId('3d', 'motion'),
            provider: null,
            candidates: [
              {
                ...PARAKEET,
                installed: false,
                model: localModel({
                  id: 'motion',
                  name: 'Motion',
                  loader: 'plugin',
                  licence: 'Apache-2.0',
                }),
              },
            ],
          }),
        ],
        engine: {
          profile: 'motion',
          known: true,
          missing: ['torch'],
          progress: null,
          failed: false,
        },
      }),
      '3d',
    )
    expect(screen.getByRole('button', { name: 'Installer les bibliothèques' })).toBeEnabled()
    fireEvent.click(screen.getByText('3D · Animation'))
    expect(screen.getByText(/Le modèle de mouvement et son encodeur/)).toBeVisible()
    expect(screen.getByText(/Apache-2.0/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Fiche éditeur' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Installer les bibliothèques' }))
    await vi.waitFor(() => expect(installEngine).toHaveBeenCalledWith('motion'))
  })

  /**
   * A card that generates on the processor lacks NOTHING, so the button used to vanish — while
   * the verdict on its models told the person to install the libraries again.
   */
  it('still offers the repair when the door is complete and its torch has no CUDA', () => {
    show(
      overview({
        engine: { known: true, missing: [], progress: null, failed: false, cuda: 'repairable' },
      }),
    )

    expect(screen.getByText(/génère sur le processeur/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Installer les bibliothèques' })).toBeEnabled()
  })

  it('puts the catalogue line under a candidate, not only its size', () => {
    show(
      overview({
        roles: [
          row({
            candidates: [
              {
                ...PARAKEET,
                model: localModel({
                  summary: 'Fastest open image-to-mesh',
                  releasedAt: '2024-03-04',
                }),
              },
            ],
          }),
        ],
      }),
    )

    expect(screen.getByText(/2024 · Fastest open image-to-mesh/)).toBeInTheDocument()
  })

  /**
   * `Thumbnail` fills the box a `Row` hands it, and these windows have no `Row` at all: left to
   * that default the picture claimed the whole width of its line and refused to shrink, drawing
   * a 256px portrait over the name beside it. Twice in two days, hence a case rather than a rule.
   */
  it('names the size of a candidate picture rather than letting it fill the line', () => {
    show()

    expect(document.querySelector('img')?.className).toContain(FIELD_THUMBNAIL)
  })

  it('says nothing about the machine before the main process has answered', () => {
    render(<AiSettings />)

    expect(screen.getByText(/Lecture de la machine/)).toBeInTheDocument()
  })

  // One line per EMPLOYMENT, never one per model: the screen answers "what serves dictation",
  // which is the question somebody opens it with.
  it('warns that nothing is billed until a provider is chosen', () => {
    show(overview({ roles: [row({ provider: null })] }))

    expect(
      screen.getByText(/Rien n’est facturé tant que vous n’en avez pas validé un/),
    ).toBeInTheDocument()
  })

  it('keeps generation employments off the overview', () => {
    show(overview({ roles: [row(), row({ role: aiRoleId('image', 'inpaint'), candidates: [] })] }))

    expect(screen.getByText('Dictée')).toBeInTheDocument()
    expect(screen.getAllByText(/Parakeet/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Image · Retouche interne')).not.toBeInTheDocument()
  })

  it('shows one family of employments, and none of the others', () => {
    show(
      overview({ roles: [row(), row({ role: aiRoleId('image', 'inpaint'), candidates: [] })] }),
      'image',
    )

    expect(screen.getByText('Image · Retouche interne')).toBeInTheDocument()
    expect(screen.queryByText('Dictée')).not.toBeInTheDocument()
    expect(screen.queryByText('Ollama')).not.toBeInTheDocument()
    expect(screen.queryByText(/libres sur/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter un fichier…' })).not.toBeInTheDocument()
  })

  /**
   * Nothing is hidden and everything is explained: a model the machine cannot take stays on
   * screen, unpickable, carrying the figures that say why.
   */
  it('keeps a model too heavy visible, greyed, with its reason', () => {
    show()

    const radio = screen.getByRole('radio', { name: /HiDream/ })
    expect(radio).toBeDisabled()
    expect(screen.getByText(/place insuffisante — 48/)).toBeInTheDocument()
  })

  it('names Ollama once, without listing models that serve another employment', () => {
    show(
      overview({
        ollama: {
          ready: true,
          installed: true,
          names: ['alpha:1', 'beta:2'],
          progress: null,
          failed: false,
        },
        roles: [row({ role: aiRoleId('image', 'txt2img'), candidates: [PARAKEET] })],
      }),
    )

    expect(screen.getAllByText('Ollama')).toHaveLength(1)
    expect(screen.queryByText(/alpha:1/)).not.toBeInTheDocument()
    expect(screen.getByText(/2 modèles prêts/)).toBeInTheDocument()
    expect(screen.getByText(/ouvrez Assistant plus bas/)).toBeInTheDocument()
  })

  it('offers to install Ollama when it is not on this computer', () => {
    const installOllama = vi.fn(() => Promise.resolve(overview()))
    installFakeBridge({ ai: { installOllama } })
    show(
      overview({
        ollama: { ready: false, installed: false, names: [], progress: null, failed: false },
        engine: { known: false, missing: [], progress: null, failed: false },
        roles: [row({ role: aiRoleId('image', 'txt2img'), candidates: [PARAKEET] })],
      }),
    )

    expect(screen.getByText(/n’est pas sur cet ordinateur/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Installer Ollama' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Installer Ollama' }))
    expect(installOllama).toHaveBeenCalledOnce()
  })

  it('says the install failed without pretending Ollama is here', () => {
    show(
      overview({
        ollama: { ready: false, installed: false, names: [], progress: null, failed: true },
        engine: { known: false, missing: [], progress: null, failed: false },
        roles: [row({ role: aiRoleId('image', 'txt2img'), candidates: [PARAKEET] })],
      }),
    )

    expect(screen.getByText(/n’a pas marché/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Installer Ollama' })).toBeInTheDocument()
  })

  it('groups Ollama models away from the studio catalogue', () => {
    const ollama: ModelCandidate = {
      ...PARAKEET,
      model: localModel({
        id: 'qwen3:8b',
        name: 'qwen3:8b',
        format: 'gguf',
        loader: 'ollama',
        files: [],
      }),
    }
    show(
      overview({
        roles: [row({ candidates: [PARAKEET, ollama], clouds: ['scenario'] })],
      }),
    )

    expect(screen.getByText('Sur cet ordinateur')).toBeInTheDocument()
    expect(screen.getByText(/Le studio fait tourner le modèle ici/)).toBeInTheDocument()
    expect(screen.getAllByText('Ollama').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Ollama est un logiciel sur cet ordinateur/)).not.toHaveLength(0)
    expect(screen.getByText('En ligne')).toBeInTheDocument()
    expect(screen.getByText(/Les serveurs Scenario/)).toBeInTheDocument()
    expect(screen.getByText('qwen3:8b')).toBeInTheDocument()
  })
})
