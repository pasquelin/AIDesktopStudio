import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { useSettings } from '@/stores/settings'
import { useSettingsDraft } from '@/stores/settingsDraft'
import { useStagedNavigation } from './useStagedNavigation'

beforeEach(() => {
  useSettings.setState({ settings: structuredClone(DEFAULT_SETTINGS) })
  useSettingsDraft.setState({ pending: {}, touched: new Set() })
})

describe('the navigation scheme being edited', () => {
  it('combines staged navigation leaves with stored values', () => {
    const { result } = renderHook(() => useStagedNavigation())

    act(() => {
      useSettingsDraft.getState().stage('three.navigationPreset', 'custom')
      useSettingsDraft.getState().stage('three.navigationCustomOrbit', 'middle')
    })

    expect(result.current).toEqual([
      'custom',
      {
        orbit: 'middle',
        pan: DEFAULT_SETTINGS.three.navigationCustomPan,
        dolly: DEFAULT_SETTINGS.three.navigationCustomDolly,
        fly: DEFAULT_SETTINGS.three.navigationCustomFly,
      },
    ])
  })

  it('keeps the custom object stable across an unrelated draft change', () => {
    const { result } = renderHook(() => useStagedNavigation())
    const custom = result.current[1]

    act(() => useSettingsDraft.getState().stage('appearance.density', 'compact'))

    expect(result.current[1]).toBe(custom)
  })
})
