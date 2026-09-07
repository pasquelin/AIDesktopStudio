import { describe, expect, it } from 'vitest'
import { createStudio } from './studio'
import { PROJECT } from './project'

describe('isolation du studio du banc', () => {
  it('ne transmet pas les modèles armés au run suivant', async () => {
    const first = await createStudio(PROJECT)
    await first.run('generator.prepare', {
      family: 'image',
      modelId: 'model-image',
      parameters: { prompt: 'voiture rouge' },
    })
    first.close()

    const second = await createStudio(PROJECT)
    try {
      expect((await second.snapshot()).armedModels).toEqual({})
    } finally {
      second.close()
    }
  })
})

describe('the window a headless run has not', () => {
  it('survives the studio closing its own window', async () => {
    const first = await createStudio(PROJECT)
    window.close()
    first.close()

    const second = await createStudio(PROJECT)
    try {
      expect(second.documents()).toBeDefined()
    } finally {
      second.close()
    }
  })
})
