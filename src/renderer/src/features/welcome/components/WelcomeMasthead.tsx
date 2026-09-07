import { useTranslation } from 'react-i18next'
import { WelcomeMark } from './WelcomeMark'

/**
 * Mounted ONCE, above the carousel. NOT a dragged bar though it sits where one would:
 * `one-window-title-bar.test.ts` reserves that to `WindowTitleBar`, and this window carries none.
 */
export function WelcomeMasthead() {
  const { t } = useTranslation()
  return (
    <header className="flex shrink-0 flex-col items-center gap-2 px-10 pt-8 pb-2">
      <WelcomeMark />
      {/* Padded by the tracking it carries: the space sits to the RIGHT of the last letter, so a
          centred line reads half a step left of the mark above it. */}
      <p className="tracking-mark pl-(--tracking-mark) text-sm font-semibold uppercase">
        {t('app.name')}
      </p>
    </header>
  )
}
