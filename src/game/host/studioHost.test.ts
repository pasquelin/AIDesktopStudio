// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { createStudioHost } from './studioHost'
import type { LogEntry } from '@shared/domain/gameRuntime'
import type { Player } from '../ports/netPort'

const player: Player = { id: 'p1', name: 'Alba', local: true }

describe('the game as the studio fills it', () => {
  it('serves its assets on the studio protocol, and sends its log where it was told', () => {
    const journal: LogEntry[] = []
    const game = createStudioHost({
      input: document.createElement('div'),
      player,
      urlForAsset: id => `ai-desktop-studio://asset/${id}`,
      journal: entry => journal.push(entry),
    })

    expect(game.assets.urlOf({ kind: 'asset', id: 'asset_1' })).toBe(
      'ai-desktop-studio://asset/asset_1',
    )

    game.log.write('info', 'started')
    expect(journal.map(entry => entry.message)).toEqual(['started'])
  })

  /** What no host has yet answers so, rather than half doing the job — see `inertRender.ts`. */
  it('refuses a generation and starts no sound', async () => {
    const game = createStudioHost({
      input: document.createElement('div'),
      player,
      urlForAsset: id => id,
    })

    expect(await game.ai.generateDialogue({ prompt: 'greet', speaker: 'guard' })).toEqual({
      ok: false,
      refused: 'notGranted',
    })
    expect(game.audio.play({ kind: 'asset', id: 'asset_1' }, { volume: 1, loop: false })).toBeNull()
  })
})
