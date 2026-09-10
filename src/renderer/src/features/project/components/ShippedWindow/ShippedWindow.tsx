import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SHIPPED_FAMILIES, type ShippedFamily } from '@shared/domain/shippedResources'
import { PropertySection } from '@/components/PropertySection'
import { WindowShell } from '@/components/WindowShell'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { ShippedWindowAnimations } from './ShippedWindowAnimations'
import { ShippedWindowCharacter } from './ShippedWindowCharacter'
import { ShippedWindowTextures } from './ShippedWindowTextures'

/**
 * What the studio ships with, and how to put it into the open project — E-23.
 *
 * Iterated rather than written out three times: the `Record` refuses to compile without a body
 * for a family added to the union, which is what keeps a fourth one from arriving unnoticed.
 */
const BODIES: Record<ShippedFamily, ReactNode> = {
  character: <ShippedWindowCharacter />,
  textures: <ShippedWindowTextures />,
  animations: <ShippedWindowAnimations />,
}

export function ShippedWindow() {
  const { t } = useTranslation()
  useAppliedSettings()

  return (
    <WindowShell title={t('shipped.title')}>
      {SHIPPED_FAMILIES.map(family => (
        <PropertySection
          key={family}
          title={t(`shipped.${family}`)}
          description={t(`shipped.${family}Note`)}
          scId={`shipped.${family}`}
          plate
        >
          {BODIES[family]}
        </PropertySection>
      ))}
    </WindowShell>
  )
}
