import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { Rig, RigBone } from '@shared/domain/rig'
import type { CharacterExtras } from '@shared/domain/character'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { setCharacterBoneRest } from '@/engines/character/characterCommands'
import { installFakeBridge } from '@/services/fakeBridge'
import { isCharacterDirty, seedCharacter, useCharacters } from '@/stores/character'
import { clearCharacters } from '@/stores/character-fixtures'
import { saveCharacter, saveCharacterDocument } from './characterSave'
import { noteCharacterSkins, type CharacterSkinning } from './characterSkins'
import { installCharacterDocument } from '@/stores/character-fixtures'
import { useDocuments } from '@/stores/documents'

/** Each container the port was asked to rebuild, held open until a case lets it land. */
const writes = vi.hoisted(
  (): {
    bones: readonly RigBone[]
    skins: unknown
    extras: CharacterExtras
    land: (ok: boolean) => void
  }[] => [],
)

vi.mock('@/engines/scene/glbWrite.worker?worker', () => ({ default: class {} }))

vi.mock('@/engines/scene/glbWriter', () => ({
  createGlbWriter: () => ({
    write: (
      _file: Uint8Array,
      patch: { bones: readonly RigBone[]; skins: unknown; extras: CharacterExtras },
    ) =>
      new Promise((resolve, reject) => {
        writes.push({
          bones: patch.bones,
          skins: patch.skins,
          extras: patch.extras,
          land: ok => (ok ? resolve(new Uint8Array([1])) : reject(new Error('the worker let go'))),
        })
      }),
    dispose: () => {},
  }),
}))

vi.mock('@/helpers/assetFetch', () => ({
  assetBytes: () => Promise.resolve(new Uint8Array([1, 2])),
}))

const ASSET = 'asset-hero'
const RIG: Rig = {
  origin: 'local',
  bones: [{ name: 'Spine', parent: null, rest: IDENTITY_TRANSFORM }],
}

const raised = (y: number) => ({ ...IDENTITY_TRANSFORM, position: { x: 0, y, z: 0 } })
const poseSpine = (y: number): void =>
  useCharacters.getState().runCommand(ASSET, setCharacterBoneRest('Spine', raised(y)))
const dirty = (): boolean => isCharacterDirty(useCharacters.getState(), ASSET)

/** What the engine last weighed, read by the writes through the getter every ⌘S hands over. */
let weighed: CharacterSkinning = []

const filed: Asset = {
  id: ASSET,
  name: 'Héros',
  type: 'mesh',
  location: 'local',
  tags: [],
  createdAt: '2026-09-02T00:00:00.000Z',
}

beforeEach(() => {
  writes.length = 0
  weighed = []
  clearCharacters()
  installFakeBridge({ assets: { saveMesh: () => Promise.resolve(filed) } })
  seedCharacter(ASSET, RIG, {})
})

describe('writing a character back to its own file', () => {
  // 🛑 Rebuilding tens of megabytes takes seconds and a hand goes on posing through them. Read
  // after the write, the mark counted those poses as being in a file that does not hold them.
  it('does not count a pose made while the file was being written as saved', async () => {
    const saving = saveCharacter(ASSET, () => weighed)
    await vi.waitFor(() => expect(writes).toHaveLength(1))

    poseSpine(0.2)
    writes[0]?.land(true)

    expect(await saving).toBe(true)
    expect(dirty()).toBe(true)
  })

  it('writes the material dress beside the character data', async () => {
    seedCharacter(ASSET, RIG, {
      dress: { kind: 'materials', documentIds: ['material-1'] },
    })

    const saving = saveCharacter(ASSET, () => weighed)
    await vi.waitFor(() => expect(writes).toHaveLength(1))
    writes[0]?.land(true)
    await saving

    expect(writes[0]?.extras.dress).toEqual({
      kind: 'materials',
      documentIds: ['material-1'],
    })
  })

  it('writes the material dress when the model has no skeleton', async () => {
    seedCharacter(ASSET, null, { dress: { kind: 'image', assetId: 'texture-1' } })

    const saving = saveCharacter(ASSET, () => weighed)
    await vi.waitFor(() => expect(writes).toHaveLength(1))
    writes[0]?.land(true)

    expect(await saving).toBe(true)
    expect(writes[0]).toMatchObject({
      bones: [],
      skins: [],
      extras: { dress: { kind: 'image', assetId: 'texture-1' } },
    })
  })

  // A second ⌘S is pressed precisely because the first showed nothing. Answered with the first
  // one's promise it wrote no byte and still said `true`.
  it('writes the skeleton as it stands when a save waits its turn behind another', async () => {
    const first = saveCharacter(ASSET, () => weighed)
    await vi.waitFor(() => expect(writes).toHaveLength(1))

    poseSpine(0.2)
    const second = saveCharacter(ASSET, () => weighed)
    writes[0]?.land(true)
    await vi.waitFor(() => expect(writes).toHaveLength(2))
    writes[1]?.land(true)

    expect([await first, await second]).toEqual([true, true])
    expect(writes[0]?.bones[0]?.rest.position.y).toBe(0)
    expect(writes[1]?.bones[0]?.rest.position.y).toBe(0.2)
    // And the second landing IS what makes the character clean: its own mark, its own answer.
    expect(dirty()).toBe(false)
  })

  /**
   * 🛑 The weights are the engine's answer ABOUT the skeleton: written with the bones of now and
   * the weights of before, `JOINTS_0` indexes joints that moved under it.
   */
  it('weighs a waiting save against the skeleton as it stands when it starts', async () => {
    const first = saveCharacter(ASSET, () => weighed)
    await vi.waitFor(() => expect(writes).toHaveLength(1))

    const second = saveCharacter(ASSET, () => weighed)
    // The engine reweighs while the first container is still being rebuilt.
    weighed = [{ mesh: 0, primitive: 0, joints: new Uint16Array([7]), weights: new Float32Array() }]
    writes[0]?.land(true)
    await vi.waitFor(() => expect(writes).toHaveLength(2))
    writes[1]?.land(true)
    await Promise.all([first, second])

    expect(writes[0]?.skins).toEqual([])
    expect(writes[1]?.skins).toEqual(weighed)
  })

  // Three ⌘S are one intent, and each rebuild is tens of megabytes: a write that already has one
  // behind it is superseded before it lands, so the third joins that slot rather than stacking.
  it('collapses every save pressed while one waits into that one', async () => {
    const saves = [saveCharacter(ASSET, () => weighed)]
    await vi.waitFor(() => expect(writes).toHaveLength(1))

    saves.push(
      saveCharacter(ASSET, () => weighed),
      saveCharacter(ASSET, () => weighed),
    )
    writes[0]?.land(true)
    await vi.waitFor(() => expect(writes).toHaveLength(2))
    writes[1]?.land(true)

    expect(await Promise.all(saves)).toEqual([true, true, true])
    expect(writes).toHaveLength(2)
  })

  // The branch the queue exists for: a refusal must not take the save behind it down with it.
  it('writes the one waiting even when the write before it failed', async () => {
    // Awaited from the start: a refusal nobody is listening for yet is an unhandled rejection,
    // which vitest reports against whichever case happened to be running.
    const refused = expect(saveCharacter(ASSET, () => weighed)).rejects.toThrow()
    await vi.waitFor(() => expect(writes).toHaveLength(1))

    poseSpine(0.2)
    const second = saveCharacter(ASSET, () => weighed)
    writes[0]?.land(false)
    await vi.waitFor(() => expect(writes).toHaveLength(2))
    writes[1]?.land(true)

    await refused
    expect(await second).toBe(true)
    expect(dirty()).toBe(false)
  })
})

/**
 * ⌘S on a character tab, which is what the shell's own router fires: the model's container is
 * patched, and the project folder gains nothing — see `IO_BY_KIND.character`.
 */
describe('saving the character tab in front', () => {
  const DOCUMENT = 'doc-hero'

  it('patches the model the tab was opened on, weights and all', async () => {
    installCharacterDocument(DOCUMENT, ASSET)
    seedCharacter(ASSET, RIG, {})
    poseSpine(0.2)
    noteCharacterSkins(ASSET, weighed)

    const saved = saveCharacterDocument(DOCUMENT)
    await vi.waitFor(() => expect(writes).toHaveLength(1))
    writes[0]?.land(true)

    expect(await saved).toBe(true)
    expect(writes[0]?.skins).toBe(weighed)
    expect(writes[0]?.bones[0]?.rest.position.y).toBeCloseTo(0.2, 5)
  })

  // A descriptor that lost its asset is a tab with nothing behind it: writing would patch a
  // container this document never named.
  it('writes nothing for a tab naming no model', async () => {
    useDocuments.setState({
      documents: {
        [DOCUMENT]: {
          id: DOCUMENT,
          kind: 'character',
          workspace: '3d',
          title: 'orphan',
          path: 'Modelling/Models/orphan.glb',
        },
      },
      activeId: DOCUMENT,
    })

    expect(await saveCharacterDocument(DOCUMENT)).toBe(false)
    expect(writes).toHaveLength(0)
  })
})
