import { describe, expect, it } from 'vitest'
import { reliefLayer, terrainEditLayer } from '@shared/domain/scene'
import { sculptEditOf, strokeDabs } from './reliefStroke'

describe('strokeDabs', () => {
  it('lays dabs along the path at the spacing, not one per raw sample', () => {
    expect(strokeDabs({ x: 0, z: 0 }, { x: 1, z: 0 }, 0.25)).toEqual([
      { x: 0.25, z: 0 },
      { x: 0.5, z: 0 },
      { x: 0.75, z: 0 },
      { x: 1, z: 0 },
    ])
  })

  it('emits nothing when the pointer has not travelled a full step', () => {
    expect(strokeDabs({ x: 0, z: 0 }, { x: 0.1, z: 0 }, 0.25)).toEqual([])
  })
})

describe('sculptEditOf', () => {
  const hills = terrainEditLayer({ id: 'hills', name: 'Hills' })
  const locked = terrainEditLayer({ id: 'locked', name: 'Locked', locked: true })
  const island = reliefLayer(
    { assetId: 'h' },
    { id: 'island', name: 'Island', edits: [hills, locked] },
  )

  it('keeps the armed edit when it can be written', () => {
    expect(sculptEditOf([island], { terrainId: 'island', editId: 'hills' })).toEqual({
      terrainId: 'island',
      editId: 'hills',
    })
  })

  it('takes the first writable edit when the panel armed the terrain as a whole', () => {
    expect(sculptEditOf([island], { terrainId: 'island', editId: null })).toEqual({
      terrainId: 'island',
      editId: 'hills',
    })
  })

  it('refuses a locked edit and a missing terrain', () => {
    expect(sculptEditOf([island], { terrainId: 'island', editId: 'locked' })).toBeNull()
    expect(sculptEditOf([island], { terrainId: 'gone', editId: 'hills' })).toBeNull()
    expect(sculptEditOf([island], null)).toBeNull()
  })
})
