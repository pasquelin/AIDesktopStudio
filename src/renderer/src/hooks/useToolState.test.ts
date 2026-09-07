import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { useAccounts } from '@/stores/accounts'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { trackByGit } from '@/stores/git-fixtures'
import { subscribeToToolState } from './useToolState'

/**
 * 🛑 What a surface offers is read from six stores, and a run without a window is told about it
 * by this one subscription. A store the hook reads and this list forgets is a rail that never
 * redraws — a `git init` that leaves the Git panel out for the rest of the session.
 */
describe('being told that what a surface offers may have changed', () => {
  it.each([
    [
      'a project opening',
      () =>
        useProject.setState({
          project: { path: '/p', manifest: { version: 1, createdAt: '', updatedAt: '' } },
        }),
    ],
    ['git answering about the folder', () => trackByGit()],
    ['an account arriving', () => useAccounts.setState({ accounts: [] })],
    ['a document opening', () => useDocuments.setState({ documents: {} })],
    ['the home coming forward', () => useLayouts.setState({ home: true })],
    ['a setting changing', () => useSettings.setState({ settings: DEFAULT_SETTINGS })],
  ])('calls back when %s', (_what, change) => {
    const told = vi.fn()
    const stop = subscribeToToolState(told)

    change()

    expect(told).toHaveBeenCalled()
    stop()
  })

  it('stops listening to every one of them at once', () => {
    const told = vi.fn()
    subscribeToToolState(told)()

    useProject.setState({ project: null })
    trackByGit()

    expect(told).not.toHaveBeenCalled()
  })
})
