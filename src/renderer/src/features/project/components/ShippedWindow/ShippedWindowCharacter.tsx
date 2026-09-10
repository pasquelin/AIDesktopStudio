import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BUNDLED_CHARACTER_NAMES } from '@shared/domain/bundledCharacter'
import { CHARACTER_LEVELS, type CharacterLevel } from '@shared/domain/characterLevel'
import { PropertyRow } from '@/components/PropertyRow'
import { WindowButton } from '@/components/WindowButton'
import { WindowNote } from '@/components/WindowNote'
import { getBridge } from '@/services/bridge'

/**
 * The shipped character, at each density it ships at.
 *
 * The install is idempotent by contract: a project that already holds the level keeps the asset
 * it has, ids included. So the row offers the gesture whatever the project holds, and answers
 * with WHERE it landed rather than claiming it did something.
 */
export function ShippedWindowCharacter() {
  const { t } = useTranslation()
  const [landed, setLanded] = useState<Partial<Record<CharacterLevel, string>>>({})
  const [placing, setPlacing] = useState<CharacterLevel | null>(null)

  const place = async (level: CharacterLevel): Promise<void> => {
    setPlacing(level)
    const installed = await getBridge()?.assets.installBundledCharacter(level)
    setPlacing(null)
    if (installed) setLanded(held => ({ ...held, [level]: installed.path ?? '' }))
  }

  return (
    <>
      {CHARACTER_LEVELS.map(level => (
        <PropertyRow
          key={level}
          label={BUNDLED_CHARACTER_NAMES[level]}
          actions={
            <WindowButton
              size="row"
              disabled={placing !== null}
              onClick={() => {
                void place(level)
              }}
            >
              {t('shipped.place')}
            </WindowButton>
          }
        >
          {landed[level] === undefined ? t('shipped.notPlaced') : t('shipped.placed')}
        </PropertyRow>
      ))}
      <WindowNote>{t('shipped.characterWhere')}</WindowNote>
    </>
  )
}
