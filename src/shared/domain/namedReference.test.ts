import { describe, expect, it } from 'vitest'
import { resolveNamedReference } from './namedReference'

type Subject = { id: string; names: readonly string[] }

const SUBJECTS: readonly Subject[] = [
  { id: 'Health', names: ['Health', 'Santé'] },
  { id: 'Summer', names: ['Été'] },
]

const resolve = (given: string, subjects = SUBJECTS) =>
  resolveNamedReference(
    given,
    subjects,
    subject => subject.id,
    subject => subject.names,
  )

describe('named reference resolution', () => {
  it('resolves canonical and displayed names across case and accents', () => {
    expect(resolve('Health')).toMatchObject({ kind: 'resolved', value: { id: 'Health' } })
    expect(resolve('health')).toMatchObject({ kind: 'resolved', value: { id: 'Health' } })
    expect(resolve('sante')).toMatchObject({ kind: 'resolved', value: { id: 'Health' } })
    expect(resolve('composant Santé')).toMatchObject({ kind: 'resolved', value: { id: 'Health' } })
    expect(resolve('ÉTÉ')).toMatchObject({ kind: 'resolved', value: { id: 'Summer' } })
  })

  it('distinguishes an ambiguous displayed name from an unknown one', () => {
    const ambiguous = [...SUBJECTS, { id: 'Wellness', names: ['Santé'] }]

    expect(resolve('santé', ambiguous)).toMatchObject({ kind: 'ambiguous' })
    expect(resolve('nothing')).toEqual({ kind: 'missing' })
  })
})
