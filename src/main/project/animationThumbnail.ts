import { dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { z } from 'zod'
import type { Asset } from '@shared/domain/asset'
import { animationPosterPathOf } from '@shared/domain/animationLibrary'
import { assetFilePath } from '@main/assets/protocol'
import { assetId } from '@main/assets/validation'
import type { AnimationPosterWrite } from './catalogTypes'
import { probePng } from '@main/media/png'
import { writeAtomic } from '@main/persistence'

const requestSchema = z.object({
  projectPath: z.string(),
  assetId,
  sourcePath: z.string(),
  png: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= 4 * 1024 * 1024),
  replace: z.literal(true).optional(),
})

export async function saveAnimationThumbnail(
  value: unknown,
  root: string,
  find: (id: string) => Promise<Asset | null>,
  publish: (write: AnimationPosterWrite) => Promise<boolean>,
): Promise<void> {
  const request = requestSchema.parse(value)
  if (request.projectPath !== root) throw new Error('The thumbnail belongs to another project')
  const asset = await find(request.assetId)
  if (asset?.type !== 'animation' || asset.path !== request.sourcePath)
    throw new Error('The animation moved or is no longer available')
  const picture = probePng(request.png)
  if (picture?.width !== 512 || picture.height !== 512) throw new Error('Expected a 512px PNG')
  const posterPath = animationPosterPathOf(asset.path)
  const file = posterPath ? assetFilePath(root, posterPath) : null
  if (!posterPath || !file) throw new Error('The thumbnail is outside the project')
  await mkdir(dirname(file), { recursive: true })
  await writeAtomic(file, request.png)
  await publish({
    assetId: asset.id,
    sourcePath: asset.path,
    posterPath,
    ...(request.replace ? { replace: true } : {}),
  })
}
