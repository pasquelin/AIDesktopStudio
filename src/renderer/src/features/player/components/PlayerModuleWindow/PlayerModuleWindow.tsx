import { mdiAccountOutline } from '@mdi/js'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { playerModuleAssetOf } from '@shared/domain/playerModuleWindow'
import { EmptyState } from '@/components/EmptyState'
import { WindowShell } from '@/components/WindowShell'
import { sceneFromGltf } from '@/engines/scene/gltfDocument'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { EMPTY_SCENE, type SceneState } from '@/engines/scene/sceneState'
import { fetchAsset } from '@/helpers/assetFetch'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { useConnections } from '@/hooks/useConnections'
import { reportFailure } from '@/services/diagnostics'
import { assetVersionOf } from '@/stores/assets'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'

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
  const [read, setRead] = useState<{ id: string; scene: SceneState } | null>(null)
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
    renderer.configure(useSettings.getState().settings.three)
    engine.current = renderer

    return () => {
      engine.current = null
      renderer.unmount()
    }
  }, [])

  // Its own effect: the one that mounts the renderer must not run again for a preference.
  useEffect(() => {
    engine.current?.configure(three)
  }, [three])

  useEffect(() => {
    if (assetId) void readModule(assetId, setRead, setFailure)
  }, [assetId])

  const state = read?.id === assetId ? read.scene : null

  useEffect(() => {
    if (state) engine.current?.apply(state)
  }, [state])

  return (
    <WindowShell title={t('playerWindow.title')}>
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
  into: (read: { id: string; scene: SceneState }) => void,
  onFailure: (assetId: string) => void,
): Promise<void> {
  try {
    const text = await (await fetchAsset(assetId)).text()
    into({ id: assetId, scene: { ...EMPTY_SCENE, nodes: sceneFromGltf(JSON.parse(text)).nodes } })
  } catch (error) {
    onFailure(assetId)
    reportFailure('scene.player', assetId, error)
  }
}
