import { useEffect, useRef } from 'react'
import { WelcomeBackdrop } from '@/engines/welcome/WelcomeBackdrop'
import { useSettings } from '@/stores/settings'

export function WelcomeCanvas({ slide }: { slide: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<WelcomeBackdrop | null>(null)
  const reduceMotion = useSettings(state => state.settings.appearance.reduceMotion)
  const start = useRef({ reduceMotion, slide })

  useEffect(() => {
    const node = canvas.current
    if (!node) return

    let backdrop: WelcomeBackdrop
    try {
      backdrop = new WelcomeBackdrop(node, start.current)
    } catch {
      // No WebGL: the rest of the window still works, just without the animated ground.
      return
    }
    engine.current = backdrop
    const frame = new ResizeObserver(() => backdrop.resize())
    frame.observe(node)
    return () => {
      frame.disconnect()
      backdrop.dispose()
      engine.current = null
    }
  }, [])

  useEffect(() => {
    engine.current?.setReduceMotion(reduceMotion)
  }, [reduceMotion])

  useEffect(() => {
    engine.current?.setSlide(slide)
  }, [slide])

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
