import type { ModelFamily } from './model'
import type { SettingsSectionId } from './settings'

/**
 * A screen of the settings window, and the two texts that name it. Declared here rather than
 * beside the React tree: an id, a label and a description are data, and having the renderer
 * own them left a section able to disagree with the settings it holds.
 *
 * The id is the union `settings.ts` already declares — the one a panel names to open this
 * window on a section, and the one the route is validated against. Two unions for one idea is
 * what this registry exists to prevent.
 */
export type SettingSectionEntry = {
  id: SettingsSectionId
  labelKey: string
  /** Absent on a sub-section, whose parent's description already says what the screen is for. */
  descriptionKey?: string
  /** Set on a sub-section. The navigation builds its tree from this, and nothing else. */
  parent?: SettingsSectionId
  /**
   * The model family this screen chooses providers for. Declared rather than read back out of
   * the id: an action that cannot find a model of a family has to open the screen that gives it
   * one, and slicing `'background-removal'` off the id would hand it a string nothing checks.
   */
  family?: ModelFamily
}

/** Where a family's model is chosen, when a screen offers one. */
export function sectionOfFamily(family: ModelFamily): SettingsSectionId | undefined {
  return SETTING_SECTIONS.find(section => section.family === family)?.id
}

/**
 * One screen per family, holding every employment that family has and what serves each.
 *
 * They carry `family:` since ADR-23 removed the per-family default picker: an action that cannot
 * find a model has one place to send the person, and this is it. The last three have no
 * workspace of their own — they are the families the canvas edits reach for.
 */
export const AI_FAMILY_SECTIONS: readonly SettingSectionEntry[] = [
  { id: 'ai.image', labelKey: 'workspaces.image', parent: 'ai', family: 'image' },
  { id: 'ai.video', labelKey: 'workspaces.video', parent: 'ai', family: 'video' },
  { id: 'ai.3d', labelKey: 'workspaces.3d', parent: 'ai', family: '3d' },
  { id: 'ai.audio', labelKey: 'workspaces.audio', parent: 'ai', family: 'audio' },
  { id: 'ai.material', labelKey: 'workspaces.materials', parent: 'ai', family: 'material' },
  { id: 'ai.skybox', labelKey: 'workspaces.skyboxes', parent: 'ai', family: 'skybox' },
  { id: 'ai.code', labelKey: 'workspaces.code', parent: 'ai', family: 'code' },
  { id: 'ai.upscale', labelKey: 'families.upscale', parent: 'ai', family: 'upscale' },
  {
    id: 'ai.background-removal',
    labelKey: 'families.background-removal',
    parent: 'ai',
    family: 'background-removal',
  },
  {
    id: 'ai.vectorization',
    labelKey: 'families.vectorization',
    parent: 'ai',
    family: 'vectorization',
  },
]

export const SETTING_SECTIONS: readonly SettingSectionEntry[] = [
  {
    id: 'general',
    labelKey: 'settings.general',
    descriptionKey: 'settings.generalDescription',
  },
  {
    id: 'account',
    labelKey: 'settings.account',
    descriptionKey: 'settings.accountDescription',
    parent: 'ai',
  },
  {
    id: 'appearance',
    labelKey: 'settings.appearance',
    descriptionKey: 'settings.appearanceDescription',
  },
  {
    id: 'generation',
    labelKey: 'settings.generation',
    descriptionKey: 'settings.generationDescription',
  },
  {
    id: 'ai',
    labelKey: 'settings.ai',
    descriptionKey: 'settings.aiDescription',
  },
  ...AI_FAMILY_SECTIONS,
  {
    id: 'spaces',
    labelKey: 'settings.spaces',
    descriptionKey: 'settings.spacesDescription',
  },
  {
    id: 'spaces.three',
    labelKey: 'workspaces.3d',
    parent: 'spaces',
  },
  {
    id: 'input',
    labelKey: 'settings.input',
    descriptionKey: 'settings.inputDescription',
  },
  {
    id: 'shortcuts',
    labelKey: 'settings.shortcuts',
    descriptionKey: 'settings.shortcutsDescription',
  },
  {
    id: 'dictation',
    labelKey: 'settings.dictation',
    descriptionKey: 'settings.dictationDescription',
  },
  {
    id: 'media',
    labelKey: 'settings.media',
    descriptionKey: 'settings.mediaDescription',
  },
  {
    id: 'git',
    labelKey: 'settings.git',
    descriptionKey: 'settings.gitDescription',
  },
  {
    id: 'mcp',
    labelKey: 'settings.mcp',
    descriptionKey: 'settings.mcpDescription',
  },
  {
    id: 'memory',
    labelKey: 'settings.memory',
    descriptionKey: 'settings.memoryDescription',
  },
  {
    id: 'memory.graph',
    labelKey: 'settings.memoryGraph',
    descriptionKey: 'settings.memoryGraphDescription',
    parent: 'memory',
  },
  {
    id: 'storage',
    labelKey: 'settings.storage',
    descriptionKey: 'settings.storageDescription',
  },
  {
    id: 'advanced',
    labelKey: 'settings.advanced',
    descriptionKey: 'settings.advancedDescription',
  },
]

/**
 * Sections of a parent, in declared order. The navigation renders these under it; nothing else
 * decides which screens nest.
 */
export function childSections(parent: SettingsSectionId): readonly SettingSectionEntry[] {
  return SETTING_SECTIONS.filter(section => section.parent === parent)
}

export function rootSections(): readonly SettingSectionEntry[] {
  return SETTING_SECTIONS.filter(section => !section.parent)
}

export function sectionEntry(id: SettingsSectionId): SettingSectionEntry | null {
  return SETTING_SECTIONS.find(section => section.id === id) ?? null
}
