import type { FC } from 'react'
import type { SettingsSectionId } from '@shared/domain/settings'
import {
  childSections,
  rootSections,
  SETTING_SECTIONS,
  type SettingSectionEntry,
} from '@shared/domain/settingsRegistry'
import { AccountSettings } from './AccountSettings/AccountSettings'
import { AiSettings } from './Ai/AiSettings'
import { DictationSettings } from './DictationSettings'
import { McpSettings } from './McpSettings'
import { MemoryGraph } from './Memory/Graph/MemoryGraph'
import { MemorySettings } from './Memory/MemorySettings'
import { MediaSettings } from './MediaSettings'
import { InputSettings } from './InputSettings'
import { ShortcutsSettings } from './ShortcutsSettings/ShortcutsSettings'

export type SettingsSection = SettingSectionEntry & {
  /** What no descriptor can express: credentials, a catalogue picker, a resolved status. */
  Content?: FC
  children: readonly SettingsSection[]
}

/**
 * What no descriptor can express, per section. Everything else — the id, the two texts, the
 * nesting — comes from the shared registry.
 *
 * The family screens are spelled out rather than derived from the id: reading `'image'` back
 * out of `'generation.image'` or `'ai.image'` would hand a string the type cannot check,
 * and a section renamed would fail here instead of failing silently.
 */
const CONTENT: Partial<Record<SettingsSectionId, FC>> = {
  account: AccountSettings,
  ai: AiSettings,
  shortcuts: ShortcutsSettings,
  media: MediaSettings,
  input: InputSettings,
  mcp: McpSettings,
  memory: MemorySettings,
  'memory.graph': MemoryGraph,
  dictation: DictationSettings,
  'ai.image': () => <AiSettings family="image" />,
  'ai.video': () => <AiSettings family="video" />,
  'ai.3d': () => <AiSettings family="3d" />,
  'ai.audio': () => <AiSettings family="audio" />,
  'ai.material': () => <AiSettings family="material" />,
  'ai.skybox': () => <AiSettings family="skybox" />,
  'ai.code': () => <AiSettings family="code" />,
  'ai.upscale': () => <AiSettings family="upscale" />,
  'ai.background-removal': () => <AiSettings family="background-removal" />,
  'ai.vectorization': () => <AiSettings family="vectorization" />,
}

function withContent(entry: SettingSectionEntry): SettingsSection {
  return {
    ...entry,
    Content: CONTENT[entry.id],
    children: childSections(entry.id).map(withContent),
  }
}

/**
 * The settings tree: a column of sections on the left, the selected one on the right. The
 * sections, their texts and their nesting all come from the registry — this only adds what
 * belongs to React.
 *
 * Spec § 9 also lists Storage, Shortcuts, Performance and Advanced. They appear as they are
 * built; an entry with nothing behind it would be worse than its absence.
 */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = rootSections().map(withContent)

export function findSection(id: string): SettingsSection | null {
  const entry = SETTING_SECTIONS.find(section => section.id === id)
  return entry ? withContent(entry) : null
}
