import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { completedOnboarding, WELCOME_SLIDES, type WelcomeSlideId } from '@shared/domain/welcome'
import { TooltipHost } from '@/components/TooltipHost'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { useConnections } from '@/hooks/useConnections'
import { useLatest } from '@/hooks/useLatest'
import { useAccounts } from '@/stores/accounts'
import { useAiModels } from '@/stores/aiModels'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { WelcomeCanvas } from './WelcomeCanvas'
import { WelcomeFooter } from './WelcomeFooter'
import { WelcomeMasthead } from './WelcomeMasthead'
import { WelcomePanel } from './WelcomePanel'
import { WelcomeStage } from './WelcomeStage'
import { WelcomeSlideAccount } from './WelcomeSlideAccount'
import { WelcomeSlideAi } from './WelcomeSlideAi'
import { WelcomeSlideCraft } from './WelcomeSlideCraft'
import { WelcomeSlideLanguage } from './WelcomeSlideLanguage'
import { WelcomeSlideLook } from './WelcomeSlideLook'
import { WelcomeSlideModels } from './WelcomeSlideModels'
import { WelcomeSlideProject } from './WelcomeSlideProject'

/**
 * Which screen each step of `WELCOME_SLIDES` shows. Keyed, not ordered: the rail and the titles
 * were positional arrays, so a screen inserted mid-list moved every title onto the wrong dot.
 */
/** The sheets that hold two columns rather than one question — the rest read as a band that wide. */
const WIDE: readonly WelcomeSlideId[] = ['ai', 'models']

const SLIDES: Record<WelcomeSlideId, ComponentType> = {
  language: WelcomeSlideLanguage,
  look: WelcomeSlideLook,
  craft: WelcomeSlideCraft,
  ai: WelcomeSlideAi,
  models: WelcomeSlideModels,
  account: WelcomeSlideAccount,
  project: WelcomeSlideProject,
}

type WelcomeKeys = {
  index: number
  advance: () => void
  finish: () => Promise<void>
  goTo: (next: number) => void
}

const closest = (target: EventTarget | null, selector: string): boolean =>
  target instanceof HTMLElement && target.closest(selector) !== null

function handleWelcomeKey(event: globalThis.KeyboardEvent, held: WelcomeKeys): void {
  if (closest(event.target, 'input, textarea, select')) return
  if (event.key === 'Enter' && closest(event.target, 'button, [role="button"]')) return
  if (event.key === 'Escape') {
    event.preventDefault()
    void held.finish()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    held.advance()
    return
  }
  // An arrow slides and never ends (Alban): on the last screen the right one used to close the
  // window, so reaching the end by keyboard and reaching it by mistake were the same gesture.
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    held.goTo(held.index + 1)
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    held.goTo(held.index - 1)
  }
}

export function WelcomeWindow() {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const connect = useSettings(state => state.connect)
  const connectAccounts = useAccounts(state => state.connect)
  const connectProject = useProject(state => state.connect)
  const connectAiModels = useAiModels(state => state.connect)
  const write = useSettings(state => state.write)

  useConnections([connect, connectAccounts, connectProject, connectAiModels])
  useAppliedSettings()

  const last = WELCOME_SLIDES.length - 1
  const goTo = useCallback(
    (next: number) => {
      setIndex(Math.min(last, Math.max(0, next)))
    },
    [last],
  )

  const finish = useCallback(async () => {
    await write({ onboarding: completedOnboarding(new Date().toISOString()) })
    window.close()
  }, [write])

  const advance = useCallback(() => {
    if (index >= last) void finish()
    else goTo(index + 1)
  }, [finish, goTo, index, last])

  const latest = useLatest({ index, advance, finish, goTo })
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      handleWelcomeKey(event, latest.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [latest])

  const titles: Record<WelcomeSlideId, string> = {
    language: t('welcome.language.title'),
    look: t('welcome.look.title'),
    craft: t('welcome.craft.title'),
    ai: t('welcome.ai.title'),
    models: t('welcome.models.title'),
    account: t('welcome.account.title'),
    project: t('welcome.project.title'),
  }

  return (
    <div className="text-base-content relative h-screen overflow-hidden">
      <WelcomeCanvas slide={index} />
      <div className="relative z-10 flex h-full flex-col">
        <WelcomeMasthead />
        <WelcomeStage index={index}>
          {WELCOME_SLIDES.map(id => {
            const Slide = SLIDES[id]
            return (
              <WelcomePanel key={id} wide={WIDE.includes(id)}>
                <Slide />
              </WelcomePanel>
            )
          })}
        </WelcomeStage>
        <WelcomeFooter
          index={index}
          titles={titles}
          onBack={() => goTo(index - 1)}
          onNext={advance}
          onSkip={() => void finish()}
          onGoTo={goTo}
        />
      </div>
      <TooltipHost />
    </div>
  )
}
