import { describe, expect, it } from 'vitest'
import { fileViewOf } from './fileView'

describe('file view registry', () => {
  /** The kind stays: two files of one character would otherwise open two identical tabs. */
  it('routes an input map by its complete compound extension', () => {
    expect(fileViewOf('Controls/character.input.json')).toEqual({
      id: 'inputMap',
      path: 'Controls/character.input.json',
      title: 'character.input',
    })
  })

  it('routes an animation graph, which used to leave the studio for the system app', () => {
    expect(fileViewOf('Animations/character.anim.json')).toEqual({
      id: 'animationGraph',
      path: 'Animations/character.anim.json',
      title: 'character.anim',
    })
  })

  it('leaves an ordinary JSON file to the system', () => {
    expect(fileViewOf('Data/character.json')).toBeNull()
  })
})
