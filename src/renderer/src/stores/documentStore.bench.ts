import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import type { Command, History } from '@/engines/core/history'
import { createDocumentStore } from './documentStore'

/**
 * What the modified marker costs per frame.
 *
 * `SceneDocument` reads `isDirty` through a zustand selector, so it runs on every state change —
 * and a dragged inspector field emits one per frame. The audit of 8 August put React at
 * 0.15 ms of a 3.31 ms frame; this says how much of that this adds.
 */
type Fake = { value: number }

const store = createDocumentStore<Fake>({ value: 0 })

const commandAt = (value: number): Command<Fake> => ({
  id: 'set',
  apply: () => ({ value }),
  revert: state => state,
})

/** A session's worth of undo, which is what `HISTORY_LIMIT` caps the stack at. */
const history: History<Fake> = {
  past: Array.from({ length: 100 }, (_unused, index) => commandAt(index)),
  future: [],
  dropped: null,
}

const state = {
  states: { 'doc-1': { value: 0 } },
  histories: { 'doc-1': history },
  saved: { 'doc-1': history.past.at(-1) ?? null },
  revisions: { 'doc-1': 1 },
  incarnations: { 'doc-1': 'bench' },
}

describe('reading the modified marker', () => {
  bench('isDirty on a full history', () => {
    store.isDirty(state, 'doc-1')
  })
})
