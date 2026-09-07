import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileOutcome } from '@shared/domain/fileOp'
import { installFakeBridge } from '@/services/fakeBridge'
import { useFileClipboard } from '@/stores/fileClipboard'
import { useSelection } from '@/stores/selection'
import { runExplorerCommand } from './explorerCommands'

const DONE: FileOutcome = { done: [], refused: [], batch: 'batch-1' }

const pasteFiles = vi.fn(async () => DONE)
const newFolder = vi.fn(async () => DONE)
const trashFiles = vi.fn(async () => DONE)

const settle = vi.fn()

const context = { into: 'Images', folderName: 'Nouveau dossier', settle }

beforeEach(() => {
  vi.clearAllMocks()
  installFakeBridge({ project: { pasteFiles, newFolder, trashFiles } })
  useFileClipboard.getState().clear()
  useSelection.getState().selectFiles(['Images/a.png'])
})

describe('the commands of the project folder', () => {
  it('holds the selection, pastes it where it is told, and spends a cut on the paste', async () => {
    expect(runExplorerCommand('explorer.cut', context)).toBe(true)
    expect(useFileClipboard.getState()).toMatchObject({ paths: ['Images/a.png'], cut: true })

    expect(runExplorerCommand('explorer.paste', context)).toBe(true)
    expect(pasteFiles).toHaveBeenCalledWith(['Images/a.png'], 'Images', true)
    expect(useFileClipboard.getState().paths).toEqual([])
    await vi.waitFor(() => expect(settle).toHaveBeenCalledWith(DONE))
  })

  it('has nothing to do with an empty selection or an empty clipboard', () => {
    useSelection.getState().selectFiles([])

    expect(runExplorerCommand('explorer.trash', context)).toBe(false)
    expect(runExplorerCommand('explorer.paste', context)).toBe(false)
    expect(trashFiles).not.toHaveBeenCalled()
  })

  it('makes a folder where it is told, under the name it is given', () => {
    expect(runExplorerCommand('explorer.newFolder', context)).toBe(true)

    expect(newFolder).toHaveBeenCalledWith('Images', 'Nouveau dossier')
  })
})
