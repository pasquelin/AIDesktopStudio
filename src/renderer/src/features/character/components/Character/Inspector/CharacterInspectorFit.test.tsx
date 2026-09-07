import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { i18n as I18n, TFunction } from 'i18next'
import type { CharacterFit } from '@/hooks/useCharacterFit'
import { CharacterInspectorFit } from './CharacterInspectorFit'

// Typed against what the hook really returns: the mock had drifted from it without a word.
const useCharacterFit = vi.hoisted(() => vi.fn<() => CharacterFit>())

vi.mock('@/hooks/useCharacterFit', () => ({ useCharacterFit }))

const chooseBackend = vi.fn()
const setMiaOptions = vi.fn()
const fit = vi.fn()
const sample = {
  bounds: { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } },
  points: new Float32Array(),
}

beforeEach(() => {
  chooseBackend.mockReset()
  setMiaOptions.mockReset()
  fit.mockReset()
  useCharacterFit.mockReturnValue({
    // Branded types this stub cannot forge; everything else in the mock is checked.
    t: ((key: string) =>
      ({
        'inspector.characterKind': 'Type de personnage',
        'inspector.rigService': 'Service',
        'inspector.rigServiceLocal': 'Automatique — le studio',
        'inspector.rigCreate': 'Créer le squelette',
        'inspector.rigRegenerate': 'Régénérer le squelette',
        'inspector.rigRegenerateConfirm': 'Le squelette entier sera remplacé. Continuer ?',
        'inspector.autoRigFingers': 'Doigts',
        'inspector.autoRigFingerDetailed': 'Détaillés',
        'inspector.autoRigFingerSimplified': 'Simplifiés',
        'inspector.autoRigUseSurfaceNormals': 'Utiliser les normales de surface',
        'inspector.autoRigUseSurfaceNormalsHint': 'Améliore la séparation des poids.',
        'inspector.autoRigWeightPostProcessing': 'Nettoyer les influences',
        'inspector.autoRigMiaSettingsHint': 'Ces réglages seront utilisés au prochain calcul.',
      })[key] ?? key) as unknown as TFunction,
    i18n: { language: 'fr' } as unknown as I18n,
    kind: 'human',
    setKind: vi.fn(),
    plan: null,
    services: [],
    maxSize: undefined,
    bytes: 0,
    refusal: null,
    rigBackends: [
      {
        backendId: 'make-it-animatable',
        modelId: 'make-it-animatable',
        name: 'Make-It-Animatable',
      },
    ],
    selectedBackend: 'make-it-animatable',
    chooseBackend,
    miaOptions: { fingers: 'detailed', useSurfaceNormals: false, weightPostProcessing: true },
    setMiaOptions,
    needsDownload: false,
    failure: null,
    running: false,
    download: vi.fn(),
    useSimple: vi.fn(),
    fit,
  })
})

describe('the Auto Rig selector', () => {
  it('shows the installed advanced backend and reflects the one currently chosen', () => {
    render(
      <CharacterInspectorFit assetId="asset" documentId="document" nodeId="node" sample={sample} />,
    )

    expect(screen.getByLabelText('Service')).toHaveValue('make-it-animatable')
    expect(screen.getByRole('option', { name: 'Make-It-Animatable' })).toBeInTheDocument()
  })

  it('lets the person switch back to the studio rigger from the same inspector', async () => {
    render(
      <CharacterInspectorFit assetId="asset" documentId="document" nodeId="node" sample={sample} />,
    )

    await userEvent.selectOptions(screen.getByLabelText('Service'), 'simple')

    expect(chooseBackend).toHaveBeenCalledWith('simple')
  })

  it('shows MIA quality settings and can regenerate an existing rig', async () => {
    render(
      <CharacterInspectorFit
        assetId="asset"
        documentId="document"
        nodeId="node"
        sample={sample}
        hasRig
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText('Doigts'), 'simplified')
    await userEvent.click(screen.getByLabelText('Utiliser les normales de surface'))
    await userEvent.click(screen.getByLabelText('Nettoyer les influences'))

    expect(screen.getByRole('button', { name: 'Régénérer le squelette' })).toBeInTheDocument()
    expect(setMiaOptions).toHaveBeenCalledWith({
      fingers: 'simplified',
      useSurfaceNormals: false,
      weightPostProcessing: true,
    })
    expect(setMiaOptions).toHaveBeenCalledWith({
      fingers: 'detailed',
      useSurfaceNormals: true,
      weightPostProcessing: true,
    })
    expect(setMiaOptions).toHaveBeenCalledWith({
      fingers: 'detailed',
      useSurfaceNormals: false,
      weightPostProcessing: false,
    })
  })

  it('presents MIA setting help as compact informational alerts', () => {
    render(
      <CharacterInspectorFit assetId="asset" documentId="document" nodeId="node" sample={sample} />,
    )

    for (const text of [
      'Améliore la séparation des poids.',
      'Ces réglages seront utilisés au prochain calcul.',
    ]) {
      expect(screen.getByText(text)).toHaveClass('alert', 'alert-info', 'alert-soft', 'text-tiny')
    }
  })
})

describe('regenerating a rig that already exists', () => {
  /** What it drops — IK chains, hand-added bones, renamings — only the undo stack covers. */
  it('asks first, and leaves the rig alone when the person says no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <CharacterInspectorFit
        assetId="asset"
        documentId="document"
        nodeId="node"
        sample={sample}
        hasRig
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Régénérer le squelette' }))

    expect(confirm).toHaveBeenCalledWith('Le squelette entier sera remplacé. Continuer ?')
    expect(fit).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Régénérer le squelette' }))

    expect(fit).toHaveBeenCalled()
    confirm.mockRestore()
  })

  // A first rig destroys nothing, so it must not put a question in the way.
  it('asks nothing when there is no rig yet', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <CharacterInspectorFit assetId="asset" documentId="document" nodeId="node" sample={sample} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Créer le squelette' }))

    expect(confirm).not.toHaveBeenCalled()
    expect(fit).toHaveBeenCalled()
    confirm.mockRestore()
  })
})
