/**
 * Which asset each shipped working texture became in the open project, and the material a new
 * primitive is therefore born with.
 *
 * NO PRIMITIVE IS BORN BARE. A grey shape says nothing about its scale, nothing about how its
 * UVs stretch, and nothing about where one of its faces ends and the next begins — which is
 * three quarters of what a person looks at a new shape FOR. The texture is a starting point,
 * changed like any other, never an absence to be filled later.
 *
 * Module state rather than a store: `createNodeOf` is synchronous — it runs inside a command,
 * between two entries of the history — and copying four files into a project is not. What waits
 * for the copy, and remembers which project it was for, is `projectInstalls`.
 */
import {
  DEFAULT_CHECKER_TEXTURE,
  type CheckerTextureId,
  type InstalledCheckerTexture,
} from '@shared/domain/checkerTexture'
import type { MaterialDescriptor, TextureRef } from '@shared/domain/scene'
import { getBridge } from '@/services/bridge'
import { DEFAULT_MATERIAL } from './sceneState'

const installed = new Map<CheckerTextureId, string>()
const paths = new Map<string, string>()

/**
 * The shipped textures put into the open project, and their ids remembered — which is what lets
 * `defaultMeshMaterial` stay synchronous at the moment a shape is actually made.
 *
 * Answers whether it landed and never rejects: `projectInstalls` reads that to know whether the
 * next mount has to ask again. A project that cannot be written to is the one case a shape still
 * comes out plain, and the main process is where that failure is logged.
 */
export async function installCheckerTextures(isCurrent: () => boolean): Promise<boolean> {
  try {
    const textures = (await getBridge()?.assets.installBundledTextures()) ?? []
    if (isCurrent()) rememberCheckerTextures(textures)
    // 🛑 What LANDED, never « did not throw »: an empty answer leaves every new shape plain, and
    // saying `true` would memoise that for the whole session — see `projectInstalls`.
    return textures.length > 0
  } catch {
    if (isCurrent()) forgetCheckerTextures()
    return false
  }
}

/** Replaces what is known, so leaving a project cannot leave its ids behind for the next one. */
export function rememberCheckerTextures(textures: readonly InstalledCheckerTexture[]): void {
  installed.clear()
  paths.clear()
  for (const texture of textures) {
    installed.set(texture.id, texture.assetId)
    if (texture.path) paths.set(texture.assetId, texture.path)
  }
}

export function forgetCheckerTextures(): void {
  installed.clear()
  paths.clear()
}

/** The file that id became, so a save can name it by uri without waiting for the shelf. */
export function checkerTexturePath(assetId: string): string | null {
  return paths.get(assetId) ?? null
}

export function checkerTextureRef(id: CheckerTextureId): TextureRef | null {
  const assetId = installed.get(id)
  return assetId ? { assetId } : null
}

/**
 * What a mesh is born wearing. The one door — `createNodeOf` and the templates both come through
 * here, so a primitive added by hand and one a template placed cannot disagree about it.
 *
 * The mapless material is the failure case, not a mode: it means the project could not be
 * written to. See the head of this file.
 */
export function defaultMeshMaterial(
  id: CheckerTextureId = DEFAULT_CHECKER_TEXTURE,
): MaterialDescriptor {
  // A COPY either way: handed out by reference, one descriptor would be shared by every mesh
  // made while the install is pending, and editing one would edit them all.
  const map = checkerTextureRef(id)
  return map ? { ...DEFAULT_MATERIAL, map } : { ...DEFAULT_MATERIAL }
}
