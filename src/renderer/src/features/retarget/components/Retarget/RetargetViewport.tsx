import { createRetargetModelSource } from '../../retargetModelSource'
import { restoreStoredRig } from '@/character/restoreStoredRig'
import { useTranslation } from 'react-i18next'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import { PANE_TOOLBAR } from '@/components/panelStyles'
import { reportFailure } from '@/services/diagnostics'
import { useLatest } from '@/hooks/useLatest'
import { cn } from '@/helpers/cn'
import { useEffect, useRef } from 'react'
import { useSettings } from '@/stores/settings'
import { SceneSpeedControl } from '@/features/scene/components/Scene/SceneSpeedControl'
import { SceneNavigationHint } from '@/features/scene/components/Scene/SceneNavigationHint'
import { useState } from 'react'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { createGltfSource } from '@/engines/scene/gltfSource'
import { workshopScene } from '@/character/characterStage'
import type { WireBone, WireClip } from '@/engines/scene/retargetMessage'
import type { RetargetSnapshot } from '../../retargetChannel'

export type MotionView = {
  engine: SceneRenderer
  nodeId: string
  bones: WireBone[]
  clips: WireClip[]
}
export type RetargetViewportProps = {
  assetId: string
  clipIndex?: number
  sourceUrl?: string
  snapshot?: RetargetSnapshot
  onReady: (view: MotionView | null) => void
  onFailure: () => void
  navigating?: boolean
  onNavigatingChange?: (value: boolean) => void
}

export function RetargetViewport({
  assetId,
  clipIndex = 0,
  sourceUrl,
  snapshot,
  onReady,
  onFailure,
  onNavigatingChange,
  navigating = false,
}: RetargetViewportProps) {
  const view = useSettings(state => state.settings.three)
  const engine = useRef<SceneRenderer | null>(null)
  const sourceMode = sourceUrl !== undefined
  const switching = useRef<ReturnType<typeof createRetargetModelSource> | null>(null)
  const [speed, setSpeed] = useState<number | null>(null)
  useEffect(() => {
    engine.current?.configure({ ...view, showGrid: true })
  }, [view])
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const callbacks = useLatest({ onReady, onFailure, onNavigatingChange, clipIndex, snapshot })
  useEffect(() => {
    if (!host.current) return
    const scene = workshopScene(assetId)
    const nodeId = scene.nodes[0]?.id
    if (!nodeId) return
    let alive = true
    let framed = false
    const source = sourceMode
      ? createRetargetModelSource(
          createGltfSource(() => null),
          key =>
            renderer.apply({
              ...scene,
              nodes: scene.nodes.map(node =>
                node.type === 'model' ? { ...node, model: { ...node.model, assetId: key } } : node,
              ),
            }),
          () => {
            if (alive) callbacks.current.onFailure()
          },
        )
      : null
    switching.current = source
    const renderer = new SceneRenderer({
      onSelect: () => {},
      onTransform: () => {},
      chrome: false,
      onFlySpeedChange: setSpeed,
      onNavigatingChange: value => {
        callbacks.current.onNavigatingChange?.(value)
      },
      ...(source && { loadModel: source.load }),
      onCharacter: () => {
        void ready()
      },
    })
    const ready = async () => {
      try {
        await restoreRig(renderer, nodeId, callbacks.current.snapshot)
        if (!alive || (source && !source.current())) return
        if (!framed) framed = renderer.frameContents()
        const motion = renderer.inspectMotion(nodeId)
        if (!motion) {
          callbacks.current.onFailure()
          return
        }
        if (source) poseInitially(renderer, nodeId, motion.clips[callbacks.current.clipIndex])
        callbacks.current.onReady({ engine: renderer, nodeId, ...motion })
      } catch (error) {
        if (alive) {
          reportFailure('scene.animation', assetId, error)
          callbacks.current.onFailure()
        }
      }
    }
    engine.current = renderer
    renderer.mount(host.current)
    renderer.configure({ ...useSettings.getState().settings.three, showGrid: true })
    renderer.setSkeletons(true)
    if (!source) renderer.apply(scene)
    return () => {
      alive = false
      callbacks.current.onReady(null)
      engine.current = null
      renderer.releaseNavigation()
      renderer.dispose()
      source?.dispose()
      switching.current = null
    }
  }, [assetId, sourceMode, snapshot?.incarnation, snapshot?.rig, snapshot?.bindings])
  useEffect(() => {
    if (!sourceUrl || !switching.current) return
    callbacks.current.onReady(null)
    void switching.current.select(sourceUrl)
  }, [sourceUrl, assetId, callbacks])
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col p-(--sc-gutter)">
      <div
        ref={host}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-(--radius-sc-lg)"
      />
      {navigating && <SceneNavigationHint speed={speed} />}
      <Toolbar
        orientation="horizontal"
        label={t('character.cameraSpeed')}
        className={cn(PANE_TOOLBAR, 'm-(--sc-gutter)')}
        extras={
          <SceneSpeedControl speed={speed} onSpeed={value => engine.current?.setFlySpeed(value)} />
        }
      />
    </div>
  )
}

async function restoreRig(
  renderer: SceneRenderer,
  nodeId: string,
  snapshot: RetargetSnapshot | undefined,
): Promise<void> {
  if (!snapshot?.rig) return
  if (!(await restoreStoredRig(renderer, nodeId, snapshot.rig, snapshot.bindings)))
    throw new Error('incompatible skin bindings')
}

/** Holds the first frame of the chosen clip so the source never shows its bind pose. */
function poseInitially(renderer: SceneRenderer, nodeId: string, clip: WireClip | undefined): void {
  if (!clip) return
  const key = 'retarget-initial-pose'
  renderer.installMotion(nodeId, key, clip)
  renderer.poseNode(nodeId, [{ key, time: 0, weight: 1, part: 'all', rootMotion: 'travel' }])
}
