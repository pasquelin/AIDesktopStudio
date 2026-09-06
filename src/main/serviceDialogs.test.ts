import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pickWeights } from './serviceDialogs'

const native = vi.hoisted(() => ({
  open: vi.fn(),
  confirm: vi.fn(),
}))
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null },
  dialog: { showOpenDialog: native.open, showMessageBox: native.confirm },
}))

describe('local motion folder selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    native.open.mockResolvedValue({ canceled: false, filePaths: ['/models/motion'] })
    native.confirm.mockResolvedValue({ response: 0 })
  })

  it('asks for a folder and confirms the required terms before accepting it', async () => {
    expect(await pickWeights('en', 'motion')).toBe('/models/motion')
    expect(native.open).toHaveBeenCalledWith(
      expect.objectContaining({ properties: ['openDirectory'] }),
    )
    expect(native.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ defaultId: 1, cancelId: 1 }),
    )
  })

  it('does not accept weights when the user declines the terms', async () => {
    native.confirm.mockResolvedValue({ response: 1 })
    expect(await pickWeights('en', 'motion')).toBeNull()
  })
})
