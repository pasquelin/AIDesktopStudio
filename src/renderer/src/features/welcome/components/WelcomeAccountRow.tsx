import { WINDOW_CAPTION } from '@/components/windowStyles'

/**
 * A MONOGRAM and not a logo: `@mdi/js` carries none of these five marks, and drawing them by hand
 * would put SVG paths in a component, the one thing `UiIcon` exists to prevent.
 */
export function WelcomeAccountRow({ name, service }: { name: string; service: string }) {
  return (
    <li className="border-base-300 flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
      <span className="bg-base-300 flex size-8 shrink-0 items-center justify-center rounded-(--radius-sc-md) text-sm font-semibold">
        {[...service][0]}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className={WINDOW_CAPTION}>{service}</span>
      </span>
    </li>
  )
}
