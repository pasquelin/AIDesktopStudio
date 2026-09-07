import { describe, expect, it, vi } from 'vitest'
import { createVisualCapturePort } from './visualCapture'

const PNG_1X1 = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
)

describe('VisualCapturePort', () => {
  it('keeps a valid renderer capture in memory with its document revision', async () => {
    const send = vi.fn(() => true)
    const port = createVisualCapturePort({
      send,
      now: () => '2026-09-04T10:00:00.000Z',
      newId: () => 'capture_1',
    })

    const pending = port.capture('document_1', 7)
    port.settle({ callId: 'capture_1', png: PNG_1X1 })

    await expect(pending).resolves.toMatchObject({
      resourceId: 'document_1',
      revision: 7,
      width: 1,
      height: 1,
      bytes: PNG_1X1,
    })
    expect(send).toHaveBeenCalledWith({ callId: 'capture_1', documentId: 'document_1' })
  })

  it('returns no context when no renderer receives the request', async () => {
    const port = createVisualCapturePort({ send: () => false, now: () => '' })
    await expect(port.capture('document_1')).resolves.toBeNull()
  })

  it('rejects an oversized payload before probing it', async () => {
    const port = createVisualCapturePort({
      send: () => true,
      now: () => '',
      newId: () => 'capture_large',
    })
    const pending = port.capture('document_1')
    port.settle({ callId: 'capture_large', png: new Uint8Array(8_000_001) })

    await expect(pending).resolves.toBeNull()
  })

  it('ignores malformed boundary values without consuming the pending capture', async () => {
    const port = createVisualCapturePort({
      send: () => true,
      now: () => '2026-09-04T10:00:00.000Z',
      newId: () => 'capture_guarded',
    })
    const pending = port.capture('document_1')
    port.settle({ callId: 'capture_guarded', png: 'not bytes' })
    port.settle({ callId: 'capture_guarded', png: PNG_1X1 })

    await expect(pending).resolves.toMatchObject({ bytes: PNG_1X1 })
  })
})
