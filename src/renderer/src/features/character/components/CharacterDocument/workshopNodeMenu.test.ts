import i18next from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workshopIdOf } from '@shared/domain/character'
import { DISPLAY_MODES } from '@shared/domain/scene'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { flush } from '@/stores/generation-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { registerSceneEngine, forgetSceneEngine } from '@/stores/sceneEngines'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { openWorkshopNodeMenu } from './workshopNodeMenu'

const WORKSHOP = workshopIdOf('asset-hero')

let menu = fakeMenu()
const frameContents = vi.fn(() => true)

describe('what a right-click offers on the model of a workshop', () => {
  beforeEach(() => {
    menu = fakeMenu()
    vi.clearAllMocks()
    installFakeBridge({ menu: menu.bridge })
    useSceneViews.setState({ views: {} })
    // Only the one method the frame row reaches: the menu never builds a renderer.
    registerSceneEngine(WORKSHOP, { frameContents } as unknown as SceneRenderer)
    return () => forgetSceneEngine(WORKSHOP)
  })

  it('offers the view alone — frame, bones, the ways of drawing, capture — never a document edit', () => {
    openWorkshopNodeMenu({ workshopId: WORKSHOP, t: i18next.t })

    expect(menu.labels()).toEqual([
      i18next.t('commands.sceneFrame.title'),
      i18next.t('character.showBones'),
      i18next.t('sceneTools.display'),
      ...DISPLAY_MODES.map(mode => i18next.t(`sceneDisplay.${mode}`)),
      i18next.t('commands.sceneCapture.title'),
    ])
    expect(menu.labels()).not.toContain(i18next.t('commands.sceneDelete.title'))
  })

  it('names the bones row by what pressing it will do', () => {
    useSceneViews.getState().setSkeletons(WORKSHOP, true)
    openWorkshopNodeMenu({ workshopId: WORKSHOP, t: i18next.t })

    expect(menu.labels()).toContain(i18next.t('character.hideBones'))
  })

  it('puts the bones out from the row, on the workshop view', async () => {
    useSceneViews.getState().setSkeletons(WORKSHOP, true)
    menu.picks(i18next.t('character.hideBones'))
    openWorkshopNodeMenu({ workshopId: WORKSHOP, t: i18next.t })
    await flush()

    expect(sceneViewOf(useSceneViews.getState(), WORKSHOP).skeletons).toBe(false)
  })

  it('draws the model in the way a row of the group chooses, and greys the way in force', async () => {
    menu.picks(i18next.t('sceneDisplay.wireframe'))
    openWorkshopNodeMenu({ workshopId: WORKSHOP, t: i18next.t })
    await flush()

    expect(sceneViewOf(useSceneViews.getState(), WORKSHOP).displays[0]).toBe('wireframe')
    expect(menu.offers(i18next.t('sceneDisplay.shaded'))).toBe(false)
  })

  it('frames the whole model rather than a selection the workshop has not got', async () => {
    menu.picks(i18next.t('commands.sceneFrame.title'))
    openWorkshopNodeMenu({ workshopId: WORKSHOP, t: i18next.t })
    await flush()

    expect(frameContents).toHaveBeenCalledOnce()
  })
})
