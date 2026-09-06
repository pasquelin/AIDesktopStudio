import type { CommandId } from '@shared/domain/command'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { characterViewOf, useCharacterView } from '@/stores/characterView'
import { forgetSceneEngine, registerSceneEngine } from '@/stores/sceneEngines'
import { sceneViewChromeOf } from '@/stores/sceneViewChrome'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { runWorkshopCommand, type WorkshopCommandContext } from './workshopCommands'

const ASSET = 'asset-hero'
const WORKSHOP = 'workshop-hero'

const setNavigating = vi.fn()

const context = (): WorkshopCommandContext => ({
  assetId: ASSET,
  workshopId: WORKSHOP,
  setNavigating,
  view: sceneViewChromeOf(useSceneViews.getState(), WORKSHOP),
})

const workshopView = () => sceneViewOf(useSceneViews.getState(), WORKSHOP)

beforeEach(() => {
  useSceneViews.setState({ views: {} })
  useCharacterView.setState({ views: {} })
  setNavigating.mockClear()
})

afterEach(() => forgetSceneEngine(WORKSHOP))

describe('runWorkshopCommand', () => {
  it('arms a transform mode on the character and leaves the flight', () => {
    expect(runWorkshopCommand('scene.rotate', context())).toBe(true)

    expect(characterViewOf(useCharacterView.getState(), ASSET).mode).toBe('rotate')
    expect(setNavigating).toHaveBeenCalledWith(false)
  })

  it('cycles what the workshop draws, and comes back round', () => {
    runWorkshopCommand('scene.display', context())
    expect(workshopView().displays[0]).toBe('wireframe')

    for (let step = 1; step < 10; step += 1) runWorkshopCommand('scene.display', context())
    expect(workshopView().displays[0]).toBe('shaded')
  })

  it('puts the bones out and back', () => {
    useSceneViews.getState().setSkeletons(WORKSHOP, true)

    runWorkshopCommand('scene.skeletons', context())
    expect(workshopView().skeletons).toBe(false)

    runWorkshopCommand('scene.skeletons', context())
    expect(workshopView().skeletons).toBe(true)
  })

  // The whole model, never a selection: the workshop has none, and framing it would frame the void.
  it('frames the whole workshop on its engine', () => {
    const frameContents = vi.fn(() => true)
    // The one method the command reaches — a live renderer needs a canvas this test has not.
    registerSceneEngine(WORKSHOP, { frameContents } as unknown as SceneRenderer)

    expect(runWorkshopCommand('scene.frame', context())).toBe(true)
    expect(frameContents).toHaveBeenCalledOnce()
  })

  it('leaves what edits a document to someone else, touching nothing', () => {
    const before = useSceneViews.getState().views

    const edits: CommandId[] = ['scene.undo', 'scene.redo', 'scene.scale', 'scene.delete']
    for (const command of edits) expect(runWorkshopCommand(command, context())).toBe(false)

    expect(useSceneViews.getState().views).toBe(before)
    expect(characterViewOf(useCharacterView.getState(), ASSET).mode).toBe('translate')
    expect(setNavigating).not.toHaveBeenCalled()
  })
})
