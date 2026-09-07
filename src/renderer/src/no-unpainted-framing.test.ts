import { expect, it } from 'vitest'

/**
 * Every module of the renderer, as text — read through Vite for the reason
 * `no-hardcoded-text.test.ts` gives: the renderer has no filesystem.
 */
const MODULES: Record<string, string> = import.meta.glob(
  ['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx', '!./**/*-fixtures.ts*'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
)

/**
 * `frameContents` aims the camera and asks for NO frame: it serves a caller that draws on the
 * very next line. A gesture is not one, and the workshop's Frame button spent a release moving a
 * camera over a viewport that only paints on demand — the recentring showed at the next click,
 * and neither the typecheck, the lint nor the suite said a word. A hand calls `frameAll`.
 *
 * Its blind spot: this reads the CALL, so a renderer reached through a port whose method is named
 * something else passes — `characterStage.ts` declares exactly such a port.
 */
it('leaves `frameContents` to the loops that draw on the very next line', () => {
  const callers = Object.entries(MODULES)
    .filter(([, source]) => source.includes('.frameContents('))
    .map(([path]) => path)
    .sort()

  expect(callers).toEqual([
    './character/characterStage.ts',
    './engines/scene/SceneRendererPreview.ts',
    './engines/scene/sceneStage.ts',
    './features/game/components/GameWindow/GameWindow.tsx',
    './features/retarget/components/Retarget/RetargetViewport.tsx',
  ])
})
