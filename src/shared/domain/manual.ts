import type { Language } from '../i18n/languages'

/**
 * The user manual, as the application carries it. Written by `pnpm manual:collect` into
 * `shared/manual.json` from `docs/{fr/manuel,en/manual}`, read by the window the Help menu opens.
 *
 * The markdown files are the source and stay readable on their own; this module is only how they
 * reach a machine with no network. Nothing here is written by hand — `manual.i18n.test.ts`
 * recomputes the whole file and fails on any drift.
 *
 * Only the manual travels. `docs/ci` and `architecture.md` address a developer, and shipping
 * them would put the repository's own notes in front of a user.
 */

/**
 * A heading of a chapter: what the contents view lists, and what an anchor lands on.
 *
 * Down to `####`, which looks like one level too far and is not: two live links of the manual
 * point at one — `#les-polices-offertes` and the ffmpeg case of the troubleshooting chapter.
 * Stopping at `###` made both dead, and made the collector say so.
 *
 * Up to `#`, for one chapter: "Comment faire pour…" divides itself into four parts with a `#`
 * each. Unusual, and left alone rather than rewritten — the manual is the source, and a lot that
 * carries it into the app is not a lot that edits it.
 */
export type ManualHeading = {
  /** The fragment a link uses, computed the way the markdown renderer computes it. */
  anchor: string
  title: string
  /**
   * One to four. A literal union rather than this would be the truer contract and cost a cast at
   * every reader: a JSON import widens it to `number`, and `manual.json` is the only producer.
   * `manual.i18n.test.ts` holds the range instead.
   */
  depth: number
}

export type ManualChapter = {
  /**
   * The file's two-digit prefix, shared by both languages: it is what pairs a chapter with its
   * translation. Taken from the filename, not from the title — the title numbers `1.`, the file
   * `01-`, and the pairing has to survive that.
   */
  number: string
  /**
   * The file's own name without extension — what a sibling chapter links to.
   *
   * **Unique within a language, NOT across the two.** `07-assets` is spelled identically in
   * French and English, so a lookup keyed by slug alone resolves a French anchor against the
   * English chapter. Every resolution takes the language first.
   */
  slug: string
  /** The `# ` title with its number removed: the window numbers chapters itself. */
  title: string
  /** The body, with the GitHub navigation lines and the author's capture notes taken out. */
  markdown: string
  headings: ManualHeading[]
}

export type Manual = Record<Language, ManualChapter[]>

export const MANUAL_ROUTE = 'manual'

export function isManualRoute(hash: string): boolean {
  return hash.replace(/^#/, '') === MANUAL_ROUTE
}

/**
 * Where a link inside the manual goes.
 *
 * Three shapes and not four: `../guide-utilisateur.md` never survives collection. It appears
 * only inside the `[← …] · [Contents] · [Next →]` row, which the collector blanks — so a
 * `contents` destination would be a branch no shipped chapter can reach.
 */
export type ManualTarget =
  | { kind: 'anchor'; anchor: string }
  | { kind: 'chapter'; slug: string; anchor?: string }
  | { kind: 'external'; url: string }

const CHAPTER_LINK = /^(\d{2}-[\p{Letter}\d-]+)\.md(?:#(.+))?$/u

/**
 * Reads an `href` written for GitHub into somewhere the window can go, or `null` when it is
 * none of the three shapes a shipped chapter uses.
 *
 * A `null` is a defect, never a link to leave alone: `collect-manual.ts` refuses to write a
 * manual containing one, so the window never meets a dead link at a reader's expense.
 */
export function manualTargetOf(href: string): ManualTarget | null {
  if (href.startsWith('#')) return { kind: 'anchor', anchor: href.slice(1) }
  if (/^https?:\/\//.test(href)) return { kind: 'external', url: href }

  const chapter = CHAPTER_LINK.exec(href)
  const slug = chapter?.[1]
  if (!slug) return null
  return { kind: 'chapter', slug, anchor: chapter?.[2] }
}

const LINK = /\[[^\]]*\]\(([^)]+)\)/g

/**
 * Every link of these chapters that lands nowhere, named with its site. Empty is the only
 * acceptable answer: the collector refuses to write a manual it is not empty for.
 *
 * ONE language at a time, and that is not tidiness: `07-assets` is the slug of a chapter in
 * BOTH, so a single index keyed by slug resolves a French anchor against the English chapter —
 * and passes, because the English one happens to have a heading of that name.
 *
 * Here rather than in the collector, because it is asked twice: once of what is about to be
 * written, once of what was shipped. The same question deserves the same answer.
 */
export function deadManualLinks(chapters: readonly ManualChapter[], language: Language): string[] {
  const slugs = new Set(chapters.map(chapter => chapter.slug))
  const dead: string[] = []

  // Counted rather than collected into a set, and that is the whole of the rule below: a title
  // repeated in one chapter yields ONE anchor for several headings.
  const anchors = new Map(
    chapters.map(chapter => {
      const counts = new Map<string, number>()
      for (const entry of chapter.headings) {
        counts.set(entry.anchor, (counts.get(entry.anchor) ?? 0) + 1)
      }
      return [chapter.slug, counts]
    }),
  )

  /**
   * Why an ambiguous anchor is refused rather than resolved to the first heading.
   *
   * GitHub numbers repeats — `#undo-and-redo`, then `-1`, then `-2` — and this rule does not,
   * because the window resolves an anchor with `getElementById`, which answers the FIRST match
   * and cannot be told to mean the third. Chapter 15 carries three "Annuler et rétablir", so the
   * case is real; no link points at one today, and this is what says so tomorrow.
   */
  const missing = (slug: string, anchor: string): string | null => {
    const count = anchors.get(slug)?.get(anchor) ?? 0
    if (count === 0) return 'names no heading'
    if (count > 1) return `names ${count} headings, so it cannot land where it means`
    return null
  }

  for (const chapter of chapters) dead.push(...deadLinksIn(chapter, language, slugs, missing))

  return dead
}

function deadLinksIn(
  chapter: ManualChapter,
  language: Language,
  slugs: ReadonlySet<string>,
  missing: (slug: string, anchor: string) => string | null,
): string[] {
  const dead: string[] = []
  const say = (href: string, what: string) =>
    dead.push(`${language}/${chapter.slug}: "${href}" ${what}`)
  for (const [, href = ''] of chapter.markdown.matchAll(LINK)) {
    const target = manualTargetOf(href)
    if (!target) say(href, 'is none of the three shapes a manual link takes')
    else if (target.kind === 'anchor') {
      const fault = missing(chapter.slug, target.anchor)
      if (fault) say(href, fault)
    } else if (target.kind === 'chapter') {
      if (!slugs.has(target.slug)) say(href, 'is not a shipped chapter')
      else if (target.anchor) {
        const fault = missing(target.slug, target.anchor)
        if (fault) say(href, fault)
      }
    }
  }
  return dead
}

/**
 * The fragment a heading answers to, on GitHub's rule: lowercased, punctuation dropped, spaces
 * to hyphens — accents kept, which is why `#étape-3--brancher-votre-compte` is a live link.
 *
 * Shared with the collector rather than reimplemented there: an anchor computed two ways is an
 * anchor that resolves in the build and not on screen.
 *
 * GitHub's `-1`, `-2` suffixes for a repeated title are NOT reproduced, and deliberately: the
 * window resolves by `getElementById`, which answers the first match. `deadManualLinks` refuses
 * a link into an ambiguous anchor instead of pretending to honour it.
 */
export function manualAnchorOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}
