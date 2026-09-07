import { useEffect } from 'react'
import { ensureProjectInstalls } from '@/engines/scene/projectInstalls'
import { useProject } from '@/stores/project'

/**
 * Puts what the app ships with into the open project — the working textures and the character —
 * and remembers what each became.
 *
 * Mounted by the 3D space rather than by the studio: a project one only ever paints in has no
 * business gaining four texture assets and a two-megabyte mesh. It covers the Add menu, whose
 * hand is slower than any install; the door that CREATES a document awaits the same call for
 * itself, since a template lays its shapes down before this — or any other editor — has mounted.
 */
export function useProjectInstalls(): void {
  const path = useProject(state => state.project?.path ?? '')

  useEffect(() => {
    void ensureProjectInstalls(path)
  }, [path])
}
