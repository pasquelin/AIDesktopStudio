import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { download } from '../../scripts/download.mjs'

const temporary: string[] = []

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true })
  vi.unstubAllGlobals()
})

const into = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'fetch-ffmpeg-'))
  temporary.push(directory)
  return join(directory, 'archive')
}

const served = (body: string): Response =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/zip' } })

/** What a throttled host does: it answers 200, then cuts the socket while the body is in flight. */
const cut = (): Response =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new TypeError('terminated'))
      },
    }),
    { status: 200 },
  )

describe('build download', () => {
  it('takes the archive a throttled host serves on a later try', async () => {
    const answers = [cut, cut, () => served('the encoder')]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answers.shift()!()),
    )
    const file = into()

    await download('https://host/ffprobe.zip', file, { attempts: 4, wait: async () => {} })

    expect(readFileSync(file, 'utf8')).toBe('the encoder')
  })

  it('asks again when the host answers 429 rather than cutting the socket', async () => {
    const answers = [() => new Response('', { status: 429 }), () => served('the encoder')]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answers.shift()!()),
    )
    const file = into()

    await download('https://host/throttled.zip', file, { attempts: 4, wait: async () => {} })

    expect(readFileSync(file, 'utf8')).toBe('the encoder')
  })

  it('asks a host that answered 404 exactly once', async () => {
    const asked = vi.fn(async () => new Response('', { status: 404 }))
    vi.stubGlobal('fetch', asked)

    await expect(
      download('https://host/pruned.zip', into(), { attempts: 4, wait: async () => {} }),
    ).rejects.toThrow('answered 404')
    expect(asked).toHaveBeenCalledTimes(1)
  })
})
