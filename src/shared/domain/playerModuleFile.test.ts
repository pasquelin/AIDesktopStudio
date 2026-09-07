import { describe, expect, it } from 'vitest'
import {
  isPlayerModulePath,
  PLAYER_MODULE_EXTENSION,
  PLAYER_MODULE_FORMAT,
  PLAYER_MODULE_SEGMENT,
} from './playerModuleFile'
import { isPlayerModuleRoute, playerModuleAssetOf, playerModuleRoute } from './playerModuleWindow'

describe('what tells a module file from a mesh', () => {
  it('reads the segment before the extension, whatever the case', () => {
    expect(isPlayerModulePath('modules/Heros.Player.GLTF')).toBe(true)
    expect(isPlayerModulePath('meshes/Heros.gltf')).toBe(false)
    expect(isPlayerModulePath('meshes/Heros.glb')).toBe(false)
  })
})

describe('the route a module window loads', () => {
  it('carries its asset back', () => {
    expect(playerModuleAssetOf(`#${playerModuleRoute('asset 1/2')}`)).toBe('asset 1/2')
  })

  /** The fragment is the one input this side does not build: a hand-edited one opens empty. */
  it('answers nothing for a fragment naming none', () => {
    expect(playerModuleAssetOf('#player-module/')).toBeNull()
    expect(playerModuleAssetOf('#player-module/%E0%A4%A')).toBeNull()
    expect(playerModuleAssetOf('#game')).toBeNull()
    expect(isPlayerModuleRoute('#game')).toBe(false)
  })
})

/**
 * 🛑 The trap this split exists for: the asset backend takes `/^\.[a-z0-9]{1,8}$/` and silently
 * falls back to `.glb` for anything else — which mislabelled the file AND made the double-click
 * that opens a module never match. Written as the backend's own rule rather than a comment.
 */
describe('the extension the studio hands the asset backend', () => {
  it('is one the backend will not swap for a fallback', () => {
    expect(PLAYER_MODULE_FORMAT).toMatch(/^\.[a-z0-9]{1,8}$/i)
  })

  it('is what a filed module still ends with, segment included', () => {
    expect(PLAYER_MODULE_EXTENSION.endsWith(PLAYER_MODULE_FORMAT)).toBe(true)
    expect(isPlayerModulePath(`Heros${PLAYER_MODULE_SEGMENT}${PLAYER_MODULE_FORMAT}`)).toBe(true)
  })
})
