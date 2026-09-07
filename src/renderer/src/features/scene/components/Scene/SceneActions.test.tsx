import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import { useTreeFolds } from '@/stores/treeFolds'
import { SceneActions } from './SceneActions'

beforeEach(() => {
  useTreeFolds.setState({
    explorer: { stamp: 0, wanted: true, anyExpanded: false },
    scene: { stamp: 0, wanted: true, anyExpanded: true },
  })
})

it('carries the scene tree fold action in the title row', async () => {
  render(<SceneActions />)

  await userEvent.click(screen.getByRole('button', { name: 'Tout replier' }))

  expect(useTreeFolds.getState().scene).toMatchObject({ stamp: 1, wanted: false })
})
