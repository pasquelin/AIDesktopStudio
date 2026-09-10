import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_DERIVED_CACHE, type DerivedCacheReport } from '@shared/domain/derivedCache'
import { COPIES_ROUTE, type CopyGroup } from '@shared/domain/fileCopies'
import type { FileUse } from '@shared/domain/fileUse'
import { installFakeBridge } from '@/services/fakeBridge'
import { CopiesWindow } from './CopiesWindow'

const TWICE: CopyGroup = {
  hash: 'ab12cd34',
  copies: [
    {
      assetId: 'asset_a',
      path: 'Images/facade.jpg',
      name: 'facade',
      bytes: 1_048_576,
      addedAt: '2026-09-01T09:00:00.000Z',
      store: 'visible',
    },
    {
      assetId: 'asset_b',
      path: 'Rushes/facade.jpg',
      name: 'facade',
      bytes: 1_048_576,
      addedAt: '2026-09-02T09:00:00.000Z',
      store: 'visible',
    },
  ],
}

const HELD: DerivedCacheReport = {
  stores: [{ store: 'proxies', files: 3, bytes: 4_194_304 }],
  bytes: 4_194_304,
  clearedRows: 0,
}

function open(
  groups: CopyGroup[],
  uses: FileUse[] = [],
  cache: DerivedCacheReport = NO_DERIVED_CACHE,
  purged: DerivedCacheReport = NO_DERIVED_CACHE,
) {
  const purgeDerivedCache = vi.fn(() => Promise.resolve(purged))
  const trashFiles = vi.fn(() =>
    Promise.resolve({
      done: [{ from: 'Rushes/facade.jpg', to: '' }],
      refused: [],
      batch: 'batch-fake',
    }),
  )
  window.location.hash = `#${COPIES_ROUTE}`
  installFakeBridge({
    project: {
      fileCopies: () => Promise.resolve(groups),
      fileUses: () => Promise.resolve(uses),
      derivedCache: () => Promise.resolve(cache),
      purgeDerivedCache,
      trashFiles,
    },
  })

  return { purgeDerivedCache, trashFiles }
}

describe('CopiesWindow', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('says the project holds nothing twice, rather than showing an empty list', async () => {
    open([])
    render(<CopiesWindow />)

    expect(await screen.findByText(/pas présent deux fois|présent deux fois/i)).toBeInTheDocument()
  })

  it('names every path of a group and how much a single copy would give back', async () => {
    open([TWICE])
    render(<CopiesWindow />)

    expect(await screen.findByText('Images/facade.jpg')).toBeInTheDocument()
    expect(screen.getByText('Rushes/facade.jpg')).toBeInTheDocument()
    expect(screen.getByText(/Une seule copie gardée rendrait\s1,0\sMio/)).toBeInTheDocument()
  })

  /**
   * 🛑 The citation reader over-reports — it matches on the name and on the catalogue ids — so
   * the row must say these documents MENTION the file. « No document mentions it » is the half
   * that is established, and it is the one a person acts on.
   */
  it('says which documents mention a copy, and says when none does', async () => {
    open(
      [TWICE],
      [
        {
          title: 'Affiche',
          path: 'Documents/affiche.iaimg',
          kind: 'image',
          used: ['Images/facade.jpg'],
        },
      ],
    )
    render(<CopiesWindow />)

    expect(await screen.findByText(/mentionnent/)).toBeInTheDocument()
    expect(screen.getByText(/Aucun document ne le mentionne/)).toBeInTheDocument()
  })

  /** Nothing on this window deletes on its own: the row goes through the ordinary trash. */
  it('sends one row at a time to the ordinary trash', async () => {
    const { trashFiles } = open([TWICE])
    render(<CopiesWindow />)

    await userEvent.click((await screen.findAllByRole('button', { name: 'Corbeille' }))[1]!)

    expect(trashFiles).toHaveBeenCalledWith(['Rushes/facade.jpg'])
  })

  it('frees the rebuildable stores only when asked, and says what came back', async () => {
    const { purgeDerivedCache } = open([], [], HELD, {
      stores: [],
      bytes: 4_194_304,
      clearedRows: 3,
    })
    render(<CopiesWindow />)

    const free = await screen.findByRole('button', { name: 'Libérer' })
    expect(purgeDerivedCache).not.toHaveBeenCalled()

    await userEvent.click(free)

    await waitFor(() => expect(screen.getByText(/rendus au disque/)).toBeInTheDocument())
  })

  /** A purge that never ran and a purge that freed nothing must not read the same. */
  it('says the purge did not run when the pipeline was still deriving', async () => {
    open([], [], HELD, { ...NO_DERIVED_CACHE, refused: 'deriving' })
    render(<CopiesWindow />)

    await userEvent.click(await screen.findByRole('button', { name: 'Libérer' }))

    await waitFor(() =>
      expect(screen.getByText(/Réessayez quand les imports seront finis/)).toBeInTheDocument(),
    )
    expect(screen.queryByText(/rendus au disque/)).toBeNull()
  })

  it('offers nothing to free when the stores are empty', async () => {
    open([], [], NO_DERIVED_CACHE)
    render(<CopiesWindow />)

    expect(await screen.findByRole('button', { name: 'Libérer' })).toBeDisabled()
  })
})
