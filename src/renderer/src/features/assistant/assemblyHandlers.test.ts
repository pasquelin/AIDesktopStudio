import { beforeEach, describe, expect, it } from 'vitest'
import { emptyGame, type GameManifest } from '@shared/domain/game'
import { barrelDocument, barrelNodes } from '@/engines/scene/prefab-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, sceneStore, useScenes } from '@/stores/scenes'
import { runAction } from './executor'

const DOCUMENT = 'doc-1'
const PREFAB = 'doc-barrel'
const scene = () => sceneOf(useScenes.getState(), DOCUMENT)
const written: GameManifest[] = []

describe('a game put together in one gesture', () => {
  beforeEach(() => {
    installScene(DOCUMENT)
    useDocuments.setState({
      stored: [
        {
          id: PREFAB,
          kind: 'scene',
          workspace: '3d',
          title: 'Barrel',
          path: 'documents/Barrel.gltf',
        },
      ],
    })
    written.length = 0
    let manifest = emptyGame()
    installFakeBridge({
      documents: { read: id => Promise.resolve(id === PREFAB ? barrelDocument(PREFAB) : null) },
      game: {
        read: () => Promise.resolve({ game: manifest, trouble: null }),
        write: given => {
          manifest = given
          written.push(given)
          return Promise.resolve({ game: manifest, trouble: null })
        },
      },
    })
  })

  it('lays a template down into the scene in front', async () => {
    const outcome = await runAction('game.applyTemplate', { template: 'thirdPerson' })

    expect(outcome).toMatchObject({ ok: true, data: { template: 'thirdPerson' } })
    expect(scene().nodes.map(node => node.name)).toContain('Player_Module')
    expect(scene().world.play.camera).toBe('thirdPerson')
  })

  /** The choice field is what refuses it, and it names the three — so the caller can repair. */
  it('refuses a template the studio does not carry, listing the ones it has', async () => {
    const outcome = await runAction('game.applyTemplate', { template: 'metroidvania' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(outcome.ok ? '' : outcome.detail).toContain('thirdPerson')
  })

  /** What a spoken request carries is a TITLE; a second call carries the id back. */
  it('instances a prefab named by its title, and one named by its id', async () => {
    expect(await runAction('prefab.instantiate', { prefab: 'Barrel' })).toMatchObject({
      ok: true,
      data: { nodes: 2 },
    })
    expect(await runAction('prefab.instantiate', { prefab: PREFAB })).toMatchObject({ ok: true })
    expect(scene().nodes.filter(node => node.name === 'Barrel')).toHaveLength(2)
  })

  it('puts it where it was asked for, and keeps what hangs off it', async () => {
    await runAction('prefab.instantiate', { prefab: 'Barrel', positionX: 3, positionZ: -2 })

    const root = scene().nodes.find(node => node.name === 'Barrel')
    expect(root?.transform.position).toMatchObject({ x: 3, z: -2 })
    expect(scene().nodes.find(node => node.parentId === root?.id)).toBeDefined()
  })

  /** The tab is where edits land: the disk would bring back a piece just deleted. */
  it('instances the OPEN tab of a prefab rather than its last save', async () => {
    // `replace` rather than a second `installScene`, which resets the whole map — the scene in
    // front would go, and the read would fall back to the disk it is meant to beat.
    sceneStore.use.getState().replace(PREFAB, { ...EMPTY_SCENE, nodes: barrelNodes().slice(0, 1) })

    expect(await runAction('prefab.instantiate', { prefab: PREFAB })).toMatchObject({
      ok: true,
      data: { nodes: 1 },
    })
  })

  /** Instancing the scene in front into itself doubles it, from its stale copy, for ever. */
  it('refuses to instance the scene in front into itself', async () => {
    expect(await runAction('prefab.instantiate', { prefab: DOCUMENT })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /** 🛑 `ref.ts` names `game.prefabs` as the resolver of a `prefab:` id, and nothing wrote it. */
  it('names the scene in front as a prefab, and answers the reference to it', async () => {
    const outcome = await runAction('prefab.define', { name: 'Caisse' })

    expect(outcome).toMatchObject({ ok: true, data: { name: 'Caisse', document: DOCUMENT } })
    expect(written[0]?.prefabs).toMatchObject([{ name: 'Caisse', document: DOCUMENT }])
  })

  /** 🛑 A reference already written into a component or a script must survive a rename. */
  it('keeps the id a piece already had when it is renamed', async () => {
    await runAction('prefab.define', { name: 'Caisse' })
    const first = written[0]?.prefabs[0]?.id

    await runAction('prefab.define', { name: 'Tonneau' })

    expect(written.at(-1)?.prefabs).toHaveLength(1)
    expect(written.at(-1)?.prefabs[0]).toMatchObject({ id: first, name: 'Tonneau' })
  })

  /** 🛑 `sceneDocumentNamed` falls back on the word itself: any string was named a prefab. */
  it('refuses to name a document the project does not hold', async () => {
    expect(await runAction('prefab.define', { name: 'Caisse', document: 'Nowhere' })).toMatchObject(
      { ok: false, refusal: 'notFound' },
    )
    expect(written).toEqual([])
  })

  it('instances a prefab named by the reference the manifest holds', async () => {
    const defined = await runAction('prefab.define', { name: 'Barrel', document: PREFAB })
    // The reference the action answers with, which is the whole point of it — see `refToString`.
    const reference = defined.ok ? String(Object(defined.data).ref) : ''

    expect(await runAction('prefab.instantiate', { prefab: reference })).toMatchObject({
      ok: true,
      data: { nodes: 2 },
    })
  })

  it('refuses a prefab the project does not hold', async () => {
    expect(await runAction('prefab.instantiate', { prefab: 'Anvil' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  /** Both gestures write into the open scene, and there is none until one is in front. */
  it('refuses both when no scene is in front', async () => {
    useDocuments.setState({ documents: {}, stored: [], activeId: null })

    expect(await runAction('game.applyTemplate', { template: 'thirdPerson' })).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
    expect(await runAction('prefab.instantiate', { prefab: 'Barrel' })).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })
})
