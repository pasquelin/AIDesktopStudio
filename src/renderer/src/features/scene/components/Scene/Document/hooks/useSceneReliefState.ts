import { useEffect } from 'react'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import type { sceneViewChromeOf } from '@/stores/sceneViewChrome'

export function useSceneReliefState(
  engine: { current: SceneRenderer | null },
  view: ReturnType<typeof sceneViewChromeOf>,
): void {
  useEffect(() => engine.current?.setSculptMode?.(view.sculptMode), [engine, view.sculptMode])
  useEffect(() => engine.current?.setSculptTool?.(view.sculptTool), [engine, view.sculptTool])
  useEffect(() => engine.current?.setArmedWorld?.(view.armedWorld), [engine, view.armedWorld])
  useEffect(
    () =>
      engine.current?.setSculptBrush?.(view.sculptRadius, view.sculptFalloff, view.sculptAmount),
    [engine, view.sculptRadius, view.sculptFalloff, view.sculptAmount],
  )
}
