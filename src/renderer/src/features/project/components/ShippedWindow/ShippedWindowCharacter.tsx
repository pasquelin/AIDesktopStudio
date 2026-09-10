import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BUNDLED_CHARACTER_NAMES } from '@shared/domain/bundledCharacter'
import { CHARACTER_LEVELS, type CharacterLevel } from '@shared/domain/characterLevel'
import { PropertyRow } from '@/components/PropertyRow'
import { WindowButton } from '@/components/WindowButton'
import { WindowNote } from '@/components/WindowNote'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'

/**
 * The shipped character, at each density it ships at.
 *
 * The install is idempotent by contract: a project that already holds the level keeps the asset
 * it has, ids included. So the row offers the gesture whatever the project holds, and answers
 * with WHERE it landed rather than claiming it did something.
 */
export function ShippedWindowCharacter() {
  const { t } = useTranslation()
  const [landed, setLanded] = useState<ReadonlySet<CharacterLevel>>(new Set())
  const [placing, setPlacing] = useState<CharacterLevel | null>(null)

  /**
   * 🛑 The reset is in the `finally`, and the failure is SAID. Without either, closing the
   * project under an open window leaves every row's button disabled for the life of that
   * window — the call rejects (`NoProjectError`), the await throws past the reset, and the
   * person is left pressing a control that has stopped answering with nothing to explain it.
   */
  const place = async (level: CharacterLevel): Promise<void> => {
    setPlacing(level)
    try {
      // Keyed by what LANDED, never by what was asked: `installBundledCharacter` answers the
      // nearest level the bundle actually holds, which is not always the one clicked.
      const installed = await getBridge()?.assets.installBundledCharacter(level)
      if (installed) setLanded(held => new Set(held).add(installed.level))
    } catch (error) {
      reportFailure('assets.copy', `shipped-character-${level}`, error)
    } finally {
      setPlacing(null)
    }
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
          {landed.has(level) ? t('shipped.placed') : t('shipped.notPlaced')}
        </PropertyRow>
      ))}
      <WindowNote>{t('shipped.characterWhere')}</WindowNote>
    </>
  )
}
