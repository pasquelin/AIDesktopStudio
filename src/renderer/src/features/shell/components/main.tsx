import { localizedError } from '@shared/localizedError'
import { isRetargetRoute } from '@shared/domain/retargetWindow'
import { orElse } from '@shared/promises'
import { lazy, StrictMode, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { isJournalRoute } from '@shared/domain/activity'
import { isFileInfoRoute } from '@shared/domain/fileInfo'
import { isGameWindowRoute } from '@shared/domain/gameWindow'
import { isLicencesRoute } from '@shared/domain/licence'
import { isManualRoute } from '@shared/domain/manual'
import { isMirrorRoute } from '@shared/domain/mirror'
import { isNewDocumentRoute } from '@shared/domain/newDocument'
import { isPlayerModuleRoute } from '@shared/domain/playerModuleWindow'
import { isSettingsRoute } from '@shared/domain/settings'
import { isUsageRoute } from '@shared/domain/usage'
import { isWelcomeRoute } from '@shared/domain/welcome'
import { UNKNOWN_SYSTEM_LANGUAGE } from '@shared/i18n'
import { Application } from '@/features/shell/components/Application'
import { getBridge } from '@/services/bridge'
import { ROOT_ERROR_REPORTING, traceDroppedRejections } from '@/features/shell/rootErrors'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Failure } from '@/components/Failure'
import { initI18n } from '@/i18n/index'
import '@/index.css'

// First of all, and above the two awaits below: this module splits there, and a rejection during
// the language read or `initI18n` is exactly the kind nothing else in the window would catch.
traceDroppedRejections()

const root = document.getElementById('root')
if (!root) throw localizedError('rootElementMissing')

// Asked, never worked out here — see `StudioBridge['window']['language']`. Falling back rather
// than letting it throw: this runs during module evaluation, which the boundary below cannot
// catch, and a rejected read would leave a permanently empty window. The fallback is the one
// for a machine whose language we do not know, which is exactly what an unanswered read leaves.
const language = await orElse(getBridge()?.window.language(), UNKNOWN_SYSTEM_LANGUAGE)
await initI18n(language)

/** Same reason as the licences below, for another window's folder: registry, sections, draft. */
const RetargetWindow = lazy(async () => ({
  default: (await import('@/features/retarget/components/Retarget/RetargetWindow')).RetargetWindow,
}))

const SettingsWindow = lazy(async () => ({
  default: (await import('@/features/settings/components/SettingsWindow/SettingsWindow'))
    .SettingsWindow,
}))

/**
 * The whole notice — every shipped licence, in full — is fifty kilobytes nobody reads in a
 * usual session, and a static import puts it in the chunk the splash waits for.
 */
const LicencesWindow = lazy(async () => ({
  default: (await import('@/features/shell/components/LicencesWindow')).LicencesWindow,
}))

/** Split like its neighbours: opened on purpose, and rarely. */
const JournalWindow = lazy(async () => ({
  default: (await import('@/features/shell/components/JournalWindow')).JournalWindow,
}))

/** Split like its neighbours: the return is opened on purpose, and rarely. */
const MirrorWindow = lazy(async () => ({
  default: (await import('@/features/video/components/MirrorWindow/MirrorWindow')).MirrorWindow,
}))

/** Lazy for a harder reason than size: it drags a `SceneRenderer`, and with it all of three.js. */
const GameWindow = lazy(async () => ({
  default: (await import('@/features/game/components/GameWindow/GameWindow')).GameWindow,
}))

/** Lazy for the same reason as the game window: it drags a `SceneRenderer`, and three.js with it. */
const PlayerModuleWindow = lazy(async () => ({
  default: (await import('@/features/player/components/PlayerModuleWindow/PlayerModuleWindow'))
    .PlayerModuleWindow,
}))

/** Lazy for a harder reason than size: the charting library must stay out of the first frame. */
const UsageWindow = lazy(async () => ({
  default: (await import('@/features/usage/components/Usage/Window/UsageWindow')).UsageWindow,
}))

/**
 * Lazy for the plainest reason of the four: `manual.json` is twenty chapters in two languages,
 * and the markdown renderer comes with it. None of it belongs in the chunk the splash waits for.
 */
const ManualWindow = lazy(async () => ({
  default: (await import('@/features/manual/components/ManualWindow/ManualWindow')).ManualWindow,
}))

/** Split like its neighbours, though it is the smallest of them: it opens on a right-click. */
const FileInfoWindow = lazy(async () => ({
  default: (await import('@/features/document/components/FileInfoWindow/FileInfoWindow'))
    .FileInfoWindow,
}))

/** Split like its neighbours: it opens on the plus button, and nowhere near the first frame. */
const NewDocumentWindow = lazy(async () => ({
  default: (await import('@/features/document/components/NewDocument/NewDocumentWindow'))
    .NewDocumentWindow,
}))

const WelcomeWindow = lazy(async () => ({
  default: (await import('@/features/welcome/components/WelcomeWindow')).WelcomeWindow,
}))

/**
 * Every application window loads the same bundle and reads the route from the fragment: the
 * i18n bootstrap, the tokens and the bridge are shared, and navigation is locked, so the
 * fragment is only ever what the main process loaded. The splash is the one exception — it
 * has its own entry precisely so it never pulls this bundle in.
 */
function Route({ hash }: { hash: string }) {
  const window = windowFor(hash)
  return window ? <Suspense fallback={null}>{window}</Suspense> : <Application />
}

function windowFor(hash: string): ReactNode {
  if (isRetargetRoute(hash)) return <RetargetWindow />
  if (isSettingsRoute(hash)) return <SettingsWindow />
  if (isJournalRoute(hash)) return <JournalWindow />
  if (isLicencesRoute(hash)) return <LicencesWindow />
  if (isUsageRoute(hash)) return <UsageWindow />
  if (isGameWindowRoute(hash)) return <GameWindow />
  if (isPlayerModuleRoute(hash)) return <PlayerModuleWindow />
  if (isMirrorRoute(hash)) return <MirrorWindow />
  if (isManualRoute(hash)) return <ManualWindow />
  if (isFileInfoRoute(hash)) return <FileInfoWindow />
  if (isNewDocumentRoute(hash)) return <NewDocumentWindow />
  if (isWelcomeRoute(hash)) return <WelcomeWindow />
  return null
}

createRoot(root, ROOT_ERROR_REPORTING).render(
  <StrictMode>
    {/* Above the routes: the per-panel boundaries cover the docks, not the shell holding them.
        Renders only, and not this module's own evaluation — a throw there predates the
        boundary and leaves the empty window no React can catch. Event handlers and rejected
        promises are outside too. Retry cannot mend a rejected `lazy()` either: React caches
        the rejection, so the licences route in particular offers a button that cannot win. */}
    <ErrorBoundary fallback={retry => <Failure scope="window" onRetry={retry} />}>
      <Route hash={window.location.hash} />
    </ErrorBoundary>
  </StrictMode>,
)
