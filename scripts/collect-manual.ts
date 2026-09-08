/**
 * Collects the user manual into `src/shared/manual.json`, which the Help ▸ User manual window
 * reads. The markdown under `docs/{fr/manuel,en/manual}` stays the source and stays readable on
 * its own; this only carries it to a machine with no network.
 *
 * It REFUSES to write a manual whose links do not all resolve. That is the point of compiling
 * rather than reading the files at runtime: a chapter that lost its target fails the build here,
 * instead of offering a reader a link that does nothing.
 *
 * TypeScript rather than the `.mjs` its neighbours use — Node strips the types on the way in, and
 * `main/manual.test.ts` imports `buildManual` to recompute the whole file. One definition of what
 * a chapter is, or the guard drifts from what it guards.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Language } from '../src/shared/i18n/languages.ts'
import {
  deadManualLinks,
  chaptersForLanguage,
  manualAnchorOf,
  type Manual,
  type ManualChapter,
  type ManualHeading,
} from '../src/shared/domain/manual.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'src', 'shared', 'manual.json')

/** Where each language keeps its chapters. The index page is deliberately not among them. */
const CHAPTERS: Record<string, string> = {
  fr: join('docs', 'fr', 'manuel'),
  en: join('docs', 'en', 'manual'),
}

/**
 * The `[← …] · [Contents] · [Next chapter →]` line a chapter opens and closes with.
 *
 * Written for someone reading the files on GitHub, where there is no other way forward. The
 * window has a chapter list down its side, so on screen the line is a dead end that looks like
 * content. Recognised by its shape — a row of links around one to the index — rather than by
 * position: chapter 1 has no previous, chapter 19 no next, and both still carry it.
 */
const NAVIGATION = /^\[[^\]]*\]\([^)]*\)(?:\s*·\s*\[[^\]]*\]\([^)]*\))*$/
const INDEX_LINK = /\((?:\.\.\/)?(?:guide-utilisateur|user-guide)\.md\)/

/** The author's note for a screenshot yet to be taken. Not a sentence a reader should meet. */
const CAPTURE_NOTE = /<!--\s*CAPTURE[\s\S]*?-->/g

const TITLE = /^#\s+\d+\.\s+(.+)$/
const HEADING = /^(#{1,4})\s+(.+)$/

function chapterFrom(directory: string, file: string): ManualChapter {
  const source = readFileSync(join(directory, file), 'utf8')
  const lines = source.replace(CAPTURE_NOTE, '').split('\n')

  const title = lines.map(line => TITLE.exec(line)?.[1]).find(Boolean)
  if (!title) throw new Error(`${file}: no "# N. Title" line`)

  // Blanked rather than dropped, so the horizontal rule that precedes the closing navigation
  // does not end up glued to the paragraph above it. The `# N. Title` goes too: the window has
  // it as `title` and prints it in its own header, and a second copy under it reads as a stutter.
  const kept = lines.map(line =>
    (NAVIGATION.test(line) && INDEX_LINK.test(line)) || TITLE.test(line) ? '' : line,
  )

  const headings: ManualHeading[] = []
  for (const line of kept) {
    const found = HEADING.exec(line)
    const title = found?.[2]
    if (!title) continue
    headings.push({ anchor: manualAnchorOf(title), title, depth: (found?.[1] ?? '').length })
  }

  return {
    number: file.slice(0, 2),
    slug: file.replace(/\.md$/, ''),
    title,
    // Squeezed in the middle and trimmed at both ends: blanking three lines leaves runs of empty
    // ones, and the horizontal rules that framed the navigation now frame nothing.
    markdown: kept
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^(\s*---\s*\n)+/, '')
      .replace(/(\n\s*---\s*)+$/, '')
      .trim(),
    headings,
  }
}

export function buildManual(root: string = ROOT): Manual {
  const manual = {} as Manual
  const dead: string[] = []

  for (const language of Object.keys(CHAPTERS) as Language[]) {
    const chapterDirectory = CHAPTERS[language] ?? CHAPTERS.en ?? ''
    const directory = join(root, chapterDirectory)
    const files = readdirSync(directory)
      .filter(file => /^\d{2}-.+\.md$/.test(file))
      .sort()

    manual[language] = files.map(file => chapterFrom(directory, file))
    dead.push(...deadManualLinks(chaptersForLanguage(manual, language), language))
  }

  if (dead.length > 0) {
    throw new Error(`the manual carries links that go nowhere:\n  ${dead.join('\n  ')}`)
  }

  return manual
}

// Only when run, never when imported by the guard.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manual = buildManual()
  writeFileSync(OUTPUT, `${JSON.stringify(manual, null, 2)}\n`)

  const counts = Object.entries(manual)
    .map(([language, chapters]) => `${chapters.length} in ${language}`)
    .join(', ')
  console.log(`manual: ${counts} → src/shared/manual.json`)
}
