import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isMissing, writeQueue } from '@main/persistence'
import { recoverInterruptedMission, type Mission } from '@shared/domain/mission'
import { parseMission } from './validation'

export const MISSION_JOURNAL_VERSION = 1
const FILE_NAME = 'missions.ndjson'

type MissionJournalLine = {
  readonly v: typeof MISSION_JOURNAL_VERSION
  readonly mission: unknown
}

export type MissionJournal = {
  read: () => Promise<readonly Mission[]>
  append: (mission: Mission) => Promise<void>
  flush: () => Promise<void>
}

function missionOfLine(line: string): Mission | null {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  const migrated = migrateMissionLine(value)
  return migrated ? parseMission(migrated.mission) : null
}

function migrateMissionLine(value: unknown): MissionJournalLine | null {
  if (typeof value !== 'object' || value === null || !('mission' in value)) return null
  if (!('v' in value)) return { v: MISSION_JOURNAL_VERSION, mission: value.mission }
  if (typeof value.v === 'number' && value.v > MISSION_JOURNAL_VERSION) {
    throw new Error(`mission journal version ${value.v} is newer than supported`)
  }
  return value.v === MISSION_JOURNAL_VERSION
    ? { v: MISSION_JOURNAL_VERSION, mission: value.mission }
    : null
}

async function separatorBeforeAppend(path: string): Promise<string> {
  try {
    const content = await readFile(path, 'utf8')
    return content.length > 0 && !content.endsWith('\n') ? '\n' : ''
  } catch (error) {
    if (isMissing(error)) return ''
    throw error
  }
}

export function createMissionJournal(
  userDataPath: () => string,
  now: () => string,
): MissionJournal {
  const fileOf = (): string => join(userDataPath(), FILE_NAME)
  const queue = writeQueue()
  let separator: Promise<string> | undefined

  return {
    read: async () => {
      let content: string
      try {
        content = await readFile(fileOf(), 'utf8')
      } catch (error) {
        if (isMissing(error)) return []
        throw error
      }
      const latest = new Map<string, Mission>()
      for (const line of content.split('\n')) {
        const mission = missionOfLine(line)
        if (mission) latest.set(mission.id, recoverInterruptedMission(mission, now()))
      }
      return [...latest.values()]
    },
    append: mission =>
      queue.next(async () => {
        await mkdir(userDataPath(), { recursive: true })
        separator ??= separatorBeforeAppend(fileOf())
        const line: MissionJournalLine = { v: MISSION_JOURNAL_VERSION, mission }
        await appendFile(fileOf(), `${await separator}${JSON.stringify(line)}\n`, 'utf8')
        separator = Promise.resolve('')
      }),
    flush: queue.settled,
  }
}
