import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { readStack, type PostStack } from '@shared/domain/postProcessing'
import type { UserPostPreset } from '@shared/domain/postPresets'
import { isRecord } from '@shared/guards'
import { newId } from '@/helpers/ids'

export type PostPresetsState = {
  /** In the order they were saved. What the picker lists under the ones the studio ships. */
  saved: readonly UserPostPreset[]
  /**
   * The name is TRIMMED here, and a blank one is refused — `null` rather than an id.
   *
   * The rule belongs to the store because three surfaces reach it: the panel's field, the MCP
   * handler and a rename. Written at each of them, the fourth caller misses it and a preset
   * nobody can name lands in the picker.
   */
  savePostPreset: (name: string, stack: PostStack) => string | null
  /** `false` where the name was blank. Same rule, same place. */
  renamePostPreset: (id: string, name: string) => boolean
  forgetPostPreset: (id: string) => void
}

/**
 * On this MACHINE rather than in the project folder — a look is a way of working, the same
 * reason `useSkeletonProfiles` lives here. The ones the studio ships are code (`POST_PRESETS`),
 * so they cannot be edited, lost, or drift between two installations.
 */
export const usePostPresets = create<PostPresetsState>()(
  persist(
    set => ({
      saved: [],

      savePostPreset: (name, stack) => {
        const called = name.trim()
        if (called === '') return null

        const id = newId()
        set(state => ({ saved: [...state.saved, { id, name: called, stack }] }))
        return id
      },

      renamePostPreset: (id, name) => {
        const called = name.trim()
        if (called === '') return false

        set(state => ({
          saved: state.saved.map(preset =>
            preset.id === id ? { ...preset, name: called } : preset,
          ),
        }))
        return true
      },

      forgetPostPreset: id =>
        set(state => ({ saved: state.saved.filter(preset => preset.id !== id) })),
    }),
    {
      name: 'ai-desktop-studio:post-presets',
      // Read back through the reader rather than trusted: this is a file on disk, and a stack
      // whose effects are not effects would be handed straight to the composer.
      merge: (persisted, current) => ({ ...current, saved: readPresets(persisted) }),
    },
  ),
)

function readPresets(persisted: unknown): UserPostPreset[] {
  if (!isRecord(persisted) || !Array.isArray(persisted.saved)) return []

  return persisted.saved.flatMap((one: unknown): UserPostPreset[] => {
    if (!isRecord(one) || typeof one.id !== 'string' || typeof one.name !== 'string') return []
    return [{ id: one.id, name: one.name, stack: readStack(one.stack, newId) }]
  })
}
