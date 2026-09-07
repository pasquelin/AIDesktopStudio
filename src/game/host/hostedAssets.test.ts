// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { createHostedAssets } from './hostedAssets'

describe('where the studio serves an asset from', () => {
  it('asks the studio for the URL, and refuses what is not an asset', () => {
    const assets = createHostedAssets(id => `ai-desktop-studio://asset/${id}`)

    expect(assets.urlOf({ kind: 'asset', id: 'asset_1' })).toBe('ai-desktop-studio://asset/asset_1')
    expect(assets.urlOf({ kind: 'document', id: 'asset_1' })).toBeNull()
  })
})
