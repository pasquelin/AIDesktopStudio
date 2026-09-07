import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import type { OptimizationPlan } from '@/engines/scene/worldAnalyzer'
import { installDocument, retitleDocument } from '@/stores/document-fixtures'
import { forgetSceneEngine, registerSceneEngine } from '@/stores/sceneEngines'
import { useGameExportDialog } from '@/hooks/useGameExportDialog'
import { SceneGameExportDialog } from './SceneGameExportDialog'

const { analyzeGameOptimization, exportGameProject } = vi.hoisted(() => ({
  analyzeGameOptimization: vi.fn(async () => ({
    scenes: 2,
    objects: 50,
    drawCallsBefore: 45,
    drawCallsAfter: 5,
  })),
  exportGameProject: vi.fn(async (..._arguments: unknown[]) => ({ ok: true })),
}))
vi.mock('@/game/gameExportCompiler', () => ({ analyzeGameOptimization, exportGameProject }))

const DOCUMENT = 'Forest'
const PLAN: OptimizationPlan = {
  classifications: [],
  instances: [],
  bakeCandidates: [],
  batches: [],
  merges: [],
  sharedGeometry: [],
  sharedMaterials: [],
  spatialCells: [],
  warnings: [],
  measured: {
    triangles: 100,
    vertices: 200,
    draws: 20,
    textureBytes: 0,
    objects: 20,
    visibleObjects: 20,
    meshes: 20,
    geometryBytes: 1024,
    sharedMaterials: 1,
  },
  estimated: {
    drawCallsBefore: 20,
    drawCallsAfter: 2,
    avoidedGeometryBytes: 0,
    avoidedTextureBytes: 0,
  },
}

beforeEach(() => {
  installDocument(DOCUMENT, '3d')
  registerSceneEngine(DOCUMENT, {
    analyzeWorldOptimization: async () => PLAN,
  } as unknown as SceneRenderer)
  useGameExportDialog.getState().open(DOCUMENT)
  exportGameProject.mockClear()
  analyzeGameOptimization.mockClear()
})

afterEach(() => {
  forgetSceneEngine(DOCUMENT)
  useGameExportDialog.getState().close()
})

it('keeps visual changes off until the user enables a lossy export choice', async () => {
  const user = userEvent.setup()
  render(<SceneGameExportDialog documentId={DOCUMENT} />)

  expect(await screen.findByText(/Changements visuels.*AUCUN/)).toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: 'Générer les niveaux de distance' }))
  expect(screen.getByText(/Changements visuels.*POSSIBLES/)).toBeInTheDocument()
})

it('exports through the shared game action with the explicit choices', async () => {
  const user = userEvent.setup()
  render(<SceneGameExportDialog documentId={DOCUMENT} />)

  await screen.findByText('Appels de rendu 45 → 5')
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Simplification géométrique' }),
    'balanced',
  )
  expect(screen.getByText(/Scène actuelle avec pertes · 65 triangles/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Exporter' }))

  expect(exportGameProject).toHaveBeenCalledWith({
    entryScene: DOCUMENT,
    lossyOptimization: {
      generateLods: false,
      geometrySimplification: 'balanced',
      textureCompression: 'off',
      textureReduction: 'off',
    },
    signal: expect.any(AbortSignal),
  })
})

it('names the entry scene by document id, whatever the document is titled', async () => {
  retitleDocument(DOCUMENT, '')
  const user = userEvent.setup()
  render(<SceneGameExportDialog documentId={DOCUMENT} />)

  await screen.findByText('Appels de rendu 45 → 5')
  await user.click(screen.getByRole('button', { name: 'Exporter' }))

  expect(exportGameProject).toHaveBeenCalledWith(expect.objectContaining({ entryScene: DOCUMENT }))
})

it('aborts export preparation when the user cancels the dialog', async () => {
  let finish: ((outcome: { ok: false }) => void) | undefined
  exportGameProject.mockImplementationOnce(
    async () =>
      await new Promise<{ ok: false }>(resolve => {
        finish = resolve
      }),
  )
  const user = userEvent.setup()
  render(<SceneGameExportDialog documentId={DOCUMENT} />)

  await screen.findByText('Appels de rendu 45 → 5')
  await user.click(screen.getByRole('button', { name: 'Exporter' }))
  const options: unknown = exportGameProject.mock.calls[0]?.[0]
  const signal = typeof options === 'object' && options ? Reflect.get(options, 'signal') : undefined
  if (!(signal instanceof AbortSignal)) throw new Error('expected an export abort signal')
  await user.click(screen.getByRole('button', { name: 'Annuler' }))

  expect(signal.aborted).toBe(true)
  finish?.({ ok: false })
})
