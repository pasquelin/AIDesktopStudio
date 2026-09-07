import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInputMaps } from './inputMaps'
import type { FolderEntry } from '@shared/domain/folder'
import { INPUT_MAP_VERSION } from '@shared/domain/inputMap'

const entry = (path: string): FolderEntry => ({ path, name: path, kind: 'file' })

describe('project input maps', () => {
  let root: string
  let walked: FolderEntry[]

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ia-input-maps-'))
    walked = []
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('writes a versioned input map inside the project', async () => {
    const maps = createInputMaps({ rootOf: () => root, walk: async () => walked })
    const wrote = await maps.write('Controls/character.input.json', {
      version: 1,
      id: 'character',
      priority: 0,
      defaultActive: true,
      actions: [],
    })

    expect(wrote).toBe(true)
    expect(
      JSON.parse(await readFile(join(root, 'Controls/character.input.json'), 'utf8')),
    ).toMatchObject({
      id: 'character',
    })
  })

  it('lists input map paths in a stable order and reads their validated contents', async () => {
    await mkdir(join(root, 'Controls'), { recursive: true })
    await writeFile(
      join(root, 'Controls', 'vehicle.input.json'),
      JSON.stringify({
        version: 1,
        id: 'vehicle',
        priority: 10,
        defaultActive: false,
        actions: [],
      }),
    )
    await writeFile(
      join(root, 'character.input.json'),
      JSON.stringify({
        version: 1,
        id: 'character',
        priority: 0,
        defaultActive: true,
        actions: [],
      }),
    )
    walked = [
      entry('character.input.json'),
      entry('Controls/vehicle.input.json'),
      entry('notes.json'),
    ]
    const maps = createInputMaps({ rootOf: () => root, walk: async () => walked })

    expect(await maps.list()).toEqual(['Controls/vehicle.input.json', 'character.input.json'])
    await expect(maps.read('Controls/vehicle.input.json')).resolves.toMatchObject({ id: 'vehicle' })
  })

  it('answers nothing when an input map is missing or outside the project', async () => {
    const maps = createInputMaps({ rootOf: () => root, walk: async () => walked })

    await expect(maps.read('missing.input.json')).resolves.toBeNull()
    await expect(maps.read('../outside.input.json')).resolves.toBeNull()
  })

  it('refuses to write through a project folder symlink', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'ia-input-maps-outside-'))
    await symlink(outside, join(root, 'Controls'))
    const maps = createInputMaps({ rootOf: () => root, walk: async () => walked })

    await expect(
      maps.write('Controls/New/character.input.json', {
        version: 1,
        id: 'character',
        priority: 0,
        defaultActive: true,
        actions: [],
      }),
    ).resolves.toBe(false)
    await expect(readFile(join(outside, 'New/character.input.json'), 'utf8')).rejects.toThrow()
    await rm(outside, { recursive: true, force: true })
  })

  // 🛑 Every window, not the one that wrote: a control map is resolved once and held, so a rebind
  // saved anywhere left the others reading the version from before it.
  it('tells what a write landed on, so a held map elsewhere knows it is behind', async () => {
    const said: string[] = []
    const store = createInputMaps({
      rootOf: () => root,
      walk: async () => [],
      announce: path => said.push(path),
    })

    await store.write('Controls/character.input.json', {
      version: INPUT_MAP_VERSION,
      id: 'character',
      priority: 0,
      defaultActive: true,
      actions: [],
    })

    expect(said).toEqual(['Controls/character.input.json'])
  })
})
