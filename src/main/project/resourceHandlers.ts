import { withoutSourcePath } from '@shared/domain/asset'
import { PNG_EXTENSION } from '@shared/domain/writtenFormat'
import { CHANNELS } from '@shared/ipc'
import type { LocalBackend } from '@main/assets/localBackend'
import { createHideResource } from '@main/assets/hideResource'
import { createShowResource } from '@main/assets/showResource'
import { parseAssetId } from '@main/assets/validation'
import { handle } from '@main/ipc/handle'
import { probePng } from '@main/media/png'
import type { ProjectHandlerDeps } from './handlerTypes'
import { parseSaveTexture } from './validation'

export type ResourceHandlerDeps = {
  assets: LocalBackend
  project: ProjectHandlerDeps['project']
  newAssetId: () => string
}

/**
 * The three routes of the DURABLE INTERNAL store — §6.7 and the pair T4/T7, plus the door a
 * generation a document claimed goes in by (§6.3, D7).
 *
 * A computed channel is necessarily a file: MaterialX references its images by path. Nothing makes
 * it a file the explorer has to show, and it used to be one, written without a word. It lands under
 * a leading dot — hidden from every listing, resolving normally for the studio and for any other
 * application — and the second route is what brings it back out, moved rather than copied.
 */
export function registerResourceHandlers({
  assets,
  project,
  newAssetId,
}: ResourceHandlerDeps): void {
  handle(CHANNELS.assetsSaveTexture, async (_event, value) => {
    const request = parseSaveTexture(value)
    const probe = probePng(request.png) ?? undefined
    return withoutSourcePath(
      await assets.importFromBytes(
        {
          id: newAssetId(),
          name: request.name,
          type: 'image',
          extension: PNG_EXTENSION,
          map: request.map,
          resource: true,
          ...(probe ? { probe } : {}),
          ...(request.derivedFrom ? { derivedFrom: request.derivedFrom } : {}),
        },
        request.png,
      ),
    )
  })

  handle(CHANNELS.assetsHideResource, async (_event, value) =>
    withoutSourcePath(
      await createHideResource({
        projectPath: () => project.path(),
        find: assetId => project.catalog().find(assetId),
        repath: (from, to) => project.catalog().repath(from, to),
      }).hide(parseAssetId(value)),
    ),
  )

  handle(CHANNELS.assetsShowResource, async (_event, value) =>
    withoutSourcePath(
      await createShowResource({
        projectPath: () => project.path(),
        folderFor: role => project.folderFor(role),
        find: assetId => project.catalog().find(assetId),
        repath: (from, to) => project.catalog().repath(from, to),
      }).show(parseAssetId(value)),
    ),
  )
}
