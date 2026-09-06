import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STT_MODEL, STT_MODEL_BYTES, STT_MODEL_FILES } from '@shared/domain/dictation'
import type { LocalModel, ModelFile } from '@shared/domain/localModel'
import {
  ChecksumMismatch,
  DownloadCancelled,
  NetworkInterrupted,
  fetchModel,
  fetchModelFile,
  isNetworkError,
  modelIsComplete,
  type DownloadHost,
} from './modelInstall'

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text)
const digestOf = (text: string): string => createHash('sha256').update(text).digest('hex')

/**
 * A file of its own rather than one of the real four: `fetchModelFile` takes what it fetches as
 * an argument, so nothing here has to reach into the shared manifest — and a test that mutated
 * it would leak into the next one.
 */
const fileOf = (content: string, name = 'encoder.int8.onnx'): ModelFile => ({
  role: 'encoder',
  name,
  url: `https://models.test/${name}`,
  bytes: content.length,
  sha256: digestOf(content),
})

/**
 * A disk and a server, in memory. Files are strings: what these tests check is which bytes end
 * up where and in what order, never their content.
 */
function harness(served: Record<string, string[]> = {}) {
  const disk = new Map<string, string>()
  /** Length `sizeOf` should report, when the test put a short stand-in for a large file. */
  const sizes = new Map<string, number>()
  /** The folders the install asked for, so a nested file name can be shown to create its own. */
  const made: string[] = []
  const requests: { url: string; range: number }[] = []
  const opened: { path: string; resume: boolean }[] = []
  const closed: string[] = []
  let partial = true
  let failWith: number | null = null

  async function* stream(chunks: readonly string[]): AsyncIterable<Uint8Array> {
    for (const chunk of chunks) if (chunk.length > 0) yield bytesOf(chunk)
  }

  const host: DownloadHost = {
    fetch: (url, range) => {
      requests.push({ url, range })
      if (failWith !== null) {
        return Promise.resolve({ ok: false, status: failWith, partial: false, body: stream([]) })
      }

      const chunks = served[url] ?? []
      const honoured = range > 0 && partial
      // A range the server honours skips what the caller already holds; one it ignores serves
      // the file from the top, which is what `partial: false` says.
      const body = honoured ? [chunks.join('').slice(range)] : chunks

      return Promise.resolve({
        ok: true,
        status: honoured ? 206 : 200,
        partial: honoured,
        body: stream(body),
      })
    },
    sizeOf: path => {
      if (!disk.has(path)) return Promise.resolve(0)
      return Promise.resolve(sizes.get(path) ?? disk.get(path)?.length ?? 0)
    },
    open: (path, resume) => {
      opened.push({ path, resume })
      if (!resume) disk.set(path, '')
      return Promise.resolve({
        write: chunk => {
          disk.set(path, `${disk.get(path) ?? ''}${new TextDecoder().decode(chunk)}`)
          return Promise.resolve()
        },
        close: () => {
          closed.push(path)
          return Promise.resolve()
        },
      })
    },
    readBack: async function* (path) {
      const held = disk.get(path)
      if (held) yield bytesOf(held)
    },
    remove: path => {
      disk.delete(path)
      sizes.delete(path)
      return Promise.resolve()
    },
    rename: (from, to) => {
      const held = disk.get(from)
      disk.delete(from)
      if (held !== undefined) disk.set(to, held)
      return Promise.resolve()
    },
    exists: path => Promise.resolve(disk.has(path)),
    join: (folder, name) => `${folder}/${name}`,
    ensureFolder: folder => {
      made.push(folder)
      return Promise.resolve()
    },
  }

  return {
    host,
    disk,
    sizes,
    made,
    requests,
    opened,
    closed,
    ignoreRanges: () => {
      partial = false
    },
    refuse: (status: number) => {
      failWith = status
    },
  }
}

const options = (onProgress = vi.fn(), signal?: AbortSignal) => ({
  folder: '/models',
  onProgress,
  signal,
  alreadyDone: 0,
  // The whole set the bar is drawn against, handed in now that the installer serves any model.
  total: STT_MODEL_BYTES,
})

describe('fetchModelFile', () => {
  const content = 'the whole encoder'
  const FILE = fileOf(content)
  const target = `/models/${FILE.name}`
  const part = `${target}.part`

  it('writes to a .part and only renames once the digest matches', async () => {
    const { host, disk } = harness({ [FILE.url]: ['the whole', ' encoder'] })

    await fetchModelFile(host, FILE, options())

    expect(disk.get(target)).toBe(content)
    expect(disk.has(part)).toBe(false)
  })

  // Nothing unverified is ever loadable at the path the engine reads — the rule `fetch-ffmpeg`
  // follows at build time, applied at runtime.
  it('removes the .part and refuses when the digest is wrong', async () => {
    const { host, disk } = harness({ [FILE.url]: ['something else entirely'] })

    await expect(fetchModelFile(host, FILE, options())).rejects.toBeInstanceOf(ChecksumMismatch)

    expect(disk.has(target)).toBe(false)
    expect(disk.has(part)).toBe(false)
  })

  it('resumes from what a previous run left, asking for the rest', async () => {
    const { host, disk, requests } = harness({ [FILE.url]: [content] })
    disk.set(part, 'the whole')

    await fetchModelFile(host, FILE, options())

    expect(requests).toEqual([{ url: FILE.url, range: 9 }])
    expect(disk.get(target)).toBe(content)
  })

  // The digest of a resumed file covers what was there before as well as what arrived, or a
  // corrupted prefix would sail through.
  it('hashes the part it kept, not only what it fetched', async () => {
    const { host, disk } = harness({ [FILE.url]: [content] })
    disk.set(part, 'XXX whole')

    await expect(fetchModelFile(host, FILE, options())).rejects.toBeInstanceOf(ChecksumMismatch)
  })

  // Asked to resume and handed the whole file, what is on disk is not a prefix of what is
  // arriving: appending would build a file that is simply wrong.
  it('starts over when the server ignores the range', async () => {
    const { host, disk, ignoreRanges } = harness({ [FILE.url]: ['the whole', ' encoder'] })
    disk.set(part, 'the whole')
    ignoreRanges()

    await fetchModelFile(host, FILE, options())

    expect(disk.get(target)).toBe(content)
  })

  it('ignores a .part at least as long as the file it claims to be', async () => {
    const { host, disk, requests } = harness({ [FILE.url]: [content] })
    disk.set(part, 'leftovers from a URL that has moved')

    await fetchModelFile(host, FILE, options())

    expect(requests).toEqual([{ url: FILE.url, range: 0 }])
    expect(disk.get(target)).toBe(content)
  })

  it('reports progress against the whole model, not the file in flight', async () => {
    const { host } = harness({ [FILE.url]: ['the whole', ' encoder'] })
    const onProgress = vi.fn()

    await fetchModelFile(host, FILE, { ...options(onProgress), alreadyDone: 1_000 })

    expect(onProgress).toHaveBeenLastCalledWith({ received: 1_017, total: STT_MODEL_BYTES })
  })

  // `net.fetch` hands out chunks of a few tens of kilobytes: one event each would be twenty
  // thousand broadcasts for the encoder, every one of them re-rendering a bar of sixty steps.
  it('does not report once per chunk', async () => {
    const { host } = harness({ [FILE.url]: [...'the whole encoder'] })
    const onProgress = vi.fn()

    await fetchModelFile(host, FILE, options(onProgress))

    // One, at the end: nothing here comes close to the four megabytes between two reports.
    expect(onProgress).toHaveBeenCalledTimes(1)
  })

  // A bar that stops at 97% reads as a download that stalled, and the last step is almost
  // never a whole one.
  it('always reports the end, whatever the last chunk weighed', async () => {
    const { host } = harness({ [FILE.url]: ['the whole encoder'] })
    const onProgress = vi.fn()

    await fetchModelFile(host, FILE, options(onProgress))

    expect(onProgress).toHaveBeenLastCalledWith({ received: 17, total: STT_MODEL_BYTES })
  })

  it('stops between chunks when cancelled', async () => {
    const { host, disk } = harness({ [FILE.url]: ['the whole', ' encoder'] })
    const controller = new AbortController()
    // Aborted on the first write rather than on a progress report, which is now spaced out.
    const open = host.open
    host.open = async (path, resume) => {
      const sink = await open(path, resume)
      return {
        ...sink,
        write: async chunk => {
          await sink.write(chunk)
          controller.abort()
        },
      }
    }

    await expect(
      fetchModelFile(host, FILE, options(vi.fn(), controller.signal)),
    ).rejects.toBeInstanceOf(DownloadCancelled)

    // What arrived stays: the next attempt resumes from it rather than starting over.
    expect(disk.get(part)).toBe('the whole')
  })

  // `appendFile` opens and closes the file on every call: for the encoder alone that would be
  // sixty thousand syscalls where one handle does.
  it('opens the file once and closes it once', async () => {
    const harnessed = harness({ [FILE.url]: [...'the whole encoder'] })

    await fetchModelFile(harnessed.host, FILE, options())

    expect(harnessed.opened).toEqual([{ path: part, resume: false }])
    expect(harnessed.closed).toEqual([part])
  })

  // A cancelled download leaves a `.part` the next attempt resumes from — and an open handle
  // would keep it locked on Windows.
  it('closes the file even when it is cancelled', async () => {
    const harnessed = harness({ [FILE.url]: ['the whole', ' encoder'] })
    const controller = new AbortController()
    const open = harnessed.host.open
    harnessed.host.open = async (path, resume) => {
      const sink = await open(path, resume)
      return {
        ...sink,
        write: async chunk => {
          await sink.write(chunk)
          controller.abort()
        },
      }
    }

    await expect(
      fetchModelFile(harnessed.host, FILE, options(vi.fn(), controller.signal)),
    ).rejects.toBeInstanceOf(DownloadCancelled)

    expect(harnessed.closed).toEqual([part])
  })

  it('refuses before writing anything when the server says no', async () => {
    const { host, disk, refuse } = harness({ [FILE.url]: [content] })
    refuse(404)

    await expect(fetchModelFile(host, FILE, options())).rejects.toThrow('404')
    expect(disk.size).toBe(0)
  })

  it('names the file when the connection drops, so the journal is not a bare net:: code', async () => {
    const { host } = harness({ [FILE.url]: [content] })
    host.fetch = () => Promise.reject(new Error('net::ERR_NETWORK_CHANGED'))

    await expect(fetchModelFile(host, FILE, options())).rejects.toBeInstanceOf(NetworkInterrupted)
    await expect(fetchModelFile(host, FILE, options())).rejects.toThrow(FILE.name)
  })
})

describe('a dropped connection', () => {
  it('is recognised from Electron and from the OS', () => {
    expect(isNetworkError(new Error('net::ERR_NETWORK_CHANGED'))).toBe(true)
    expect(isNetworkError(new Error('read ECONNRESET'))).toBe(true)
    expect(isNetworkError(new Error('digest mismatch'))).toBe(false)
  })
})

describe('fetchModel', () => {
  const [FILE, OTHER] = STT_MODEL_FILES

  // These reach into the shared manifest, so what they mock has to be put back — a digest left
  // stubbed would decide the outcome of whatever ran next.
  afterEach(() => vi.restoreAllMocks())

  it('skips a file that is already there and still counts it as done', async () => {
    const { host, disk, sizes, requests } = harness()
    for (const file of STT_MODEL_FILES) {
      disk.set(`/models/${file.name}`, 'here')
      sizes.set(`/models/${file.name}`, file.bytes)
    }
    const onProgress = vi.fn()

    await fetchModel(host, STT_MODEL, { folder: '/models', onProgress })

    expect(requests).toEqual([])
    expect(onProgress).toHaveBeenLastCalledWith({
      received: STT_MODEL_BYTES,
      total: STT_MODEL_BYTES,
    })
  })

  it('throws away a final file of the wrong size and fetches it again', async () => {
    const { host, disk, requests } = harness({ [FILE!.url]: ['one'] })
    vi.spyOn(FILE!, 'sha256', 'get').mockReturnValue(digestOf('one'))
    disk.set(`/models/${FILE!.name}`, 'cut')

    await expect(
      fetchModel(
        host,
        { ...STT_MODEL, files: [FILE!] },
        { folder: '/models', onProgress: vi.fn() },
      ),
    ).resolves.toBeUndefined()

    expect(requests).toEqual([{ url: FILE!.url, range: 0 }])
    expect(disk.get(`/models/${FILE!.name}`)).toBe('one')
  })

  it('fetches the files in order, and stops at the first that fails', async () => {
    const { host, requests } = harness({ [FILE!.url]: ['one'], [OTHER!.url]: ['two'] })
    vi.spyOn(FILE!, 'sha256', 'get').mockReturnValue(digestOf('one'))
    vi.spyOn(OTHER!, 'sha256', 'get').mockReturnValue(digestOf('two'))

    // The third is served nothing, so it fails its digest — which is what ends the run, and
    // shows the run is sequential rather than a fan-out that happens to finish in order.
    await expect(
      fetchModel(host, STT_MODEL, { folder: '/models', onProgress: vi.fn() }),
    ).rejects.toBeInstanceOf(ChecksumMismatch)

    expect(requests.map(request => request.url)).toEqual([
      FILE!.url,
      OTHER!.url,
      STT_MODEL_FILES[2]!.url,
    ])
  })
})

describe('modelIsComplete', () => {
  const missing = STT_MODEL_FILES[1]!

  it('is true only when every file is present', async () => {
    const { host, disk, sizes } = harness()
    expect(await modelIsComplete(host, STT_MODEL, '/models')).toBe(false)

    for (const file of STT_MODEL_FILES) {
      disk.set(`/models/${file.name}`, 'here')
      sizes.set(`/models/${file.name}`, file.bytes)
    }
    expect(await modelIsComplete(host, STT_MODEL, '/models')).toBe(true)

    disk.delete(`/models/${missing.name}`)
    expect(await modelIsComplete(host, STT_MODEL, '/models')).toBe(false)
  })

  it('is false when a file is there but shorter than the manifest said', async () => {
    const { host, disk, sizes } = harness()
    for (const file of STT_MODEL_FILES) {
      disk.set(`/models/${file.name}`, 'here')
      sizes.set(`/models/${file.name}`, file.bytes)
    }
    disk.set(`/models/${missing.name}`, 'cut')
    sizes.set(`/models/${missing.name}`, 3)

    expect(await modelIsComplete(host, STT_MODEL, '/models')).toBe(false)
  })

  /**
   * A model the person supplied is installed exactly while THEIR file is there. Looking for it in
   * the model folder — where nothing was ever fetched — read it as never installed, which offered
   * a download for a file already on the disk.
   */
  it('reads a supplied model against the file it names, not against the model folder', async () => {
    const { host, disk } = harness()
    const supplied = { ...STT_MODEL, files: [], weightsPath: '/elsewhere/mine.gguf' }

    expect(await modelIsComplete(host, supplied, '/models')).toBe(false)

    disk.set('/elsewhere/mine.gguf', 'weights')
    expect(await modelIsComplete(host, supplied, '/models')).toBe(true)
  })

  /**
   * `[M]` The catalogue holds 507 files across 40 models, 500 of them behind a folder a loader
   * owns. On a machine with nothing installed that folder is absent, and asking after every file
   * inside it cost 507 stats per compose to answer what one stat answers.
   */
  it('asks after no file of a loader-owned folder that is not there', async () => {
    const { host, disk, sizes } = harness()
    const sizeOf = vi.fn(host.sizeOf)
    const engine: LocalModel = { ...STT_MODEL, loader: 'diffusers' }

    expect(await modelIsComplete({ ...host, sizeOf }, engine, '/models/whisper')).toBe(false)
    expect(sizeOf).not.toHaveBeenCalled()

    disk.set('/models/whisper', '')
    for (const file of STT_MODEL_FILES) {
      disk.set(`/models/whisper/${file.name}`, 'here')
      sizes.set(`/models/whisper/${file.name}`, file.bytes)
    }
    expect(await modelIsComplete({ ...host, sizeOf }, engine, '/models/whisper')).toBe(true)
    expect(sizeOf).toHaveBeenCalledTimes(STT_MODEL_FILES.length)
  })

  it('does not call a catalogue entry with nothing to fetch installed', async () => {
    const { host } = harness()
    const listed: LocalModel = { ...STT_MODEL, files: [], loader: 'plugin' }

    expect(await modelIsComplete(host, listed, '/models')).toBe(false)
  })

  it('treats an Ollama model with nothing to fetch as already here', async () => {
    const { host } = harness()
    const listed: LocalModel = { ...STT_MODEL, files: [], loader: 'ollama' }

    expect(await modelIsComplete(host, listed, '/models')).toBe(true)
  })
})

describe('a manifest whose file names carry a path', () => {
  /**
   * How a diffusers model is laid out — `model_index.json` at the root, one folder per component.
   * Without the folder being made first the write fails on an ENOENT nobody can read.
   */
  it('creates the folder each file lands in', async () => {
    const held = harness({
      'https://models.test/transformer/model.safetensors': ['weights'],
    })

    await fetchModelFile(held.host, fileOf('weights', 'transformer/model.safetensors'), {
      folder: '/models',
      signal: new AbortController().signal,
      onProgress: () => {},
      alreadyDone: 0,
      total: 7,
    })

    expect(held.made).toContain('/models/transformer')
  })
})
