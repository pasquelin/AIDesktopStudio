import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RetargetWorkspace } from './RetargetWorkspace'

vi.mock('@/hooks/useAppliedSettings', () => ({ useAppliedSettings: () => {} }))
vi.mock('@/hooks/useConnections', () => ({ useConnections: () => {} }))
vi.mock('../../hooks/useRetargetWorkspace', () => ({
  useRetargetWorkspace: () => ({ session: { snapshot: { name: 'Hero' }, gone: false } }),
}))
vi.mock('./RetargetViews', () => ({ RetargetViews: () => <p>Source and result</p> }))
vi.mock('./RetargetControls', () => ({ RetargetControls: () => <p>Bone mapping</p> }))

it('uses the fixed window surfaces with an inspector and no dock rail or close action', () => {
  const { container } = render(<RetargetWorkspace />)
  const inspector = screen.getByRole('region', { name: 'Inspecteur' })
  expect(inspector).toHaveClass('pnl-surface')
  expect(inspector).toHaveTextContent('Bone mapping')
  expect(container.querySelectorAll('.pnl-surface')).toHaveLength(2)
  expect(container.querySelector('.pnl-rail')).toBeNull()
  expect(screen.queryByRole('button', { name: /fermer|retirer/i })).not.toBeInTheDocument()
  expect(screen.getByText('Source and result')).toBeInTheDocument()
})
