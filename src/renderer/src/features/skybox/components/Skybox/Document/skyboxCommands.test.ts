import { describe, expect, it } from 'vitest'
import { skyboxViewOf, useSkyboxViews } from '@/stores/skyboxViews'
import { runSkyboxCommand } from './skyboxCommands'

describe('the commands of the sky', () => {
  it('turns the probes off, which start on, and says it acted', () => {
    expect(runSkyboxCommand('doc-1', 'skybox.probes')).toBe(true)

    expect(skyboxViewOf(useSkyboxViews.getState(), 'doc-1').probes).toBe(false)
  })
})
