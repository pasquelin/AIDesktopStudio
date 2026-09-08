import { useCallback, useEffect, useRef, useState } from 'react'
import { useLatest } from './useLatest'
import { localizedError } from '@shared/localizedError'
import { fileViewOf } from '@shared/domain/fileView'
import {
  fileViewPanelId,
  registerFileViewSave,
  setDocumentTitle,
} from '@/features/shell/components/dockviewApi'

export type FileDocumentPort<T> = {
  path: string
  read: (path: string) => Promise<T | null>
  write: (path: string, value: T) => Promise<boolean>
  /** Refuses rather than answering null — what turns typed text back into a value. */
  parse: (value: unknown) => T
  /** The three sentences a file document says about itself, already translated. */
  messages: { loadFailed: string; invalid: string; writeFailed: string }
  /**
   * Asked AFTER the write, from the disk: what a file can only learn once its neighbours can be
   * read beside it — a context two files claim, a state no transition reaches.
   */
  afterSave?: (value: T) => Promise<string | null>
}

export type FileDocument<T> = {
  value: T | null
  /** The same document as text. Authoritative while a text view is the one being typed into. */
  source: string
  error: string | null
  /** Replaces the value from a form, and rewrites the text under it. */
  change: (value: T) => void
  /** Takes what was typed. The value follows on the next `adopt` or `save`, never per keystroke. */
  changeSource: (source: string) => void
  /** Reads the text back into a value — what LEAVING a text view has to do first. */
  adopt: () => boolean
  save: () => Promise<boolean>
}

const formatted = (value: unknown): string => JSON.stringify(value, null, 2)

/**
 * One file of the project, opened as a document: read on arrival, edited as a value or as text,
 * written by ⌘S like every other document.
 *
 * 🛑 The text and the value are ONE state with a direction, not two states to reconcile: while
 * `ahead` the text is what will be saved, and any form edit rewrites it. Keyed on the active VIEW
 * instead — what the control map did — the same edit saved or was dropped depending on which
 * segment happened to be lit when ⌘S landed.
 */
export function useFileDocument<T>({
  path,
  read,
  write,
  parse,
  messages,
  afterSave,
}: FileDocumentPort<T>): FileDocument<T> {
  const [value, setValue] = useState<T | null>(null)
  const [source, setSource] = useState('')
  const [ahead, setAhead] = useState(false)
  const [modified, setModified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped by every edit, read across an await: a save that lands after the next keystroke must
  // not put the written value back on screen over what has since been typed.
  const revision = useRef(0)

  // The reader and its sentences, mirrored: the host rebuilds the port on every render, and the
  // PATH is the only thing that asks for a second read.
  const reading = useLatest({ read, loadFailed: messages.loadFailed })

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const loaded = await reading.current.read(path)
        if (!active) return
        if (!loaded) {
          setError(reading.current.loadFailed)
          return
        }
        setValue(loaded)
        setSource(formatted(loaded))
      } catch {
        if (active) setError(reading.current.loadFailed)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [path, reading])

  // The FILE's own name, never a field of its content: taking the id inside renamed the tab
  // under the fingers of whoever was typing it.
  const title = fileViewOf(path)?.title ?? ''
  useEffect(() => setDocumentTitle(fileViewPanelId(path), title, modified), [modified, path, title])

  const change = useCallback((next: T): void => {
    revision.current += 1
    setValue(next)
    setSource(formatted(next))
    setAhead(false)
    setModified(true)
    setError(null)
  }, [])

  const changeSource = useCallback((next: string): void => {
    revision.current += 1
    setSource(next)
    setAhead(true)
    setModified(true)
    setError(null)
  }, [])

  const parsed = useCallback((): T | null => {
    try {
      return ahead ? parse(JSON.parse(source)) : value === null ? null : parse(value)
    } catch {
      setError(messages.invalid)
      return null
    }
  }, [ahead, messages.invalid, parse, source, value])

  const adopt = useCallback((): boolean => {
    if (!ahead) return true
    const next = parsed()
    if (next === null) return false
    setValue(next)
    setSource(formatted(next))
    setAhead(false)
    return true
  }, [ahead, parsed])

  const save = useCallback(async (): Promise<boolean> => {
    const savedRevision = revision.current
    const next = parsed()
    if (next === null) return false
    try {
      if (!(await write(path, next))) throw localizedError('writeRefused')
    } catch {
      // 🛑 Told apart from a parse failure: caught under one message, a full disk read as
      // « this text is not a valid map » over text that was perfectly valid.
      setError(messages.writeFailed)
      return false
    }
    const unchanged = revision.current === savedRevision
    if (unchanged) {
      setValue(next)
      setSource(formatted(next))
      setAhead(false)
      setModified(false)
    }
    setError(afterSave ? await afterSave(next) : null)
    return unchanged
  }, [afterSave, messages.writeFailed, parsed, path, write])

  useEffect(() => registerFileViewSave(fileViewPanelId(path), save), [path, save])

  return { value, source, error, change, changeSource, adopt, save }
}
