import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { gameViewport } from './gameViewport'

describe('what a game window draws with', () => {
  it('keeps the lens, the quality and the shadows the person set for the studio', () => {
    const three = {
      ...DEFAULT_SETTINGS.three,
      fieldOfView: 35,
      quality: 'high' as const,
      shadows: false,
    }

    expect(gameViewport(three)).toMatchObject({ fieldOfView: 35, quality: 'high', shadows: false })
  })

  it('turns every aid off, whatever the studio shows', () => {
    const drawn = gameViewport({
      ...DEFAULT_SETTINGS.three,
      showGrid: true,
      lightHelpers: 'all',
      cameraHelpers: 'all',
      boundingBoxes: 'all',
      origins: true,
      normals: true,
    })

    expect(drawn).toMatchObject({
      showGrid: false,
      lightHelpers: 'off',
      cameraHelpers: 'off',
      boundingBoxes: 'off',
      origins: false,
      normals: false,
    })
  })
})
