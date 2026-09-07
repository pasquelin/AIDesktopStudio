import { mdiFileOutline, mdiFolderOpenOutline, mdiFolderOutline } from '@mdi/js'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { thumbnailUrl } from '@shared/domain/asset'
import { documentExtensionOf, documentsByPath, kindForExtension } from '@shared/domain/document'
import { isPrivatePath } from '@shared/domain/folder'
import { natureOf } from '@shared/domain/fileRole'
import { WORKSPACE_BY_ROLE, type FolderRole } from '@shared/domain/folderRole'
import type { EntryKind } from '@/features/explorer/components/Entry/entryKind'
import {
  domainInk,
  roleIcon,
  roleInk,
  roleLabelKey,
  workspaceById,
  workspaceInk,
  workspaceLabelKey,
} from '@/helpers/workspaces'
import type { FolderNode } from '@/hooks/useFolderTree'
import { useRoleOfFolder } from '@/hooks/useRoleOfFolder'
import { useDocuments } from '@/stores/documents'

export function useExplorerEntryPresentation() {
  const { t } = useTranslation()
  const stored = useDocuments(state => state.stored)
  const open = useDocuments(state => state.documents)
  const documents = useMemo(() => documentsByPath(stored), [stored])
  const roleOfFolder = useRoleOfFolder()
  const documentOf = useCallback(
    (node: FolderNode) => {
      if (node.kind === 'folder' || !kindForExtension(documentExtensionOf(node.name))) return null
      return documents.get(node.path) ?? null
    },
    [documents],
  )
  const roleOf = (node: FolderNode): FolderRole | null =>
    node.kind === 'folder' ? roleOfFolder(node.path) : null
  const inkFor = (node: FolderNode): string | undefined => {
    const document = documentOf(node)
    if (document) return workspaceInk(document.workspace)
    const role = roleOf(node)
    if (role) return roleInk(role)
    return node.kind === 'file' ? domainInk(natureOf(node.path).domain) : undefined
  }
  const iconFor = (node: FolderNode, expanded: boolean): string => {
    const document = documentOf(node)
    if (document) return workspaceById(document.workspace).icon
    if (node.kind !== 'folder') return mdiFileOutline
    const role = roleOf(node)
    if (role) return roleIcon(role)
    return expanded ? mdiFolderOpenOutline : mdiFolderOutline
  }
  const hintFor = (node: FolderNode): string | undefined => {
    const role = roleOf(node)
    return role
      ? t(roleLabelKey(role), { label: t(workspaceLabelKey(WORKSPACE_BY_ROLE[role])) })
      : undefined
  }
  const kindOf = (node: FolderNode): EntryKind =>
    documentOf(node) ? 'document' : node.kind === 'folder' ? 'folder' : 'file'
  const previewFor = (node: FolderNode): string | undefined =>
    node.kind === 'file' && !documentOf(node) && !isPrivatePath(node.path)
      ? thumbnailUrl(node.path)
      : undefined
  const isOpen = (node: FolderNode): boolean => {
    const document = documentOf(node)
    return document !== null && open[document.id] !== undefined
  }

  return { documentOf, hintFor, iconFor, inkFor, isOpen, kindOf, previewFor }
}
