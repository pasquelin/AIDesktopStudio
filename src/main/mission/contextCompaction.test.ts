import { describe, expect, it } from 'vitest'
import { isRecord } from '@shared/guards'
import { compactContextValue } from './contextCompaction'

describe('mission context compaction', () => {
  it('preserves small structures before compacting oversized collections', () => {
    const compacted = compactContextValue(
      {
        nodes: Array.from({ length: 200 }, (_, at) => ({ id: `node_${at}`, name: `Node ${at}` })),
        animation: {
          duration: 5_000_000,
          transitions: [{ id: 'transition_1', at: 0, kind: 'fade', duration: 1 }],
        },
      },
      2_000,
    )

    expect(compacted).toMatchObject({
      truncated: true,
      value: {
        animation: {
          duration: 5_000_000,
          transitions: [{ id: 'transition_1', at: 0, kind: 'fade', duration: 1 }],
        },
        nodes: {
          count: 200,
          summary: {
            items: expect.arrayContaining([
              { id: 'node_0', name: 'Node 0' },
              { id: 'node_1', name: 'Node 1' },
            ]),
          },
        },
      },
    })
    expect(JSON.stringify(compacted.value).length).toBeLessThanOrEqual(2_000)
  })

  it('keeps every compact structural identity before detailed entries consume the budget', () => {
    const compacted = compactContextValue(
      {
        nodes: [
          { id: 'light_1', name: 'Key light', type: 'light', payload: 'x'.repeat(800) },
          { id: 'mesh_1', name: 'Cube', type: 'mesh', payload: 'x'.repeat(800) },
          { id: 'camera_1', name: 'Main camera', type: 'camera', payload: 'x'.repeat(800) },
        ],
      },
      700,
    )

    expect(compacted.value).toMatchObject({
      nodes: {
        count: 3,
        summary: {
          byType: { light: 1, mesh: 1, camera: 1 },
          items: [
            { id: 'light_1', name: 'Key light', type: 'light' },
            { id: 'mesh_1', name: 'Cube', type: 'mesh' },
            { id: 'camera_1', name: 'Main camera', type: 'camera' },
          ],
        },
      },
    })
    expect(JSON.stringify(compacted.value).length).toBeLessThanOrEqual(700)
  })

  it('preserves escaped string values while compacting them', () => {
    const value = `quoted "path" \\ ${'x'.repeat(3_000)}`
    const compacted = compactContextValue({ value }, 2_000)

    expect(
      isRecord(compacted.value) && typeof compacted.value.value === 'string'
        ? compacted.value.value
        : '',
    ).toMatch(/^quoted "path" \\/)
    expect(JSON.stringify(compacted.value).length).toBeLessThanOrEqual(2_000)
  })
})
