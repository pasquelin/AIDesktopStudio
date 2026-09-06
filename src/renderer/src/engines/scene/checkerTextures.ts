/**
 * Which asset each shipped working texture became in the open project, and the material a new
 * primitive is therefore born with.
 *
 * NO PRIMITIVE IS BORN BARE. A grey shape says nothing about its scale, nothing about how its
 * UVs stretch, and nothing about where one of its faces ends and the next begins — which is
 * three quarters of what a person looks at a new shape FOR. The texture is a starting point,
 * changed like any other, never an absence to be filled later.
 *
 * Module state rather than a store, for one reason: `createNodeOf` is synchronous — it runs
 * inside a command, between two entries of the history — and copying four files into a project
 * is not. `ensureCheckerTextures` is what the two doors that make shapes await first: the scene
 * space when it mounts, and the new-document flow before it seeds a template.
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

/** The install in flight, by project — so ten open scenes ask the main process once. */
let running: { path: string; work: Promise<void> } | null = null

/**
 * The shipped textures in the open project, and their ids remembered. Awaiting it is what lets
 * `defaultMeshMaterial` stay synchronous at the moment a shape is actually made.
 *
 * Asked on the way BACK as much as on the way in: a slow install for the project one has just
 * left resolves after the next one has answered, and would hand every new primitive the asset
 * ids of a project this window no longer has open.
 */
export function ensureCheckerTextures(path: string): Promise<void> {
  if (path === '') {
    forgetCheckerTextures()
    return Promise.resolve()
  }

  if (running && running.path === path) return running.work

  const isCurrent = (): boolean => running?.path === path

  const work = (getBridge()?.assets.installBundledTextures() ?? Promise.resolve([]))
    .then(textures => {
      if (isCurrent()) rememberCheckerTextures(textures)
    })
    // A project that cannot be written to is the one case a shape still comes out plain. The
    // main process is where that failure is logged; here it is forgotten rather than kept, so
    // the next mount asks again instead of leaving the project bare for the session.
    .catch(() => {
      if (isCurrent()) forgetCheckerTextures()
    })

  running = { path, work }
  return work
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

/** Everything, the memo included: what is forgotten has to be asked for again, not assumed done. */
export function forgetCheckerTextures(): void {
  installed.clear()
  paths.clear()
  running = null
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
