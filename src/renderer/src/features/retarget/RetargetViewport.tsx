import { reportFailure } from '@/services/diagnostics'
import { useLatest } from '@/hooks/useLatest'
import { useEffect, useRef } from 'react'
import { useSettings } from '@/stores/settings'
import { SceneSpeedControl } from '@/features/scene/components/Scene/SceneSpeedControl'
import { SceneNavigationHint } from '@/features/scene/components/Scene/SceneNavigationHint'
import { useState } from 'react'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { createGltfSource } from '@/engines/scene/gltfSource'
import { workshopScene } from '@/character/characterStage'
import type { WireBone, WireClip } from '@/engines/scene/retargetMessage'
import type { RetargetSnapshot } from './retargetChannel'

export type MotionView = {
  engine: SceneRenderer
  nodeId: string
  bones: WireBone[]
  clips: WireClip[]
}
export type RetargetViewportProps = {
  assetId: string
  sourceUrl?: string
  snapshot?: RetargetSnapshot
  onReady: (view: MotionView | null) => void
  onFailure: () => void
  navigating?: boolean
  onNavigatingChange?: (value: boolean) => void
}

export function RetargetViewport({
  assetId,
  sourceUrl,
  snapshot,
  onReady,
  onFailure,
  onNavigatingChange,
  navigating = false,
}: RetargetViewportProps) {
  const view = useSettings(state => state.settings.three)
  const engine = useRef<SceneRenderer | null>(null)
  const [speed, setSpeed] = useState<number | null>(null)
  useEffect(() => {
    engine.current?.configure({ ...view, showGrid: true })
  }, [view])
  const host = useRef<HTMLDivElement>(null)
  const callbacks = useLatest({ onReady, onFailure, onNavigatingChange })
  useEffect(() => {
    if (!host.current) return
    const scene = workshopScene(assetId)
    const nodeId = scene.nodes[0]?.id
    if (!nodeId) return
    let alive = true
    const source = sourceUrl ? createGltfSource(() => null) : null
    const renderer = new SceneRenderer({
      onSelect: () => {},
      onTransform: () => {},
      chrome: false,
      onFlySpeedChange: setSpeed,
      onNavigatingChange: value => {
        callbacks.current.onNavigatingChange?.(value)
      },
      ...(source && {
        loadModel: async () => {
          try {
            return await source.loadAnimation(sourceUrl ?? '')
          } catch (error) {
            if (alive) callbacks.current.onFailure()
            throw error
          }
        },
      }),
      onCharacter: () => {
        void ready()
      },
    })
    const ready = async () => {
      try {
        if (snapshot?.rig) {
          if (snapshot.bindings) {
            const applied = await renderer.applyAutoRig(nodeId, {
              rig: snapshot.rig,
              bindings: snapshot.bindings,
              metadata: {
                backendId: 'stored',
                sourceInfluences: snapshot.rig.bones.length,
                outputInfluences: 4,
                fingers: false,
              },
            })
            if (!applied) throw new Error('incompatible skin bindings')
          } else await renderer.skinModel(nodeId, snapshot.rig)
        }
        if (!alive) return
        renderer.frameContents()
        const motion = renderer.inspectMotion(nodeId)
        if (motion) callbacks.current.onReady({ engine: renderer, nodeId, ...motion })
        else callbacks.current.onFailure()
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
    renderer.apply(scene)
    return () => {
      alive = false
      callbacks.current.onReady(null)
      engine.current = null
      renderer.releaseNavigation()
      renderer.dispose()
      source?.dispose()
    }
  }, [assetId, sourceUrl, snapshot])
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={host} className="relative min-h-0 min-w-0 flex-1 overflow-hidden" />
      {navigating && <SceneNavigationHint speed={speed} />}
      <SceneSpeedControl speed={speed} onSpeed={value => engine.current?.setFlySpeed(value)} />
    </div>
  )
}
