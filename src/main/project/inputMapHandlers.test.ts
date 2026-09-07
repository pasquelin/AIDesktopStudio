import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '@shared/ipc'
import { invoke, resetHandlers } from '@main/ipc/testHarness'
import { registerInputMapHandlers } from './inputMapHandlers'
import type { InputMapStore } from './inputMaps'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

const character = {
  version: 1,
  id: 'character',
  priority: 0,
  defaultActive: true,
  actions: [],
}

describe('project input map handlers', () => {
  let maps: InputMapStore

  beforeEach(() => {
    resetHandlers()
    maps = {
      list: vi.fn(async () => ['Controls/character.input.json']),
      read: vi.fn(async path => (path === 'Controls/character.input.json' ? character : null)),
      write: vi.fn(async () => true),
    }
    registerInputMapHandlers(maps)
  })

  it('lists and reads the input maps of the open project', async () => {
    await expect(invoke(CHANNELS.inputMapList)).resolves.toEqual(['Controls/character.input.json'])
    await expect(invoke(CHANNELS.inputMapRead, 'Controls/character.input.json')).resolves.toEqual(
      character,
    )
  })

  it('validates an input map before writing it', async () => {
    await expect(
      invoke(CHANNELS.inputMapWrite, 'Controls/character.input.json', character),
    ).resolves.toBe(true)
    expect(() =>
      // A version this build has never written: 1 and 2 are both READ, one being a file from
      // before driving and flying were active by default.
      invoke(CHANNELS.inputMapWrite, 'Controls/broken.input.json', {
        ...character,
        version: 99,
      }),
    ).toThrow('unsupported input map version')

    expect(maps.write).toHaveBeenCalledTimes(1)
  })
})
