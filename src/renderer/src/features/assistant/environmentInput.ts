import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { ENVIRONMENT_KINDS, STUDIO_ENVIRONMENT, type EnvironmentRef } from '@shared/domain/scene'
import { documentNamedOfKind, useDocuments } from '@/stores/documents'
import { withAsset } from './actionHandler'
import { oneOf, textOf } from './actionInputs'

/**
 * What lights a surface, named as `world.setSceneLighting` names it: a PICTURE by asset id, a sky
 * DOCUMENT by title, `studio` to put both out. Naming one is enough — `kind` is what a client
 * says only to go back to the procedural room.
 *
 * Written once because the scene and the material preview take the same three fields, and a
 * fourth arm of `EnvironmentRef` would otherwise have to be refused in two places.
 */
export function environmentFromInput(
  input: Record<string, unknown>,
  write: (environment: EnvironmentRef | null) => ActionOutcome,
): ActionOutcome | Promise<ActionOutcome> {
  const kind = oneOf(input, 'kind', ENVIRONMENT_KINDS)
  const assetId = textOf(input, 'assetId')
  const title = textOf(input, 'sky')
  const invalid = invalidEnvironment(kind, assetId, title)
  if (invalid) return invalid

  const documentId =
    title === null ? null : documentNamedOfKind(useDocuments.getState(), 'skybox', title)
  if (title !== null && documentId === null)
    return refused(
      'notFound',
      `no sky document titled "${title}" in this project — documents.list answers what there is, with its title and its kind`,
    )

  const environment: EnvironmentRef | null = environmentOf(kind, assetId, documentId)
  return assetId === null ? write(environment) : withAsset(assetId, () => write(environment))
}

function invalidEnvironment(
  kind: EnvironmentRef['kind'] | null,
  assetId: string | null,
  title: string | null,
): ActionOutcome | null {
  if (assetId !== null && title !== null)
    return refused(
      'badInput',
      'a surface is lit by ONE source: name "assetId" for a picture of the library, or "sky" for the title of a sky document — never both',
    )
  if (kind === 'skybox' && assetId === null)
    return refused(
      'badInput',
      'kind "skybox" wants "assetId" — the id of the picture to light with; assets.searchProjectCatalogue answers which the library holds',
    )
  if (kind === 'sky' && title === null)
    return refused(
      'badInput',
      'kind "sky" wants "sky" — the title of a sky document of this project; documents.list answers which there are',
    )
  if (kind === 'studio' && (assetId !== null || title !== null))
    return refused(
      'badInput',
      'kind "studio" puts every named source out, so it travels alone — drop "assetId" and "sky"',
    )

  return null
}

const environmentOf = (
  kind: EnvironmentRef['kind'] | null,
  assetId: string | null,
  documentId: string | null,
): EnvironmentRef | null =>
  documentId !== null
    ? { kind: 'sky', documentId }
    : assetId !== null
      ? { kind: 'skybox', assetId }
      : kind === 'studio'
        ? STUDIO_ENVIRONMENT
        : null
