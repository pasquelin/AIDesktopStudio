import type { IDockviewPanelProps } from 'dockview-react'
import type { DocumentKind } from '@shared/domain/document'
import { lazy, type FC } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { DocumentsGuard } from './Documents/DocumentsGuard'

export type DocumentPanelParams = { documentId: string }

/**
 * Loaded when a document of that kind is first opened, not on startup.
 *
 * Between them these reach three.js, PixiJS, wavesurfer and mediabunny, and importing them
 * here put all of them in the chunk the splash screen waits for — five megabytes to open a
 * window that shows an empty centre. A studio session opens one or two of these spaces, and
 * the one it opens costs a few hundred milliseconds it was going to spend anyway.
 */
const ImageDocument = lazy(async () => ({
  default: (await import('@/features/image/components/ImageDocument/ImageDocument')).ImageDocument,
}))
const SceneDocument = lazy(async () => ({
  default: (await import('@/features/scene/components/Scene/Document/SceneDocument')).SceneDocument,
}))
const SequenceDocument = lazy(async () => ({
  default: (await import('@/features/video/components/SequenceDocument')).SequenceDocument,
}))
const AudioDocument = lazy(async () => ({
  default: (await import('@/features/audio/components/AudioDocument')).AudioDocument,
}))
const SkyboxDocument = lazy(async () => ({
  default: (await import('@/features/skybox/components/Skybox/Document/SkyboxDocument'))
    .SkyboxDocument,
}))
const ScriptDocument = lazy(async () => ({
  default: (await import('@/features/code/components/ScriptDocument')).ScriptDocument,
}))
const GuiDocument = lazy(async () => ({
  default: (await import('@/features/gui/components/Gui/Document/GuiDocument')).GuiDocument,
}))
const CharacterDocument = lazy(async () => ({
  default: (await import('@/features/character/components/CharacterDocument/CharacterDocument'))
    .CharacterDocument,
}))
const MaterialDocument = lazy(async () => ({
  default: (await import('@/features/material/components/Material/MaterialDocument'))
    .MaterialDocument,
}))
/**
 * Every space is opened the same way: the tab checks its document still exists, then renders.
 *
 * The press brings the panel forward, which is what puts its section up — Dockview cannot: it
 * activates a group off FOCUS, and a viewport is a `div` a click never focuses. In capture,
 * because the engines below stop the propagation of their own pointer gestures.
 */
function panelFor(Space: FC<{ documentId: string }>): FC<IDockviewPanelProps<DocumentPanelParams>> {
  return props => (
    // Outside the boundary, so a space that threw is still a panel one can bring forward.
    <div
      className="size-full"
      onPointerDownCapture={() => {
        if (!props.api.isActive) props.api.setActive()
      }}
    >
      {/* Above the `Suspense` below: a rejected `lazy()` import is an error, not a fallback. Retry
          cannot fix that one — React caches the rejection — but the tab stays closable. */}
      <ErrorBoundary>
        <DocumentsGuard id={props.params.documentId}>
          {() => <Space documentId={props.params.documentId} />}
        </DocumentsGuard>
      </ErrorBoundary>
    </div>
  )
}

/** Document components handed to Dockview, keyed by `DocumentKind`. */
export const DOCUMENT_COMPONENTS: Record<
  DocumentKind,
  FC<IDockviewPanelProps<DocumentPanelParams>>
> = {
  image: panelFor(ImageDocument),
  scene: panelFor(SceneDocument),
  sequence: panelFor(SequenceDocument),
  audio: panelFor(AudioDocument),
  script: panelFor(ScriptDocument),
  skybox: panelFor(SkyboxDocument),
  material: panelFor(MaterialDocument),
  gui: panelFor(GuiDocument),
  character: panelFor(CharacterDocument),
}
