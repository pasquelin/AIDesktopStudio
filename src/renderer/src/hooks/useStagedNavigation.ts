import { useMemo } from 'react'
import {
  customFrom,
  type CustomNavigation,
  type NavigationPreset,
} from '@shared/domain/navigationPreset'
import { useSettings } from '@/stores/settings'
import { useSettingsDraft } from '@/stores/settingsDraft'

/**
 * The navigation scheme as it stands, buffer included. Read the same way as the remaps above: a
 * preset chosen in the 3D section and not yet applied has to reach the shortcuts screen, or its
 * rows show the key of a scheme that is no longer the one being edited.
 */
export function useStagedNavigation(): [NavigationPreset, CustomNavigation] {
  const stored = useSettings(state => state.settings.three)
  const staged = useSettingsDraft(state => state.pending.three)
  const three = { ...stored, ...staged }
  const preset = three.navigationPreset
  const { navigationCustomOrbit, navigationCustomPan, navigationCustomDolly, navigationCustomFly } =
    three

  // Memoised here rather than at the caller: a fresh object per render is a dependency that
  // never settles, and every consumer of this would recompute its merge on every keystroke.
  const custom = useMemo(
    () =>
      customFrom({
        navigationCustomOrbit,
        navigationCustomPan,
        navigationCustomDolly,
        navigationCustomFly,
      }),
    [navigationCustomOrbit, navigationCustomPan, navigationCustomDolly, navigationCustomFly],
  )

  return [preset, custom]
}
