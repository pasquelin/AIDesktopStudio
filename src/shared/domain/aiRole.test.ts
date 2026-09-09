import { describe, expect, it } from 'vitest'
import {
  aiRoleId,
  allRoles,
  ASSISTANT_ROLE,
  currentAiRoleKey,
  DICTATION_ROLE,
  SMART_SELECTION_ROLE,
  partsOfRole,
  primaryRoleOf,
  providerFor,
  roleChoicesFor,
  type RoleChoices,
  type RoleOffer,
  type RoleProvider,
} from './aiRole'

/** Installed defaults to what is usable: the two only part where a machine says no. */
const offer = (over: Partial<RoleOffer> = {}): RoleOffer => ({
  localModelIds: [],
  cloudIds: [],
  ...over,
  installedModelIds: over.installedModelIds ?? over.localModelIds ?? [],
})

/** A cloud, named by an id the way every one of them is — never by a member of the union. */
const CLOUD: RoleProvider = { kind: 'cloud', providerId: 'scenario' }

describe('aiRoleId', () => {
  it('names a capability of a family', () => {
    expect(aiRoleId('image', 'inpaint')).toBe('image/inpaint')
    expect(aiRoleId('video', 'img2video')).toBe('video/img2video')
  })

  // A role keys the stored preference: a name nobody serves would read as "no choice made" and
  // never redden, so it is refused where it is composed.
  it('refuses a capability the family does not have', () => {
    expect(() => aiRoleId('image', 'txt2video')).toThrow()
    expect(() => aiRoleId('video', 'inpaint')).toThrow()
    expect(() => aiRoleId('image', '')).toThrow()
  })
})

describe('allRoles', () => {
  // Derived from the capability table rather than listed: a family that gains a capability gains
  // its role, where a list written by hand would drift the day one is added.
  it('covers every capability of every family, plus the two standalone roles', () => {
    const roles = allRoles()

    expect(roles).toContain(ASSISTANT_ROLE)
    expect(roles).toContain(DICTATION_ROLE)
    expect(roles).toContain(aiRoleId('image', 'txt2img'))
    expect(roles).toContain(aiRoleId('audio', 'video2audio'))
    expect(roles).toContain(aiRoleId('skybox', 'txt2skybox'))
    expect(roles).toContain(aiRoleId('skybox', 'img2skybox'))
    expect(new Set(roles).size).toBe(roles.length)
  })
})

describe('primaryRoleOf', () => {
  it('names the first capability of a generating family', () => {
    expect(primaryRoleOf('image')).toBe(aiRoleId('image', 'txt2img'))
    expect(primaryRoleOf('3d')).toBe(aiRoleId('3d', 'txt23d'))
    expect(primaryRoleOf('skybox')).toBe(aiRoleId('skybox', 'txt2skybox'))
  })

  /**
   * The three families the canvas edits reach for gained one on 2026-08-23, which is what lets a
   * single preference table serve every employment. `other` is the one family that has none.
   */
  it('names the employment of a family that has exactly one', () => {
    expect(primaryRoleOf('upscale')).toBe(aiRoleId('upscale', 'upscale'))
    expect(primaryRoleOf('background-removal')).toBe(aiRoleId('background-removal', 'cutout'))
  })

  it('answers nothing for a family that has no employment', () => {
    expect(primaryRoleOf('other')).toBeNull()
  })

  // Appending is what keeps a family's default generation where it was: `3d` gained `rig` and
  // `motion`, and text-to-3D is still what the space generates when nothing else is asked.
  it('is unmoved by a capability appended to a family', () => {
    expect(primaryRoleOf('3d')).toBe(aiRoleId('3d', 'txt23d'))
  })
})

it('uses the cutout employment for smart image selection', () => {
  expect(SMART_SELECTION_ROLE).toBe(aiRoleId('background-removal', 'cutout'))
  expect(currentAiRoleKey('smart-selection')).toBe(SMART_SELECTION_ROLE)
})

describe('partsOfRole', () => {
  it('reads back what a generation role is made of', () => {
    expect(partsOfRole(aiRoleId('3d', 'img23d'))).toEqual({ family: '3d', capability: 'img23d' })
  })

  it('answers nothing for a role that is not a pair', () => {
    expect(partsOfRole(ASSISTANT_ROLE)).toBeNull()
    expect(partsOfRole(DICTATION_ROLE)).toBeNull()
  })
})

describe('roleChoicesFor', () => {
  const defaults: RoleChoices = { [ASSISTANT_ROLE]: CLOUD }
  const byProject: Record<string, RoleChoices> = { '/work/client': { [DICTATION_ROLE]: CLOUD } }

  it('stands on the default alone when no project is open', () => {
    expect(roleChoicesFor(defaults, byProject, null)).toEqual(defaults)
  })

  // Per ROLE: overriding one in a project must not reset the others to nothing.
  it('overlays what a project overrides without dropping the rest', () => {
    expect(roleChoicesFor(defaults, byProject, '/work/client')).toEqual({
      [ASSISTANT_ROLE]: CLOUD,
      [DICTATION_ROLE]: CLOUD,
    })
  })

  it('leaves the default alone for a project that overrides nothing', () => {
    expect(roleChoicesFor(defaults, byProject, '/work/other')).toEqual(defaults)
  })

  it('lets a project override a role the default already set', () => {
    const overriding: Record<string, RoleChoices> = {
      '/work/client': { [ASSISTANT_ROLE]: { kind: 'local', modelId: 'x' } },
    }

    expect(roleChoicesFor(defaults, overriding, '/work/client')).toEqual({
      [ASSISTANT_ROLE]: { kind: 'local', modelId: 'x' },
    })
  })
})

describe('providerFor', () => {
  const noChoice: RoleChoices = {}

  // A key present is not a subscription to spend, and an installed model is not a choice.
  it('answers nothing until a provider is chosen, even when one could serve', () => {
    expect(providerFor(ASSISTANT_ROLE, noChoice, offer({ localModelIds: ['llama'] }))).toBeNull()
    expect(providerFor(ASSISTANT_ROLE, noChoice, offer({ cloudIds: ['scenario'] }))).toBeNull()
    expect(
      providerFor(
        ASSISTANT_ROLE,
        noChoice,
        offer({ localModelIds: ['llama'], cloudIds: ['scenario'] }),
      ),
    ).toBeNull()
  })

  // The role says so at its own place, instead of a global banner condemning the whole app.
  it('answers nothing when neither side can serve', () => {
    expect(providerFor(ASSISTANT_ROLE, noChoice, offer())).toBeNull()
  })

  // Locally it may still fall back: another model on this machine is what the person asked for.
  it('falls back to another local model when the chosen one has gone', () => {
    const chosen: RoleChoices = { [ASSISTANT_ROLE]: { kind: 'local', modelId: 'gone' } }

    expect(
      providerFor(
        ASSISTANT_ROLE,
        chosen,
        offer({ localModelIds: ['llama'], installedModelIds: ['llama'], cloudIds: ['scenario'] }),
      ),
    ).toEqual({ kind: 'local', modelId: 'llama' })
  })

  it('honours an explicit choice over an installed local model', () => {
    const chosen: RoleChoices = { [ASSISTANT_ROLE]: CLOUD }

    expect(
      providerFor(
        ASSISTANT_ROLE,
        chosen,
        offer({ localModelIds: ['llama'], cloudIds: ['scenario'] }),
      ),
    ).toEqual(CLOUD)
  })

  /**
   * A cloud is one entry of a list, never a member of the union. A choice pointing at one the
   * registry no longer holds answers nothing — switching to another billed cloud is not a fallback.
   */
  it('answers nothing when the chosen cloud is no longer offered', () => {
    const chosen: RoleChoices = { [ASSISTANT_ROLE]: { kind: 'cloud', providerId: 'gone' } }

    expect(providerFor(ASSISTANT_ROLE, chosen, offer({ cloudIds: ['scenario'] }))).toBeNull()
  })

  // A model uninstalled since the choice was stored: the role keeps working on what is LEFT ON
  // THIS MACHINE rather than failing — and answers nothing when there is nothing left.
  it('answers nothing when a stale local choice has no local successor', () => {
    const stale: RoleChoices = { [ASSISTANT_ROLE]: { kind: 'local', modelId: 'gone' } }

    expect(providerFor(ASSISTANT_ROLE, stale, offer())).toBeNull()
  })

  it('keeps the choice of one role out of another', () => {
    const chosen: RoleChoices = { [ASSISTANT_ROLE]: CLOUD }

    expect(providerFor(DICTATION_ROLE, chosen, offer({ localModelIds: ['parakeet'] }))).toBeNull()
    expect(providerFor(ASSISTANT_ROLE, chosen, offer({ cloudIds: ['scenario'] }))).toEqual(CLOUD)
  })

  /**
   * Comparing the choice to the DEFAULT — the first usable model — dropped it in silence the
   * moment a role had two, and the screen then ticked the first while the second was stored.
   */
  it('honours a chosen model that is not the one the role would take on its own', () => {
    const second: RoleChoices = { [ASSISTANT_ROLE]: { kind: 'local', modelId: 'mistral' } }

    expect(
      providerFor(ASSISTANT_ROLE, second, offer({ localModelIds: ['llama', 'mistral'] })),
    ).toEqual({ kind: 'local', modelId: 'mistral' })
  })

  /**
   * 🛑 A resident model makes the machine read as smaller than it is — nothing subtracts what it
   * already occupies — so the verdict moves UNDER a running conversation. Dropping the choice then
   * moved the next sentence to a billed cloud without a word.
   */
  it('honours a chosen model the machine has stopped calling comfortable', () => {
    const chosen: RoleChoices = { [ASSISTANT_ROLE]: { kind: 'local', modelId: 'llama' } }
    const tight = offer({ localModelIds: [], installedModelIds: ['llama'], cloudIds: ['scenario'] })

    expect(providerFor(ASSISTANT_ROLE, chosen, tight)).toEqual({ kind: 'local', modelId: 'llama' })
  })

  /**
   * 🛑 Measured before it was decided: a runtime that stopped answering — an Ollama nobody
   * started — empties both lists exactly as an uninstall does, and the old fallback moved the next
   * sentence to a BILLED cloud without a word. Choosing this machine is also choosing not to pay.
   */
  it('answers nothing when the chosen model is not installed at all', () => {
    const chosen: RoleChoices = { [ASSISTANT_ROLE]: { kind: 'local', modelId: 'llama' } }

    expect(providerFor(ASSISTANT_ROLE, chosen, offer({ cloudIds: ['scenario'] }))).toBeNull()
  })
})
