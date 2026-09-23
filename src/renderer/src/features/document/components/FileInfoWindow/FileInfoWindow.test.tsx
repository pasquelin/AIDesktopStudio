import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset, AssetChanges } from '@shared/domain/asset'
import { fileInfoRoute, type FileFacts } from '@shared/domain/fileInfo'
import type { CopyGroup } from '@shared/domain/fileCopies'
import type { FileUse } from '@shared/domain/fileUse'
import type { GitRepository } from '@shared/domain/git'
import { installFakeBridge } from '@/services/fakeBridge'
import { useGit } from '@/stores/git'
import { gitReadyRepository } from '@/stores/git-fixtures'
import { FileInfoWindow } from './FileInfoWindow'

const VERSIONED = gitReadyRepository({
  files: [{ path: 'Images/facade.jpg', change: 'modified', stage: 'unstaged' }],
})

const TWICE: CopyGroup = {
  hash: 'ab12cd34',
  copies: [
    {
      assetId: 'asset_facade',
      path: 'Images/facade.jpg',
      name: 'facade',
      bytes: 2_097_152,
      addedAt: '2026-08-16T09:30:00.000Z',
      store: 'visible',
    },
    {
      assetId: 'asset_twin',
      path: 'Rushes/facade.jpg',
      name: 'facade',
      bytes: 2_097_152,
      addedAt: '2026-08-17T09:30:00.000Z',
      store: 'visible',
    },
  ],
}

const FACTS: FileFacts = {
  kind: 'file',
  bytes: 2_097_152,
  createdAt: '2026-08-16T09:30:00.000Z',
  modifiedAt: '2026-08-17T18:05:00.000Z',
}

const PICTURE: Asset = {
  id: 'asset_facade',
  name: 'facade',
  type: 'image',
  location: 'local',
  path: 'Images/facade.jpg',
  width: 1024,
  height: 768,
  hash: 'ab12cd34',
  tags: [],
  createdAt: '2026-08-16T09:30:00.000Z',
}

function open(
  path: string,
  facts: FileFacts | null,
  asset: Asset | null = null,
  repository: GitRepository = { kind: 'uninitialised' },
  uses: FileUse[] = [],
  copies: CopyGroup[] = [],
) {
  const update = vi.fn((_assetId: string, changes: AssetChanges) =>
    Promise.resolve({ ...PICTURE, ...changes, tags: [...(changes.tags ?? PICTURE.tags)] }),
  )
  window.location.hash = fileInfoRoute(path)
  installFakeBridge({
    project: {
      fileFacts: () => Promise.resolve(facts),
      fileUses: () => Promise.resolve(uses),
      fileCopies: () => Promise.resolve(copies),
    },
    // `update` is what `RoleField` calls when a role is corrected — see the case below.
    assets: { search: () => Promise.resolve(asset ? [asset] : []), update },
    git: { read: () => Promise.resolve(repository) },
  })

  return { update }
}

describe('FileInfoWindow', () => {
  beforeEach(() => {
    window.location.hash = ''
    useGit.setState({ repository: { kind: 'no-project' }, busy: false, message: '', amend: false })
  })

  /**
   * The arbitration this window was built on: a `.txt` will never have a catalogue row, so the
   * two runs that read one are ABSENT rather than shown empty.
   */
  it('shows the disk alone for a file the catalogue does not know', async () => {
    open('Notes/brief.txt', { ...FACTS, bytes: 4096 })
    render(<FileInfoWindow />)

    expect(await screen.findByText('Notes/brief.txt')).toBeInTheDocument()
    expect(screen.queryByText('Catalogue')).not.toBeInTheDocument()
    expect(screen.queryByText('Média')).not.toBeInTheDocument()
  })

  /** One block: every run is on screen at once, so nothing has to be gone looking for. */
  it('draws what the catalogue holds under the disk, without a control to reach it', async () => {
    open('Images/facade.jpg', FACTS, PICTURE)
    render(<FileInfoWindow />)

    expect(await screen.findByText('Média')).toBeInTheDocument()
    expect(screen.getByText('Catalogue')).toBeInTheDocument()
    expect(screen.getByText('1024 × 768')).toBeInTheDocument()
    expect(screen.getByText('ab12cd34')).toBeInTheDocument()
  })

  /**
   * The other half of « absent rather than empty », and the one the arbitration turns on: a row
   * the catalogue holds WITHOUT dimensions earns « Catalogue » and no « Média ». Without this
   * case the whole predicate collapses to `asset !== null` with every other case still green.
   */
  it('leaves out Média for a catalogued file whose row carries no dimensions', async () => {
    open('Notes/brief.txt', FACTS, { ...PICTURE, width: undefined, height: undefined })
    render(<FileInfoWindow />)

    expect(await screen.findByText('Catalogue')).toBeInTheDocument()
    expect(screen.queryByText('Média')).not.toBeInTheDocument()
  })

  /** The window is named by a right-click, and the file can go before anyone reads it. */
  it('says the entry has gone rather than drawing an empty pane', async () => {
    open('Images/facade.jpg', null)
    render(<FileInfoWindow />)

    expect(
      await screen.findByText('Cette entrée n’est plus dans le dossier du projet.'),
    ).toBeInTheDocument()
  })

  /**
   * A folder is not a domain — `ProjectItem` says so — and its own entry weighs ninety-six bytes,
   * which says nothing about what it holds. Both rows are left out rather than filled with a
   * number that would be read as the folder's weight.
   */
  it('leaves out the type and the size of a folder', async () => {
    open('Images', { ...FACTS, kind: 'folder' })
    render(<FileInfoWindow />)

    expect(await screen.findByText('Dossier')).toBeInTheDocument()
    expect(screen.queryByText('Type')).not.toBeInTheDocument()
    expect(screen.queryByText('Taille')).not.toBeInTheDocument()
  })

  /**
   * §11's S3 on screen: what a person needs before they move or delete a file is which of their
   * own documents would notice (E-19, E-21).
   */
  it('names the documents that cite the file', async () => {
    open('Images/facade.jpg', FACTS, PICTURE, { kind: 'uninitialised' }, [
      {
        title: 'Niveau',
        path: 'Repérages/Niveau.gltf',
        kind: 'scene',
        used: ['Images/facade.jpg'],
      },
    ])
    render(<FileInfoWindow />)

    expect(await screen.findByText('Utilisé par')).toBeInTheDocument()
    expect(screen.getByText('Niveau')).toBeInTheDocument()
  })

  // Empty is an ANSWER here, unlike the catalogue run: the question applies to every file.
  it('says in words that nothing cites the file', async () => {
    open('Images/facade.jpg', FACTS, PICTURE)
    render(<FileInfoWindow />)

    expect(
      await screen.findByText('Aucun document du projet ne cite ce fichier.'),
    ).toBeInTheDocument()
  })

  // A folder is cited by nobody, and saying so would read as a fact rather than as a question
  // that does not apply.
  it('asks nothing about what cites a folder', async () => {
    open('Images', { ...FACTS, kind: 'folder' })
    render(<FileInfoWindow />)

    expect(await screen.findByText('Dossier')).toBeInTheDocument()
    expect(screen.queryByText('Utilisé par')).not.toBeInTheDocument()
  })

  /** The project's own version control, read for THIS file — git's word, not a guess at it. */
  it('says what git holds against the file when the project is versioned', async () => {
    open('Images/facade.jpg', FACTS, PICTURE, VERSIONED)
    render(<FileInfoWindow />)

    expect(await screen.findByText('main')).toBeInTheDocument()
    // Read off the row rather than off the page: « Modifié le » sits in Général two runs above,
    // so a bare text query would pass for a reason that has nothing to do with git.
    expect(screen.getByTitle('État').parentElement).toHaveTextContent('Modifié')
  })

  /**
   * Git reports FILES. A folder has no line of its own there, so a Git run for one would answer
   * about the project instead of about the entry that was right-clicked.
   */
  it('draws no Git run for a folder, versioned project or not', async () => {
    open('Images', { ...FACTS, kind: 'folder' }, null, VERSIONED)
    render(<FileInfoWindow />)

    expect(await screen.findByText('Dossier')).toBeInTheDocument()
    expect(screen.queryByText('Git')).not.toBeInTheDocument()
  })

  /**
   * An extension cannot always tell — a normal map and an albedo are both PNGs — so the guess is
   * offered rather than imposed, wherever the studio has a row to remember the answer in.
   */
  it('offers to correct the role of a file the catalogue holds', async () => {
    const { update } = open('Images/facade.jpg', FACTS, PICTURE)
    render(<FileInfoWindow />)

    const role = await screen.findByRole('combobox', { name: 'Rôle' })
    await userEvent.selectOptions(role, 'skybox')

    await waitFor(() => expect(update).toHaveBeenCalledWith('asset_facade', { type: 'skybox' }))
    // 🛑 And it STAYS: this window holds its asset in a state only a folder change refreshes,
    // and retyping moves nothing on disk — so the control used to snap back to the old role
    // the moment it was corrected, with nothing on screen to say the write had gone through.
    expect(role).toHaveValue('skybox')
  })

  /** Read out, never offered: there is nowhere to write a correction down. */
  it('reads the role out for a file no catalogue holds, and offers nothing else either', async () => {
    open('Notes/brief.txt', { ...FACTS, bytes: 4096 })
    render(<FileInfoWindow />)

    expect(await screen.findByText('Notes/brief.txt')).toBeInTheDocument()
    expect(screen.getByText('Autre')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('the other files holding these bytes', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  /**
   * §16, narrowed to one file. The fingerprint is what makes the question askable at all — so a
   * `.txt` the catalogue holds no row for gets no run, and a row that HAS one gets an answer
   * either way: these other paths, or none.
   */
  it('names the other files holding these bytes, and says when there are none', async () => {
    open('Images/facade.jpg', FACTS, PICTURE, { kind: 'uninitialised' }, [], [TWICE])

    render(<FileInfoWindow />)

    // The file this window is open on is not one of « the others »: it is the subject.
    expect(await screen.findByText('Rushes/facade.jpg')).toBeInTheDocument()
    expect(screen.queryByText('Aucun autre fichier du projet ne porte ces octets.')).toBeNull()
  })

  it('asks nothing about the copies of a file no fingerprint identifies', async () => {
    open('Notes/brief.txt', { ...FACTS, bytes: 4096 })
    render(<FileInfoWindow />)

    await screen.findByText('Notes/brief.txt')
    expect(screen.queryByText('Copies')).toBeNull()
  })
})
