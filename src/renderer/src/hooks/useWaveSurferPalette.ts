import { useEffect } from 'react'
import { CURSOR_WIDTH, type PaletteOptions } from './waveSurferEffects'

export function useWaveSurferPalette(options: PaletteOptions): void {
  const { container, wave, head, veil, surferRef, regionsRef } = options
  useEffect(() => {
    const instance = surferRef.current
    const plugin = regionsRef.current
    if (!instance || !plugin || !wave || !head || !veil) return
    instance.setOptions({
      waveColor: wave,
      progressColor: wave,
      cursorColor: head,
      cursorWidth: CURSOR_WIDTH,
    })
    for (const region of plugin.getRegions()) region.setOptions({ color: veil })
    return plugin.enableDragSelection({ color: veil })
  }, [container, wave, head, veil, surferRef, regionsRef])
}
