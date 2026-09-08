// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { orElse } from '@shared/promises'
import { animationGraphOf, type AnimationGraph } from '@shared/domain/animationGraph'
import { fileViewOf } from '@shared/domain/fileView'
import { Button } from '@/components/Button'
import { JsonSource } from '@/components/JsonSource'
import { getBridge } from '@/services/bridge'
import {
  fileViewPanelId,
  registerFileViewSave,
  setDocumentTitle,
} from '@/features/shell/components/dockviewApi'

type AnimationGraphDocumentProps = { path: string }

/** What went wrong, rather than the sentence saying so: the language may change after it. */
type GraphFault = 'loadFailed' | 'invalid' | 'writeFailed'

function formatted(graph: AnimationGraph): string {
  return JSON.stringify(graph, null, 2)
}

/**
 * A `.anim.json` in the centre, where a double-click used to leave the studio for whatever the
 * system opens JSON with. Its text and nothing else — states and transitions have no visual
 * editor yet — read PARSED, so a graph the runtime's reader refuses is still repaired outside.
 */
export function AnimationGraphDocument({ path }: AnimationGraphDocumentProps) {
  const { t } = useTranslation()
  const [source, setSource] = useState<string | null>(null)
  const [modified, setModified] = useState(false)
  const [fault, setFault] = useState<GraphFault | null>(null)
  const revision = useRef(0)

  // 🛑 `t` is not read here, and that is what keeps the file on screen: bound to the language, it
  // would send this effect round again on a language change and drop whatever was typed.
  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      const loaded = await orElse(getBridge()?.animationGraphs.read(path), null)
      if (!active) return
      if (loaded) setSource(formatted(loaded))
      else setFault('loadFailed')
    }
    void load()
    return () => {
      active = false
    }
  }, [path])

  const title = fileViewOf(path)?.title ?? path
  useEffect(() => setDocumentTitle(fileViewPanelId(path), title, modified), [modified, path, title])

  const save = useCallback(async (): Promise<boolean> => {
    const savedRevision = revision.current
    let next: AnimationGraph
    try {
      next = animationGraphOf(JSON.parse(source ?? ''))
    } catch {
      setFault('invalid')
      return false
    }
    // Told apart from the refusal above: a file the disk would not take is not a file the author
    // mistyped, and one message for both sends them looking through JSON that parsed.
    if (!(await orElse(getBridge()?.animationGraphs.write(path, next), false))) {
      setFault('writeFailed')
      return false
    }
    const unchanged = revision.current === savedRevision
    if (unchanged) {
      setSource(formatted(next))
      setModified(false)
      setFault(null)
    }
    return unchanged
  }, [path, source])

  useEffect(() => registerFileViewSave(fileViewPanelId(path), save), [path, save])

  const messageOf = (one: GraphFault): string => {
    if (one === 'invalid') return t('game.animationGraph.invalid')
    if (one === 'writeFailed') return t('game.animationGraph.writeFailed')
    return t('game.animationGraph.loadFailed')
  }

  if (source === null)
    return (
      <div role="status" className="text-muted flex size-full items-center justify-center text-xs">
        {fault ? messageOf(fault) : t('game.animationGraph.loading')}
      </div>
    )

  return (
    <div className="bg-surface text-text flex size-full min-h-0 flex-col">
      <header className="border-border bg-panel flex items-center gap-1.5 border-b p-(--sc-gutter)">
        <span className="text-muted text-xs">{t('game.animationGraph.hint')}</span>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => void save()}>
          {t('game.animationGraph.save')}
        </Button>
      </header>
      {fault && (
        <p role="alert" className="text-warning m-0 px-3 py-2 text-xs">
          {messageOf(fault)}
        </p>
      )}
      <JsonSource
        value={source}
        label={t('game.animationGraph.jsonLabel')}
        scId="animationGraph.source"
        onChange={value => {
          revision.current += 1
          setSource(value)
          setModified(true)
          setFault(null)
        }}
      />
    </div>
  )
}
