import { describe, expect, it } from 'vitest'
import {
  ASSET_CLOUDS,
  chatModelOf,
  CLOUD_IDS,
  CLOUD_PROVIDERS,
  cloudsServing,
  defaultChatModel,
  isCloudProviderId,
  LIBRARY_CLOUDS,
  SCENARIO_CLOUD,
} from './aiCloud'
import { aiRoleId, ASSISTANT_ROLE, DICTATION_ROLE } from './aiRole'
import { TRIPO_CLOUD } from './tripo'

/** Every cloud that answers a conversation — which is every one but the two that only generate. */
const CHATTING = CLOUD_IDS.filter(id => id !== TRIPO_CLOUD)

describe('the cloud registry', () => {
  /**
   * What a cloud serves is DATA it declares, so a role nothing lists is offered none without a
   * single condition being written about it. Dictation is that role: nothing here turns speech
   * into text off this machine.
   */
  it('offers a cloud only where one declares serving the role', () => {
    expect(cloudsServing(aiRoleId('image', 'inpaint'))).toEqual([SCENARIO_CLOUD])
    expect(cloudsServing(ASSISTANT_ROLE)).toEqual(CHATTING)
    expect(cloudsServing(DICTATION_ROLE)).toEqual([])
  })

  it('does not offer Scenario for capabilities without a Scenario model', () => {
    expect(cloudsServing(aiRoleId('upscale', 'upscale'))).toEqual([])
    expect(cloudsServing(aiRoleId('background-removal', 'cutout'))).toEqual([])
    expect(cloudsServing(aiRoleId('vectorization', 'vectorize'))).toEqual([])
  })

  /**
   * A cloud publishing only PART of a family is offered for that part alone. Tripo generates a
   * picture and edits one, and nothing of it inpaints — offered there, the picker would open on
   * an account that has no model to run.
   */
  it('offers a partial cloud under the employments it names, and no other', () => {
    expect(cloudsServing(aiRoleId('image', 'txt2img'))).toContain(TRIPO_CLOUD)
    expect(cloudsServing(aiRoleId('3d', 'rig'))).toContain(TRIPO_CLOUD)
    expect(cloudsServing(aiRoleId('image', 'outpaint'))).not.toContain(TRIPO_CLOUD)
  })

  it('serves a script from every chat cloud, and from Scenario nowhere', () => {
    const writing = cloudsServing(aiRoleId('code', 'txt2code'))

    expect(writing).not.toContain(SCENARIO_CLOUD)
    expect(writing).toEqual(CHATTING.filter(id => id !== SCENARIO_CLOUD))
  })

  /**
   * The two halves that used to be one list. Generating assets and holding a library of them are
   * different properties, and Tripo has only the first — deriving the second from the families
   * would put an empty asset browser beside a full one.
   */
  it('tells a cloud that generates assets from one that keeps a library of them', () => {
    expect(ASSET_CLOUDS).toEqual([SCENARIO_CLOUD, TRIPO_CLOUD])
    expect(LIBRARY_CLOUDS).toEqual([SCENARIO_CLOUD])
  })

  // The registry decides, never a string that arrived from a stored file or an IPC payload.
  it('answers for the ids it holds, and for no other', () => {
    expect(isCloudProviderId('scenario')).toBe(true)
    expect(isCloudProviderId('openai')).toBe(true)
    expect(isCloudProviderId('nowhere')).toBe(false)
    expect(isCloudProviderId(null)).toBe(false)
  })

  /**
   * The whole point of the list: a second cloud is an ENTRY, and everything that reads the
   * registry follows it — no branch anywhere learns its name.
   */
  it('would serve a role from an entry nobody had to teach the code about', () => {
    expect(CLOUD_IDS).toEqual(CLOUD_PROVIDERS.map(one => one.id))
    expect(CLOUD_PROVIDERS.every(one => one.id.length > 0)).toBe(true)
  })

  /**
   * Scenario answers `null`, which is the reading « this one is not talked to over HTTP »: its
   * thinking goes through the catalogue, on one of a fixed four that are priced and enumerated.
   */
  it('declares the model each cloud is talked to with', () => {
    expect(defaultChatModel('deepseek')).toBe('deepseek-chat')
    expect(defaultChatModel('scenario')).toBeNull()
    expect(defaultChatModel('nowhere')).toBeNull()
  })

  it('takes a name typed for a cloud, and reads one emptied as none', () => {
    expect(chatModelOf('deepseek-reasoner', 'deepseek-chat')).toBe('deepseek-reasoner')
    expect(chatModelOf(undefined, 'deepseek-chat')).toBe('deepseek-chat')
    expect(chatModelOf('  ', 'deepseek-chat')).toBe('deepseek-chat')
  })
})
