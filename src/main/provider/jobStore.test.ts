import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createJobStore, JOB_NOTE_LIFETIME_MS, type JobStore } from './jobStore'
import type { PersistedJob } from './persistedJob'

const PROJECT = '/projects/kingdom'
const ELSEWHERE = '/projects/dungeon'
const NOW = Date.parse('2026-08-08T10:00:00.000Z')

const RUNNING: PersistedJob = {
  id: 'job_local',
  remoteId: 'job_remote',
  targetId: 'model_flux',
  label: 'Flux',
  accountId: 'fingerprint_studio',
  projectPath: PROJECT,
  createdAt: '2026-08-08T09:00:00.000Z',
}

const OTHER: PersistedJob = { ...RUNNING, id: 'job_other', projectPath: ELSEWHERE }

describe('job store', () => {
  let root = ''
  let store: JobStore

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-jobs-'))
    store = createJobStore(
      () => root,
      () => NOW,
    )
  })

  // A first launch, and a session that ended with nothing running, are the same answer.
  it('answers with nothing when no file has been written', async () => {
    expect(await store.read(PROJECT)).toEqual([])
  })

  it('leaves no staging copy behind', async () => {
    await store.write([RUNNING], [RUNNING.id])

    expect(await readdir(root)).toEqual(['jobs.json'])
  })

  /**
   * The collector writes into whichever project is open, so a job picked up under another one
   * would land its assets in the wrong library. Each project reads back only its own.
   */
  it('hands a project only the jobs that belong to it', async () => {
    await store.write([RUNNING, OTHER], [RUNNING.id, OTHER.id])

    expect(await store.read(PROJECT)).toEqual([RUNNING])
    expect(await store.read(ELSEWHERE)).toEqual([OTHER])
  })

  /**
   * A session answers for the jobs it knows about and for no others. Written as "replace this
   * project's slice", a session holding jobs of two projects would file them all under one.
   */
  it('replaces what the session answers for, and leaves the rest alone', async () => {
    await store.write([OTHER], [OTHER.id])
    await store.write([RUNNING], [RUNNING.id])

    expect(await store.read(ELSEWHERE)).toEqual([OTHER])
    expect(await store.read(PROJECT)).toEqual([RUNNING])
  })

  it('forgets a job the session no longer holds', async () => {
    await store.write([RUNNING], [RUNNING.id])
    await store.write([], [RUNNING.id])

    expect(await store.read(PROJECT)).toEqual([])
  })

  /**
   * A file on disk is untrusted input: anything may have edited it, and a half-written entry
   * resumed as if it were whole would poll a job id that is not one.
   */
  it('keeps the entries that are whole and drops the ones that are not', async () => {
    await writeFile(
      join(root, 'jobs.json'),
      JSON.stringify([RUNNING, { id: 'job_half', remoteId: 'job_remote' }, 'not an entry']),
      'utf8',
    )

    expect(await store.read(PROJECT)).toEqual([RUNNING])
  })

  // A blank id is the shape a hand-rolled guard lets through, and it polls a job that is not one.
  it('drops an entry whose remote id is blank', async () => {
    await writeFile(join(root, 'jobs.json'), JSON.stringify([{ ...RUNNING, remoteId: '' }]), 'utf8')

    expect(await store.read(PROJECT)).toEqual([])
  })

  it('starts the studio rather than refuse to, on a file that is not JSON at all', async () => {
    await writeFile(join(root, 'jobs.json'), 'not json', 'utf8')

    expect(await store.read(PROJECT)).toEqual([])
  })

  // Long enough for the longest job the API has; past it, a note is rubbish rather than work.
  it('sweeps a note nobody came back for', async () => {
    const stale = { ...RUNNING, createdAt: new Date(NOW - JOB_NOTE_LIFETIME_MS - 1).toISOString() }
    await writeFile(join(root, 'jobs.json'), JSON.stringify([stale]), 'utf8')

    expect(await store.read(PROJECT)).toEqual([])
  })

  // Written concurrently, the older list could otherwise land last and resurrect finished jobs.
  it('lands the last write last, whatever order the writes were started in', async () => {
    const second: PersistedJob = { ...RUNNING, id: 'job_second' }

    await Promise.all([
      store.write([RUNNING], [RUNNING.id, second.id]),
      store.write([second], [RUNNING.id, second.id]),
    ])

    expect(await store.read(PROJECT)).toEqual([second])
  })

  /**
   * A write rebuilds the file from what it read, so reading "nothing" from a file that is there
   * but momentarily unreadable would delete every other project's pending work in one pass.
   */
  it('refuses to write rather than rebuild from a file it could not read', async () => {
    const unreadable = createJobStore(() => join(root, 'no-such-folder'))

    // A folder in the path that does not exist answers ENOTDIR, not ENOENT on the file itself.
    await writeFile(join(root, 'jobs.json'), JSON.stringify([RUNNING]), 'utf8')
    const blocked = createJobStore(() => join(root, 'jobs.json'))

    await expect(blocked.write([], [])).rejects.toThrow()
    // The one whose folder is simply absent is a first launch, and writes as one.
    await expect(unreadable.read(PROJECT)).resolves.toEqual([])
  })

  /**
   * A write that fails is the guarantee this store exists for failing: it has to say so rather
   * than resolve, and the caller is the one place that can put it in the log.
   */
  it('reports a write it could not make at all', async () => {
    // A folder where the staging copy goes: the write is refused without the file being touched.
    await mkdir(join(root, 'jobs.json.staging'))

    await expect(store.write([RUNNING], [RUNNING.id])).rejects.toThrow()
  })

  // Quit does not wait for a write it never learned about, so the store has to say when it is done.
  it('settles the writes in flight when asked to', async () => {
    void store.write([RUNNING], [RUNNING.id])
    await store.flush()

    expect(await store.read(PROJECT)).toEqual([RUNNING])
  })
})
