import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { actionCorpus } from '@main/actionIndex/actionCorpus'
import type { ActionHit } from '@main/actionIndex/actionIndex'
import type { AssistantBrain } from '@main/assistant/brainPort'
import type { AssistantAnswer, AssistantThought } from '@shared/domain/assistant'
import { isRecord } from '@shared/guards'
import { blockScene } from './setups'
import { playMission, type MissionRun } from './playMission'

function causalThink(contexts: string[]): AssistantBrain['think'] {
  let round = 0
  return async (request, watch) => {
    const context = request.context ?? ''
    contexts.push(context)
    round += 1
    const answer: AssistantAnswer =
      round > 1
        ? { say: 'vu', calls: [], cost: 0 }
        : {
            say: 'Je lis la scène.',
            calls: [{ action: 'scene.state', input: {} }],
            cost: 0,
          }
    watch?.onNote?.({ kind: 'sent', door: 'test', model: 'test', text: 'prompt complet' })
    watch?.onNote?.({ kind: 'answered', text: JSON.stringify(answer) })
    return answer
  }
}

async function firstReflection(played: MissionRun): Promise<Record<string, unknown>> {
  if (!played.traceFile) throw new Error('trace absente')
  const trace: unknown = JSON.parse(await readFile(played.traceFile, 'utf8'))
  if (!isRecord(trace) || !Array.isArray(trace['reflections'])) throw new Error('trace invalide')
  const reflection = trace['reflections'][0]
  if (!isRecord(reflection)) throw new Error('réflexion absente')
  const missions = trace['missions']
  expect(Array.isArray(missions) && isRecord(missions[0]) && missions[0]['projectId']).toBe(
    '/projets/Démo',
  )
  return reflection
}

function expectCausalReflection(reflection: Record<string, unknown>, context: string): void {
  expect(reflection['contextSerialized']).toBe(context)
  expect(reflection['actionIndex']).toMatchObject({
    available: [],
    scope: { target: 'node', document: 'scene', documentAuthority: 'active' },
    candidates: [{ action: { name: 'scene.state' }, lexicalScore: 3 }],
  })
  expect(reflection['providerAttempts']).toMatchObject([
    { door: 'test', model: 'test', prompt: 'prompt complet' },
  ])
  const attempts = reflection['providerAttempts']
  expect(
    Array.isArray(attempts) && isRecord(attempts[0]) ? attempts[0]['rawResponse'] : '',
  ).toContain('scene.state')
  expect(reflection['actions']).toMatchObject([{ action: 'scene.state', outcome: { ok: true } }])
  expect(reflection['refusals']).toEqual([])
  expect(reflection['nextReflection']).toMatchObject({ reflection: 2 })
}

describe('parcours mission du banc', () => {
  it('crée une mission après que le setup a fermé le projet', async () => {
    const played = await playMission(
      {
        name: 'mission sans projet',
        said: ['Crée un projet.'],
        setup: async studio => {
          await studio.run('project.close', {})
        },
        passed: () => true,
      },
      async () => ({ say: 'Prêt.', calls: [], cost: 0 }),
      { search: async () => [] },
    )

    try {
      expect(played.rounds).toBe(1)
    } finally {
      played.studio.close()
    }
  })

  it('garde le même studio et le même oracle tout en bornant les actions envoyées', async () => {
    const action = actionCorpus().actions.find(candidate => candidate.name === 'documents.list')
    if (!action) throw new Error('documents.list est absente du registre')
    let round = 0
    const played = await playMission(
      {
        name: 'liste les documents',
        said: ['Liste les documents.'],
        passed: run => run.called.some(call => call.action === 'documents.list'),
      },
      async request => {
        expect(request.candidates).toEqual(['documents.list'])
        round += 1
        return round === 1
          ? { say: 'Je regarde.', calls: [{ action: 'documents.list', input: {} }], cost: 0 }
          : { say: 'Terminé.', calls: [], cost: 0 }
      },
      {
        search: async () => [
          {
            action,
            score: 1,
            lexicalScore: 1,
            relevanceScore: 1,
            applicabilityScore: 0,
            documentAffinity: 'transversal',
          },
        ],
      },
    )

    try {
      expect(played.called.map(call => call.action)).toEqual(['documents.list'])
      expect(played.metrics.llmCalls).toBe(2)
      expect(played.metrics.actionsSentToLlm).toBe(2)
      expect(played.metrics.contextChars).toBeGreaterThan(0)
    } finally {
      played.studio.close()
    }
  })

  it('persiste le contexte causal complet depuis un snapshot fidèle au studio', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'mission-trace-'))
    const action = actionCorpus().actions.find(candidate => candidate.name === 'scene.state')
    if (!action) throw new Error('scene.state est absente du registre')
    const contexts: string[] = []
    const played = await playMission(
      {
        name: 'matière rouge',
        said: ['Change le matériau de Bloc en rouge.'],
        setup: blockScene,
        passed: () => false,
      },
      causalThink(contexts),
      {
        search: async () => [
          {
            action,
            score: 4,
            lexicalScore: 3,
            semanticScore: 1,
            relevanceScore: 4,
            applicabilityScore: 0,
            documentAffinity: 'transversal',
          },
        ],
      },
      { folder, scenarioId: '12.2', runId: 1 },
    )

    try {
      expect(contexts[0]).toContain('Bloc')
      expectCausalReflection(await firstReflection(played), contexts[0] ?? '')
    } finally {
      played.studio.close()
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('persiste la tentative en cours quand le provider échoue', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'mission-trace-error-'))
    let played: MissionRun | null = null
    try {
      played = await playMission(
        { name: 'erreur provider', said: ['Continue.'], passed: () => false },
        async (_request, watch) => {
          watch?.onNote?.({
            kind: 'sent',
            door: 'test',
            model: 'test',
            text: 'prompt avant erreur',
          })
          throw new Error('provider indisponible')
        },
        { search: async () => [] },
        { folder, scenarioId: 'provider error', runId: 1 },
      )
      const trace: unknown = JSON.parse(
        await readFile(join(folder, 'provider-error-run-1.json'), 'utf8'),
      )
      expect(trace).toMatchObject({
        reflections: [
          {
            providerError: 'provider indisponible',
            providerAttempts: [{ prompt: 'prompt avant erreur' }],
          },
        ],
      })
    } finally {
      played?.studio.close()
      await rm(folder, { recursive: true, force: true })
    }
  })
})

describe('ce que le harnais mission envoie et répond, comme le produit', () => {
  it("envoie l'état du studio et le compte des souvenirs avec chaque réflexion", async () => {
    const requests: AssistantThought[] = []
    const played = await playMission(
      { name: 'état', said: ['Que vois-tu ?'], setup: blockScene, passed: () => true },
      async request => {
        requests.push(request)
        return { say: 'Une scène.', calls: [], cost: 0 }
      },
      { search: async () => [] },
    )

    try {
      expect(requests[0]?.state).toContain('Bloc')
      expect(requests[0]?.memories).toBe(0)
    } finally {
      played.studio.close()
    }
  })

  it("route actions.find vers l'index plutôt que vers la fenêtre", async () => {
    const action = actionCorpus().actions.find(candidate => candidate.name === 'git.init')
    if (!action) throw new Error('git.init est absente du registre')
    const hit: ActionHit = {
      action,
      score: 1,
      lexicalScore: 1,
      relevanceScore: 1,
      applicabilityScore: 0,
      documentAffinity: 'transversal',
    }
    const search = vi.fn(async (_query: string) => [hit])
    let round = 0
    const played = await playMission(
      { name: 'cherche', said: ['Mets le projet sous suivi de versions.'], passed: () => true },
      async () => {
        round += 1
        return round === 1
          ? { say: '', calls: [{ action: 'actions.find', input: { query: 'versions' } }], cost: 0 }
          : { say: 'Trouvé.', calls: [], cost: 0 }
      },
      { search },
    )

    try {
      expect(played.called[0]?.action).toBe('actions.find')
      expect(played.called[0]?.answer).toContain('"name":"git.init"')
      expect(search.mock.calls.some(call => call[0] === 'versions')).toBe(true)
      expect(played.candidates).toContain('git.init')
    } finally {
      played.studio.close()
    }
  })

  it('répond aux questions du modèle avec les réponses du scénario, et laisse attendre sinon', async () => {
    const ask = (): AssistantAnswer => ({
      say: '',
      ask: { questions: [{ question: 'Quel nom ?', choices: [] }] },
      calls: [],
      cost: 0,
    })
    const think =
      (log: string[]): AssistantBrain['think'] =>
      async request => {
        log.push(request.utterance)
        return log.length === 1 ? ask() : { say: 'Fait.', calls: [], cost: 0 }
      }
    const answered = await playMission(
      { name: 'répond', said: ['Renomme.'], replies: ['Bateau'], passed: () => true },
      think([]),
      { search: async () => [] },
    )
    const waiting = await playMission(
      { name: 'attend', said: ['Renomme.'], passed: () => true },
      think([]),
      { search: async () => [] },
    )

    try {
      expect(answered.missions[0]?.state).toBe('completed')
      expect(
        answered.missions[0]?.plan.steps.find(step => step.kind === 'user_input')?.result,
      ).toBe('Bateau')
      expect(waiting.missions[0]?.state).toBe('waiting_user')
      expect(waiting.asks).toEqual(['Quel nom ?'])
    } finally {
      answered.studio.close()
      waiting.studio.close()
    }
  })
})
