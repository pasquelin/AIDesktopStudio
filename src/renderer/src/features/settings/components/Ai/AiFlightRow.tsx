import { ProgressBar } from '@/components/ProgressBar'
import { HINT_LEFT } from '@/helpers/tooltip'
import { WindowButton, type WindowButtonProps } from '@/components/WindowButton'

export type AiFlightRowProps = {
  /** From 0 to 1. */
  ratio: number
  label: string
  stop: string
  stopHint: string
  onStop: () => void
  size?: WindowButtonProps['size']
}

/**
 * A bar and the button that stops it — the shape a download and a load both take.
 *
 * Local to this window rather than in `design/`: the preferences are the surface where the studio
 * is an ordinary application, so these are DaisyUI buttons and not `ToolButton`s.
 */
export function AiFlightRow({ ratio, label, stop, stopHint, onStop, size }: AiFlightRowProps) {
  return (
    <span className="flex items-center gap-2">
      <ProgressBar ratio={ratio} label={label} className="w-24" />
      <WindowButton size={size} {...HINT_LEFT(stopHint)} onClick={onStop}>
        {stop}
      </WindowButton>
    </span>
  )
}
