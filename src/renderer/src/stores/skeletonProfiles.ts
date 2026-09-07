import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isRecord } from '@shared/guards'
import { isSkeletonProfile, type SkeletonProfile } from '@shared/domain/skeletonProfile'

export type SkeletonProfilesState = {
  /** By project path, then by skeleton signature — see `skeletonSignatureOf`. */
  byProject: Record<string, Record<string, SkeletonProfile>>
  rememberSkeletonProfile: (projectPath: string, profile: SkeletonProfile) => void
}

/** Answered for a project nothing has been learnt about. Shared, since a selector reads it. */
const NO_PROFILES: readonly SkeletonProfile[] = []

/**
 * What each project knows about the skeletons it has already read, kept between sessions.
 *
 * What is stored is the CORRECTION, filed under the fingerprint of the bone names — one rig
 * arrives under many files, and the signature is what recognises them as one. On this machine
 * rather than in the project folder, which the studio writes nothing of its own into.
 */
export const useSkeletonProfiles = create<SkeletonProfilesState>()(
  persist(
    set => ({
      byProject: {},

      rememberSkeletonProfile: (projectPath, profile) =>
        set(state => ({
          byProject: {
            ...state.byProject,
            [projectPath]: { ...state.byProject[projectPath], [profile.signature]: profile },
          },
        })),
    }),
    {
      name: 'ai-desktop-studio:skeleton-profiles',
      // Read back through the guard rather than trusted: this is a file on disk, and a profile
      // whose roles are not roles would be handed to the retargeting worker as a mapping.
      merge: (persisted, current) => ({ ...current, byProject: readProfiles(persisted) }),
    },
  ),
)

function readProfiles(persisted: unknown): SkeletonProfilesState['byProject'] {
  if (!isRecord(persisted) || !isRecord(persisted.byProject)) return {}

  const read: SkeletonProfilesState['byProject'] = {}
  for (const [path, profiles] of Object.entries(persisted.byProject)) {
    if (!isRecord(profiles)) continue

    const kept: Record<string, SkeletonProfile> = {}
    for (const [signature, profile] of Object.entries(profiles)) {
      if (isSkeletonProfile(profile)) kept[signature] = profile
    }
    if (Object.keys(kept).length > 0) read[path] = kept
  }

  return read
}

/** The mappings a project has learnt, for the engine to start from. */
export function skeletonProfilesOf(
  state: SkeletonProfilesState,
  projectPath: string | null,
): readonly SkeletonProfile[] {
  const held = projectPath ? state.byProject[projectPath] : undefined
  return held ? Object.values(held) : NO_PROFILES
}
