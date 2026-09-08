import { cn } from '@/helpers/cn'
import { TILE_MARK } from './styles'
import { UiIcon } from './UiIcon'

export type TileMarkProps = {
  /** `@mdi/js` path. The glyph carries the meaning, so `label` gives it the words. */
  icon: string
  /** Resolved by the caller — translating per tile runs i18next per frame. */
  label: string
}

/**
 * A standing marked in the corner of a picture — what kind of asset it is, where a channel's
 * pixels came from. Never an action, and `pointer-events-none` is what holds that: a texture
 * channel lays this over a 28px thumbnail that TOGGLES, and a mark taking the press would eat a
 * quarter of it. The tooltip goes with the press, and the name is what a reader is left.
 */
export function TileMark({ icon, label }: TileMarkProps) {
  return (
    <span
      className={cn(
        'text-muted pointer-events-none absolute start-1 top-1 inline-flex items-center',
        TILE_MARK,
      )}
      title={label}
      aria-label={label}
      role="img"
    >
      <UiIcon path={icon} size={12} />
    </span>
  )
}
