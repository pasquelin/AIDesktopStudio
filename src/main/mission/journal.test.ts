import { appendFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addMissionStep,
  createMission,
  createMissionStep,
  transitionMission,
  transitionMissionStep,
  type MissionClock,
} from '@shared/domain/mission'
import { createMissionJournal, MISSION_JOURNAL_VERSION } from './journal'

function clock(): MissionClock {
  let id = 0
  return { now: () => '2026-09-04T10:00:00.000Z', newId: () => String(++id) }
}

describe('mission journal', () => {
  it('restores the latest version of every mission across a restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-missions-'))
    const time = clock()
    const journal = createMissionJournal(() => root, time.now)
    const first = createMission('First', time)
    const second = createMission('Second', time)
    await journal.append(first)
    await journal.append(transitionMission(first, 'planning', time.now()))
    await journal.append(second)

    const reopened = createMissionJournal(() => root, time.now)
    expect(await reopened.read()).toMatchObject([
      { id: first.id, state: 'planning' },
      { id: second.id, state: 'created' },
    ])
  })

  it('migrates an unversioned line and ignores a corrupt line', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-missions-'))
    const time = clock()
    const mission = createMission('Legacy', time)
    const legacy = { ...mission, revision: undefined }
    await appendFile(
      join(root, 'missions.ndjson'),
      [JSON.stringify({ mission: legacy }), 'not json'].join('\n'),
    )

    expect(await createMissionJournal(() => root, time.now).read()).toEqual([mission])
  })

  it('separates the first append from a truncated crash tail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-missions-'))
    const time = clock()
    await appendFile(join(root, 'missions.ndjson'), '{"v":1,"mission":')
    const journal = createMissionJournal(() => root, time.now)
    const mission = createMission('After crash', time)

    await journal.append(mission)

    expect(await createMissionJournal(() => root, time.now).read()).toEqual([mission])
  })

  it('refuses a future journal rather than fork its chronology', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-missions-'))
    const time = clock()
    await appendFile(
      join(root, 'missions.ndjson'),
      JSON.stringify({ v: MISSION_JOURNAL_VERSION + 1, mission: createMission('Future', time) }),
    )

    await expect(createMissionJournal(() => root, time.now).read()).rejects.toThrow(
      'mission journal version 2 is newer than supported',
    )
  })

  it('pauses an action whose result was not journalled before shutdown', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-missions-'))
    const time = clock()
    let mission = createMission('Act', time)
    const step = createMissionStep(
      mission.id,
      'Create',
      { kind: 'action', call: { action: 'project.create', input: {} } },
      time,
    )
    mission = addMissionStep(mission, step, time.now())
    mission = transitionMission(
      transitionMission(mission, 'planning', time.now()),
      'ready',
      time.now(),
    )
    mission = transitionMission(mission, 'running', time.now())
    mission = transitionMissionStep(mission, step.id, 'ready', time.now())
    mission = transitionMissionStep(mission, step.id, 'running', time.now())
    const journal = createMissionJournal(() => root, time.now)
    await journal.append(mission)

    expect(await journal.read()).toMatchObject([
      { state: 'paused', waits: [{ kind: 'recovery', stepId: step.id }] },
    ])
  })

  it('flushes every queued append before shutdown', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-missions-'))
    const time = clock()
    const journal = createMissionJournal(() => root, time.now)
    void journal.append(createMission('Queued', time))
    await journal.flush()

    expect(await readFile(join(root, 'missions.ndjson'), 'utf8')).toContain('Queued')
  })
})
