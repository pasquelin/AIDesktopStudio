import { useTranslation } from 'react-i18next'
import { cn } from '@/helpers/cn'
import { HINT_TOP } from '@/helpers/tooltip'
import { WindowButton } from '@/components/WindowButton'
import { WELCOME_SLIDES, type WelcomeSlideId } from '@shared/domain/welcome'

export function WelcomeFooter({
  index,
  titles,
  onBack,
  onNext,
  onSkip,
  onGoTo,
}: {
  index: number
  /** Keyed by slide, never by position: a screen inserted mid-list renamed every dot after it. */
  titles: Record<WelcomeSlideId, string>
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  onGoTo: (index: number) => void
}) {
  const { t } = useTranslation()
  const last = index >= WELCOME_SLIDES.length - 1
  const first = index === 0

  return (
    <footer className="flex shrink-0 flex-col gap-3 px-10 pt-2 pb-4">
      {/* Its own line, above the actions: sharing the row with them, the steps read as a third
          control rather than as where the reader stands. */}
      <nav
        className="flex items-center justify-center gap-2"
        aria-label={t('welcome.steps', {
          current: index + 1,
          total: WELCOME_SLIDES.length,
        })}
      >
        {WELCOME_SLIDES.map((id: WelcomeSlideId, slideIndex) => (
          <button
            key={id}
            type="button"
            aria-current={slideIndex === index ? 'step' : undefined}
            aria-label={t('welcome.goToStep', {
              current: slideIndex + 1,
              title: titles[id],
            })}
            className={cn(
              'h-2 w-2 rounded-full',
              slideIndex === index ? 'bg-primary' : 'bg-base-300',
            )}
            onClick={() => onGoTo(slideIndex)}
          />
        ))}
      </nav>
      <div className="flex items-center justify-between gap-4">
        <WindowButton variant="secondary" onClick={onSkip} {...HINT_TOP(t('welcome.skipHint'))}>
          {t('welcome.skip')}
        </WindowButton>
        <div className="flex items-center gap-2">
          <WindowButton
            variant="secondary"
            onClick={onBack}
            disabled={first}
            {...HINT_TOP(t('welcome.backHint'))}
          >
            {t('welcome.back')}
          </WindowButton>
          <WindowButton
            variant="primary"
            onClick={onNext}
            {...HINT_TOP(last ? t('welcome.doneHint') : t('welcome.nextHint'))}
          >
            {last ? t('welcome.done') : t('welcome.next')}
          </WindowButton>
        </div>
      </div>
    </footer>
  )
}
