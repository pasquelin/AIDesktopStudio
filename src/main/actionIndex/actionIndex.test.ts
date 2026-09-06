import { describe, expect, it, onTestFinished } from 'vitest'
import { ACTION_REGISTRY, assistantAction } from '@shared/domain/assistant'
import { openMemoryDatabase } from '@main/project/sqliteMemory'
import { actionCorpus, actionFingerprint } from './actionCorpus'
import { createActionIndex } from './actionIndex'

describe('ActionIndex', () => {
  it('derives every registered action without maintaining another action list', () => {
    const corpus = actionCorpus()
    expect(ACTION_REGISTRY).toHaveLength(310)
    expect(corpus.actions).toHaveLength(ACTION_REGISTRY.length)
    expect(corpus.actions.map(action => action.name)).toEqual(
      ACTION_REGISTRY.map(action => action.name),
    )
    expect(corpus.actions.find(action => action.name === 'clip.add')?.capabilities).toMatchObject({
      documentKinds: ['sequence'],
    })
  })

  it('keeps its fingerprint stable until a descriptor changes', () => {
    const first = actionCorpus()
    const second = actionCorpus()
    expect(second.fingerprint).toBe(first.fingerprint)
    expect(actionFingerprint(first.actions.slice(1))).not.toBe(first.fingerprint)
  })

  it('rebuilds only when the registry fingerprint changes', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    const corpus = actionCorpus()
    expect(index.rebuild(corpus)).toMatchObject({ rebuilt: true, count: 310 })
    expect(index.rebuild(corpus)).toMatchObject({ rebuilt: false, count: 310 })

    const changed = { ...corpus, fingerprint: 'changed' }
    expect(index.rebuild(changed).rebuilt).toBe(true)
    expect(index.fingerprint()).toBe('changed')
    expect(index.count()).toBe(310)
  })

  it('uses FTS5 to rank close action names and descriptions', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())
    const hits = index.search({ query: 'create project' })
    expect(hits[0]?.action.name).toBe('project.create')
    expect(hits.length).toBeLessThanOrEqual(5)
    expect(index.search({ query: 'layer' }).some(hit => hit.action.name.includes('layer'))).toBe(
      true,
    )
  })

  it('retrieves actions from the translated user request without translating the manuals', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    expect(
      index.search({ query: 'ajoute un cube au centre de la scène' }).map(hit => hit.action.name),
    ).toContain('node.add')
    expect(index.search({ query: 'crée un nouveau projet' }).map(hit => hit.action.name)).toContain(
      'project.create',
    )
    const requests = [
      ['renomme objet scène 3D cube Cube Test', 'node.rename'],
      ['change la couleur du premier matériau en rouge', 'node.setMeshMaterial'],
      ['génère une image photoréaliste', 'generator.prepare'],
      ['génère un modèle 3D', 'generator.prepare'],
      ['mets le projet sous gestion de versions', 'git.init'],
    ]
    for (const [query, expected] of requests) {
      const names = index.search({ query: query ?? '', limit: 12 }).map(hit => hit.action.name)
      expect(names, `${query}: ${JSON.stringify(names)}`).toContain(expected)
    }
    const renameHits = index.search({
      query: 'Renomme le cube Cube Test.\nPlan mission',
      limit: 12,
    })
    expect(
      renameHits.map(hit => hit.action.name),
      JSON.stringify(renameHits.map(hit => [hit.action.name, hit.score, hit.lexicalScore])),
    ).toContain('node.rename')
    expect(
      index
        .search({
          query: 'Change la couleur de base du premier matériau en rouge.\nPlan mission',
          limit: 12,
        })
        .map(hit => hit.action.name),
    ).toContain('node.setMeshMaterial')
  })

  it('lets BM25 rank descriptive matches before registry order', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const source = actionCorpus().actions.slice(0, 2)
    const actions = source.map((action, at) => ({
      ...action,
      title: '',
      description: at === 0 ? 'quasar' : 'quasar quasar quasar quasar',
      searchable: at === 0 ? 'quasar' : 'quasar quasar quasar quasar',
    }))
    const index = createActionIndex(database)
    index.rebuild({ actions, fingerprint: actionFingerprint(actions) })
    expect(index.search({ query: 'quasar' })[0]?.action.name).toBe(actions[1]?.name)
  })

  it('retrieves transitive workflow prerequisites and favours available continuations', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const discovery = index.search({ query: 'génère une image photoréaliste', limit: 12 })
    expect(discovery.map(hit => hit.action.name)).toEqual(
      expect.arrayContaining(['models.search', 'generator.prepare']),
    )
    const continuation = index.search({
      query: 'génère une image photoréaliste',
      limit: 12,
      available: ['generationModelCandidates'],
    })
    expect(
      continuation.find(hit => hit.action.name === 'generator.prepare')?.workflowScore,
    ).toBeGreaterThan(0)
    expect(
      discovery.find(hit => hit.action.name === 'models.search')?.action.description,
    ).toContain('not the content to generate')
    expect(
      discovery.find(hit => hit.action.name === 'generator.prepare')?.workflowScore,
    ).toBeGreaterThan(0)
  })

  it('offers a consumer that can follow a relevant producer in the same batch', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const names = index
      .search({ query: 'génère une image photoréaliste', limit: 12 })
      .map(hit => hit.action.name)

    expect(names).toContain('generator.submit')
  })

  it('uses structural scope without mixing it into the lexical query', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const hits = index.search({
      query: 'renomme la sélection',
      limit: 12,
      scope: { target: 'node' },
    })

    expect(hits.map(hit => hit.action.name)).toContain('node.rename')
    expect(hits.find(hit => hit.action.name === 'node.rename')).toMatchObject({
      compatibilityScore: 4,
      applicabilityScore: 4,
      documentAffinity: 'required',
    })
    expect(hits.find(hit => hit.action.name === 'node.rename')?.relevanceScore).toBeGreaterThan(0)
  })

  it('uses canonical document compatibility for a family whose name differs from its document', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const clip = index
      .inspect({ query: 'ajoute un média', limit: 12, scope: { document: 'sequence' } })
      .find(hit => hit.action.name === 'clip.add')

    expect(clip).toMatchObject({ applicabilityScore: 0, documentAffinity: 'required' })
    expect(
      index
        .inspect({
          query: 'ajoute un média',
          limit: 12,
          scope: { document: 'scene', documentAuthority: 'explicit' },
        })
        .find(hit => hit.action.name === 'clip.add'),
    ).toMatchObject({ scopeScore: -4, applicabilityScore: -4 })
  })

  it('keeps transversal actions retrievable across unrelated active documents', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())
    const requests = [
      ['ouvre les réglages globaux', 'settings.open'],
      ['liste les scripts du projet', 'script.list'],
      ['crée un nouveau projet', 'project.create'],
    ]

    for (const [query, expected] of requests) {
      const ranking = index.inspect({
        query: query ?? '',
        limit: 12,
        scope: { document: 'image', documentAuthority: 'active' },
      })
      expect(ranking.find(hit => hit.action.name === expected)).toMatchObject({
        included: true,
        applicabilityScore: 0,
        documentAffinity: 'transversal',
      })
    }
  })

  it('uses an active document as a bonus without making it a precondition', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const settings = index
      .inspect({
        query: 'configure the current editor grid',
        limit: 12,
        scope: { document: 'scene', documentAuthority: 'active' },
      })
      .find(hit => hit.action.name === 'settings.write')
    const script = index
      .inspect({
        query: 'list the project scripts',
        limit: 12,
        scope: { document: 'image', documentAuthority: 'active' },
      })
      .find(hit => hit.action.name === 'script.list')

    expect(settings).toMatchObject({ scopeScore: 2, documentAffinity: 'relevant' })
    expect(script).toMatchObject({ applicabilityScore: 0, documentAffinity: 'transversal' })
  })

  it('does not turn a resolved document selection into a global-action incompatibility', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const memory = index
      .inspect({
        query: 'remember this rule about the selected camera',
        limit: 12,
        scope: { target: 'node', document: 'scene', documentAuthority: 'active' },
      })
      .find(hit => hit.action.name === 'memory.write')

    expect(memory).toMatchObject({ applicabilityScore: 0, documentAffinity: 'transversal' })
    expect(memory).not.toHaveProperty('compatibilityScore')
  })

  it('ranks an action targeting the selection above a similarly worded document action', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const hits = index.search({
      query: 'Change la couleur de base de son premier matériau en rouge.\nPlan mission',
      limit: 12,
      scope: { target: 'node', document: 'scene' },
    })

    expect(hits[0]?.action.name).toBe('node.setMeshMaterial')
    expect(hits.map(hit => hit.action.name)).not.toContain('material.setSurfaceSettings')
  })

  it('keeps representative families within bounded lexical results', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())
    const requests = [
      ['Compte les assets de chaque type.', 'assets.counts'],
      ['Active la grille de la scène.', 'settings.write'],
      [
        "Combien ai-je d'images, de vidéos, de fichiers audio, de modèles 3D et de skyboxes ?",
        'assets.counts',
      ],
      ['Quel est le statut Git du projet ?', 'git.status'],
      ['Lance le jeu.', 'play.start'],
      ['Liste les scripts du projet.', 'script.list'],
      ['Décris ce qui est devant.', 'studio.describe'],
      ['Exporte le jeu.', 'game.export'],
    ]

    for (const [query, expected] of requests) {
      const names = index
        .search({ query: query ?? '', limit: 12, scope: {} })
        .map(hit => hit.action.name)
      expect(names, `${query}: ${JSON.stringify(names)}`).toContain(expected)
    }
  })

  it('offers a workflow continuation even when its words are absent from the new query', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const names = index
      .search({
        query: 'Active la grille de la scène.\nPlan mission',
        limit: 12,
        available: ['settingsState'],
        scope: { document: 'scene' },
      })
      .map(hit => hit.action.name)

    expect(names).toContain('settings.write')
  })

  it('offers a missing prerequisite for a relevant consumer beyond the first three hits', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const ranking = index.inspect({
      query: 'Active les ombres et la grille de la scène.',
      limit: 12,
      scope: { document: 'scene' },
    })

    const write = ranking.find(hit => hit.action.name === 'settings.write')
    const read = ranking.find(hit => hit.action.name === 'settings.read')
    expect(write?.rank).toBeGreaterThan(3)
    expect(read?.workflowScore).toBeGreaterThan(0)
    expect(read?.included).toBe(true)
  })

  it('offers optional discovery without making a resolved file path a prerequisite', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const discovery = index.search({ query: 'Ouvre mon image du bateau.', limit: 12 })
    expect(discovery.map(hit => hit.action.name)).toEqual(
      expect.arrayContaining(['file.open', 'files.search']),
    )
    expect(assistantAction('file.open')?.inputs).toBeUndefined()
  })

  it('combines a resolved document target with the matching navigation intent', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())

    const hit = index
      .search({
        query: 'Reviens sur la scène 3D.',
        limit: 12,
        scope: { target: 'document', document: 'scene', documentAuthority: 'explicit' },
      })
      .find(candidate => candidate.action.name === 'document.activate')

    expect(hit).toMatchObject({ compatibilityScore: 4, targetIntentScore: 1 })
  })

  it('replaces fields, vectors and FTS words when the corpus changes', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const original = actionCorpus()
    const first = original.actions[0]
    if (!first) throw new Error('the action corpus is empty')
    const changedAction = { ...first, searchable: `${first.searchable} ultramarineindexword` }
    const changedActions = [changedAction, ...original.actions.slice(1)]
    const index = createActionIndex(database)
    index.rebuild({ actions: changedActions, fingerprint: actionFingerprint(changedActions) })
    index.writeEmbeddings([{ name: first.name, model: 'fixture', values: new Float32Array([1]) }])
    expect(index.search({ query: 'ultramarineindexword' })[0]?.action.name).toBe(first.name)
    expect(database.prepare('SELECT count(*) AS count FROM action_fields').get()).toBeDefined()

    index.rebuild(original)
    expect(index.search({ query: 'ultramarineindexword' })).toEqual([])
    expect(index.embeddingModel()).toBeNull()
  })

  it('bounds an ambiguous query and keeps close names ordered by intent', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())
    const ambiguous = index.search({ query: 'open', limit: 3 })
    expect(ambiguous).toHaveLength(3)
    expect(index.search({ query: 'project open' })[0]?.action.name).toBe('project.open')
  })

  it('bounds requested results and rejects punctuation-only questions', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())
    expect(index.search({ query: 'scene', limit: 100 })).toHaveLength(12)
    expect(index.search({ query: '---', limit: 4 })).toEqual([])
  })

  it('explains every action rank before applying the result limit', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())
    const ranking = index.inspect({ query: 'open project', limit: 3 })

    expect(ranking).toHaveLength(310)
    expect(ranking.find(hit => hit.action.name === 'project.open')).toMatchObject({
      included: true,
      rank: 1,
    })
    expect(ranking.filter(hit => hit.included)).toHaveLength(3)
    expect(ranking.find(hit => hit.action.name === 'actions.find')?.exclusion).toBe(
      'reservedDiscoveryAction',
    )
  })

  it('keeps grammatical filler out of FTS and explains intent ranking', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())
    const ranking = index.inspect({ query: 'Supprime le document de mon projet', limit: 12 })
    const deletion = ranking.find(hit => hit.action.name === 'document.deleteFromDisk')

    expect(deletion).toMatchObject({ included: true, intentScore: 2 })
    expect(deletion?.fusionScore).toBeGreaterThan(0)
    expect(ranking.find(hit => hit.action.name === 'documents.list')?.intentScore).toBe(-0.5)
  })

  it('adds semantic ranking when compatible embeddings exist', () => {
    const corpus = actionCorpus()
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(corpus)
    const target = corpus.actions.find(action => action.name === 'project.create')
    if (!target) throw new Error('project.create is absent')
    index.writeEmbeddings([
      { name: target.name, model: 'fixture', values: new Float32Array([1, 0]) },
    ])
    const hits = index.search({
      query: 'make something new',
      embedding: { model: 'fixture', values: new Float32Array([1, 0]) },
    })
    expect(hits[0]?.action.name).toBe('project.create')
    expect(hits[0]?.semanticScore).toBe(1)
  })

  it('falls back to lexical results without embeddings or with another model', () => {
    const database = openMemoryDatabase()
    onTestFinished(() => database.close())
    const index = createActionIndex(database)
    index.rebuild(actionCorpus())
    expect(index.search({ query: 'project create' })[0]?.action.name).toBe('project.create')
    const incompatible = index.search({
      query: 'project create',
      embedding: { model: 'other', values: new Float32Array([1, 0]) },
    })
    expect(incompatible[0]?.action.name).toBe('project.create')
    expect(incompatible[0]?.semanticScore).toBeUndefined()
  })
})
