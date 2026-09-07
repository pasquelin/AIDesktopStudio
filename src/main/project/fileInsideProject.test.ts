import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { fileInsideProject } from './fileInsideProject'

let project: string
let outside: string

beforeEach(async () => {
  project = await realpath(await mkdtemp(join(tmpdir(), 'ai-desktop-studio-project-')))
  outside = await realpath(await mkdtemp(join(tmpdir(), 'scenario-outside-')))
})

const media = async (folder: string, name: string): Promise<string> => {
  const path = join(folder, name)
  await writeFile(path, new Uint8Array([1, 2, 3]))
  return path
}

describe('what a montage is allowed to have read', () => {
  it('answers a file that really sits in the project', async () => {
    const rush = await media(project, 'plan.mp4')

    await expect(fileInsideProject(project, pathToFileURL(rush).href)).resolves.toBe(rush)
  })

  it('reads it under a subfolder too, which is where media live', async () => {
    await mkdir(join(project, 'Video'))
    const rush = await media(join(project, 'Video'), 'plan.mp4')

    await expect(fileInsideProject(project, pathToFileURL(rush).href)).resolves.toBe(rush)
  })

  it('refuses a file that simply sits elsewhere', async () => {
    const rush = await media(outside, 'plan.mp4')

    await expect(fileInsideProject(project, pathToFileURL(rush).href)).resolves.toBeNull()
  })

  it('refuses a climb spelled into the url', async () => {
    await media(outside, 'plan.mp4')

    await expect(
      fileInsideProject(project, `file://${join(project, '..')}/scenario-outside/plan.mp4`),
    ).resolves.toBeNull()
  })

  /**
   * The one a name cannot betray: the link sits inside the project, is named like anything else,
   * and points out. `relative` on the SPELLED path would answer that it is inside.
   */
  it('refuses a link that sits in the project and points out of it', async () => {
    const rush = await media(outside, 'plan.mp4')
    await symlink(rush, join(project, 'plan.mp4'))

    const asked = pathToFileURL(join(project, 'plan.mp4')).href
    await expect(fileInsideProject(project, asked)).resolves.toBeNull()
  })

  it('refuses what the catalogue and the repository keep for themselves', async () => {
    await mkdir(join(project, '.git'))
    const secret = await media(join(project, '.git'), 'config')

    await expect(fileInsideProject(project, pathToFileURL(secret).href)).resolves.toBeNull()
  })

  it('answers nothing for a file that is not there, there being nothing to read', async () => {
    await expect(
      fileInsideProject(project, pathToFileURL(join(project, 'absent.mp4')).href),
    ).resolves.toBeNull()
  })
})
