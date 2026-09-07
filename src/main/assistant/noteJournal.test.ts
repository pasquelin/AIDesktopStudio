import { describe, expect, it } from 'vitest'
import { isToastWorthy } from '@shared/domain/activity'
import { isRecord } from '@shared/guards'
import { LANGUAGES, TRANSLATIONS } from '@shared/i18n'
import { NOTE_TEXT_MAX, type AssistantNote } from '@shared/domain/assistantNote'
import { lineOfNote, reportOfNote } from './noteJournal'

/** Every note the union can carry, so the guard below reads them all rather than a sample. */
const EVERY_NOTE: readonly AssistantNote[] = [
  { kind: 'sent', door: 'deepseek', model: 'deepseek-chat', text: 'You drive AI Desktop Studio' },
  { kind: 'answered', text: '{"say":"","calls":[]}' },
  { kind: 'ran', action: 'jobs.list', input: '{}', answer: 'ok', refused: false },
  { kind: 'ran', action: 'project.create', input: '{}', answer: 'badInput', refused: true },
  { kind: 'asked', question: 'Quel nom ?', answer: 'Bateaux' },
]

const CODES = LANGUAGES.map(one => one.code)

/** The sentence a key resolves to, walked rather than indexed: half these names are plural stems. */
function sentenceOf(bundle: unknown, key: string): string {
  const found = key
    .split('.')
    .reduce<unknown>((at, part) => (isRecord(at) ? at[part] : undefined), bundle)
  return typeof found === 'string' ? found : ''
}

describe('what a note becomes in the journal', () => {
  /**
   * 🛑 A hole nothing fills draws EMPTY on screen, and nothing else here would say so: these keys
   * are composed at runtime, so `known-keys.i18n.test.ts` never resolves them — it was written
   * with `{{round}}` and `{{model}}` where the code passes `door` and `chars`, and every gate
   * was green on a line that would have read « Tour  envoyé à  ».
   */
  it.each(CODES)('fills every hole of its %s sentence', code => {
    const unfilled = EVERY_NOTE.flatMap(note => {
      const report = reportOfNote(note)
      const sentence = sentenceOf(TRANSLATIONS[code], report.messageKey)
      return [...sentence.matchAll(/{{\s*(\w+)/g)]
        .map(hole => hole[1] ?? '')
        .filter(name => report.params?.[name] === undefined)
        .map(name => `${report.messageKey} — ${name}`)
    })

    expect(unfilled).toEqual([])
  })

  /**
   * 🛑 A prompt leaves NOTHING here, and it is not a matter of size: its head carries
   * `Folders on this machine:` — a home, a Desktop, a Documents — and this journal lives in
   * `<project>/.index/catalog.db`, which travels with a project someone may share. Only its
   * SIZE is kept; the text is in the transcript, which stays in the log folder.
   */
  it('keeps a prompt out of a file that travels with the project', () => {
    const report = reportOfNote({
      kind: 'sent',
      door: 'deepseek',
      model: 'deepseek-chat',
      text: `You drive AI Desktop Studio\n\nFolders on this machine:\nhome: /Users/someone\n`,
    })

    expect(report.detail).toBeUndefined()
    expect(report.params?.['chars']).toBe(67)
  })

  /** Every arm, not one: a single unbounded detail is a database row nothing holds back. */
  it.each(EVERY_NOTE)('bounds what $kind writes to the database', note => {
    expect((reportOfNote(note).detail ?? '').length).toBeLessThanOrEqual(NOTE_TEXT_MAX + 1)
  })

  /**
   * 🛑 `warn` and never `error`: a refusal is the studio holding its own line, and `isToastWorthy`
   * turns an error into a toast — every refused call of a plan would raise one.
   */
  it('reports a refusal without putting a toast on the screen', () => {
    const report = reportOfNote({
      kind: 'ran',
      action: 'project.create',
      input: '{}',
      answer: 'badInput',
      refused: true,
    })

    expect(report.level).toBe('warn')
    expect(isToastWorthy({ ...report, at: '' })).toBe(false)
  })

  it('says what the person answered, and that they answered nothing', () => {
    const answered: AssistantNote = { kind: 'asked', question: 'Quel nom ?', answer: 'Bateaux' }
    const dismissed: AssistantNote = { kind: 'asked', question: 'Quel nom ?', answer: null }

    expect(reportOfNote(answered).detail).toBe('Bateaux')
    expect(lineOfNote(dismissed)).toContain('dismissed')
  })

  /** 🛑 The note travels with the answer: for a question that offered one it IS the answer, and
   * the journal showed such a question as one the person had walked away from. */
  it('keeps the note the person wrote beside their answer', () => {
    const noted: AssistantNote = {
      kind: 'asked',
      question: 'Pourquoi ?',
      answer: null,
      note: 'pour un test',
    }

    expect(reportOfNote(noted).detail).toBe('(pour un test)')
    expect(lineOfNote(noted)).toContain('pour un test')
  })
})
