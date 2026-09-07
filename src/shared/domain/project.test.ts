import { describe, expect, it } from 'vitest'
import type { AccountSummary } from './account'
import {
  listedAt,
  planProjectAccount,
  projectPathFor,
  projectPickerFolder,
  landedInDefaultFolder,
  projectsByCreation,
  movedRecentProject,
  projectName,
  RECENT_DOCUMENTS_MAX,
  RECENT_PROJECTS_MAX,
  withoutProjectDocuments,
  withRecentDocument,
  withRecentProject,
  type Project,
  type RecentDocument,
  type RecentProject,
} from './project'

function project(path: string): Project {
  return {
    path,
    manifest: { version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01' },
  }
}

function recent(count: number): RecentProject[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `/projects/p${index}`,
    openedAt: '2026-01-01T00:00:00Z',
  }))
}

describe('remembering an opened project', () => {
  // Storage order, which is what decides eviction — never what a screen draws. See the suite
  // below, which holds the order the eye gets.
  it('puts it first, and carries the date the project was MADE', () => {
    const list = withRecentProject(recent(3), project('/projects/new'), '2026-08-08T10:00:00Z')

    expect(list[0]).toEqual({
      path: '/projects/new',
      openedAt: '2026-08-08T10:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    })
  })

  it('lists a project once however often it is reopened', () => {
    const once = withRecentProject(recent(3), project('/projects/p1'), '2026-08-08T10:00:00Z')
    const twice = withRecentProject(once, project('/projects/p1'), '2026-08-08T11:00:00Z')

    expect(twice.filter(entry => entry.path === '/projects/p1')).toHaveLength(1)
    expect(twice[0]?.openedAt).toBe('2026-08-08T11:00:00Z')
    expect(twice).toHaveLength(3)
  })

  /**
   * 🛑 The folder, and NOTHING beside it. Stored as well, the name was a third copy — a rename
   * had to write it separately, and a shelf holding the old one listed one folder twice.
   */
  it('remembers a folder and reads its name off it', () => {
    const list = withRecentProject([], project('/somewhere/Summer campaign'), 'now')

    expect(list[0]).not.toHaveProperty('name')
    expect(projectName(list[0]?.path ?? '')).toBe('Summer campaign')
  })

  it('stays bounded, dropping the one opened longest ago', () => {
    const full = recent(RECENT_PROJECTS_MAX)
    const list = withRecentProject(full, project('/projects/new'), 'now')

    expect(list).toHaveLength(RECENT_PROJECTS_MAX)
    expect(list.map(entry => entry.path)).not.toContain(`/projects/p${RECENT_PROJECTS_MAX - 1}`)
  })
})

/**
 * The order a screen draws, which is deliberately NOT the stored one. Both the home's panel and the
 * title bar's menu read this: one list read in two orders is a list nobody trusts.
 */
describe('listing the projects for the eye', () => {
  const made = (
    path: string,
    createdAt: string,
    openedAt = '2026-01-01T00:00:00Z',
  ): RecentProject => ({ path, openedAt, createdAt })

  it('puts the newest-MADE project first, whatever order they are stored in', () => {
    const list = projectsByCreation([
      made('/old', '2026-01-01T00:00:00Z'),
      made('/newest', '2026-08-13T00:00:00Z'),
      made('/middle', '2026-05-01T00:00:00Z'),
    ])

    expect(list.map(entry => entry.path)).toEqual(['/newest', '/middle', '/old'])
  })

  /**
   * The defect this whole key exists for: opening a project rewrites the stored order, and a list
   * drawn from it therefore moved the row that had just been clicked to the top. The creation date
   * is the one key an opening cannot touch, so the two orders below must be identical.
   */
  it('does not move a project because it was just opened', () => {
    const before = [made('/a', '2026-01-01T00:00:00Z'), made('/b', '2026-02-01T00:00:00Z')]
    const after = withRecentProject(before, project('/a'), '2026-08-13T10:00:00Z')

    expect(projectsByCreation(after).map(entry => entry.path)).toEqual(
      projectsByCreation(before).map(entry => entry.path),
    )
  })

  /**
   * An entry stored before `createdAt` existed. Falling back to `openedAt` rather than to the epoch
   * is the whole point: sorted as the epoch, every project a user already had would be buried under
   * the first one made after the upgrade.
   */
  it('falls back to the opening date for an entry that predates the field', () => {
    const legacy: RecentProject = { path: '/legacy', openedAt: '2026-08-12T00:00:00Z' }

    expect(listedAt(legacy)).toBe('2026-08-12T00:00:00Z')
    expect(projectsByCreation([made('/older', '2026-03-01T00:00:00Z'), legacy])[0]?.path).toBe(
      '/legacy',
    )
  })

  it('breaks a tie on the path, so two projects made at once never swap between renders', () => {
    const same = '2026-08-13T00:00:00Z'
    const one = projectsByCreation([made('/b', same), made('/a', same)])
    const other = projectsByCreation([made('/a', same), made('/b', same)])

    expect(one.map(entry => entry.path)).toEqual(['/a', '/b'])
    expect(other.map(entry => entry.path)).toEqual(one.map(entry => entry.path))
  })

  it('leaves the list it was given alone', () => {
    const stored = [made('/a', '2026-01-01T00:00:00Z'), made('/b', '2026-08-01T00:00:00Z')]
    projectsByCreation(stored)

    expect(stored.map(entry => entry.path)).toEqual(['/a', '/b'])
  })
})

/**
 * Renaming an entry of the shelf. The name is STORED rather than derived from the folder, so the
 * manifest write and this one belong together — otherwise the project goes on being listed under
 * its old name until it is next opened.
 */
describe('renaming a remembered project', () => {
  const entry = (path: string): RecentProject => ({
    path,
    openedAt: '2026-08-01T00:00:00Z',
    createdAt: '2026-05-01T00:00:00Z',
  })

  it('moves the one entry and no other, the name following its folder', () => {
    const list = movedRecentProject([entry('/a'), entry('/b')], '/b', '/Renamed')

    expect(list.map(one => projectName(one.path))).toEqual(['a', 'Renamed'])
  })

  /**
   * 🛑 The destination is dropped first. Left in, renaming onto a folder the shelf already knew
   * listed it TWICE — two rows for one folder, which is what a person saw on 2026-08-31.
   */
  it('leaves one row where the shelf already knew the folder moved to', () => {
    const list = movedRecentProject([entry('/a'), entry('/b')], '/a', '/b')

    expect(list.map(one => one.path)).toEqual(['/b'])
  })

  /**
   * A rename is not an opening. Stamping either date would move the row in the order the screens
   * read — `createdAt` is the sort key, `openedAt` decides eviction — so a gesture that changes a
   * word would silently reshuffle the list or throw away a different project.
   */
  it('touches neither date, so nothing moves and nothing is evicted differently', () => {
    const before = entry('/a')

    expect(movedRecentProject([before], '/a', '/Renamed')[0]).toEqual({
      ...before,
      path: '/Renamed',
    })
  })

  // The open project need not be a remembered one, so an unknown path is not an error.
  it('leaves a list that does not hold the path alone', () => {
    const list = [entry('/a')]

    expect(movedRecentProject(list, '/elsewhere', '/Renamed')).toEqual(list)
  })

  it('leaves the list it was given alone', () => {
    const list = [entry('/a')]
    movedRecentProject(list, '/a', '/Renamed')

    expect(list[0]?.path).toBe('/a')
  })
})

describe('what a project is called', () => {
  it('is the name of its folder, on either separator', () => {
    expect(projectName('/Users/someone/Mes Projets/jeu1')).toBe('jeu1')
    expect(projectName('C:\\Projets\\jeu1')).toBe('jeu1')
  })

  // macOS writes `Été` as two code points. Read as it came, it would not match the word typed here.
  it('reads a decomposed name as the word it spells', () => {
    expect(projectName('/Projets/E\u0301te\u0301')).toBe('Été')
  })

  /**
   * 🛑 A path a model writes and a picker returns. Read as it came, the name is the empty string —
   * an untitled project in the title bar, the breadcrumb, `projects.list` and the briefing.
   */
  it('reads a folder named with a trailing separator', () => {
    expect(projectName('/Users/x/Projets/jeu1/')).toBe('jeu1')
    expect(projectName('C:\\Projets\\jeu1\\')).toBe('jeu1')
  })

  // Nothing above a volume root is a folder, so there is no name to read — and none to invent.
  it('answers nothing for a path that names no folder', () => {
    expect(projectName('/')).toBe('')
    expect(projectName('')).toBe('')
  })
})

/**
 * Which API key a project works under. The link itself lives in `storage.projectAccounts`, a
 * branch of its own rather than a field of the shelf above: that list is bounded, evicted by
 * opening date, and emptied of an entry whenever an OPENING FAILS. A project on a drive that was
 * not plugged in would have come back on someone else's key, in silence.
 */
describe('planning the account a project opens on', () => {
  const accounts = (activeId: string): AccountSummary[] =>
    [
      { id: 'account_one', name: 'Studio' },
      { id: 'account_two', name: 'Client' },
    ].map(account => ({ ...account, active: account.id === activeId }))

  it('restores the linked account when it is held and not in force', () => {
    expect(planProjectAccount('account_two', accounts('account_one'))).toEqual({
      kind: 'restore',
      account: { id: 'account_two', name: 'Client', active: false },
    })
  })

  // The common case, and the one that must cost nothing: reopening a project already on its key.
  it('keeps the active account when the link already names it', () => {
    expect(planProjectAccount('account_one', accounts('account_one'))).toEqual({ kind: 'keep' })
  })

  // A project made before this was recorded, or made a moment ago.
  it('adopts the active account when nothing is linked', () => {
    expect(planProjectAccount(undefined, accounts('account_one'))).toEqual({ kind: 'adopt' })
  })

  /**
   * Removing a key and adding it back mints a fresh id, so a live key can leave a link naming
   * nothing. Told apart from "no link at all" because only one of the two owes the user a
   * sentence: collapsing them would either warn on every project ever made, or never warn.
   */
  it('reports a link naming an account that is no longer held', () => {
    expect(planProjectAccount('account_gone', accounts('account_one'))).toEqual({ kind: 'missing' })
  })
})

/**
 * Left to the system, the dialog reopens wherever it last was — which after a creation is inside
 * the project just made, so the second project of a session landed within the first.
 */
describe('where the folder dialog should open', () => {
  const madeIn = (path: string): RecentProject => ({
    path,
    openedAt: '2026-08-16T10:00:00Z',
    createdAt: '2026-08-16T10:00:00Z',
  })

  it('answers the preference when the user set one', () => {
    expect(projectPickerFolder('/Users/someone/Projets', [madeIn('/elsewhere/Reel')])).toBe(
      '/Users/someone/Projets',
    )
  })

  // An empty preference means "follow me", which is what the newest project's folder does.
  it('falls back to the folder holding the newest project', () => {
    expect(projectPickerFolder(undefined, [madeIn('/Users/someone/Mes Projets/Reel')])).toBe(
      '/Users/someone/Mes Projets',
    )
  })

  it('reads a Windows path as its own folder rather than as one long name', () => {
    expect(projectPickerFolder(undefined, [madeIn('C:\\Users\\someone\\Projets\\Reel')])).toBe(
      'C:\\Users\\someone\\Projets',
    )
  })

  // A first launch has neither, and the system opening where it likes is the right answer then.
  it('answers nothing when there is no preference and no project yet', () => {
    expect(projectPickerFolder(undefined, [])).toBeUndefined()
  })
})

/**
 * What tells a project it wears two trees: an old project keeps its files under `assets/`, nothing
 * migrates them out, and the import that follows creates `Images/` beside it. The journal says so
 * once — without it, a folder appears on its own and nothing in the app explains it.
 */
describe('an asset filed in the default folder of its kind', () => {
  it('is what the studio just chose a tree for', () => {
    expect(landedInDefaultFolder('Images/Boulder.png', 'Images')).toBe(true)
  })

  /**
   * A second pull writes over the row it finds, which keeps the path it already had — under
   * `assets/img` for a project of that age. Nothing new appeared, so nothing is said.
   */
  it('is not an asset that landed where it already was', () => {
    expect(landedInDefaultFolder('assets/img/Boulder.png', 'Images')).toBe(false)
  })

  // Filed by the user into a folder of their own, which says nothing about which tree was chosen.
  it('is not an asset sitting under a folder of the default one', () => {
    expect(landedInDefaultFolder('Images/Repérages/Boulder.png', 'Images')).toBe(false)
  })

  // An asset linked where the user left it, or one that lives in the library alone.
  it('is not an asset with no file in the project', () => {
    expect(landedInDefaultFolder(undefined, 'Images')).toBe(false)
  })
})

describe('projectPathFor', () => {
  it('puts a bare name under the projects folder', () => {
    expect(projectPathFor('test3', '/Users/x/Projets')).toBe('/Users/x/Projets/test3')
  })

  /**
   * 🛑 The main process only checks that what it receives is ABSOLUTE, and `..` passes that: the
   * folder was created outside the projects folder, on a yes that never named it.
   */
  it('refuses a name that would leave the folder it is put in', () => {
    expect(projectPathFor('../Secret', '/Users/x/Projets')).toBeUndefined()
    expect(projectPathFor('a/b', '/Users/x/Projets')).toBeUndefined()
    expect(projectPathFor('~/ailleurs', '/Users/x/Projets')).toBeUndefined()
  })

  it('leaves an absolute path where it points', () => {
    expect(projectPathFor('/tmp/Ailleurs', '/Users/x/Projets')).toBe('/tmp/Ailleurs')
  })

  // The first project of a machine: no folder is known, so nothing can be composed.
  it('answers nothing where no folder is known', () => {
    expect(projectPathFor('test3', undefined)).toBeUndefined()
  })
})

describe('the shelf of recent documents', () => {
  const entry = (project: string, path: string, openedAt: string): RecentDocument => ({
    project,
    path,
    kind: 'scene',
    openedAt,
  })

  const shelf = (recent: readonly RecentDocument[]): string[] =>
    recent.map(one => `${one.project}:${one.path}`)

  /** Most recently opened first, and that IS the order it is drawn in — unlike the projects. */
  it('puts the one just opened at the top', () => {
    const recent = withRecentDocument(
      [entry('/a', 'Scenes/One.gltf', '2026-09-01T10:00:00.000Z')],
      entry('/a', 'Scenes/Two.gltf', '2026-09-02T10:00:00.000Z'),
    )

    expect(shelf(recent)).toEqual(['/a:Scenes/Two.gltf', '/a:Scenes/One.gltf'])
  })

  it('lists a document opened again once, at the top', () => {
    const recent = withRecentDocument(
      [
        entry('/a', 'Scenes/One.gltf', '2026-09-01T10:00:00.000Z'),
        entry('/a', 'Scenes/Two.gltf', '2026-09-01T11:00:00.000Z'),
      ],
      entry('/a', 'Scenes/One.gltf', '2026-09-02T10:00:00.000Z'),
    )

    expect(shelf(recent)).toEqual(['/a:Scenes/One.gltf', '/a:Scenes/Two.gltf'])
  })

  /** The same path in two projects is two documents — one identity would take the other's row. */
  it("tells one project's document from another's of the same path", () => {
    const recent = withRecentDocument(
      [entry('/a', 'Scenes/One.gltf', '2026-09-01T10:00:00.000Z')],
      entry('/b', 'Scenes/One.gltf', '2026-09-02T10:00:00.000Z'),
    )

    expect(shelf(recent)).toEqual(['/b:Scenes/One.gltf', '/a:Scenes/One.gltf'])
  })

  it('keeps no more than the bound, dropping the oldest', () => {
    let recent: RecentDocument[] = []
    for (let n = 0; n < RECENT_DOCUMENTS_MAX + 3; n += 1) {
      recent = withRecentDocument(
        recent,
        entry('/a', `Scenes/${n}.gltf`, '2026-09-01T10:00:00.000Z'),
      )
    }

    expect(recent).toHaveLength(RECENT_DOCUMENTS_MAX)
    expect(shelf(recent).at(-1)).toBe('/a:Scenes/3.gltf')
  })

  /**
   * Forgetting or binning a project takes its documents with it: each row would otherwise reopen
   * the project that was just dropped, which is the one thing dropping it has to stop.
   */
  it('drops everything a project held when the project goes', () => {
    const recent = withoutProjectDocuments(
      [
        entry('/a', 'Scenes/One.gltf', '2026-09-01T10:00:00.000Z'),
        entry('/b', 'Scenes/Two.gltf', '2026-09-01T11:00:00.000Z'),
      ],
      '/a',
    )

    expect(shelf(recent)).toEqual(['/b:Scenes/Two.gltf'])
  })
})
