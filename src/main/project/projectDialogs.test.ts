import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setWindowLanguage } from '@main/window/language'
import type { AskUser } from './documentDialogs'
import { askLeaveWithJobs, askTrashProject, askUseOccupiedFolder } from './projectDialogs'

type Shown = Parameters<AskUser>[0]

const asking = (answer: number) => {
  const shown: Shown[] = []
  const ask: AskUser = options => {
    shown.push(options)
    return Promise.resolve(answer)
  }
  return { ask, shown }
}

beforeEach(() => {
  vi.clearAllMocks()
  setWindowLanguage('en')
})

// The button arrangement — cancel first, and on both the default and the dismissal — belongs to
// `askConfirm` and is checked with it. What is this question's own is the wording.
describe('asking before laying a project into an occupied folder', () => {
  it('goes ahead only on the confirming button', async () => {
    await expect(askUseOccupiedFolder(asking(1).ask, 'Reel')).resolves.toBe(true)
    await expect(askUseOccupiedFolder(asking(0).ask, 'Reel')).resolves.toBe(false)
  })

  it('names the folder it is about to write in', async () => {
    const { ask, shown } = asking(0)
    await askUseOccupiedFolder(ask, 'Bande-annonce')

    expect(shown[0]?.message).toContain('Bande-annonce')
    expect(shown[0]?.message).not.toContain('{{folder}}')
  })

  /**
   * Two promises, and the second is the one that bites: the folder BECOMES the project root, so
   * saying yes on `~/Documents` makes every folder under it un-creatable afterwards. A wording
   * that only reassured about the files read as "may I add something here", which is not the
   * question being asked.
   */
  it('says both what happens to the folder and what happens to its files', async () => {
    const { ask, shown } = asking(0)
    await askUseOccupiedFolder(ask, 'Reel')

    expect(shown[0]?.detail).toContain('BECOME the project')
    expect(shown[0]?.detail).toContain('Nothing already there is changed or moved')
  })

  it('speaks the language the windows speak', async () => {
    setWindowLanguage('fr')
    const { ask, shown } = asking(0)
    await askUseOccupiedFolder(ask, 'Reel')

    expect(shown[0]?.buttons).toEqual(['Annuler', 'Installer ici'])
  })
})

/**
 * The generations are not at risk — the manager files them nowhere but in their own project. What
 * this question exists for is that they leave the bar, and a studio with no project open has no
 * surface left that could say so.
 */
describe('asking before closing a project with generations running', () => {
  it('closes only on the confirming button', async () => {
    await expect(askLeaveWithJobs(asking(1).ask, 2)).resolves.toBe(true)
    await expect(askLeaveWithJobs(asking(0).ask, 2)).resolves.toBe(false)
  })

  // The count is in the detail and the title carries none: this file has no plural forms, and a
  // title built from a number would read « 1 générations » on a lone job.
  it('says how many are running, without putting the number in the title', async () => {
    const { ask, shown } = asking(0)
    await askLeaveWithJobs(ask, 3)

    expect(shown[0]?.detail).toContain('3')
    expect(shown[0]?.detail).not.toContain('{{count')
    expect(shown[0]?.message).not.toMatch(/\d/)
  })

  // The promise the question is worth asking for: what is running is not lost, only out of sight.
  it('says the work is waiting rather than lost', async () => {
    const { ask, shown } = asking(0)
    await askLeaveWithJobs(ask, 1)

    expect(shown[0]?.detail).toContain('carry on')
    expect(shown[0]?.detail).toContain('open it again')
  })
})

/**
 * The one gesture of the shelf that cannot be taken back — the three others are shortcuts a
 * reopening puts right. Asked here rather than behind `project.trash`, which the wire can call:
 * a native dialog raised there would stand for good.
 */
describe('asking before a project folder goes to the trash', () => {
  it('bins only on the confirming button', async () => {
    await expect(askTrashProject(asking(1).ask, 'Reel')).resolves.toBe(true)
    await expect(askTrashProject(asking(0).ask, 'Reel')).resolves.toBe(false)
  })

  it('names the project it is about to take, so the answer is about that one', async () => {
    const { ask, shown } = asking(0)
    await askTrashProject(ask, 'Bande-annonce')

    expect(shown[0]?.message).toContain('Bande-annonce')
    expect(shown[0]?.message).not.toContain('{{name}}')
  })

  // Both halves of the promise: the folder goes whole, and the way back is the system's alone.
  it('says the whole folder goes, and that the studio cannot put it back', async () => {
    const { ask, shown } = asking(0)
    await askTrashProject(ask, 'Reel')

    expect(shown[0]?.detail).toContain('everything in it')
    expect(shown[0]?.detail).toContain('cannot put them back')
  })

  it('speaks the language the windows speak', async () => {
    setWindowLanguage('fr')
    const { ask, shown } = asking(0)
    await askTrashProject(ask, 'Reel')

    expect(shown[0]?.buttons).toEqual(['Annuler', 'Mettre à la corbeille'])
  })
})
