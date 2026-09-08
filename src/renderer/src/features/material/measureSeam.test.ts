import { localizedError } from '@shared/localizedError'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assetUrl } from '@shared/domain/asset'
import { setChannel } from '@/engines/material/commands'
import type { SeamPort } from '@/engines/material/derive/seamPort'
import { bridgeWatchingLogs } from '@/services/fakeBridge'
import { installMaterial } from '@/stores/material-fixtures'
import { seamOf, useMaterialViews } from '@/stores/materialViews'
import { useMaterials } from '@/stores/materials'
import { measureMaterialSeam } from './measureSeam'

const fill = () =>
  useMaterials
    .getState()
    .runCommand(
      'doc-1',
      setChannel('baseColor', { assetId: 'img-1', origin: 'imported', width: 512, height: 512 }),
    )

const reading = () => seamOf(useMaterialViews.getState(), 'doc-1')

beforeEach(() => {
  installMaterial('doc-1')
  useMaterialViews.setState({ inspected: {}, seams: {} })
})

describe('measuring the seam of a material', () => {
  it('remembers what the GPU answered, for the session', async () => {
    bridgeWatchingLogs()
    fill()
    const measure = vi.fn((_url: string) => Promise.resolve(2.5))

    await expect(measureMaterialSeam('doc-1', measure)).resolves.toBe(true)

    expect(measure).toHaveBeenCalledWith(assetUrl('img-1'))
    // The asset with it: a reading of pixels the document no longer points at is not a reading.
    expect(reading()).toEqual({ assetId: 'img-1', ratio: 2.5 })
  })

  /**
   * The base colour and nothing else: it is the channel a seam is seen in, and measuring the
   * eight would open eight contexts to answer the same question about maps laid out together.
   */
  it('says so rather than measuring nothing when there is no base colour', async () => {
    const { entries } = bridgeWatchingLogs()
    const measure = vi.fn((_url: string) => Promise.resolve(2.5))

    await expect(measureMaterialSeam('doc-1', measure)).resolves.toBe(false)

    expect(measure).not.toHaveBeenCalled()
    expect(entries().at(-1)?.message).toContain(localizedError('baseColorEmpty').message)
    expect(reading()).toBeNull()
  })

  it('reports a GPU that refused rather than leaving the button silent', async () => {
    const { entries } = bridgeWatchingLogs()
    fill()
    const measure: SeamPort = () => Promise.reject(new Error('no WebGL context'))

    await expect(measureMaterialSeam('doc-1', measure)).resolves.toBe(false)

    expect(entries().at(-1)?.message).toContain('no WebGL context')
    expect(reading()).toBeNull()
  })

  /** A reading describes the pixels of one document: another must not read it as its own. */
  it('is forgotten with the document it measured', async () => {
    bridgeWatchingLogs()
    fill()
    await measureMaterialSeam('doc-1', () => Promise.resolve(3))

    useMaterialViews.getState().forget('doc-1')

    expect(reading()).toBeNull()
  })
})
