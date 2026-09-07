import { useTranslation } from 'react-i18next'
import { HOME_SURFACE } from '@shared/domain/tool'
import { openNewDocument } from '@/features/shell/newDocument'
import { Button } from '@/components/Button'
import { QuietNote } from '@/components/QuietNote'
import { HINT_TOP } from '@/helpers/tooltip'
import { HomeViewHidden } from './HomeViewHidden'

/** The foot of the page: one sentence, two ways on. Nobody should reach the bottom and stop. */
export function HomeViewClosing() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <QuietNote standalone>{t('home.closing.title')}</QuietNote>
      <Button
        {...HINT_TOP(t('home.closingActionHint'))}
        onClick={() => void openNewDocument(HOME_SURFACE)}
      >
        {t('home.closing.action')}
      </Button>
      <HomeViewHidden />
    </div>
  )
}
