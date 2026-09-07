import { describe, expect, it } from 'vitest'
import type { AiOverview, ModelCandidate, RoleRow } from '@shared/domain/aiOverview'
import { aiRoleId, ASSISTANT_ROLE } from '@shared/domain/aiRole'
import { GIBI, localModel } from '@shared/domain/localModel-fixtures'
import { EMPTY_AI_OVERVIEW } from '@/services/fakeAiOverview'
import { sectionModels, welcomeSections } from './welcomeSections'

const candidate = (id: string, diskBytes: number): ModelCandidate => ({
  model: localModel({ id, name: id, diskBytes }),
  installed: false,
  loaded: false,
  holdable: true,
  unverified: false,
  supplied: false,
  serves: 1,
  fit: 'compatible',
  obstacle: null,
})

const row = (role: RoleRow['role'], candidates: readonly ModelCandidate[]): RoleRow => ({
  role,
  provider: null,
  chosen: { app: null, project: null },
  candidates,
  clouds: [],
})

const overview = (roles: readonly RoleRow[]): AiOverview => ({ ...EMPTY_AI_OVERVIEW, roles })

describe('the sections a first launch picks between', () => {
  it('opens on the assistant, wherever the employments put it', () => {
    const sections = welcomeSections(
      overview([row(aiRoleId('image', 'txt2img'), []), row(ASSISTANT_ROLE, [])]),
    )

    expect(sections.map(group => group.key)).toEqual([ASSISTANT_ROLE, 'image'])
  })
})

describe('what one section can download', () => {
  it('names a model once, though the family holds it for several employments', () => {
    const sdxl = candidate('sdxl', 4 * GIBI)
    const models = sectionModels(
      overview([
        row(aiRoleId('image', 'txt2img'), [sdxl]),
        row(aiRoleId('image', 'img2img'), [sdxl]),
      ]),
      welcomeSections(overview([row(aiRoleId('image', 'txt2img'), [sdxl])]))[0]!,
      4,
    )

    expect(models.map(one => one.model.id)).toEqual(['sdxl'])
  })

  it('offers the lightest first, and only as many as the screen holds', () => {
    const models = sectionModels(
      overview([
        row(ASSISTANT_ROLE, [
          candidate('big', 8 * GIBI),
          candidate('small', GIBI),
          candidate('mid', 4 * GIBI),
        ]),
      ]),
      welcomeSections(overview([row(ASSISTANT_ROLE, [])]))[0]!,
      2,
    )

    expect(models.map(one => one.model.id)).toEqual(['small', 'mid'])
  })
})
