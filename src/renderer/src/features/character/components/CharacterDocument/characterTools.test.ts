import { describe, expect, it } from 'vitest'
import { DISPLAY_MODES } from '@shared/domain/scene'
import { WORKSHOP_TOOLS, workshopBar } from './characterTools'

describe('the workshop bar', () => {
  // No scale, no delete, nothing added: a workshop holds one node, and a joint is a point and a
  // length with nothing about it to enlarge.
  it('offers the scene tools that move the view, then the bones, and nothing that edits', () => {
    expect(WORKSHOP_TOOLS.map(tool => tool.id)).toEqual([
      'select',
      'navigate',
      'translate',
      'rotate',
      'display',
      'frame',
      'skeletons',
    ])
    expect(WORKSHOP_TOOLS.find(tool => tool.id === 'display')?.modes?.map(mode => mode.id)).toEqual(
      DISPLAY_MODES,
    )
  })

  it('opens without a divider, nothing standing above select here', () => {
    expect(WORKSHOP_TOOLS[0]?.separatorBefore).toBeFalsy()
  })

  it('lights the bones and the drawn mode from the view it is handed', () => {
    const bar = workshopBar({ displays: ['wireframe'], skeletons: false }, true)

    expect(bar.find(tool => tool.id === 'skeletons')?.pressed).toBe(false)
    expect(bar.find(tool => tool.id === 'display')?.activeMode).toBe('wireframe')
    expect(bar.filter(tool => tool.pressed).map(tool => tool.id)).toEqual(['editSkeleton'])
  })
})
