import { mdiCreationOutline, mdiKeyOutline, mdiPlayOutline, mdiProgressClock } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { HOME_SURFACE } from '@shared/domain/tool'
import { openNewDocument } from '@/features/shell/newDocument'
import type { DocumentDescriptor } from '@shared/domain/document'
import { isFinished } from '@shared/domain/job'
import { Carousel } from '@/components/Carousel/Carousel'
import { useGauge } from '@/hooks/useGauge'
import { getBridge } from '@/services/bridge'
import { useDocuments, type DocumentsSlice } from '@/stores/documents'
import { useJobs } from '@/stores/jobs'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { openDocument } from '@/features/shell/components/dockviewApi'
import { SpotlightCard, type Slide } from './SpotlightCard'
import { SpotlightWaiting } from './SpotlightWaiting'
import { projectName } from '@shared/domain/project'

/** Two to a page, dividing the band: a fixed width left the second one sliced by the edge. */
const PER_VIEW = 2

/** Under this a half-band card no longer holds a heading and a sentence, so one takes the width. */
const MIN_CARD_WIDTH = 320

/** What the gauge says at scale 1, and what a window with no stylesheet falls back to. */
const CARD_HEIGHT = 168

/**
 * The document "Resume" means. The tab in front when the studio was last on a workspace, and
 * the first one otherwise — the store keys its record in insertion order, which is the closest
 * thing to recency a `DocumentDescriptor` carries.
 */
function resumable(state: DocumentsSlice): DocumentDescriptor | undefined {
  const active = state.activeId ? state.documents[state.activeId] : undefined
  return active ?? Object.values(state.documents)[0]
}

/**
 * The band at the top of the home, built from what is actually true right now.
 *
 * Deliberately not an editorial carousel: banners of that kind need someone to write them, and
 * a studio that ships with three that never change is a studio whose first screen is stale on
 * the second launch. What a person wants at the top is where they left off, what is running,
 * and what is in their way.
 *
 * It never renders empty, which is why it is pinned — the last branch below is what holds that.
 */
export function Spotlight() {
  const { t } = useTranslation()
  const project = useProject(state => state.project)
  const projectKnown = useProject(state => state.known)
  const last = useDocuments(resumable)
  // The count, not the list: `apply` replaces the whole array on every progress event, and this
  // band only changes when a job starts or stops.
  const running = useJobs(state => state.jobs.filter(job => !isFinished(job.status)).length)
  const authenticated = useSettings(state => state.auth.authenticated)
  const authKnown = useSettings(state => state.authKnown)
  // The card holds prose, which follows `appearance.fontScale`; its height has to follow with it.
  const cardHeight = useGauge('--sc-spotlight-card', CARD_HEIGHT)

  const slides = spotlightSlides({ project, last, running, authenticated, authKnown, t })

  // No card for "start a project": the rail's + makes one, the tools band offers it twice more,
  // and a banner across the top of the page said the same thing a fourth time.

  // Every branch above is conditional, and a project open with nothing in it yet satisfies none
  // of them. Being pinned is a promise to draw something: without this, the home would open on
  // its second band, and the one state a fresh project is in would be the one with no heading.
  if (slides.length === 0) {
    // Except at launch, where "nothing is true" and "nothing is known yet" look the same from
    // here. Naming a state now would name the wrong one and take it back a moment later — which
    // is what made this band flicker through three readings while the window was still opening.
    if (!authKnown || !projectKnown) return <SpotlightWaiting />

    slides.push({
      id: 'ready',
      icon: mdiCreationOutline,
      title: t('home.spotlight.ready'),
      // Two sentences rather than an empty hole: `readyBody` names the project, and filling that
      // hole with '' left "est ouvert et ne contient encore rien" standing without a subject.
      body: project
        ? t('home.spotlight.readyBody', { project: projectName(project.path) })
        : t('home.spotlight.readyBodyNoProject'),
      action: {
        label: t('home.spotlight.readyAction'),
        hint: t('home.spotlightReadyHint'),
        onClick: () => void openNewDocument(HOME_SURFACE),
      },
    })
  }

  // Read off the list rather than set at four push sites: the first card that offers something
  // to do is the one worth the accent, and "running" is the only card that offers nothing.
  const leading = slides.find(slide => slide.action !== undefined)
  if (leading) leading.leading = true

  // A lone banner has no rail to be scrolled along, and a half-width card marooned in a 1400 px
  // band reads as a leftover rather than as the top of the page. It takes the width instead, and
  // lies down: a full-width card as tall as a stacked one is mostly empty.
  if (slides.length === 1 && slides[0]) return <SpotlightCard slide={slides[0]} layout="banner" />

  return (
    <Carousel
      items={slides}
      itemWidth={MIN_CARD_WIDTH}
      perView={PER_VIEW}
      itemHeight={cardHeight}
      label={t('home.sections.spotlight')}
      renderCard={slide => <SpotlightCard slide={slide} layout="stacked" />}
    />
  )
}

type SpotlightState = {
  project: ReturnType<typeof useProject.getState>['project']
  last: DocumentDescriptor | undefined
  running: number
  authenticated: boolean
  authKnown: boolean
  t: ReturnType<typeof useTranslation>['t']
}

function spotlightSlides(state: SpotlightState): Slide[] {
  const slides: Slide[] = []
  if (state.project && state.last) slides.push(resumeSlide(state.project.path, state.last, state.t))
  if (state.running > 0) slides.push(runningSlide(state.running, state.t))
  if (state.authKnown && !state.authenticated) slides.push(credentialsSlide(state.t))
  return slides
}

function resumeSlide(path: string, last: DocumentDescriptor, t: SpotlightState['t']): Slide {
  return {
    id: 'resume',
    icon: mdiPlayOutline,
    title: t('home.spotlight.resume'),
    body: t('home.spotlight.resumeBody', { project: projectName(path), name: last.title }),
    action: {
      label: t('home.spotlight.resumeAction'),
      hint: t('home.spotlightResumeHint'),
      onClick: () => openDocument(last),
    },
  }
}

function runningSlide(running: number, t: SpotlightState['t']): Slide {
  return {
    id: 'running',
    icon: mdiProgressClock,
    title: t('home.spotlight.running', { count: running }),
    body: t('home.spotlight.runningBody'),
  }
}

function credentialsSlide(t: SpotlightState['t']): Slide {
  return {
    id: 'credentials',
    icon: mdiKeyOutline,
    title: t('home.spotlight.connect'),
    body: t('home.spotlight.connectBody'),
    action: {
      label: t('home.spotlight.connectAction'),
      hint: t('home.spotlightConnectHint'),
      onClick: () => void getBridge()?.settings.open('account'),
    },
  }
}
