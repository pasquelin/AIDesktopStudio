import { useTranslation } from 'react-i18next'
import { PropertySection } from '@/components/PropertySection'
import { WindowShell } from '@/components/WindowShell'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { ShippedWindowAnimations } from './ShippedWindowAnimations'
import { ShippedWindowCharacter } from './ShippedWindowCharacter'
import { ShippedWindowTextures } from './ShippedWindowTextures'

/**
 * What the studio ships with, and how to put it into the open project — E-23.
 *
 * The three families are drawn apart because they are NOT placed alike, and the window says so
 * rather than pretending otherwise: the character and the working textures are copied in, a
 * shipped clip is already reachable everywhere a clip is chosen. See `SHIPPED_PLACEMENT`.
 */
export function ShippedWindow() {
  const { t } = useTranslation()
  useAppliedSettings()

  return (
    <WindowShell title={t('shipped.title')}>
      <PropertySection
        title={t('shipped.character')}
        description={t('shipped.characterNote')}
        scId="shipped.character"
        plate
      >
        <ShippedWindowCharacter />
      </PropertySection>

      <PropertySection
        title={t('shipped.textures')}
        description={t('shipped.texturesNote')}
        scId="shipped.textures"
        plate
      >
        <ShippedWindowTextures />
      </PropertySection>

      <PropertySection
        title={t('shipped.animations')}
        description={t('shipped.animationsNote')}
        scId="shipped.animations"
        plate
      >
        <ShippedWindowAnimations />
      </PropertySection>
    </WindowShell>
  )
}
