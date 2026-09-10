import { describe, expect, it } from 'vitest'
import { WINDOW_SOURCES } from '../windowSources'

/**
 * The mirror of `windowStyles.test.ts`, in the other direction.
 *
 * `styles.ts` holds what the components of the DOCKS share, and its strings speak the studio's own
 * names — `bg-elevated`, `text-muted`, `bg-surface` — which the `@theme` declares and DaisyUI has
 * never heard of. A window that is not a dock reaching for them puts the two vocabularies in one
 * bag, and that is how `chipSkin` and `windowControl` came to write colours the other side cannot
 * resolve.
 *
 * 🛑 **Its blind spot, written rather than hidden.** It reads the IMPORT, one hop. A window that
 * reaches `styles.ts` THROUGH a component of `design/` stays green, and must: a dock component
 * wears its own vocabulary wherever it is mounted. The journal is the witness — it renders
 * `ActivityList`, whose row imports the status tones, and that row belongs to the dock as much.
 */
const IMPORTS_STUDIO_STYLES = /from '@\/components\/styles'/

const FRAMES_A_WINDOW = /<WindowShell[\s>]/

/**
 * The folders a window owns, declared rather than read off the first path segment.
 *
 * That segment was the family until the features moved under `features/<name>/components/`: it
 * then reads `./features/` for every one of them, and swallows every dock in the studio. The
 * case below is what keeps the list honest — a `<WindowShell>` outside it goes red.
 */
const FAMILIES: readonly string[] = [
  './features/document/',
  './features/manual/',
  './features/player/',
  // One folder rather than the feature: `features/project/` also holds the home's shelf,
  // which is a dock component and wears the docks' vocabulary by right.
  './features/project/components/CopiesWindow/',
  './features/project/components/ShippedWindow/',
  './features/retarget/components/',
  './features/settings/',
  // Two files rather than a folder: the journal and the licences are one window each, and they
  // sit among the shell's own components, which are the docks this rule is measured against.
  './features/shell/components/JournalWindow.tsx',
  './features/shell/components/LicencesWindow.tsx',
  './features/usage/',
  './features/welcome/',
]

/**
 * Declared with the reason, which is the same one three times: `windowStyles.ts` publishes no
 * equivalent. It carries captions, rows and actions — no field role, no suffix, no gauge at all.
 */
const ALLOWED: readonly string[] = [
  './features/document/components/NewDocument/NewDocumentNameField.tsx',
  './features/document/components/NewDocument/NewDocumentTemplateTile.tsx',
  './features/settings/components/Ai/AiCandidateRow.tsx',
  './features/welcome/components/WelcomeModelRow.tsx',
]

describe('a window that is not a dock', () => {
  /** Reading nothing would satisfy the rule below for ever, and this sweeps by glob. */
  it('finds the windows and their sources at all', () => {
    expect(FAMILIES.length).toBeGreaterThan(3)
    expect(Object.keys(WINDOW_SOURCES).length).toBeGreaterThan(400)
  })

  /** A window framed outside the list is a window this rule never reads. */
  it('names every folder a window frames itself in', () => {
    const outside = Object.entries(WINDOW_SOURCES)
      .filter(([, code]) => FRAMES_A_WINDOW.test(code))
      .map(([path]) => path)
      .filter(path => !FAMILIES.some(folder => path.startsWith(folder)))

    expect(outside.sort()).toEqual([])
  })

  it('never reaches for the class strings of the docks', () => {
    const offenders = Object.entries(WINDOW_SOURCES)
      .filter(([path]) => FAMILIES.some(folder => path.startsWith(folder)))
      .filter(([path]) => !ALLOWED.includes(path))
      .filter(([, code]) => IMPORTS_STUDIO_STYLES.test(code))
      .map(([path]) => path)

    expect(offenders.sort()).toEqual([])
  })

  /**
   * A rule that cannot be shown to refuse anything refuses nothing — `windowStyles` is one word
   * away, and a pattern reading both would go quiet while staying green.
   */
  it('tells the studio module from the window one, which is what makes it a rule', () => {
    expect(IMPORTS_STUDIO_STYLES.test("import { rowSkin } from '@/components/styles'")).toBe(true)
    expect(
      IMPORTS_STUDIO_STYLES.test("import { WINDOW_ROW } from '@/components/windowStyles'"),
    ).toBe(false)
  })

  /** The exceptions are the rule's own state: one that stopped being needed and stayed is a hole. */
  it('declares no exception for a file that no longer needs one', () => {
    const stale = ALLOWED.filter(path => !IMPORTS_STUDIO_STYLES.test(WINDOW_SOURCES[path] ?? ''))

    expect(stale).toEqual([])
  })
})
