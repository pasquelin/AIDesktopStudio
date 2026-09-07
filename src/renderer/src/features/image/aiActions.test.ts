import { aiRoleId } from '@shared/domain/aiRole'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FieldDescriptor } from '@shared/domain/model'
import { setLayerMask } from '@/engines/canvas/commands'
import { installFakeBridge } from '@/services/fakeBridge'
import { installCanvas } from '@/stores/canvas-fixtures'
import { useCanvases } from '@/stores/canvases'
import { useLayouts } from '@/stores/layouts'
import { useModels } from '@/stores/models'
import { chooseModels } from '@/stores/models-fixtures'
import { chassisFor } from '@/stores/panels-fixtures'
import { shownIn } from '@pasquelin/panels'
import { panelsStore } from '@/stores/panels'
import { prepareEdit } from './aiActions'

const INPAINT = aiRoleId('image', 'inpaint')

const DOCUMENT = 'doc-1'

const FIELDS: FieldDescriptor[] = [
  { key: 'prompt', kind: 'longText', label: 'Prompt', required: false },
  { key: 'image', kind: 'image', label: 'Image', required: true },
  { key: 'mask', kind: 'image', label: 'Mask', required: false, maskFrom: 'image' },
]

const host = {
  snapshot: () => Promise.resolve('FLAT'),
  maskSnapshot: () => Promise.resolve('MASK'),
}

let uploaded: string[] = []
const bridge = {
  uploadAsset: (_name: string, image: string) => {
    uploaded.push(image)
    return Promise.resolve(`asset-${image.toLowerCase()}`)
  },
  describeModel: () => Promise.resolve({ fields: FIELDS }),
}

beforeEach(() => {
  uploaded = []
  installCanvas(DOCUMENT)
  chassisFor('image')
  useLayouts.setState({ activeWorkspace: 'image', home: false })
  // The employment a retouch reaches for since ADR-23, not the family's first one: the same
  // weights serve both, and a person may well have picked differently for each.
  chooseModels({ [INPAINT]: 'model_flux' })
})

describe('preparing an edit', () => {
  it("opens the retouch's own model on the flattened document", async () => {
    await expect(prepareEdit(DOCUMENT, 'regenerate', host, bridge)).resolves.toBe(true)

    expect(useModels.getState().selected[INPAINT]).toBe('model_flux')
    // The form still opens on the FAMILY, which is what a descriptor belongs to.
    expect(useModels.getState().preset[INPAINT]).toMatchObject({ image: 'asset-flat' })
  })

  /**
   * 🛑 ADR-23 § C. Naming the family reached for what text-to-image was on, so someone who had
   * chosen SSD-1B to retouch with had their retouch run by whatever drew from words.
   */
  it('leaves the model of another employment of the same family alone', async () => {
    chooseModels({ [aiRoleId('image', 'txt2img')]: 'model_words' })

    await expect(prepareEdit(DOCUMENT, 'regenerate', host, bridge)).resolves.toBe(false)

    expect(uploaded).toEqual([])
  })

  /**
   * The canvas does not honour a mask whose box is unticked, so sending it would ask the model
   * to repaint a region nothing on screen shows.
   */
  it('leaves a disabled mask out of the edit', async () => {
    useCanvases
      .getState()
      .runCommand(DOCUMENT, setLayerMask('layer-1', { enabled: false, linked: true }))

    await prepareEdit(DOCUMENT, 'regenerate', host, bridge)

    expect(uploaded).toEqual(['FLAT'])
  })

  // An upload is a permanent asset in the user's library: a model with nowhere to put a picture
  // must not cost one.
  it('sends nothing to a model that takes no picture', async () => {
    const textOnly = {
      ...bridge,
      describeModel: () =>
        Promise.resolve({ fields: [FIELDS[0]].filter(field => field !== undefined) }),
    }

    await expect(prepareEdit(DOCUMENT, 'regenerate', host, textOnly)).resolves.toBe(false)
    expect(uploaded).toEqual([])
  })

  /**
   * REJECTS rather than answering `false`, and the difference is a line in the journal: the two
   * refusals above each bring something forward — the models panel, the settings screen — and this
   * one has nothing to show. Answering `false`, the menu item did nothing and said nothing.
   */
  it('says so, rather than nothing, when the editor has no picture to send', async () => {
    const booting = { ...host, snapshot: () => Promise.resolve(null) }

    await expect(prepareEdit(DOCUMENT, 'regenerate', booting, bridge)).rejects.toThrow()
    expect(uploaded).toEqual([])
  })

  // The mask one paints is the mask one regenerates — but only where the layer carries one.
  it('sends the mask along when the armed layer has one', async () => {
    useCanvases
      .getState()
      .runCommand(DOCUMENT, setLayerMask('layer-1', { enabled: true, linked: true }))

    await prepareEdit(DOCUMENT, 'regenerate', host, bridge)

    expect(uploaded).toEqual(['FLAT', 'MASK'])
    expect(useModels.getState().preset[INPAINT]).toMatchObject({ mask: 'asset-mask' })
  })

  it('sends only the picture when there is no mask to send', async () => {
    await prepareEdit(DOCUMENT, 'regenerate', host, bridge)

    expect(uploaded).toEqual(['FLAT'])
  })

  // Cutting out, enlarging and vectorizing take the picture whole: a mask would mean nothing.
  it('asks each edit of the employment it belongs to', async () => {
    chooseModels({ [aiRoleId('upscale', 'upscale')]: 'model_big' })

    await prepareEdit(DOCUMENT, 'enlarge', host, bridge)

    expect(useModels.getState().selected[aiRoleId('upscale', 'upscale')]).toBe('model_big')
    expect(uploaded).toEqual(['FLAT'])
  })

  /**
   * Never a model chosen on the user's behalf. The generation panel comes up instead: its picker
   * lists exactly what this operation can be served by, which is where choosing one belongs.
   */
  it('opens the generation panel rather than picking one when none is set', async () => {
    chooseModels()

    await expect(prepareEdit(DOCUMENT, 'regenerate', host, bridge)).resolves.toBe(false)

    expect(uploaded).toEqual([])
    expect(shownIn(panelsStore.getState(), 'left').primary).toBe('generator')
  })

  /**
   * The Models panel lists the workspace's own family and no other, so it can never show a
   * vectorizer: sending the user there was a dead end, and the reason three edits read as
   * "the panel opens and nothing happens".
   */
  it('opens the settings screen of a family the workspace has no panel for', async () => {
    const opened: string[] = []
    installFakeBridge({
      settings: {
        open: section => {
          opened.push(section)
          return Promise.resolve()
        },
      },
    })
    chooseModels()

    await expect(prepareEdit(DOCUMENT, 'vectorize', host, bridge)).resolves.toBe(false)

    expect(opened).toEqual(['ai.vectorization'])
    expect(uploaded).toEqual([])
  })

  // The action prepares; it never submits. Every parameter of the model stays visible, and the
  // edit is reviewable before it is paid for.
  it('brings the form forward rather than submitting it', async () => {
    await prepareEdit(DOCUMENT, 'regenerate', host, bridge)

    expect(panelsStore.getState().focusedZone).toBe('left')
  })
})
