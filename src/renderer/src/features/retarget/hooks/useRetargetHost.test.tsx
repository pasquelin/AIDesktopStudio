import { openCharacter } from '@/character/openCharacter'
import { revealTool } from '@/helpers/revealPanel'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { Rig } from '@shared/domain/rig'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { installFakeBridge } from '@/services/fakeBridge'
import { useSectionFolds } from '@/stores/sectionFolds'
import { useProject } from '@/stores/project'
import { clearCharacters } from '@/stores/character-fixtures'
import {
  characterOf,
  characterStore,
  isCharacterDirty,
  seedCharacter,
  useCharacters,
} from '@/stores/character'
import { linkCharacterMotion, setCharacterRig } from '@/engines/character/characterCommands'
import type { RetargetMessage } from '../retargetChannel'
import { useRetargetHost } from './useRetargetHost'

vi.mock('@/character/openCharacter', () => ({ openCharacter: vi.fn(async () => true) }))
vi.mock('@/helpers/revealPanel', () => ({ revealTool: vi.fn(() => true) }))

class HostChannel {
  static current: HostChannel | null = null
  onmessage: ((event: MessageEvent) => unknown) | null = null
  postMessage = vi.fn<(message: RetargetMessage) => void>()
  close = vi.fn()
  constructor(readonly name: string) {
    HostChannel.current = this
  }
  async receive(message: RetargetMessage): Promise<void> {
    await this.onmessage?.(new MessageEvent('message', { data: message }))
  }
}
const HERO = 'hero'
const RIG: Rig = {
  origin: 'local',
  bones: [{ name: 'Hips', parent: null, rest: IDENTITY_TRANSFORM }],
}
const SAVED: Asset = {
  id: 'new-motion',
  name: 'Walk',
  type: 'animation',
  location: 'local',
  tags: [],
  createdAt: '2026-09-06T00:00:00Z',
}
const channel = () => {
  if (!HostChannel.current) throw new Error('host did not open its channel')
  return HostChannel.current
}
function apply(requestId = 'request'): RetargetMessage {
  const state = useCharacters.getState()
  return {
    kind: 'apply',
    requestId,
    name: 'Walk',
    revision: characterStore.revisionOf(state, HERO),
    incarnation: characterStore.incarnationOf(state, HERO) ?? '',
    glb: new Uint8Array(16),
  }
}
function pendingSave() {
  let finish: (asset: Asset) => void = () => {}
  const result = new Promise<Asset>(resolve => {
    finish = resolve
  })
  const saveAnimation = vi.fn(() => result)
  const remove = vi.fn(async () => {})
  installFakeBridge({ assets: { saveAnimation, remove } })
  return { saveAnimation, remove, finish }
}

beforeEach(() => {
  clearCharacters()
  useProject.setState({
    project: {
      path: '/project',
      manifest: { version: 1, createdAt: '', updatedAt: '' },
    },
  })
  installFakeBridge()
  seedCharacter(HERO, RIG, {})
  HostChannel.current = null
  vi.stubGlobal('BroadcastChannel', HostChannel)
})
afterEach(() => vi.unstubAllGlobals())

describe('the retarget owner session', () => {
  it('shares the current unsaved rig and reuses its session when reopened', async () => {
    const open = vi.fn(async () => {})
    installFakeBridge({ retargetWindow: { open } })
    useCharacters.getState().runCommand(HERO, setCharacterRig({ ...RIG, origin: 'imported' }))
    const { result } = renderHook(() => useRetargetHost(HERO))
    await act(async () => {
      await channel().receive({ kind: 'ask' })
      await result.current()
      await result.current()
    })
    expect(isCharacterDirty(useCharacters.getState(), HERO)).toBe(true)
    expect(channel().postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'snapshot',
        snapshot: expect.objectContaining({ rig: { ...RIG, origin: 'imported' } }),
      }),
    )
    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[0]).toEqual(open.mock.calls[1])
  })

  it('copies the rig across only when it changes, and only announces the rest', async () => {
    installFakeBridge({ assets: { saveAnimation: vi.fn(async () => SAVED) } })
    const { unmount } = renderHook(() => useRetargetHost(HERO))
    await act(async () => {
      await channel().receive({ kind: 'ask' })
    })
    channel().postMessage.mockClear()
    act(() =>
      useCharacters
        .getState()
        .runCommand(HERO, linkCharacterMotion({ id: 'm1', name: 'Walk', assetId: 'a1' })),
    )
    expect(channel().postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'changed',
        revision: characterStore.revisionOf(useCharacters.getState(), HERO),
      }),
    )
    act(() =>
      useCharacters.getState().runCommand(HERO, setCharacterRig({ ...RIG, origin: 'imported' })),
    )
    expect(channel().postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'snapshot',
        snapshot: expect.objectContaining({ rig: { ...RIG, origin: 'imported' } }),
      }),
    )
    unmount()
  })

  it('keeps one session per character across reopenings and greets a surviving window', async () => {
    const open = vi.fn(async () => {})
    installFakeBridge({ retargetWindow: { open } })
    const first = renderHook(() => useRetargetHost(HERO))
    const name = channel().name
    await act(async () => {
      await first.result.current()
    })
    first.unmount()
    const second = renderHook(() => useRetargetHost(HERO))
    await act(async () => {
      await second.result.current()
    })
    expect(channel().name).toBe(name)
    expect(open.mock.calls).toEqual([[HERO], [HERO]])
    expect(channel().postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'snapshot',
        snapshot: expect.objectContaining({ assetId: HERO }),
      }),
    )
    second.unmount()
  })

  it('applies a request once and adds one undoable motion', async () => {
    const saveAnimation = vi.fn(async () => SAVED)
    installFakeBridge({ assets: { saveAnimation } })
    renderHook(() => useRetargetHost(HERO))
    const message = apply()
    await act(async () => {
      await channel().receive(message)
      await channel().receive(message)
    })
    expect(saveAnimation).toHaveBeenCalledTimes(1)
    expect(characterOf(useCharacters.getState(), HERO).motions).toHaveLength(1)
    act(() => useCharacters.getState().undo(HERO))
    expect(characterOf(useCharacters.getState(), HERO).motions).toEqual([])
  })

  it('rolls back the newly saved asset when the rig changes during saving', async () => {
    const pending = pendingSave()
    renderHook(() => useRetargetHost(HERO))
    let saving: Promise<void> | null = null
    act(() => {
      saving = channel().receive(apply())
    })
    act(() => useCharacters.getState().runCommand(HERO, setCharacterRig(null)))
    await act(async () => {
      pending.finish(SAVED)
      await saving
    })
    expect(pending.remove).toHaveBeenCalledWith([SAVED.id], false, '/project')
    expect(characterOf(useCharacters.getState(), HERO).motions).toEqual([])
    expect(channel().postMessage).toHaveBeenCalledWith({
      kind: 'answer',
      requestId: 'request',
      ok: false,
    })
  })

  it('closes its channel and discards a save that completes after the owner closes', async () => {
    const pending = pendingSave()
    const { unmount } = renderHook(() => useRetargetHost(HERO))
    let saving: Promise<void> | null = null
    act(() => {
      saving = channel().receive(apply())
    })
    unmount()
    const published = channel().postMessage.mock.calls.length
    await act(async () => {
      pending.finish(SAVED)
      await saving
    })
    expect(pending.remove).toHaveBeenCalledWith([SAVED.id], false, '/project')
    expect(channel().close).toHaveBeenCalledOnce()
    expect(channel().postMessage).toHaveBeenLastCalledWith({ kind: 'gone' })
    expect(channel().postMessage.mock.calls).toHaveLength(published)
    expect(characterOf(useCharacters.getState(), HERO).motions).toEqual([])
  })

  it('refuses to link into another project and scopes rollback to the original project', async () => {
    const pending = pendingSave()
    renderHook(() => useRetargetHost(HERO))
    let saving: Promise<void> | null = null
    act(() => {
      saving = channel().receive(apply())
    })
    act(() =>
      useProject.setState({
        project: {
          path: '/other',
          manifest: { version: 1, createdAt: '', updatedAt: '' },
        },
      }),
    )
    await act(async () => {
      pending.finish(SAVED)
      await saving
    })
    expect(pending.remove).toHaveBeenCalledWith([SAVED.id], false, '/project')
    expect(characterOf(useCharacters.getState(), HERO).motions).toEqual([])
    expect(channel().postMessage).toHaveBeenCalledWith({
      kind: 'answer',
      requestId: 'request',
      ok: false,
    })
  })

  it('rejects a request for a previous opening of the same character', async () => {
    const saveAnimation = vi.fn(async () => SAVED)
    installFakeBridge({ assets: { saveAnimation } })
    renderHook(() => useRetargetHost(HERO))
    const stale = apply()
    act(() => {
      useCharacters.getState().drop(HERO)
      seedCharacter(HERO, RIG, {})
    })
    await act(async () => {
      await channel().receive(stale)
    })
    expect(saveAnimation).not.toHaveBeenCalled()
    expect(channel().postMessage).toHaveBeenCalledWith({
      kind: 'answer',
      requestId: 'request',
      ok: false,
    })
  })
})

it('returns to the original character inspector without generating a rig', async () => {
  const focusOrigin = vi.fn(async () => {})
  installFakeBridge({ retargetWindow: { focusOrigin } })
  const host = renderHook(() => useRetargetHost(HERO))
  const incarnation = characterStore.incarnationOf(useCharacters.getState(), HERO) ?? ''
  vi.mocked(openCharacter).mockClear()
  vi.mocked(revealTool).mockClear()
  useSectionFolds.setState({ wanted: false })
  await act(() => channel().receive({ kind: 'editRig', incarnation: 'old-session' }))
  expect(openCharacter).not.toHaveBeenCalled()
  await act(() => channel().receive({ kind: 'editRig', incarnation }))
  expect(openCharacter).toHaveBeenCalledExactlyOnceWith(HERO)
  expect(revealTool).toHaveBeenCalledWith('inspector')
  expect(focusOrigin).toHaveBeenCalledOnce()
  expect(useSectionFolds.getState().wanted).toBe(true)
  expect(isCharacterDirty(useCharacters.getState(), HERO)).toBe(false)
  useProject.setState({ project: null })
  await act(() => channel().receive({ kind: 'editRig', incarnation }))
  expect(openCharacter).toHaveBeenCalledTimes(1)
  host.unmount()
})
