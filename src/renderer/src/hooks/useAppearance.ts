import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { contentFor, hoverFor, inkFor } from '@shared/domain/color'
import { THEME_ATTRIBUTE, type ResolvedTheme, type Theme } from '@shared/domain/settings'
import { refreshPalette, token } from '@/engines/core/palette'
import { useSettings } from '@/stores/settings'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Absent under a test that never built a DOM, and under an old runtime. */
function darkQuery(): MediaQueryList | null {
  return typeof window === 'undefined' || !window.matchMedia ? null : window.matchMedia(DARK_QUERY)
}

/**
 * What `system` currently means. Chromium answers this according to `nativeTheme.themeSource`,
 * which the main process sets from this same setting — so one query covers both the OS switching
 * on its own and the setting being changed in another window.
 *
 * Dark when nothing can answer: the palette in `index.css` is declared dark first.
 */
function systemPrefersDark(): boolean {
  return darkQuery()?.matches ?? true
}

function resolveTheme(theme: Theme, systemDark: boolean): ResolvedTheme {
  if (theme !== 'system') return theme
  return systemDark ? 'dark' : 'light'
}

/**
 * Publishes the appearance on the root element: `data-theme`, which selects the daisyUI theme
 * and the studio tokens with it, and `data-density`, which the `--sc-*` gauges hang off.
 *
 * One hook for both, and one invalidation of the palette rather than two: the canvases cache
 * what `getComputedStyle` answers, and a theme and a density landing in separate effects would
 * make them read the tokens twice for a single change — `getComputedStyle` resolves style over
 * the whole shell, which is the whole frame budget.
 *
 * It reads the store itself: every window that renders needs exactly this, and having each one
 * select the settings on its own is how one of them ends up publishing the density and not the
 * theme.
 */
export function useAppearance(): void {
  const theme = useSettings(state => state.settings.appearance.theme)
  const density = useSettings(state => state.settings.appearance.density)
  const accent = useSettings(state => state.settings.appearance.accent)
  const fontScale = useSettings(state => state.settings.appearance.fontScale)
  const reduceMotion = useSettings(state => state.settings.appearance.reduceMotion)

  // Subscribed only while it can change anything: on an explicit theme the listener would wake
  // the renderer for a preference nothing reads. Changing the setting re-subscribes, and React
  // reads the snapshot again with it.
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => {
      const media = theme === 'system' ? darkQuery() : null
      if (!media) return () => {}

      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [theme],
  )

  const resolved = resolveTheme(theme, useSyncExternalStore(subscribe, systemPrefersDark))

  useEffect(() => {
    const root = document.documentElement
    root.dataset['theme'] = THEME_ATTRIBUTE[resolved]
    root.dataset['density'] = density
    root.dataset['reduceMotion'] = String(reduceMotion)
    root.style.setProperty('--sc-font-scale', String(fontScale))

    // An inline property, which outranks every theme block — and removed rather than blanked
    // when unset, so the theme's own accent comes back instead of an empty value nothing can
    // parse. `--color-primary` follows it: daisyUI paints the same blue for the same meaning.
    for (const name of ['--color-accent', '--color-primary']) {
      if (accent) root.style.setProperty(name, accent)
      else root.style.removeProperty(name)
    }

    // The ink follows the fill, or the words keep the blue the studio shipped with while every
    // button turns the colour that was picked. Read against the chassis the theme just selected
    // rather than a copy of it — the attribute is already set above. Uncached on purpose: the
    // cache still holds the palette being left, which is the whole reason `refreshPalette` runs
    // last. With nothing to read, `inkFor` hands the accent back rather than a broken value.
    if (accent) {
      root.style.setProperty('--color-accent-ink', inkFor(accent, token(root, '--color-chassis')))
    } else root.style.removeProperty('--color-accent-ink')

    // And the ink ON the fill, which is a different question and was nobody's until now: the
    // sheet can only ship one answer, and a picked yellow takes the white it shipped with to
    // 1.71:1 — a primary button whose label cannot be read at all. daisyUI's name follows for
    // the reason its fill does, a paragraph above.
    const content = accent ? contentFor(accent) : ''
    for (const name of ['--color-accent-content', '--color-primary-content']) {
      if (content) root.style.setProperty(name, content)
      else root.style.removeProperty(name)
    }

    // And the fill under the pointer, which has to follow too: the sheet's hover is drawn from
    // the sheet's accent, so a picked red would darken toward the blue it replaced.
    if (accent) root.style.setProperty('--color-accent-hover', hoverFor(accent))
    else root.style.removeProperty('--color-accent-hover')

    // After the attributes, never before: the engines read the tokens back the moment they are
    // told, and `getComputedStyle` would hand them the palette they are leaving.
    refreshPalette()
  }, [resolved, density, accent, fontScale, reduceMotion])
}
