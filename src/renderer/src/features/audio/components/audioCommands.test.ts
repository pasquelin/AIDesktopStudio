import { describe, expect, it } from 'vitest'
import { SECOND } from '@shared/domain/time'
import { canUndo } from '@/engines/core/history'
import { addClip } from '@/engines/timeline/commands'
import { EMPTY_SOUND_SEQUENCE, makeClip } from '@/engines/timeline/timelineState'
import { sequenceHistoryOf, useSequences } from '@/stores/sequences'
import { runAudioCommand } from './audioCommands'

describe('the commands of a take', () => {
  it('undoes the montage while the chain over the take has nothing to give back', () => {
    useSequences.setState({ states: { 'doc-1': EMPTY_SOUND_SEQUENCE }, histories: {} })
    const clip = makeClip({ id: 'clip-2', assetId: 'asset-a', start: 5 * SECOND, duration: SECOND })
    useSequences.getState().runCommand('doc-1', addClip('A1', clip))

    expect(runAudioCommand('doc-1', 'audio.undo')).toBe(true)

    expect(canUndo(sequenceHistoryOf(useSequences.getState(), 'doc-1'))).toBe(false)
  })

  it('says it did nothing when neither half has anything to undo', () => {
    useSequences.setState({ states: { 'doc-1': EMPTY_SOUND_SEQUENCE }, histories: {} })

    expect(runAudioCommand('doc-1', 'audio.undo')).toBe(false)
  })
})
