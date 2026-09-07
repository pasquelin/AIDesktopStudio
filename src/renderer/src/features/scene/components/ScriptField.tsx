import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { nameOf } from '@shared/domain/folder'
import { LinkField } from '@/components/LinkField/LinkField'
import type { LinkOption } from '@/components/LinkField/linkOption'
import { openDocumentById } from '@/helpers/openAsset'
import { codeFilesOf, scriptPathOf, useCode } from '@/stores/code'
import { documentAtPath, useDocuments } from '@/stores/documents'

export type ScriptFieldProps = {
  label: string
  value: string
  onChange: (script: string) => void
  scId?: string
}

/**
 * The script a component runs, chosen from the project's own — the row a texture and a typeface
 * are chosen by, so the panel says « a file » the same way everywhere.
 *
 * 🛑 A script the project no longer holds stays OFFERED, marked missing: dropping it would
 * rewrite the component on the first edit, which is what a missing link must never do.
 */
export function ScriptField({ label, value, onChange, scId }: ScriptFieldProps) {
  const { t } = useTranslation()
  const files = useCode(state => state.files)

  // 🛑 Read from the DISK on opening, as `FontField` asks the machine for its faces: `files` is
  // what is open or last compiled, not what the project holds — closing a tab drops its entry
  // (`forget`), and the row then called a perfectly good script missing.
  useEffect(() => {
    void useCode.getState().reload()
  }, [])
  // Selected APART and joined in a memo, the convention `useDocumentOptions` states: the store
  // object changes identity on every tab gesture, so subscribing to it re-renders on each one.
  const documents = useDocuments(state => state.documents)
  const stored = useDocuments(state => state.stored)

  const options = useMemo<LinkOption[]>(() => {
    const held = named(codeFilesOf({ files }).map(file => file.script))
    const known = value === '' || held.some(one => one.id === value)
    return known
      ? held
      : [...held, { id: value, name: t('inspector.scriptMissing', { name: fileOf(value) }) }]
  }, [files, value, t])

  const path = value === '' ? null : scriptPathOf(value)
  const open = path === null ? null : documentAtPath({ documents, stored }, path)

  return (
    <LinkField
      label={label}
      value={value === '' ? null : value}
      options={options}
      onChange={id => onChange(id ?? '')}
      emptyLabel={t('inspector.scriptNone')}
      // Never reached, the memo appending the held value as its own option — the prop is
      // required all the same, as `FontField` notes for the same reason.
      missingLabel={t('inspector.noScriptOffered')}
      clearLabel={t('inspector.clearScript')}
      clearHint={t('inspector.clearScriptHint')}
      open={
        open
          ? {
              label: t('inspector.openScript'),
              hint: t('inspector.openScriptHint'),
              run: () => openDocumentById(open.id),
            }
          : undefined
      }
      scId={scId}
    />
  )
}

/**
 * By file name, the row being narrow — and by PATH for those that would otherwise read alike:
 * `Scripts/player.ts` and `Enemies/player.ts` were two identical rows nobody could tell apart.
 */
function named(scripts: readonly string[]): LinkOption[] {
  const files = scripts.map(fileOf)
  const seen = new Map<string, number>()
  for (const file of files) seen.set(file, (seen.get(file) ?? 0) + 1)
  return scripts.map((script, index) => ({
    id: script,
    name: (seen.get(files[index] ?? '') ?? 0) > 1 ? scriptPathOf(script) : (files[index] ?? ''),
  }))
}

/** The file's own name, folders left out. */
function fileOf(value: string): string {
  return nameOf(scriptPathOf(value))
}
