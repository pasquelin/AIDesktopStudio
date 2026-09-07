import { action, type AssistantAction } from './assistantAction'
import { DEFAULT_SETTINGS } from './settings'
import { SETTING_ACTION_IDS, type SettingActionId } from './settingAction'
import { DOCUMENT_KINDS } from './document'

/** The two buttons nothing takes back: one writes outside the studio, the other empties it. */
const IRREVERSIBLE: readonly SettingActionId[] = ['advanced.installResolveBridge', 'advanced.reset']

/**
 * The studio's own settings, and which account it works through.
 *
 * `accounts.add` and `accounts.remove` are NOT here. Adding one takes an API key and a secret,
 * which the renderer may hold for exactly as long as it takes to hand them over and never read
 * back — a channel that took them from an outside client would be a way of writing a credential
 * into a studio through a port. Removing one destroys the only copy of it this machine has.
 */
export const SETTINGS_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'settings.read',
    titleKey: 'assistant.actions.settingsRead.title',
    descriptionKey: 'assistant.actions.settingsRead.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: { documentKinds: DOCUMENT_KINDS, documentAffinity: 'relevant' },
    fields: [],
    returns: ['settingsState'],
  }),
  action({
    /**
     * `record` rather than `raw`, which published no type at all: `PartialSettings` is a static
     * union of this repository, not a shape discovered at runtime, so a client can be told both
     * that it is an object and which sections it may name. The main process merges branch by
     * branch, so what is not named is not touched.
     */
    name: 'settings.write',
    titleKey: 'assistant.actions.settingsWrite.title',
    descriptionKey: 'assistant.actions.settingsWrite.description',
    commitment: 'studio',
    repeatable: true,
    reach: 'mcp',
    capabilities: { documentKinds: DOCUMENT_KINDS, documentAffinity: 'relevant' },
    inputs: ['settingsState'],
    fields: [
      {
        key: 'settings',
        kind: 'record',
        labelKey: 'assistant.fields.settings',
        required: true,
        options: Object.keys(DEFAULT_SETTINGS),
      },
    ],
  }),
  action({
    name: 'accounts.list',
    titleKey: 'assistant.actions.accountsList.title',
    descriptionKey: 'assistant.actions.accountsList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'accounts.activate',
    titleKey: 'assistant.actions.accountsActivate.title',
    descriptionKey: 'assistant.actions.accountsActivate.description',
    commitment: 'studio',
    repeatable: false,
    reach: 'mcp',
    fields: [
      { key: 'accountId', kind: 'text', labelKey: 'assistant.fields.accountId', required: true },
    ],
  }),
  action({
    // The label alone. Neither half of the credential crosses this boundary in either direction,
    // which is what keeps this one on the near side of the rule the block above states.
    name: 'accounts.rename',
    titleKey: 'assistant.actions.accountsRename.title',
    descriptionKey: 'assistant.actions.accountsRename.description',
    commitment: 'studio',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'accountId', kind: 'text', labelKey: 'assistant.fields.accountId', required: true },
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
  action({
    /**
     * The buttons of the settings window, which are not settings: they have no path and no value.
     * Two of them leave something behind, and `raises` is what asks about those two.
     */
    name: 'settings.triggerAction',
    titleKey: 'assistant.actions.settingsTriggerAction.title',
    descriptionKey: 'assistant.actions.settingsTriggerAction.description',
    commitment: 'none',
    repeatable: true,
    raises: input => (IRREVERSIBLE.some(id => id === input.action) ? 'files' : 'none'),
    reach: 'mcp',
    fields: [
      {
        key: 'action',
        kind: 'choice',
        labelKey: 'assistant.fields.settingsAction',
        required: true,
        options: SETTING_ACTION_IDS,
      },
    ],
  }),
]
