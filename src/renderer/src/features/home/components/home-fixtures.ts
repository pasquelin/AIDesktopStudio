import { act, waitFor } from '@testing-library/react'
import { expect } from 'vitest'
import { DEFAULT_HOME_SECTIONS } from '@shared/domain/home'
import type { Project } from '@shared/domain/project'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'

/** A project the studio has answered about, for the suites of every section. */
const HOME_PROJECT: Project = {
  path: '/projects/Summer',
  manifest: {
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
}

/**
 * A studio that has already answered, on the default order.
 *
 * The home says nothing before the main process has spoken — which is what `Spotlight.test` is
 * about, and what every other suite has to step past to reach the shelf it is testing.
 */
export function settleHome(project: Project | null = HOME_PROJECT): void {
  useSettings.setState(state => ({
    authKnown: true,
    loaded: true,
    settings: {
      ...state.settings,
      home: { enabled: true, news: true, sections: [...DEFAULT_HOME_SECTIONS] },
    },
  }))
  useProject.setState({ project, known: true })
}

/**
 * Waits for a band's read to have been made AND settled.
 *
 * Several cases assert an absence, and a band is absent before it has read too — so the wait has
 * to be on something positive first, or the assertion passes before the bridge has answered and
 * stays green against a band that never draws at all.
 */
export async function settled(read: { mock: { calls: readonly unknown[] } }): Promise<void> {
  // Read off `mock.calls` rather than through `toHaveBeenCalled`, so the parameter is the one
  // shape every spy shares — `vi.fn` infers a type per call site, and none of them is `Mock`.
  await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(0))
  await act(async () => {
    await new Promise(done => setTimeout(done, 0))
  })
}
