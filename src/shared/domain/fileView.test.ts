import { describe, expect, it } from 'vitest'
import { fileViewOf } from './fileView'

describe('file view registry', () => {
  it('routes an input map by its complete compound extension', () => {
    expect(fileViewOf('Controls/character.input.json')).toEqual({
      id: 'inputMap',
      path: 'Controls/character.input.json',
      title: 'character',
    })
  })

  it('leaves an ordinary JSON file to the system', () => {
    expect(fileViewOf('Data/character.json')).toBeNull()
  })
})
