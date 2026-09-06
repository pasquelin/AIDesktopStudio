/**
 * What the studio redistributes, and under which terms. Written by `pnpm licences:collect`
 * into `shared/licences.json`, read by the window the Help menu opens.
 *
 * Attribution is the obligation every one of these licences shares — MIT, Apache-2.0, BSD and
 * the LGPL all ask for the notice to travel with the binary. FFmpeg is the one that asks for
 * more: `sources` carries where its corresponding source lives.
 */
export type Licence = {
  name: string
  /** Absent where a component carries no number: the window then says so from a bundle. */
  version?: string
  /** SPDX identifier as the package declares it, or `UNKNOWN` when it declares none. */
  spdx: string
  /** Full licence text, so the window is the notice rather than a link to it. */
  text: string
  /** Required publisher wording, always visible even when the full text is folded. */
  attribution?: string
  /** Where the corresponding sources are — a URL, never a sentence about one. */
  sources?: string
  /** Marks a source offered as the very version shipped, untouched. */
  unmodified?: boolean
}

/** What the English notice writes for a component with no version — shared by its writer and its reader. */
export const NO_VERSION = 'shipped with the application'

/**
 * Whether these terms oblige us to say where the source is, and not merely to carry the notice.
 *
 * Shared with `collect-licences.mjs`, which applies it: one definition, or the test that guards
 * the rule drifts from the rule itself. Matched on the prefix so a version bump still answers.
 */
export function isCopyleft(spdx: string): boolean {
  return /^(MPL|LGPL|GPL|AGPL|EPL|CDDL|OSL|CeCILL)/.test(spdx)
}

export const LICENCES_ROUTE = 'licences'

export function isLicencesRoute(hash: string): boolean {
  return hash.replace(/^#/, '') === LICENCES_ROUTE
}
