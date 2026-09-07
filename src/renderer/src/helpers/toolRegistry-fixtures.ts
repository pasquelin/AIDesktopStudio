import type { ToolState } from './toolRegistry'

/** What a workspace answers to: a project is always open in one, by definition. */
export const IN_WORKSPACE: ToolState = {
  hasProject: true,
  hasGit: true,
  hasCloud: true,
  centreTaken: true,
  documentKind: 'scene',
}

/** The home before anything has been opened, which is where a launch starts. */
export const NO_PROJECT: ToolState = { ...IN_WORKSPACE, hasProject: false, hasGit: false }

/** A project open in a folder git is not tracking, which is every folder until `git init`. */
export const NO_GIT: ToolState = { ...IN_WORKSPACE, hasGit: false }

/** No key opening onto a remote library, which is every launch before one is entered. */
export const NO_CLOUD: ToolState = { ...IN_WORKSPACE, hasCloud: false }

/** A space with no document open: the empty centre holds the conversation, so no panel may. */
export const IN_CENTRE: ToolState = { ...IN_WORKSPACE, centreTaken: false }
