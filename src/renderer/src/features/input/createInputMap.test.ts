import { installFakeBridge } from '@/services/fakeBridge'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const openFileView = vi.fn()
vi.mock('@/features/shell/components/dockviewApi', () => ({ openFileView }))

const { createInputMapFromPreset } = await import('./createInputMap')

beforeEach(() => {
  openFileView.mockReset()
})

const bridgeHolding = (paths: readonly string[], write: () => Promise<boolean>) =>
  installFakeBridge({
    inputMaps: { list: async () => [...paths], read: async () => null, write },
  })

describe('input map creation', () => {
  it('writes the chosen preset in the role folder and opens it', async () => {
    const write = vi.fn(async () => true)
    bridgeHolding([], write)

    expect(await createInputMapFromPreset('character')).toBe('Controls/character.input.json')
    expect(write).toHaveBeenCalledWith(
      'Controls/character.input.json',
      expect.objectContaining({ id: 'character' }),
    )
    expect(openFileView).toHaveBeenCalledWith({
      id: 'inputMap',
      path: 'Controls/character.input.json',
      title: 'character',
    })
  })

  /** The FILE names the context: a map filed elsewhere must not rename what a scene resolves. */
  it('walks to a free name and names the context after it, folder left out', async () => {
    const write = vi.fn(async () => true)
    bridgeHolding(['Controls/character.input.json'], write)

    expect(await createInputMapFromPreset('character')).toBe('Controls/character-2.input.json')
    expect(write).toHaveBeenCalledWith(
      'Controls/character-2.input.json',
      expect.objectContaining({ id: 'character-2' }),
    )
  })
})
