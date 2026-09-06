import { mdiAccountOutline } from '@mdi/js'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { playerModuleAssetOf } from '@shared/domain/playerModuleWindow'
import { EmptyState } from '@/components/EmptyState'
import { WindowShell } from '@/components/WindowShell'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import type { SceneState } from '@/engines/scene/sceneState'
import { assetBytes } from '@/helpers/assetFetch'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { useConnections } from '@/hooks/useConnections'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { assetVersionOf } from '@/stores/assets'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { sceneFromModuleFile } from '@/features/player/sceneFromModuleFile'

/**
 * A player module on its own. It reads the FILE its route names rather than a scene: a second
 * window editing the studio's own state would need a two-way sync and a shared history.
 *
 * 🛑 It SHOWS the module and does not yet edit it — no gizmo, no tree, no save.
 */
export function PlayerModuleWindow() {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const engine = useRef<SceneRenderer | null>(null)
  // Both carry the module they answer FOR: a window turned towards another one must not show the
  // one before it while the new file is being read, and clearing them in the effect cascades.
  const [read, setRead] = useState<{ id: string; scene: SceneState; title: string } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  useAppliedSettings()
  const [assetId, setAssetId] = useState(playerModuleAssetOf(window.location.hash))
  const connectProject = useProject(state => state.connect)
  const connectSettings = useSettings(state => state.connect)
  const three = useSettings(state => state.settings.three)

  // The project, not just the module: a mesh wears the material of OTHER documents, read off this
  // window's own stores. And the settings, or the window shows the defaults' theme and lens.
  useConnections([connectProject, connectSettings])

  // 🛑 The main process turns THIS window towards another module by reloading its fragment, which
  // Chromium treats as a same-document navigation: nothing re-renders, so the window went on
  // showing the module before it — measured against `openPlayerModuleWindow`'s reveal branch.
  useEffect(() => {
    const follow = () => setAssetId(playerModuleAssetOf(window.location.hash))
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])

  useEffect(() => {
    const element = hostRef.current
    if (!element) return

    const renderer = new SceneRenderer({
      onSelect: () => {},
      onTransform: () => {},
      assetVersion: assetVersionOf,
    })
    renderer.mount(element)
    engine.current = renderer

    return () => {
      engine.current = null
      renderer.unmount()
    }
  }, [])

  // After the mount, so a preference does not rebuild the renderer.
  useEffect(() => {
    engine.current?.configure(three)
  }, [three])

  useEffect(() => {
    if (!assetId) return
    let cancelled = false
    void readModule(
      assetId,
      read => {
        if (!cancelled) setRead(read)
      },
      id => {
        if (!cancelled) setFailure(id)
      },
    )
    return () => {
      cancelled = true
    }
  }, [assetId])

  const state = read?.id === assetId ? read.scene : null
  const title = read?.id === assetId && read.title ? read.title : t('playerWindow.title')

  useEffect(() => {
    if (state) engine.current?.apply(state)
  }, [state])

  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <WindowShell title={title}>
      <div className="relative h-full">
        <div ref={hostRef} className="absolute inset-0" />
        {!state && (
          <EmptyState
            icon={mdiAccountOutline}
            message={t(failure === assetId ? 'playerWindow.unreadable' : 'playerWindow.reading')}
          />
        )}
      </div>
    </WindowShell>
  )
}

/** Read off the file the route names — and SAID on screen, never only to the journal. */
async function readModule(
  assetId: string,
  into: (read: { id: string; scene: SceneState; title: string }) => void,
  onFailure: (assetId: string) => void,
): Promise<void> {
  try {
    const scene = sceneFromModuleFile(await assetBytes(assetId), assetId)
    into({ id: assetId, scene, title: (await nameOf(assetId)) ?? scene.nodes[0]?.name ?? '' })
  } catch (error) {
    onFailure(assetId)
    reportFailure('scene.player', assetId, error)
  }
}

/** Caption only: a catalogue miss must not blank a file that parsed. */
async function nameOf(assetId: string): Promise<string | null> {
  try {
    const [asset] = (await getBridge()?.assets.search({ ids: [assetId], limit: 1 })) ?? []
    return asset?.name ?? null
  } catch {
    return null
  }
}
