// SPDX-License-Identifier: MIT

/** The two gestures a family of project JSON files answers when a game is being built. */
export type ProjectFiles<T> = {
  list: () => Promise<string[]>
  read: (path: string) => Promise<T | null>
}

/**
 * Every file of one family the project holds, read and paired with its path.
 *
 * 🛑 A file that will not parse is LEFT OUT rather than fatal: one broken map must not stop every
 * other from loading, and the reader has already said why in its own message.
 */
export async function projectModulesOf<T>(
  files: ProjectFiles<T> | undefined,
): Promise<{ path: string; value: T }[]> {
  if (!files) return []

  try {
    const paths = await files.list()
    const read = await Promise.all(paths.map(async path => await one(files, path)))
    return read.filter((held): held is { path: string; value: T } => held !== null)
  } catch {
    return []
  }
}

async function one<T>(
  files: ProjectFiles<T>,
  path: string,
): Promise<{ path: string; value: T } | null> {
  try {
    const value = await files.read(path)
    return value ? { path, value } : null
  } catch {
    return null
  }
}
