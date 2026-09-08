import {
  BUNDLED_CHARACTER_LEVELS,
  BUNDLED_CHARACTER_NAMES,
  bundledCharacterFile,
  type InstalledCharacter,
} from '@shared/domain/bundledCharacter'
import { nearestCharacterLevel, type CharacterLevel } from '@shared/domain/characterLevel'
import { pathIn } from '@shared/domain/folder'
import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import {
  installBundledResource,
  type BundledResource,
  type BundledResourceDeps,
} from './bundledResource'

type BundledCharacterDeps = BundledResourceDeps & {
  /** Where the shipped characters sit — injected like everything else that touches the disk. */
  folder: () => string
}

function resourceOf(level: CharacterLevel): BundledResource {
  return {
    file: bundledCharacterFile(level),
    name: BUNDLED_CHARACTER_NAMES[level],
    type: 'mesh',
    role: 'models',
    // A LITERAL: this names where the file WAS, which no value the studio may still change can
    // spell. Projects laid out while models sat under a modelling folder hold it there.
    formerPaths: [pathIn('.resources/Modelling/Models', bundledCharacterFile(level))],
  }
}

/**
 * The character the app ships with, put into the open project — ONE level, the one asked for.
 *
 * Not all four: a project would carry 19 MB of which three densities nothing looks at. The ask
 * goes through `nearestCharacterLevel` like any other character's, so what comes back is what the
 * app HAS rather than what was wanted — the same answer shape a character somebody imported with
 * a single density gives.
 */
export function registerBundledCharacterHandlers({ folder, ...deps }: BundledCharacterDeps): void {
  // Named rather than written inline: `ipc-handlers.test.ts` reads `handle(CHANNELS.…` by regex
  // on ONE line, and an argument list Prettier wraps leaves the channel looking unhandled.
  const install = async (
    _event: unknown,
    wanted: CharacterLevel,
  ): Promise<InstalledCharacter | null> => {
    const level = nearestCharacterLevel(wanted, BUNDLED_CHARACTER_LEVELS)
    if (!level) return null

    const asset = await installBundledResource(deps, folder(), resourceOf(level))
    return { level, assetId: asset.id, ...(asset.path ? { path: asset.path } : {}) }
  }

  handle(CHANNELS.charactersInstallBundled, install)
}
