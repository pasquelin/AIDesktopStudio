// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest'
import type { InputMap } from '@shared/domain/inputMap'
import { installFakeBridge } from '@/services/fakeBridge'
import {
  inputMapIdConflict,
  projectInputMaps,
  inputMapsChanged,
  isDuplicateInputMapId,
  onInputMapsChanged,
  withoutDuplicateInputMapIds,
} from './projectInputMaps'

const CHARACTER: InputMap = {
  version: 1,
  id: 'character',
  priority: 0,
  defaultActive: true,
  actions: [],
}

describe('project input maps for scripts', () => {
  it('loads each listed map with the path imports resolve against', async () => {
    installFakeBridge({
      inputMaps: {
        list: () => Promise.resolve(['Scripts/character.input.json']),
        read: () => Promise.resolve(CHARACTER),
      },
    })

    expect(await projectInputMaps()).toEqual([
      { path: 'Scripts/character.input.json', map: CHARACTER },
    ])
  })

  it('leaves one unreadable map out without losing the others', async () => {
    installFakeBridge({
      inputMaps: {
        list: () => Promise.resolve(['broken.input.json', 'character.input.json']),
        read: path =>
          path.startsWith('broken')
            ? Promise.reject(new Error('broken'))
            : Promise.resolve(CHARACTER),
      },
    })

    expect(await projectInputMaps()).toEqual([{ path: 'character.input.json', map: CHARACTER }])
  })

  it('keeps duplicate context files available to relative script imports', async () => {
    installFakeBridge({
      inputMaps: {
        list: () => Promise.resolve(['Controls/a.input.json', 'Controls/b.input.json']),
        read: path => Promise.resolve({ ...CHARACTER, priority: path.includes('/a.') ? 0 : 10 }),
      },
    })

    expect(await projectInputMaps()).toEqual([
      { path: 'Controls/a.input.json', map: CHARACTER },
      { path: 'Controls/b.input.json', map: { ...CHARACTER, priority: 10 } },
    ])
    expect(inputMapIdConflict(await projectInputMaps())?.path).toBe('Controls/b.input.json')
  })
})

describe('what a game is handed when two files carry one context', () => {
  const at = (path: string, id: string) => ({ path, map: { ...CHARACTER, id } })

  it('keeps the FIRST file and drops the one that repeats its id', () => {
    const kept = withoutDuplicateInputMapIds([
      at('Controls/character.input.json', 'character'),
      at('Controls/studio.input.json', 'character'),
      at('Controls/vehicle.input.json', 'vehicle'),
    ])

    expect(kept.map(one => one.path)).toEqual([
      'Controls/character.input.json',
      'Controls/vehicle.input.json',
    ])
  })

  it('leaves a project with one file per context exactly as it was', () => {
    const maps = [at('a.input.json', 'character'), at('b.input.json', 'vehicle')]

    expect(withoutDuplicateInputMapIds(maps)).toEqual(maps)
  })

  /**
   * 🛑 Asked of ONE id: the save of a document reads its own, and a first duplicate pair
   * elsewhere in the project used to hide the one the author had just written.
   */
  it('says an id is doubled even when another pair comes first', () => {
    const maps = [
      at('a.input.json', 'character'),
      at('b.input.json', 'character'),
      at('c.input.json', 'vehicle'),
      at('d.input.json', 'vehicle'),
    ]

    expect(isDuplicateInputMapId(maps, 'vehicle')).toBe(true)
    expect(isDuplicateInputMapId(maps, 'flight')).toBe(false)
  })
})

/** The bridge has list, read and write and no event — this is what stands in for one. */
describe('being told a control map was written', () => {
  it('tells a listener until it lets go', () => {
    const told = vi.fn()
    const forget = onInputMapsChanged(told)

    inputMapsChanged()
    forget()
    inputMapsChanged()

    expect(told).toHaveBeenCalledOnce()
  })
})
