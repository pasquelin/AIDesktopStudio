import { describe, expect, it, vi } from 'vitest'

import { createAssetText } from './assetText'

describe('reading the asset the model wrote', () => {
  it('takes the preview when it is the whole text, without downloading', async () => {
    const download = vi.fn(() => Promise.resolve('never asked for'))
    const readText = createAssetText({
      retrieve: () =>
        Promise.resolve({
          url: 'https://cdn/asset',
          properties: { preview: '{"say":"ok"}', hasFullPreview: true },
        }),
      download,
    })

    expect(await readText('asset_1')).toBe('{"say":"ok"}')
    expect(download).not.toHaveBeenCalled()
  })

  /**
   * A truncated preview is the worst of the three outcomes: parsed as JSON it fails halfway
   * through an object that was complete on the server, and the retry pays for a fault that was
   * never the model's.
   */
  it('downloads when the preview is only part of the answer', async () => {
    const readText = createAssetText({
      retrieve: () =>
        Promise.resolve({
          url: 'https://cdn/asset',
          properties: { preview: '{"say":"ok', hasFullPreview: false },
        }),
      download: () => Promise.resolve('{"say":"ok","calls":[]}'),
    })

    expect(await readText('asset_1')).toBe('{"say":"ok","calls":[]}')
  })

  it('answers nothing when there is nowhere to read from', async () => {
    const readText = createAssetText({
      retrieve: () => Promise.resolve({}),
      download: () => Promise.resolve('unreachable'),
    })

    expect(await readText('asset_1')).toBe('')
  })
})
