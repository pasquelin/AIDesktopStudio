import { localizedError } from '@shared/localizedError'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { reportFailure } from '@/services/diagnostics'
import { useCanvases } from '@/stores/canvases'
import { matchesAsset, reportAssetDrift } from './assetFidelity'
import { lendPictureMeasure } from './pictureSize'

vi.mock('@/services/diagnostics', () => ({ reportFailure: vi.fn() }))

const DOCUMENT = 'image-1'
const ASSET = 'asset-7'

let giveBack: () => void

/** The browser is the real measurer, and jsdom decodes nothing — the port exists for this. */
const measuring = (size: { width: number; height: number } | Error) =>
  lendPictureMeasure(() => (size instanceof Error ? Promise.reject(size) : Promise.resolve(size)))

beforeEach(() => {
  vi.mocked(reportFailure).mockClear()
})

afterEach(() => giveBack?.())

const holding = (width: number, height: number): void => {
  useCanvases.getState().replace(DOCUMENT, { ...DEFAULT_CANVAS, width, height })
}

describe('whether a document still measures its asset', () => {
  it('is true when the two agree', async () => {
    giveBack = measuring({ width: 4112, height: 2658 })
    holding(4112, 2658)

    await expect(matchesAsset(DOCUMENT, ASSET)).resolves.toBe(true)
  })

  it('is false when the document drifted from the picture', async () => {
    giveBack = measuring({ width: 4112, height: 2658 })
    holding(1024, 1024)

    await expect(matchesAsset(DOCUMENT, ASSET)).resolves.toBe(false)
  })

  /**
   * `null`, not `false`, and the distinction is what keeps a toast off every save made while the
   * engine brings its GPU context up. A question that cannot be answered is not a mismatch.
   */
  it('is unanswerable when the document holds no canvas yet', async () => {
    giveBack = measuring({ width: 4112, height: 2658 })

    await expect(matchesAsset(DOCUMENT, ASSET)).resolves.toBeNull()
  })

  it('is unanswerable when the picture will not measure', async () => {
    giveBack = measuring(new Error('gone'))
    holding(1024, 1024)

    await expect(matchesAsset(DOCUMENT, ASSET)).resolves.toBeNull()
  })
})

/**
 * The sentence that replaces a refusal. Removing the refusal was right — a crop is an edit, and
 * an editor that cannot crop is not one — but it left ⌘S able to shrink an asset with nothing
 * said, and `replaceBytes` deletes what it replaces.
 */
describe('saying that a document drifted from its asset', () => {
  it('says it when the document no longer measures the picture', async () => {
    giveBack = measuring({ width: 4112, height: 2658 })
    holding(1024, 1024)

    await reportAssetDrift(DOCUMENT, ASSET, 'concept art')

    // `canvas.size`, not `assets.save`: at ⌘S the asset IS rewritten — « the save happens either
    // way » — and on a revisit nothing is saved at all. What both moments have to say is that the
    // document does not measure its picture, which is the one thing `canvas.size` names.
    expect(reportFailure).toHaveBeenCalledWith(
      'canvas.size',
      'concept art',
      expect.objectContaining({ message: localizedError('assetSizeMismatch').message }),
    )
  })

  it('stays quiet when the document is still the picture', async () => {
    giveBack = measuring({ width: 800, height: 600 })
    holding(800, 600)

    await reportAssetDrift(DOCUMENT, ASSET, 'concept art')

    expect(reportFailure).not.toHaveBeenCalled()
  })

  // An unanswerable question is not a drift, and a save made while the engine boots asks one.
  it('stays quiet when the answer cannot be had', async () => {
    giveBack = measuring(new Error('gone'))
    holding(1024, 1024)

    await reportAssetDrift(DOCUMENT, ASSET, 'concept art')

    expect(reportFailure).not.toHaveBeenCalled()
  })
})
