import { chatModelOf, defaultChatModel, SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import { canServe, type RoleRow } from '@shared/domain/aiOverview'
import type { RoleProvider } from '@shared/domain/aiRole'
import { ASSISTANT_MODELS, type AssistantModel } from '@shared/domain/assistant'

/** One thing that can answer a sentence, told apart by where it runs. */
export type AssistantChoice = { readonly value: string } & (
  | { readonly group: 'machine'; readonly modelId: string; readonly name: string }
  | { readonly group: 'clouds'; readonly providerId: string; readonly name: string }
  | { readonly group: 'studio'; readonly model: AssistantModel }
)

export type AssistantGroup = AssistantChoice['group']

/** A `<select>` hands back ONE string. This is where that string is written, and the only place. */
function valueOf(group: AssistantGroup, name: string): string {
  return `${group}:${name}`
}

export function providerOfChoice(choice: AssistantChoice): RoleProvider {
  if (choice.group === 'machine') return { kind: 'local', modelId: choice.modelId }

  return {
    kind: 'cloud',
    providerId: choice.group === 'clouds' ? choice.providerId : SCENARIO_CLOUD,
  }
}

/** Everything that could serve the assistant, in reading order. */
export function assistantChoicesOf(
  row: RoleRow | undefined,
  cloudModels: Readonly<Record<string, string>>,
): readonly AssistantChoice[] {
  if (row === undefined) return []

  // What SERVES is listed whatever the machine now says of it: `providerFor` keeps an explicit
  // local choice on installed alone, so a model chosen while the memory was free would otherwise
  // leave the field reading « nothing chosen » over an assistant that answers.
  const serving = row.provider?.kind === 'local' ? row.provider.modelId : null
  const machine: AssistantChoice[] = row.candidates
    .filter(one => canServe(one) || one.model.id === serving)
    .map(one => ({
      value: valueOf('machine', one.model.id),
      group: 'machine',
      modelId: one.model.id,
      name: one.model.name,
    }))

  // Filtered on what a cloud DECLARES rather than on its name: one that answers no chat has no
  // model to name here, and Scenario is that cloud.
  const clouds: AssistantChoice[] = row.clouds.flatMap(providerId => {
    const declared = defaultChatModel(providerId)
    if (declared === null) return []

    return {
      value: valueOf('clouds', providerId),
      group: 'clouds',
      providerId,
      name: chatModelOf(cloudModels[providerId], declared),
    }
  })

  const studio: AssistantChoice[] = row.clouds.includes(SCENARIO_CLOUD)
    ? ASSISTANT_MODELS.map(model => ({
        value: valueOf('studio', model),
        group: 'studio',
        model,
      }))
    : []

  return [...machine, ...clouds, ...studio]
}

/**
 * What one choice is CALLED on screen. Beside the list rather than in the picker: the card that
 * asks which assistant a new project keeps offers the same entries, and two spellings of one
 * model would read as two models.
 */
export function assistantChoiceLabel(
  choice: AssistantChoice,
  translate: (key: string, values?: Record<string, string>) => string,
): string {
  switch (choice.group) {
    case 'machine':
      return choice.name
    case 'clouds':
      // A model's own name is data and stays as it is; the cloud is named from the bundle.
      return translate('assistant.cloudBrain', {
        cloud: translate(`aiClouds.${choice.providerId}`),
        model: choice.name,
      })
    case 'studio':
      return translate(`assistant.models.${choice.model}`)
  }
}

/** Which entry answers today — the effective provider, and for the studio the model it thinks with. */
export function servingChoiceValue(
  provider: RoleProvider | null,
  studioModel: AssistantModel,
): string | null {
  if (provider === null) return null
  if (provider.kind === 'local') return valueOf('machine', provider.modelId)

  return provider.providerId === SCENARIO_CLOUD
    ? valueOf('studio', studioModel)
    : valueOf('clouds', provider.providerId)
}
