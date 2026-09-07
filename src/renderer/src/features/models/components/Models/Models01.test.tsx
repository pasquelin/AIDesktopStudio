import { render, screen, waitFor } from '@testing-library/react'
import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOCAL_RUNTIME,
  type ModelFamily,
  type ModelPage,
  type ModelQuery,
  type ModelSummary,
} from '@shared/domain/model'
import { withQueries } from '@/features/shell/components/query-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { useLayouts } from '@/stores/layouts'
import { useModels } from '@/stores/models'
import { useSettings } from '@/stores/settings'
import { chooseModels } from '@/stores/models-fixtures'
import { Models } from './Models'

function model(id: string, overrides: Partial<ModelSummary> = {}): ModelSummary {
  return {
    id,
    name: `Model ${id}`,
    family: 'image',
    runsOn: SCENARIO_CLOUD,
    source: 'scenario',
    origin: 'official',
    featured: false,
    capabilities: ['txt2img'],
    tags: [],
    ...overrides,
  }
}

function renderPanel(family: ModelFamily = 'image') {
  return render(withQueries(<Models family={family} />))
}

describe('Models panel', () => {
  beforeEach(() => {
    useSettings.setState({ auth: { authenticated: true } })
    // The panel reads the preference too, so a model preferred by one test would be shown as
    // chosen in the next.
    chooseModels()
    useModels.setState({ selected: {}, collections: {} })
    useLayouts.setState({ activeWorkspace: 'image' })
  })

  /**
   * Said only once the panel has nothing else to show — a machine holding local models has rows
   * to draw, and telling it there is no key would hide the very models that need none.
   */
  it('says what to do rather than showing an empty panel without credentials', async () => {
    useSettings.setState({ auth: { authenticated: false, reason: 'missing' } })
    installFakeBridge()
    renderPanel()

    expect(await screen.findByText(/identifiants API/i)).toBeInTheDocument()
  })

  // The studio has to be useful with no account at all: what runs here needs none, and asking
  // for it must not go anywhere near the catalogue.
  it('narrows to this machine and still draws its models when no key is held', async () => {
    useSettings.setState({ auth: { authenticated: false, reason: 'missing' } })
    const searchModels = vi.fn((_query?: ModelQuery): Promise<ModelPage> =>
      Promise.resolve({ items: [model('local_one', { runsOn: LOCAL_RUNTIME })], cursor: null }),
    )
    installFakeBridge({ provider: { searchModels } })

    renderPanel()

    expect(await screen.findByText('Model local_one')).toBeInTheDocument()
    expect(searchModels.mock.calls[0]?.[0]).toMatchObject({ runsOn: LOCAL_RUNTIME })
  })

  // Saying the key is missing without a way to type it leaves the user hunting through menus.
  it('leads to the account settings from the panel that reports the missing key', async () => {
    useSettings.setState({ auth: { authenticated: false, reason: 'missing' } })
    const open = vi.fn(() => Promise.resolve())
    installFakeBridge({ settings: { open } })
    renderPanel()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Configurer les identifiants' }),
    )
    expect(open).toHaveBeenCalledWith('account')
  })

  it('asks only for the models of the family it browses', async () => {
    const searchModels = vi.fn((_query?: ModelQuery): Promise<ModelPage> =>
      Promise.resolve({ items: [], cursor: null }),
    )
    installFakeBridge({ provider: { searchModels } })

    renderPanel('3d')

    await waitFor(() => expect(searchModels).toHaveBeenCalled())
    expect(searchModels.mock.calls[0]?.[0]).toMatchObject({
      family: '3d',
      runsOn: LOCAL_RUNTIME,
    })
  })

  it('shows the models it received', async () => {
    installFakeBridge({
      provider: {
        searchModels: () => Promise.resolve({ items: [model('flux'), model('veo')], cursor: null }),
      },
    })

    renderPanel()

    expect(await screen.findByText('Model flux')).toBeInTheDocument()
    expect(screen.getByText('Model veo')).toBeInTheDocument()
  })

  /**
   * The whole point of the paging: a first request must not walk the catalogue. The bridge is
   * asked for a bounded page and for the next one only when the list nears its end.
   */
  it('asks for a bounded page rather than the whole catalogue', async () => {
    const searchModels = vi.fn((_query?: ModelQuery): Promise<ModelPage> =>
      Promise.resolve({ items: [], cursor: null }),
    )
    installFakeBridge({ provider: { searchModels } })

    renderPanel()

    await waitFor(() => expect(searchModels).toHaveBeenCalled())
    const limit = searchModels.mock.calls[0]?.[0]?.limit ?? 0
    expect(limit).toBeGreaterThan(0)
    expect(limit).toBeLessThanOrEqual(50)
  })

  it('follows the cursor to the next page as the end nears', async () => {
    const pages: ModelPage[] = [
      { items: [model('a')], cursor: 'l:public:1:token' },
      { items: [model('b')], cursor: null },
    ]
    const searchModels = vi.fn((query?: ModelQuery): Promise<ModelPage> =>
      Promise.resolve((query?.cursor ? pages[1] : pages[0]) ?? { items: [], cursor: null }),
    )
    installFakeBridge({ provider: { searchModels } })

    renderPanel()

    expect(await screen.findByText('Model b')).toBeInTheDocument()
    expect(searchModels.mock.calls[1]?.[0]).toMatchObject({ cursor: 'l:public:1:token' })
  })

  /**
   * The registry bounds how many pages one request walks, so a selective filter answers an
   * empty page with a live cursor. Nothing scrolls then — the panel has to ask on its own, or
   * a workspace whose models sit late in the catalogue looks empty.
   */
  it('keeps walking when a page comes back empty but the cursor lives on', async () => {
    const pages: ModelPage[] = [
      { items: [], cursor: 'l:public:0:token' },
      { items: [model('late')], cursor: null },
    ]
    const searchModels = vi.fn((query?: ModelQuery): Promise<ModelPage> =>
      Promise.resolve((query?.cursor ? pages[1] : pages[0]) ?? { items: [], cursor: null }),
    )
    installFakeBridge({ provider: { searchModels } })

    renderPanel()

    expect(await screen.findByText('Model late')).toBeInTheDocument()
  })

  /**
   * Pulling empty pages without a ceiling walks the whole catalogue the moment the panel
   * opens on a filter nothing matches — the exact freeze the paging exists to prevent.
   */
  it('stops pulling empty pages instead of walking the whole catalogue', async () => {
    const searchModels = vi.fn((): Promise<ModelPage> =>
      Promise.resolve({ items: [], cursor: 'l:public:0:more' }),
    )
    installFakeBridge({ provider: { searchModels } })

    renderPanel()

    await waitFor(() => expect(searchModels.mock.calls.length).toBeGreaterThan(1))
    await waitFor(() =>
      expect(screen.getByText(/Aucun modèle dans cet espace/)).toBeInTheDocument(),
    )
    expect(searchModels.mock.calls.length).toBeLessThanOrEqual(8)
  })

  // Left on "loading" forever, a refused request looks like a panel that never finishes.
  it('says why it has nothing rather than loading forever', async () => {
    installFakeBridge({
      provider: { searchModels: () => Promise.reject(new Error('rate-limited')) },
    })

    renderPanel()

    expect(await screen.findByText(/Trop de requêtes/)).toBeInTheDocument()
  })

  // The walk covers private models then public ones: the same model can arrive twice.
  it('shows a model once even when two pages carry it', async () => {
    const pages: ModelPage[] = [
      { items: [model('flux')], cursor: 'next' },
      { items: [model('flux')], cursor: null },
    ]
    installFakeBridge({
      provider: {
        searchModels: query =>
          Promise.resolve((query?.cursor ? pages[1] : pages[0]) ?? { items: [], cursor: null }),
      },
    })

    renderPanel()

    await waitFor(() => expect(screen.getAllByText('Model flux')).toHaveLength(1))
  })

  /**
   * `thumbnail` is set on 160 of the 640 public models; the rest are pictured by an example
   * asset whose URL is signed and short-lived, so it is fetched when the card is seen.
   */
})
