import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { chaptersForLanguage, type ManualTarget } from '@shared/domain/manual'
import { isSupportedLanguage, UNKNOWN_SYSTEM_LANGUAGE } from '@shared/i18n'
import manual from '@shared/manual.json'
import { foldForSearch } from '@shared/text'
import { WindowShell } from '@/components/WindowShell'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import { WindowNav } from '@/components/WindowNav/WindowNav'
import { WindowNavItem } from '@/components/WindowNav/WindowNavItem'
import { WindowSearch } from '@/components/WindowSearch'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { useMarkdownComponents } from '@/hooks/useMarkdownComponents'
import { ManualWindowBody } from './ManualWindowBody'
import { ManualWindowResults } from './ManualWindowResults'

/**
 * The user manual, offline and in the reader's language — the same twenty chapters as
 * `docs/`, compiled into `shared/manual.json` by `pnpm manual:collect`.
 *
 * Built on the settings window's shape, as the usage window is: chapters on the left, the open
 * one on the right, the search over the list and the results in the pane. The first version of
 * this file wore the STUDIO's tokens instead of DaisyUI's, which made a window that passed every
 * test and still did not look like the application it opens from.
 *
 * Its links are the whole reason the manual is compiled rather than fetched: every one of them
 * was resolved at build time, so a chapter reference here cannot be a click that does nothing.
 * External ones go out through `setWindowOpenHandler`, which already refuses anything but HTTPS
 * — the manual needs no bridge of its own.
 */
export function ManualWindow() {
  const { t, i18n } = useTranslation()
  useAppliedSettings()

  const language = isSupportedLanguage(i18n.language) ? i18n.language : UNKNOWN_SYSTEM_LANGUAGE
  const chapters = chaptersForLanguage(manual, language)

  const [slug, setSlug] = useState(chapters[0]?.slug ?? '')
  const [query, setQuery] = useState('')

  const chapter = chapters.find(entry => entry.slug === slug) ?? chapters[0]
  const searching = query.trim() !== ''

  // Folded once per language rather than per keystroke: `foldForSearch` decomposes and strips
  // accents over the whole manual, which is four hundred thousand characters of one language.
  const folded = useMemo(
    () =>
      chapters.map(entry => ({
        chapter: entry,
        text: foldForSearch(`${entry.title}\n${entry.markdown}`),
      })),
    [chapters],
  )

  const found = useMemo(() => {
    const needle = foldForSearch(query.trim())
    if (needle === '') return []
    return folded.filter(entry => entry.text.includes(needle)).map(entry => entry.chapter)
  }, [folded, query])

  const open = useCallback((next: string) => {
    setQuery('')
    setSlug(next)
  }, [])

  const go = useCallback((target: ManualTarget) => {
    if (target.kind === 'external') return
    if (target.kind === 'chapter') setSlug(target.slug)

    const anchor = target.anchor
    if (anchor === undefined) return
    // After the chapter has painted: a heading in a chapter just switched to does not exist yet.
    requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: 'start' })
    })
  }, [])

  const components = useMarkdownComponents(go)

  return (
    <WindowShell
      title={t('manual.title')}
      navLabel={t('manual.chapters')}
      nav={
        <>
          {/* Outside the scrolling list, as the settings search is — the component says why. */}
          <WindowSearch label={t('manual.search')} value={query} onChange={setQuery} />

          <WindowNav>
            {chapters.map(entry => (
              <WindowNavItem
                key={entry.slug}
                active={!searching && entry.slug === chapter?.slug}
                hint={t('manual.chapterHint')}
                onSelect={() => open(entry.slug)}
                className="gap-2 px-3"
              >
                {/* The token, not an opacity: a number dimmed by `opacity-N` is a word the
                    contrast guard cannot reason about, and this window has a caption ink. */}
                <span className={WINDOW_CAPTION}>{entry.number}</span>
                <span className="truncate">{entry.title}</span>
              </WindowNavItem>
            ))}
          </WindowNav>
        </>
      }
    >
      {searching ? (
        <>
          <h2 className="mb-4 text-base font-semibold">{t('manual.results')}</h2>
          <ManualWindowResults found={found} onOpen={open} />
        </>
      ) : (
        chapter && (
          <>
            <h2 className="mb-4 text-base font-semibold">
              <span className={WINDOW_CAPTION}>{chapter.number}</span> {chapter.title}
            </h2>
            <ManualWindowBody markdown={chapter.markdown} components={components} />
          </>
        )
      )}
    </WindowShell>
  )
}
