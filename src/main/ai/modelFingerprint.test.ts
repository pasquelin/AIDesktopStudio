import { expect, it, vi } from 'vitest'
import { fingerprintModelFile, DownloadCancelled } from './modelInstall'
const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text)

it('cancels local fingerprinting between chunks and closes the source stream', async () => {
  const controller = new AbortController()
  let closed = false
  let read = 0
  const onBytes = vi.fn(() => controller.abort())
  async function* source() {
    try {
      for (let chunk = 0; chunk < 100; chunk++) {
        read++
        yield bytesOf('weights')
      }
    } finally {
      closed = true
    }
  }
  await expect(
    fingerprintModelFile(source, '/local', controller.signal, onBytes),
  ).rejects.toBeInstanceOf(DownloadCancelled)
  expect(read).toBe(2)
  expect(closed).toBe(true)
  expect(onBytes).toHaveBeenCalledExactlyOnceWith(7)
})
