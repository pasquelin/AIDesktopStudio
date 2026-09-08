// SPDX-License-Identifier: MIT
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { animationGraphOf, type AnimationGraph } from '@shared/domain/animationGraph'
import { FileEditor } from '@/components/FileEditor/FileEditor'
import { JsonSource } from '@/components/JsonSource'
import { getBridge } from '@/services/bridge'
import { useFileDocument } from '@/hooks/useFileDocument'
import { AnimationGraphExpert } from './AnimationGraphExpert'
import { AnimationGraphSimple } from './AnimationGraphSimple'

export type AnimationGraphView = 'simple' | 'expert' | 'json'
type AnimationGraphDocumentProps = { path: string }

/** Read by the translation guard, which checks each view was given both its word and its line. */
export const ANIMATION_GRAPH_VIEWS: readonly AnimationGraphView[] = ['simple', 'expert', 'json']

const readGraph = async (path: string): Promise<AnimationGraph | null> =>
  (await getBridge()?.animationGraphs.read(path)) ?? null

const writeGraph = async (path: string, graph: AnimationGraph): Promise<boolean> =>
  (await getBridge()?.animationGraphs.write(path, graph)) === true

/**
 * A `.anim.json` in the centre, on the shell every file the studio edits as a form wears — the
 * same three views, the same sections, the same saving as a control map. Its states and its
 * transitions are edited as FIELDS now, the text staying one view among three.
 */
export function AnimationGraphDocument({ path }: AnimationGraphDocumentProps) {
  const { t } = useTranslation()
  const [view, setView] = useState<AnimationGraphView>('simple')

  const file = useFileDocument<AnimationGraph>({
    path,
    read: readGraph,
    write: writeGraph,
    parse: animationGraphOf,
    messages: {
      loadFailed: t('game.animationGraph.loadFailed'),
      invalid: t('game.animationGraph.invalid'),
      writeFailed: t('game.animationGraph.writeFailed'),
    },
  })

  const graph = file.value
  if (!graph)
    return (
      <div role="status" className="text-muted flex size-full items-center justify-center text-xs">
        {file.error ?? t('game.animationGraph.loading')}
      </div>
    )

  return (
    <FileEditor
      description={t('game.animationGraph.hint')}
      viewsLabel={t('game.animationGraph.views')}
      views={ANIMATION_GRAPH_VIEWS.map(id => ({
        id,
        label: t(`game.scriptView.${id}`),
        hint: t(`game.animationGraph.viewHint.${id}`),
      }))}
      view={view}
      onView={next => (next === 'json' || file.adopt() ? setView(next) : undefined)}
      error={file.error}
      scId="animationGraph.view"
    >
      {view === 'simple' && <AnimationGraphSimple graph={graph} />}
      {view === 'expert' && <AnimationGraphExpert graph={graph} onChange={file.change} />}
      {view === 'json' && (
        <JsonSource
          value={file.source}
          label={t('game.animationGraph.jsonLabel')}
          scId="animationGraph.source"
          onChange={file.changeSource}
        />
      )}
    </FileEditor>
  )
}
