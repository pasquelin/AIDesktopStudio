import type { ResolvedTheme } from './domain/settings'

/**
 * Window chrome color, painted before the first render. It matches `--color-chassis`, the
 * outermost surface — not `--color-panel`, the surfaces laid on it. Opaque on purpose: we judge
 * colors in this app, never through translucency (spec § 7).
 *
 * Per theme, and unavoidably a second copy of what `index.css` declares: the main process
 * paints this before any stylesheet is parsed, so it cannot read the token. `theme.test.ts`
 * pins the two against the stylesheet rather than trusting them to stay in step.
 */
export const WINDOW_CHROME_COLOR: Record<ResolvedTheme, string> = {
  dark: '#2b2d30',
  light: '#dcdde1',
}

/**
 * Painted behind the splash before its first frame, and the same in both themes because the page
 * is: `splash.html` paints the icon's tile colour whatever the system says, so a light value here
 * would flash light and snap dark. `splash.test.ts` pins this against what that page paints.
 */
export const SPLASH_BACKGROUND_COLOR: Record<ResolvedTheme, string> = {
  dark: '#161921',
  light: '#161921',
}

/**
 * Painted behind the video return before its first frame, and behind the picture afterwards.
 *
 * Not a theme pair: a monitor is black in both themes, as `--color-monitor` is — what surrounds
 * a picture must add nothing to it, and a light grey field would tint every judgement made on
 * the second screen. `theme.test.ts` pins it against that token.
 */
export const MIRROR_BACKGROUND = '#000000'

export const APP_NAME = 'AI Desktop Studio'
