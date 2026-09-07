import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { IMPORTABLE_FILE_EXTENSIONS } from '@shared/domain/importFormat'

describe('packaged file associations', () => {
  it('lets the operating system hand every importable file to the application', async () => {
    const config = await readFile('electron-builder.yml', 'utf8')
    const block = config.split('\nfileAssociations:\n')[1]?.split('\nelectronFuses:\n')[0] ?? ''
    const associated = [...block.matchAll(/^ {6}- (\w+)$/gm)].map(match => match[1])

    expect(associated.sort()).toEqual([...IMPORTABLE_FILE_EXTENSIONS].sort())
  })
})
