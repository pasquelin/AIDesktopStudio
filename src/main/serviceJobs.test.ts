import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { removeFiles } from './serviceJobs'

const row = (
  id: string,
  path: string,
  convertedFrom: string,
  type: Asset['type'] = 'animation',
): Asset => ({
  id,
  name: id,
  type,
  location: 'local',
  path,
  convertedFrom,
  tags: [],
  createdAt: '2026-09-07T00:00:00.000Z',
})

describe('removeFiles', () => {
  it('removes only one original from a shared flat-animation source folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ia-studio-remove-converted-'))
    await mkdir(join(root, 'Animations/.sources'), { recursive: true })
    await writeFile(join(root, 'Animations/Walk.glb'), 'walk')
    await writeFile(join(root, 'Animations/.sources/Walk.fbx'), 'walk source')
    await writeFile(join(root, 'Animations/.sources/Run.fbx'), 'run source')

    await removeFiles(
      { project: { current: () => ({ path: root }), roles: () => ({ animations: 'Animations' }) } },
      row('Walk', 'Animations/Walk.glb', 'Animations/.sources/Walk.fbx'),
    )

    expect(await readFile(join(root, 'Animations/.sources/Run.fbx'), 'utf8')).toBe('run source')
  })

  it('removes a suffixed source package and all of its neighbours', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ia-studio-remove-converted-'))
    await mkdir(join(root, 'Models/.sources/Robot 2'), { recursive: true })
    await writeFile(join(root, 'Models/Robot.glb'), 'robot')
    await writeFile(join(root, 'Models/.sources/Robot 2/Robot.fbx'), 'source')
    await writeFile(join(root, 'Models/.sources/Robot 2/rig.bin'), 'rig')
    const asset = row('Robot', 'Models/Robot.glb', 'Models/.sources/Robot 2/Robot.fbx', 'mesh')

    await removeFiles(
      { project: { current: () => ({ path: root }), roles: () => ({ models: 'Models' }) } },
      asset,
    )

    await expect(access(join(root, 'Models/.sources/Robot 2'))).rejects.toThrow()
  })

  it('removes the empty folder owned by a packaged OBJ', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ia-studio-remove-converted-'))
    await mkdir(join(root, 'Models/Robot/.sources'), { recursive: true })
    await writeFile(join(root, 'Models/Robot/Robot.glb'), 'robot')
    await writeFile(join(root, 'Models/Robot/.sources/Robot.obj'), 'source')

    await removeFiles(
      { project: { current: () => ({ path: root }), roles: () => ({ models: 'Models' }) } },
      row('Robot', 'Models/Robot/Robot.glb', 'Models/Robot/.sources/Robot.obj', 'mesh'),
    )

    await expect(access(join(root, 'Models/Robot'))).rejects.toThrow()
  })

  it('removes the nested source package and folder of a reclassified animation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ia-studio-remove-converted-'))
    await mkdir(join(root, 'Animations/Robot/.sources/Robot'), { recursive: true })
    await writeFile(join(root, 'Animations/Robot/animation.glb'), 'robot')
    await writeFile(join(root, 'Animations/Robot/.sources/Robot/Robot.obj'), 'source')
    await writeFile(join(root, 'Animations/Robot/.sources/Robot/rig.bin'), 'rig')

    await removeFiles(
      { project: { current: () => ({ path: root }), roles: () => ({ animations: 'Animations' }) } },
      row('Robot', 'Animations/Robot/animation.glb', 'Animations/Robot/.sources/Robot/Robot.obj'),
    )

    await expect(access(join(root, 'Animations/Robot'))).rejects.toThrow()
  })
})
