import { beforeEach, expect, it, onTestFinished } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { createCatalog, type Catalog } from './catalog'
import { dispatchCatalogRequest } from './catalogDispatch'
import { openMemoryDatabase } from './sqliteMemory'

const animation: Asset = {
  id: 'jump',
  name: 'Jump',
  type: 'animation',
  location: 'local',
  tags: ['motion'],
  createdAt: '2026-09-06',
  path: 'Animations/Jump.glb',
}
let catalog: Catalog
beforeEach(() => {
  const driver = openMemoryDatabase()
  onTestFinished(driver.close)
  catalog = createCatalog(driver)
  catalog.add(animation)
})

it('publishes through the worker protocol without replacing edits made during rendering', () => {
  catalog.add({ ...animation, name: 'My jump', tags: ['chosen'] })
  const response = dispatchCatalogRequest(catalog, {
    id: 1,
    op: 'setAnimationPoster',
    assetId: animation.id,
    sourcePath: 'Animations/Jump.glb',
    posterPath: 'Animations/Jump.glb.thumb.png',
  })
  expect(response).toEqual({ id: 1, ok: true, value: true })
  expect(catalog.find(animation.id)).toMatchObject({
    name: 'My jump',
    tags: ['chosen'],
    posterPath: 'Animations/Jump.glb.thumb.png',
  })
})

it('rejects publication after a move, deletion, missing file or another poster', () => {
  const publish = () =>
    catalog.setAnimationPoster({
      assetId: animation.id,
      sourcePath: 'Animations/Jump.glb',
      posterPath: 'new.png',
    })
  catalog.repath('Animations/Jump.glb', 'Moved.glb')
  expect(publish()).toBe(false)
  expect(catalog.find(animation.id)?.path).toBe('Moved.glb')
  catalog.remove(animation.id)
  expect(publish()).toBe(false)
  expect(catalog.find(animation.id)).toBeNull()
  catalog.add({ ...animation, posterPath: 'chosen.png' })
  expect(publish()).toBe(false)
  expect(catalog.find(animation.id)?.posterPath).toBe('chosen.png')
  catalog.add(animation)
  catalog.markMissing(animation.id, '2026-09-06')
  expect(publish()).toBe(false)
})

/**
 * The automatic pass may never overwrite a still; a person asking for one must.
 *
 * What the accepted write is FOR is the stamp: a redrawn still keeps its name — it lives at
 * `<folder>/thumb.png` and nowhere else — and the shelf reads it through a versioned URL, so
 * without a new `local_changed_at` the window goes on serving the picture just replaced. Both
 * columns are written by the one statement, so an accepted write is the stamp moving.
 *
 * 🛑 Not measured on the stamp ITSELF: `new Date()` resolves to the millisecond and the catalogue
 * takes no clock, so two writes of one tick carry the same one. A real redraw costs seconds.
 */
it('redraws over a still on demand, and only on demand', () => {
  const publish = (replace?: boolean) =>
    catalog.setAnimationPoster({
      assetId: animation.id,
      sourcePath: 'Animations/Jump.glb',
      posterPath: 'Animations/Jump/thumb.png',
      replace,
    })

  expect(publish()).toBe(true)
  expect(publish()).toBe(false)
  expect(publish(true)).toBe(true)
  expect(catalog.find(animation.id)?.posterPath).toBe('Animations/Jump/thumb.png')
})
