import { useEffect, useState } from 'react'
import { useShortcuts } from '@/hooks/useShortcuts'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'

type Navigation = Pick<
  SceneRenderer,
  'setMotion' | 'releaseNavigation' | 'setNavigating' | 'frameAll' | 'flying' | 'flightOwnsArrows'
>
type Side = 'source' | 'target'

/** One keyboard owner for both existing scene engines. */
export function useRetargetNavigation(source: Navigation | null, target: Navigation | null) {
  const [active, activate] = useState<Side>('target')
  const [navigating, setNavigating] = useState(false)
  const engine = active === 'source' ? source : target
  const { heldMotion } = useShortcuts({
    scope: 'scene',
    enabled: engine !== null,
    onMotionChange: held => engine?.setMotion(held),
    isFlying: () => engine?.flying ?? false,
    flightOwnsArrows: () => engine?.flightOwnsArrows ?? false,
    onCommand: command => {
      if (!engine) return false
      if (command === 'scene.frame') {
        engine.frameAll()
        return true
      }
      if (command !== 'scene.navigate') return false
      engine.setNavigating(!navigating)
      setNavigating(!navigating)
      return true
    },
  })
  useEffect(
    () => () => {
      heldMotion.current.clear()
      setNavigating(false)
      engine?.releaseNavigation()
    },
    [engine, heldMotion],
  )
  return {
    active,
    activate,
    navigating,
    onNavigatingChange: setNavigating,
  }
}
