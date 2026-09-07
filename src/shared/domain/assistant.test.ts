import { describe, expect, it } from 'vitest'
import { isRecord } from '../guards'
import { LANGUAGES, TRANSLATIONS } from '../i18n'
import {
  ACTION_REFUSALS,
  ACTION_REGISTRY,
  assistantAction,
  commitmentOfCommand,
  findActions,
  needsConfirmation,
  refusalKey,
} from './assistant'
import { COMMAND_REGISTRY, type CommandId } from './command'
import { delegated } from './delegation'

function resolve(bundle: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((current, part) => (isRecord(current) ? current[part] : undefined), bundle)
}

const KEYS_OF = (): readonly string[] =>
  ACTION_REGISTRY.flatMap(action => [
    action.titleKey,
    action.descriptionKey,
    ...action.fields.map(field => field.labelKey),
  ])

describe('the action registry', () => {
  it('names each action once', () => {
    const names = ACTION_REGISTRY.map(action => action.name)

    expect(new Set(names).size).toBe(names.length)
  })

  it.each(LANGUAGES.map(language => language.code))('says what every action does in %s', code => {
    for (const key of KEYS_OF()) {
      const text = resolve(TRANSLATIONS[code], key)
      expect(typeof text === 'string' && text.trim() !== '', `${key} is missing`).toBe(true)
    }
  })

  /**
   * Same bar as the commands, and for a sharper reason: this sentence is the whole of what the
   * model is told about an action before it picks one. A title repeated back explains nothing,
   * and the wrong action gets chosen on the strength of it.
   */
  it('explains, and does not merely repeat the title', () => {
    for (const action of ACTION_REGISTRY) {
      const description = resolve(TRANSLATIONS.fr, action.descriptionKey)
      expect(
        String(description).length,
        `${action.descriptionKey} explains nothing`,
      ).toBeGreaterThan(40)
    }
  })

  it('finds an action by name, and answers null for one nothing declares', () => {
    expect(assistantAction('workspace.open')?.name).toBe('workspace.open')
    expect(assistantAction('workspace.explode')).toBeNull()
  })

  it('offers only values a field accepts, when it closes the set', () => {
    for (const action of ACTION_REGISTRY) {
      for (const field of action.fields) {
        if (field.options) expect(field.options.length, `${field.key}`).toBeGreaterThan(0)
      }
    }
  })

  it('lets a command be named only if the registry declares it', () => {
    const ids: readonly string[] = COMMAND_REGISTRY.map(descriptor => descriptor.id)
    const offered = assistantAction('command.runStudioCommand')?.fields[0]?.options ?? []

    expect(offered).toHaveLength(ids.length)
    for (const id of offered) expect(ids).toContain(id)
  })
})

describe('what an action engages', () => {
  it('asks before anything that outlives the window, and not otherwise', () => {
    expect(needsConfirmation('none')).toBe(false)
    expect(needsConfirmation('asset')).toBe(true)
    expect(needsConfirmation('credits')).toBe(true)
  })

  /**
   * Command by command rather than by sampling, because this is the one level derived instead of
   * declared. The five that upload are the five the canvas prepares an edit from; every other
   * command in the registry moves the view, arms a tool, or edits a document that can undo it.
   */
  it.each(COMMAND_REGISTRY.map(descriptor => descriptor.id))('rates %s', id => {
    const uploads: readonly CommandId[] = [
      'canvas.regenerate',
      'canvas.cutout',
      'canvas.enlarge',
      'canvas.vectorize',
      'canvas.extend',
    ]

    expect(commitmentOfCommand(id)).toBe(uploads.includes(id) ? 'asset' : 'none')
  })

  it.each(LANGUAGES.map(language => language.code))('says why it refused, in %s', code => {
    for (const refusal of ACTION_REFUSALS) {
      const text = resolve(TRANSLATIONS[code], refusalKey(refusal))
      expect(typeof text === 'string' && text.trim() !== '', refusal).toBe(true)
    }
  })

  /**
   * The half of two-step discovery that lives in the registry: what a query finds is what the
   * model is shown next, so an answer ranked by chance is a briefing about the wrong family.
   */
  it('finds an action by its name or its description, the closest first', () => {
    const found = findActions('checkout branch')

    expect(found[0]?.name).toBe('git.checkout')
    expect(found.some(one => one.name === 'actions.find')).toBe(false)
  })

  it('finds nothing on an empty query rather than everything', () => {
    expect(findActions('   ')).toEqual([])
  })

  it('finds the action whose field ACCEPTS the word, so a studio command is reachable by name', () => {
    expect(findActions('duplicate scene').map(action => action.name)).toContain(
      'command.runStudioCommand',
    )
  })

  /**
   * 🛑 The five the widening put within a spoken sentence's reach, and the reason `studio`
   * exists: the assistant's model is now shown the whole registry, where before it was shown
   * eleven names. Which account answers decides whose library and whose invoice the next
   * generation lands on, and no ⌘Z reaches any of it.
   */
  it.each([
    'settings.write',
    'accounts.activate',
    'accounts.rename',
    'project.open',
    'project.create',
  ])('asks before %s changes what the studio is', name => {
    expect(assistantAction(name)?.commitment).toBe('studio')
    expect(needsConfirmation('studio')).toBe(true)
  })

  /** And no switch waves it through, which is what tells it apart from the other four. */
  it('never delegates what changes the studio itself', () => {
    const armed = {
      enabled: true,
      delegateFiles: true,
      delegateAsset: true,
      delegateRemote: true,
      delegateBudget: 1_000,
    }

    expect(delegated(armed, 'studio', 0, 0)).toBe(false)
    expect(delegated(armed, 'files', 0, 0)).toBe(true)
  })

  it('never spends credits through a command', () => {
    // Submitting is its own action, and the only one that reaches for the user's balance. A
    // command that started billing would slip past the estimate the assistant is meant to quote.
    for (const descriptor of COMMAND_REGISTRY) {
      expect(commitmentOfCommand(descriptor.id), descriptor.id).not.toBe('credits')
    }
  })
})

describe('what a second identical call can bring', () => {
  /**
   * Named rather than counted, like `raises` and `asksItself`: a count stays green the day one
   * action is freed while another is pinned, and a reading action pinned by mistake tells a model
   * to stop watching its own generation.
   */
  it('names every action a turn refuses to run twice', () => {
    const pinned = ACTION_REGISTRY.filter(entry => !entry.repeatable)

    expect(pinned.map(entry => entry.name).sort()).toEqual([
      'accounts.activate',
      'animation.autoKey',
      'asset.reveal',
      'channel.setMuteSoloLock',
      'chat.close',
      'clip.select',
      // 🛑 A command answers `ok` and nothing of what it did: « duplique-le » ran
      // `scene.duplicate` three times and left four cubes where two were asked for.
      'command.runStudioCommand',
      'dictation.start',
      'dictation.stop',
      'document.activate',
      'document.close',
      'document.open',
      'favorite.pinAssetRecipe',
      'favorite.unpinAssetRecipe',
      'file.open',
      'file.reveal',
      'fileInfo.openWindow',
      'help.openStudioWindow',
      'layer.select',
      'material.setPreviewDisplay',
      'mirror.openVideoReturnWindow',
      'models.select',
      'node.select',
      'panel.close',
      'panel.open',
      'play.pause',
      'play.resume',
      'play.start',
      'play.stop',
      'project.close',
      'project.create',
      'project.forget',
      'project.open',
      'project.rename',
      'project.trash',
      'settings.open',
      'skybox.setViewportOptions',
      'target.select',
      'view.direction',
      'view.setDisplayMode',
    ])
  })

  /**
   * The four the measured loop was written against, spelled out: each ANSWERS differently on a
   * second call, and `job.waitForCloudGeneration` says in its own description that it is made to be called again.
   */
  it.each(['jobs.list', 'job.waitForCloudGeneration', 'activity.recent', 'files.list'])(
    'leaves %s callable as many times as a plan needs',
    name => {
      expect(assistantAction(name)?.repeatable).toBe(true)
    },
  )
})
