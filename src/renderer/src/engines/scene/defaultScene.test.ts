import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import { createDefaultScene } from './defaultScene'

describe('createDefaultScene', () => {
  it('lights the scene, so a first mesh is visible', () => {
    const kinds = createDefaultScene()
      .nodes.filter(node => node.type === 'light')
      .map(node => (node.type === 'light' ? node.light.kind : null))
    expect(kinds).toEqual(['ambient', 'directional', 'hemisphere'])
  })

  it('names each light after its three.js class, as an exported scene would', () => {
    expect(createDefaultScene().nodes.map(node => node.name)).toEqual([
      'AmbientLight',
      'DirectionalLight',
      'HemisphereLight',
    ])
  })

  it('holds no mesh: an empty scene is what a new document is', () => {
    expect(createDefaultScene().nodes.filter(node => node.type === 'mesh')).toEqual([])
  })

  it('selects nothing', () => {
    expect(createDefaultScene().selectedIds).toEqual([])
  })

  it('gives every node its own id', () => {
    const ids = createDefaultScene().nodes.map(node => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('builds a fresh scene each time, sharing nothing with the previous one', () => {
    expect(createDefaultScene().nodes[0]?.id).not.toBe(createDefaultScene().nodes[0]?.id)
  })

  it('puts the sun above and to the side, not at the origin', () => {
    const sun = createDefaultScene().nodes.find(node => node.name === 'DirectionalLight')
    expect(sun?.transform.position).toEqual({ x: 5, y: 10, z: 7.5 })
  })

  // A document READ off a file falls back to `DEFAULT_WORLD`, which stays on `none` so an older
  // project opens exactly as it was authored. Only a scene MADE from here gets the newer curve.
  it('opens a new scene on a tone curve, where a read one keeps none', () => {
    expect(createDefaultScene().world.toneMapping).toBe('agx')
    expect(DEFAULT_WORLD.toneMapping).toBe('none')
  })

  it('shows every light', () => {
    expect(createDefaultScene().nodes.every(node => node.visible)).toBe(true)
  })
})
