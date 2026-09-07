import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeFilmFrameOffThread } from './filmEncodePort'

const session = vi.hoisted(() => ({
  nextId: vi.fn(() => 7),
  send: vi.fn(() => Promise.resolve({ id: 7, bytes: new Uint8Array([137, 80, 78, 71]) })),
}))

vi.mock('../core/workerSession', () => ({ createWorkerSession: () => session }))

describe('encodeFilmFrameOffThread', () => {
  beforeEach(() => vi.clearAllMocks())

  it('transfers its disposable readback buffer without copying it on the UI thread', async () => {
    const pixels = new Uint8Array([1, 2, 3, 4])

    await expect(encodeFilmFrameOffThread(pixels, 1, 1)).resolves.toEqual(
      new Uint8Array([137, 80, 78, 71]),
    )

    expect(session.send).toHaveBeenCalledWith(
      { id: 7, pixels, width: 1, height: 1, encoded: false },
      [pixels.buffer],
    )
  })
})
