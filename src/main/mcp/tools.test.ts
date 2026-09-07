import { describe, expect, it } from 'vitest'
import { ACTION_REGISTRY } from '@shared/domain/assistant'
import { englishText, TRANSLATIONS } from '@shared/i18n'
import { actionOfTool, mcpTools, schemaOfFields, toolName } from './tools'

/** `englishText`'s twin, which the bundles publish no counterpart of — only this file wants it. */
const frenchText = (key: string): string => {
  const text = key
    .split('.')
    .reduce<unknown>(
      (current, part) =>
        typeof current === 'object' && current !== null
          ? (current as Record<string, unknown>)[part]
          : undefined,
      TRANSLATIONS.fr,
    )
  return typeof text === 'string' ? text : ''
}

describe('the registry, published as tools', () => {
  it('publishes input maps, animation graphs and retarget measurements', () => {
    expect(mcpTools().map(tool => tool.name)).toEqual(
      expect.arrayContaining([
        'inputMaps_list',
        'inputMap_read',
        'inputMap_write',
        'animationGraphs_list',
        'animationGraph_read',
        'animationGraph_write',
        'animation_retargetStatus',
      ]),
    )
  })

  it('offers every action of the wire, and nothing else', () => {
    expect(
      mcpTools()
        .map(tool => tool.name)
        .sort(),
    ).toEqual(ACTION_REGISTRY.map(action => toolName(action.name)).sort())
  })

  it('publishes numeric choices with their actual JSON type', () => {
    const usage = mcpTools().find(tool => tool.name === 'usage_report')

    expect(usage?.inputSchema.properties['days']).toMatchObject({
      type: 'number',
      enum: [7, 31, 120],
    })
  })

  /**
   * The dot has to go: an action is `command.runStudioCommand`, and the tool-name grammar clients hold us to
   * takes letters, digits, underscore and dash. A name that fails it is refused by the client
   * rather than by us, which is the hardest kind of failure to place.
   */
  it('names each tool in the grammar a client accepts, and finds the action back', () => {
    for (const tool of mcpTools()) {
      expect(tool.name, tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
      expect(actionOfTool(tool.name)).not.toBeNull()
    }
  })

  it('answers nothing for a name the registry does not declare', () => {
    expect(actionOfTool('command_fly')).toBeNull()
  })

  // So a client can say "this will ask you first" before it makes the call, rather than appear
  // to hang for the two minutes a question is allowed to stand.
  it('says on the tool itself what running it engages', () => {
    const submit = mcpTools().find(tool => tool.name === 'generator_submit')

    // Never a UNIT: what a run costs is the unit of whichever cloud serves it, and one of them
    // sells credits rather than creative units.
    expect(submit?.description).toContain('Refuses with a consent token first')
    expect(submit?.description).not.toContain('creative units')
  })

  /**
   * `commitment` is the FLOOR. This file read it and nothing else, so `git_commit` — whose
   * `raises` lifts an amend to `files` — went out as "Runs straight away", which is the one
   * sentence a client trusts to decide whether to expect a question.
   */
  it('does not promise an immediate run for a call whose input can raise it', () => {
    const marked = ACTION_REGISTRY.filter(entry => entry.raises)

    // Named rather than counted: a `filter` that empties leaves the loop below green while every
    // tool it guarded goes back to announcing an immediate run.
    expect(marked.map(action => action.name).sort()).toEqual([
      'ai.manageLocalRuntime',
      'assets.removeFromLibrary',
      'command.runStudioCommand',
      'context.writeProjectCard',
      // Named a folder, it writes without a picker to ask first — see `gameActions`.
      'game.export',
      'git.commit',
      'settings.triggerAction',
    ])
    for (const action of marked) {
      const tool = mcpTools().find(one => one.name === toolName(action.name))

      expect(tool?.description, action.name).not.toContain('Runs straight away')
      expect(tool?.description, action.name).toContain('depends on what is given')
    }
  })

  /**
   * `document.close` and `workspace.open` commit `none` so that no SECOND question is raised —
   * never because there is none. Their tools said "Runs straight away" for a call that hangs.
   *
   * The commitment is checked too: the note REPLACES the one `commitment` would have written, so
   * `asksItself` on anything above the floor would drop the word that a confirmation is coming.
   */
})

describe('tool execution metadata', () => {
  it('says so when the handler raises the studio’s own question', () => {
    const marked = ACTION_REGISTRY.filter(entry => entry.asksItself)

    expect(marked.map(action => action.name).sort()).toEqual([
      'document.close',
      'project.close',
      'workspace.open',
    ])
    for (const action of marked) {
      const tool = mcpTools().find(one => one.name === toolName(action.name))

      expect(action.commitment, action.name).toBe('none')
      expect(tool?.description, action.name).not.toContain('Runs straight away')
      expect(tool?.description, action.name).toContain('wait on the person at the screen')
    }
  })

  /**
   * Named rather than counted, like the two flags above. A lot engages nothing of its OWN, so
   * `commitment` alone announced "Runs straight away" for fifty calls that may each engage.
   */
  it('says so when a call carries other calls', () => {
    const marked = ACTION_REGISTRY.filter(entry => entry.runsOthers)

    expect(marked.map(action => action.name)).toEqual(['studio.batch'])
    for (const action of marked) {
      const tool = mcpTools().find(one => one.name === toolName(action.name))

      expect(action.commitment, action.name).toBe('none')
      expect(tool?.description, action.name).not.toContain('Runs straight away')
      expect(tool?.description, action.name).toContain('cleared on its own terms')
    }
  })

  /**
   * A `record`'s `options` name its KEYS, where every other kind's name its VALUES — and
   * `assistant/instruction.ts` writes "one of: …" for any field with options, which would be a
   * lie in the prompt. No `both` action carries one today; this is what keeps that true.
   */
  it('keeps a record field off the door the assistant’s prompt reads', () => {
    const reaching = ACTION_REGISTRY.filter(action => action.reach === 'both')

    expect(
      reaching.flatMap(action => action.fields.filter(field => field.kind === 'record')),
    ).toEqual([])
  })

  /**
   * Eight descriptions carried "This asks first…" of their own AND the generated note, saying
   * the same thing twice in one paragraph. The note is the single authority on engagement; a
   * description states the REASON and never repeats the fact.
   *
   * Both bundles: the note is generated in English only, so nothing else would ever look at the
   * French — and it is the French a person reads in the studio's own history of what it did.
   */
  it('never lets a description say a second time that it asks', () => {
    for (const action of ACTION_REGISTRY) {
      expect(englishText(action.descriptionKey), action.name).not.toMatch(/asks?\b[^.]*\bfirst\b/i)
      expect(frenchText(action.descriptionKey), action.name).not.toMatch(/demande[^.]*d['’]abord/i)
    }
  })

  /**
   * `track_state` CHANGED a track's mute, solo, lock and height under a name every other
   * `_state` reads with — a client building its safe list from the suffix fired it blind.
   *
   * Its blind spot, written rather than hidden: this reads the opening WORD of a sentence, so it
   * catches the name that lies about a mutation and not a mutation described in the passive.
   */
  it('reserves the _state suffix for tools that answer rather than change', () => {
    for (const tool of mcpTools().filter(one => one.name.endsWith('_state'))) {
      expect(tool.description, tool.name).toMatch(/^(Returns|Answers|Says) /)
    }
  })
})

describe('an action’s inputs, as JSON Schema', () => {
  it('carries the closed set of a choice, and marks what is required', () => {
    const schema = schemaOfFields([
      { key: 'family', kind: 'choice', labelKey: 'x', required: true, options: ['image', '3d'] },
      { key: 'note', kind: 'text', labelKey: 'x', required: false },
    ])

    expect(schema.properties['family']).toMatchObject({ type: 'string', enum: ['image', '3d'] })
    expect(schema.required).toEqual(['family'])
    // A key nobody declared would be refused against the registry anyway; saying so in the
    // schema saves the round trip.
    expect(schema.additionalProperties).toBe(false)
  })

  /**
   * `raw` carries a generation model's own parameters, whose shape is only known once
   * `GET /models/{id}` has answered — announcing it as an object would be a promise the
   * registry cannot keep.
   */
  it('leaves a raw field untyped rather than guessing at it', () => {
    const schema = schemaOfFields([
      { key: 'parameters', kind: 'raw', labelKey: 'assistant.fields.parameters', required: true },
    ])

    expect(schema.properties['parameters']).not.toHaveProperty('type')
    expect(schema.properties['parameters']?.description).not.toBe('')
  })

  /**
   * The case that was wrongly wearing `raw`: `settings.write` published `{"description": …}` and
   * nothing else, so a client could neither build the call nor probe for it under
   * `additionalProperties: false`. Its options name the KEYS, hence `propertyNames`.
   */
})

describe('structured action inputs', () => {
  it('announces a record as an object, and names the keys it takes', () => {
    const schema = schemaOfFields([
      {
        key: 'settings',
        kind: 'record',
        labelKey: 'assistant.fields.settings',
        required: true,
        options: ['general', 'mcp'],
      },
    ])

    expect(schema.properties['settings']).toMatchObject({
      type: 'object',
      propertyNames: { enum: ['general', 'mcp'] },
    })
    expect(schema.properties['settings']).not.toHaveProperty('enum')
  })

  /**
   * 🛑 `maximum`/`minimum` are NUMERIC keywords: emitted on a `{type: 'string'}` they are ignored
   * by every validator, so the contract announced a bound nobody applied — for every text field
   * of the 282 actions. A string is bounded by `maxLength`.
   */
  it('bounds a string by its length and a number by its value', () => {
    const schema = schemaOfFields([
      {
        key: 'summary',
        kind: 'text',
        labelKey: 'assistant.fields.memorySummary',
        required: true,
        max: 200,
      },
      {
        key: 'importance',
        kind: 'integer',
        labelKey: 'assistant.fields.memoryImportance',
        required: false,
        max: 5,
      },
    ])

    expect(schema.properties['summary']).toMatchObject({ maxLength: 200 })
    expect(schema.properties['summary']).not.toHaveProperty('maximum')
    expect(schema.properties['importance']).toMatchObject({ maximum: 5 })
    expect(schema.properties['importance']).not.toHaveProperty('maxLength')
  })

  it('leaves no required parameter without a type a client can build from', () => {
    const untyped = mcpTools().flatMap(tool =>
      tool.inputSchema.required
        .filter(key => {
          const property = tool.inputSchema.properties[key]
          return property !== undefined && !('type' in property) && !('enum' in property)
        })
        .map(key => `${tool.name}.${key}`),
    )

    // The two that legitimately have none: a generation model's own parameters, whose shape only
    // `GET /models/{id}` knows — and `models_readGenerationModelFields` is published so a client can ask.
    expect(untyped).toEqual(['generator_prepare.parameters', 'cost_estimate.parameters'])
  })
})
