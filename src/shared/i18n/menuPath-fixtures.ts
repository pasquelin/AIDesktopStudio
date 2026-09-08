/**
 * How this repository reads a menu path, in ONE place — `manual.i18n.test.ts` asks it of the
 * twenty chapters the Help window renders, `bundles.test.ts` of the bundles themselves. Written
 * out twice, the two readings would drift, and the manual's has already been widened three times.
 */
import { isRecord } from '../guards'
import { actionsIn, childSections, descriptorsIn, rootSections } from '../domain/settingsRegistry'

/**
 * Both separators the chapters write, and they are not interchangeable to a regexp: `▸` carries
 * the paths, `›` a handful. `→` marks a DIRECTION and stays out — adding it returned six French
 * and ten English fragments of sentences, measured.
 *
 * ONE line break at most, and the `\S` edges are what make crossing it safe: `**` pairs greedily,
 * so without them the reading starts on a CLOSING `**` and runs to the next line's opening one,
 * returning half a table row as a path — measured. Refusing the break outright was the other
 * failure: a path a reflow had split was quoted correctly and read by nobody.
 */
const MENU_PATH =
  /\*\*(?=\S)((?:[^*\n]|\n(?!\s*\n)){1,90}[▸›](?:[^*\n]|\n(?!\s*\n)){1,90})(?<=\S)\*\*/g

/**
 * Which index a segment of a settings path is read against: the roots at depth one, that root's
 * own screens at depth two. `null` where the tree says nothing — a setting name, not a screen.
 */
const settingsIndex = (
  tree: Map<string, ReadonlySet<string>>,
  parts: readonly string[],
  index: number,
): ReadonlySet<string> | null => {
  if (index === 1) return new Set(tree.keys())
  if (index !== 2) return null

  const held = tree.get(asRead(parts[1] ?? ''))

  return held !== undefined && held.size > 0 ? held : null
}

/** A path a reflow split reads as one line, the break being of the page and not of the menu. */
export const menuPathsOf = (markdown: string): string[] =>
  [...markdown.matchAll(MENU_PATH)].flatMap(match => (match[1] ?? '').replace(/\s*\n\s*/g, ' '))

/** As a reader compares a quote to a menu: trailing ellipsis dropped, holes dropped, folded. */
export const asRead = (text: string): string =>
  text
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/[….]+$/, '')
    .trim()
    .toLowerCase()

export const screenLabels = (bundle: unknown, into = new Set<string>()): Set<string> => {
  if (typeof bundle === 'string') into.add(asRead(bundle))
  else if (isRecord(bundle)) for (const held of Object.values(bundle)) screenLabels(held, into)

  return into
}

const valueAt = (bundle: unknown, path: string): string => {
  let held: unknown = bundle
  for (const step of path.split('.')) held = isRecord(held) ? held[step] : undefined

  return typeof held === 'string' ? held : ''
}

/**
 * The settings window as a TREE — each root screen against what may legitimately follow it —
 * read from the registry that already declares the nesting. A flat set of every section says
 * `Réglages ▸ Clés API` resolves, when the screen sits under « Modèles d'IA ».
 *
 * What follows a root is a screen it HOLDS, a setting it CARRIES or an action it OFFERS, all
 * three declared: `Réglages ▸ Génération ▸ Image` stayed green on the whole screen alone, the
 * families living under « Modèles d'IA » and no setting of that section being named so.
 *
 * Two things it does NOT catch. A path of TWO segments only asks that the root exists, so
 * `Réglages ▸ Génération` reads green while meaning a screen it does not hold. And a root the
 * registry leaves empty — `shortcuts` — carries no index at all, so anything follows it.
 */
export const settingsTree = (bundle: unknown): Map<string, ReadonlySet<string>> =>
  new Map(
    rootSections()
      .map(
        root =>
          [
            asRead(valueAt(bundle, root.labelKey)),
            new Set(
              [
                ...childSections(root.id).map(child => asRead(valueAt(bundle, child.labelKey))),
                ...descriptorsIn(root.id).map(held => asRead(valueAt(bundle, held.titleKey))),
                ...actionsIn(root.id).map(offered => asRead(valueAt(bundle, offered.titleKey))),
              ].filter(Boolean),
            ),
          ] as [string, ReadonlySet<string>],
      )
      .filter(([label]) => label !== ''),
  )

/** What ends a quoted path inside a sentence — everything else is read as part of a label. */
const SENTENCE_BOUND = /[.,;:!?()«»"“”—–\n]/

const wordsOf = (text: string): string[] => text.trim().split(/\s+/).filter(Boolean)

/** The longest run of words at that end which the screen carries as a label, if any. */
const labelAt = (text: string, at: 'start' | 'end', labels: ReadonlySet<string>): boolean => {
  const words = wordsOf(text)

  return words.some((_, index) =>
    labels.has(asRead((at === 'end' ? words.slice(index) : words.slice(0, index + 1)).join(' '))),
  )
}

/** A window whose FIRST segment names it, and the tree its later segments walk down. */
export type RootedPath = { root: string; tree: Map<string, ReadonlySet<string>> }

/**
 * A path quoted in a BUNDLE wears no bold — nothing sets it apart from the sentence around it —
 * so the reading slides outwards from the separator and keeps the longest run each side that is a
 * label. `▸` in a bundle can only be a menu path, which is what makes sliding safe here and not
 * in the manual, where prose arrows abound.
 *
 * `rooted` walks the settings tree instead: the segment after the root is a ROOT screen, the one
 * after it a screen that root holds. `Réglages ▸ Compte` stayed green for months because
 * `usage.account` carries « Compte » elsewhere. Deeper still names a setting — read as before.
 */
export const unquotedMenuSegments = (
  value: string,
  labels: ReadonlySet<string>,
  rooted?: RootedPath,
): string[] =>
  value
    .split(SENTENCE_BOUND)
    .filter(window => /[▸›]/.test(window))
    .flatMap(window => {
      const parts = window.split(/[▸›]/)
      const under = rooted !== undefined && labelAt(parts[0] ?? '', 'end', new Set([rooted.root]))
      const carried = (index: number): ReadonlySet<string> =>
        under && rooted !== undefined
          ? (settingsIndex(rooted.tree, parts, index) ?? labels)
          : labels

      return parts
        .filter((part, index) =>
          index === 0
            ? !labelAt(part, 'end', labels)
            : index === parts.length - 1
              ? !labelAt(part, 'start', carried(index))
              : !carried(index).has(asRead(part)),
        )
        .map(part => `"${part.trim()}" in ${window.trim()}`)
    })
