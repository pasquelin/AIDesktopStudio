// @vitest-environment jsdom
import { Group, type Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { SceneRenderer } from './SceneRenderer'
import { newComponent } from '@shared/domain/componentRegistry'
import { playerModuleNodes } from './nodeFactory'
import { EMPTY_SCENE } from './sceneState'
import type { Component } from '@shared/domain/component'
import type { ViewportAids } from './viewportAids'

/** The module's one runtime export; everything else it publishes is a type. */
type ViewportAidsModule = { createViewportAids: () => ViewportAids }

/**
 * 🛑 Measured THROUGH the engine, never on the aid alone: a case reading `viewportAids` directly
 * stays green on exactly the defect this file exists for — what the renderer decides to hand it.
 */
const held: { aids?: ViewportAids } = {}

// Resolved from THIS file: moving it one folder up silently stops the mock applying.
vi.mock('./viewportAids', async importOriginal => {
  const real = await importOriginal<ViewportAidsModule>()
  return {
    createViewportAids: (): ViewportAids => {
      const made = real.createViewportAids()
      held.aids = made
      return made
    },
  }
})

const drawnAids = (chrome: boolean, nodes = [...playerModuleNodes()]): number => {
  const renderer = new SceneRenderer({
    onSelect: () => {},
    onTransform: () => {},
    loadModel: async () => new Group(),
    ...(chrome ? {} : { chrome: false }),
  })
  renderer.apply({ ...EMPTY_SCENE, nodes })
  // Everything hanging off the workshop group: the cage is a line, the arm a solid.
  const drawn: readonly Object3D[] = held.aids?.object.children ?? []
  return drawn.length
}

/** Stripped of every figure, which is what a hand-edited file routinely holds. */
const bare = (component: Component): Component => ({ type: component.type })

/** A body whose controller was tuned to nothing — what a hand-edited file routinely holds. */
const withoutFigures = () =>
  playerModuleNodes().map(node =>
    node.components?.some(one => one.type === 'CharacterController')
      ? { ...node, components: [newComponent('CharacterController')].map(bare) }
      : node,
  )

describe('the aids a player module asks to be drawn', () => {
  it('outlines the body and its arm in an editing viewport', () => {
    expect(drawnAids(true)).toBe(2)
  })

  /**
   * 🛑 A window that PLAYS the scene shows none of them, whatever the settings say — the cut
   * `showAidsForSelection` already makes for frustums, lamps, markers and rails. Drawn off a
   * COMPONENT, these two answered to none of it: the player saw a wireframe capsule around
   * their own character, and a line marking where the camera sits, on every frame.
   */
  it('draws neither of them in a window that plays the scene', () => {
    expect(drawnAids(false)).toBe(0)
  })

  /**
   * 🛑 The very defaults the PHYSICS falls back on — `characters.capsuleOf` reads them through
   * `numberOf`. Read raw, a controller carrying no figure gave `NaN` and the body the engine
   * feels was outlined by nothing at all.
   */
  it('outlines a body whose controller was tuned to nothing, at the size it is felt', () => {
    expect(drawnAids(true, withoutFigures())).toBe(2)
  })
})
