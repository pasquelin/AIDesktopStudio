import { ACTION_FAMILIES, ACTION_TARGET_DESCRIPTORS } from '@shared/domain/assistant'
import type {
  ActionCommitment,
  ActionField,
  ActionName,
  ActionReach,
  ActionResource,
  ActionCapabilities,
} from '@shared/domain/assistant'
import { englishText, textAt, TRANSLATIONS } from '@shared/i18n'
import { COMPONENTS, COMPONENT_TYPES } from '@shared/domain/componentRegistry'
import { COMMAND_REGISTRY } from '@shared/domain/command'
import { POST_EFFECTS, POST_EFFECT_IDS } from '@shared/domain/postProcessing'
import { digestOf } from '@main/memory/vectors'

function capabilitiesOf(
  action: (typeof ACTION_FAMILIES)[number]['actions'][number],
): ActionCapabilities {
  const explicit = action.capabilities ?? {}
  const namespace = action.name.split('.')[0] ?? ''
  const inferredTarget = ACTION_TARGET_DESCRIPTORS.find(descriptor =>
    descriptor.namespaces.includes(namespace),
  )?.target
  return inferredTarget === undefined || explicit.targets?.includes(inferredTarget)
    ? explicit
    : { ...explicit, targets: [...(explicit.targets ?? []), inferredTarget] }
}

export type IndexedAction = {
  name: ActionName
  family: string
  title: string
  description: string
  commitment: ActionCommitment
  repeatable: boolean
  reach: ActionReach
  fields: readonly ActionField[]
  raisesCommitment: boolean
  asksItself: boolean
  runsOthers: boolean
  ordinal: number
  searchable: string
  localizedTitles: readonly string[]
  localizedFieldLabels: readonly string[]
  requires: readonly ActionResource[]
  produces: readonly ActionResource[]
  inputs: readonly ActionResource[]
  uses: readonly ActionResource[]
  returns: readonly ActionResource[]
  capabilities: ActionCapabilities
}

export type ActionCorpus = {
  fingerprint: string
  actions: readonly IndexedAction[]
}

export function actionFingerprint(actions: readonly IndexedAction[]): string {
  return digestOf(JSON.stringify(actions))
}

function includesClosedChoice(fields: readonly ActionField[], values: readonly string[]): boolean {
  return fields.some(
    field =>
      field.options?.length === values.length &&
      field.options.every(
        option =>
          typeof option === 'string' && values.some(expectedValue => expectedValue === option),
      ),
  )
}

function componentTerms(fields: readonly ActionField[]): readonly string[] {
  if (!includesClosedChoice(fields, COMPONENT_TYPES)) return []
  return Object.values(COMPONENTS).flatMap(component => [
    component.type,
    englishText(component.titleKey),
    textAt(TRANSLATIONS.fr, component.titleKey),
    englishText(component.descriptionKey),
    textAt(TRANSLATIONS.fr, component.descriptionKey),
    ...component.fields.flatMap(field => [
      field.key,
      englishText(field.labelKey),
      textAt(TRANSLATIONS.fr, field.labelKey),
    ]),
  ])
}

function componentNameTerms(): readonly string[] {
  return Object.values(COMPONENTS).flatMap(component => [
    component.type,
    englishText(component.titleKey),
    textAt(TRANSLATIONS.fr, component.titleKey),
  ])
}

function commandTerms(fields: readonly ActionField[]): readonly string[] {
  if (
    !includesClosedChoice(
      fields,
      COMMAND_REGISTRY.map(command => command.id),
    )
  )
    return []
  return COMMAND_REGISTRY.flatMap(command => [
    command.id,
    command.scope,
    englishText(command.titleKey),
    textAt(TRANSLATIONS.fr, command.titleKey),
    englishText(command.helpKey),
    textAt(TRANSLATIONS.fr, command.helpKey),
  ])
}

function localizedTerms(key: string): readonly string[] {
  return [englishText(key), textAt(TRANSLATIONS.fr, key)]
}

function postEffectTerms(fields: readonly ActionField[]): readonly string[] {
  const addressesEffect =
    fields.some(field => field.key === 'effectId') || includesClosedChoice(fields, POST_EFFECT_IDS)
  if (!addressesEffect) return []
  const addressesParameter = fields.some(field => field.key === 'param')
  return POST_EFFECT_IDS.flatMap(effect => [
    effect,
    ...localizedTerms(`postfx.effect_${effect}`),
    ...(addressesParameter
      ? Object.keys(POST_EFFECTS[effect].params).flatMap(parameter => [
          parameter,
          ...localizedTerms(`postfx.param_${parameter}`),
        ])
      : []),
  ])
}

export function actionCorpus(): ActionCorpus {
  let ordinal = 0
  const actions = ACTION_FAMILIES.flatMap(family =>
    family.actions.map(action => {
      const title = englishText(action.titleKey)
      const description = englishText(action.descriptionKey)
      const frenchTitle = textAt(TRANSLATIONS.fr, action.titleKey)
      const frenchDescription = textAt(TRANSLATIONS.fr, action.descriptionKey)
      const fields = action.fields.map(field => ({ ...field }))
      const capabilities = capabilitiesOf(action)
      const indexed: IndexedAction = {
        name: action.name,
        family: family.name,
        title,
        description,
        commitment: action.commitment,
        repeatable: action.repeatable,
        reach: action.reach,
        fields,
        raisesCommitment: action.raises !== undefined,
        asksItself: action.asksItself === true,
        runsOthers: action.runsOthers === true,
        ordinal: ordinal++,
        localizedTitles: [title, frenchTitle],
        requires: action.requires ?? [],
        produces: action.produces ?? [],
        inputs: action.inputs ?? [],
        uses: action.uses ?? [],
        returns: action.returns ?? [],
        capabilities,
        localizedFieldLabels: fields.flatMap(field => [
          englishText(field.labelKey),
          textAt(TRANSLATIONS.fr, field.labelKey),
        ]),
        searchable: [
          action.name,
          family.name,
          title,
          description,
          frenchTitle,
          frenchDescription,
          ...componentTerms(action.fields),
          ...(capabilities.targets?.includes('component') ? componentNameTerms() : []),
          ...commandTerms(action.fields),
          ...postEffectTerms(action.fields),
          ...fields.flatMap(field => [
            field.key,
            englishText(field.labelKey),
            textAt(TRANSLATIONS.fr, field.labelKey),
            ...(field.options ?? []).map(String),
          ]),
        ].join(' '),
      }
      return indexed
    }),
  )

  return { actions, fingerprint: actionFingerprint(actions) }
}
