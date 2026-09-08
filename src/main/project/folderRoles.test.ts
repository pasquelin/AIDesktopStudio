import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ROLE_PATHS, FOLDER_ROLES, ROLE_MARKER } from '@shared/domain/folderRole'
import { ROLE_CACHE_FILE } from '@shared/domain/project'
import { exists } from '@main/persistence'
import {
  ensureRoleFolder,
  layRoleFolders,
  markRoleFolder,
  resolveRoleFolders,
  writeRoleCache,
} from './folderRoles'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-roles-'))
})

/** The map a project just laid out answers with, cache written as an open would write it. */
async function resolved(): Promise<Record<string, string | undefined>> {
  const { roles, walked } = await resolveRoleFolders(root)
  if (walked) await writeRoleCache(root, roles)
  return roles
}

describe('the tree a new project is laid out with', () => {
  it('gives every role a folder, and every folder a marker saying what it is for', async () => {
    await layRoleFolders(root)

    for (const role of FOLDER_ROLES) {
      const folder = DEFAULT_ROLE_PATHS[role]
      expect(await readFile(join(root, folder, ROLE_MARKER), 'utf8')).toBe(`${role}\n`)
    }
  })

  it('answers where each role sits without walking, once the cache is written', async () => {
    await layRoleFolders(root)
    await resolved()

    expect(await resolveRoleFolders(root)).toEqual({ roles: DEFAULT_ROLE_PATHS, walked: false })
  })
})

/**
 * 🛑 What the marker is FOR, and the only reason it exists rather than a table of paths: the
 * Finder renames without telling the studio, and a map keyed by path is wrong from that moment.
 */
describe('a folder the user moved behind the studio', () => {
  it('goes on serving its role after being renamed', async () => {
    await layRoleFolders(root)
    await resolved()

    await rename(join(root, 'Models'), join(root, 'Mes modèles'))

    expect((await resolved()).models).toBe('Mes modèles')
  })

  it('goes on serving after being moved under another folder entirely', async () => {
    await layRoleFolders(root)
    await resolved()

    await mkdir(join(root, 'Acte 1'), { recursive: true })
    await rename(join(root, 'Images'), join(root, 'Acte 1/Photos'))

    expect((await resolved()).image).toBe('Acte 1/Photos')
  })

  /** One walk, and the cache is rewritten — the next open pays reads again, not a traversal. */
  it('is found by one walk, and the answer is remembered', async () => {
    await layRoleFolders(root)
    await resolved()
    await rename(join(root, 'Audio'), join(root, 'Sons'))

    expect((await resolveRoleFolders(root)).walked).toBe(true)
    await resolved()

    expect(await resolveRoleFolders(root)).toMatchObject({ walked: false })
  })
})

/**
 * 🛑 What keeps the walk rare. An absence has to be REMEMBERED, or a project made before the
 * roles — no marker anywhere — pays a full traversal on every opening, for ever.
 */
describe('a project no folder of which carries a role', () => {
  it('walks once, and never again', async () => {
    await mkdir(join(root, 'Anciennes images'), { recursive: true })

    expect((await resolveRoleFolders(root)).walked).toBe(true)
    await resolved()

    expect(await resolveRoleFolders(root)).toEqual({ roles: {}, walked: false })
  })

  /** The price of remembering: a shelf copied in from elsewhere waits for the next walk. */
  it('does not see a marker that appeared without the studio writing it', async () => {
    await resolved()
    await markRoleFolder(root, 'Venu dailleurs', 'image')

    expect((await resolveRoleFolders(root)).roles.image).toBeUndefined()
  })
})

/**
 * 🛑 No role folder is migrated, and none needs to be: the marker binds a role to a FOLDER, so
 * the three shelves a project laid one fold deeper go on serving where they sit. The folder above
 * them carried a role of its own, which this build no longer knows — it turns ordinary.
 */
describe('a project laid out while the 3D shelves sat under a folder of their own', () => {
  it('keeps them where they sit', async () => {
    await mkdir(join(root, 'Modelling'), { recursive: true })
    await writeFile(join(root, 'Modelling', ROLE_MARKER), 'modelling\n')
    await markRoleFolder(root, 'Modelling/Scenes', 'scenes')
    await markRoleFolder(root, 'Modelling/Models', 'models')
    await markRoleFolder(root, 'Modelling/Animations', 'animations')

    const roles = await resolved()

    expect(roles.scenes).toBe('Modelling/Scenes')
    expect(roles.models).toBe('Modelling/Models')
    expect(roles.animations).toBe('Modelling/Animations')
    expect(Object.values(roles)).not.toContain('Modelling')
  })
})

/**
 * 🛑 A property of the VOLUME, measured rather than deduced from `process.platform`: APFS and NTFS
 * fold the case, ext4 does not. The default moved from `scripts` to `Scripts`, so this is exactly
 * what a project made before the roles hands the studio.
 */
describe('a folder the disk already holds under another case', () => {
  it('records the name the disk holds, not the one asked for', async ({ skip }) => {
    await mkdir(join(root, 'scripts'), { recursive: true })
    if (!(await exists(join(root, 'Scripts')))) return skip()

    expect(await ensureRoleFolder(root, {}, 'code')).toBe('scripts')
    expect(await readFile(join(root, 'scripts', ROLE_MARKER), 'utf8')).toBe('code\n')
  })
})

describe('a role whose folder is gone', () => {
  it('is left out of the map rather than pointed at a folder nothing holds', async () => {
    await layRoleFolders(root)
    await rm(join(root, 'Skyboxes'), { recursive: true })

    const roles = await resolved()
    expect(roles.skyboxes).toBeUndefined()
    expect(roles.image).toBe('Images')
  })

  /** A folder comes back because something is being WRITTEN, never because a project opened. */
  it('gets its folder and its marker back when a write asks for one', async () => {
    await layRoleFolders(root)
    await rm(join(root, 'Skyboxes'), { recursive: true })

    expect(await ensureRoleFolder(root, await resolved(), 'skyboxes')).toBe('Skyboxes')
    expect(await readFile(join(root, 'Skyboxes', ROLE_MARKER), 'utf8')).toBe('skyboxes\n')
  })

  it('keeps the folder it was resolved to rather than laying the default down beside it', async () => {
    await layRoleFolders(root)
    await rename(join(root, 'Images'), join(root, 'Photos'))

    expect(await ensureRoleFolder(root, await resolved(), 'image')).toBe('Photos')
    expect(await exists(join(root, 'Images'))).toBe(false)
  })
})

/** A folder copied brings its marker along — an ordinary accident, not a corrupt project. */
describe('two folders claiming one role', () => {
  it('keeps the shallower of the two, whichever the walk reached first', async () => {
    await markRoleFolder(root, 'Archive/Sauvegarde/Images', 'image')
    await markRoleFolder(root, 'Images', 'image')

    expect((await resolved()).image).toBe('Images')
  })
})

describe('what the studio refuses to believe', () => {
  /** 🛑 A path this cache names is WRITTEN INTO, and a project can arrive from anyone. */
  it('refuses a cached folder that would write outside the project', async () => {
    await layRoleFolders(root)
    await writeRoleCache(root, { image: '../../Ailleurs' })

    expect((await resolved()).image).toBe('Images')
  })

  it('ignores a cache naming a folder that no longer carries the role', async () => {
    await layRoleFolders(root)
    await mkdir(join(root, 'Ailleurs'), { recursive: true })
    await writeRoleCache(root, { image: 'Ailleurs' })

    expect((await resolved()).image).toBe('Images')
  })

  it('ignores a marker holding a word no role answers to', async () => {
    await layRoleFolders(root)
    await mkdir(join(root, 'Bizarre'), { recursive: true })
    await writeFile(join(root, 'Bizarre', ROLE_MARKER), 'sculpture\n')

    expect(Object.values(await resolved())).not.toContain('Bizarre')
  })

  /** A cache that will not parse costs a walk, never the project. */
  it('walks rather than fails when the cache is not JSON', async () => {
    await layRoleFolders(root)
    await mkdir(join(root, '.index'), { recursive: true })
    await writeFile(join(root, ROLE_CACHE_FILE), '{ truncated', 'utf8')

    expect((await resolved()).image).toBe('Images')
  })
})
