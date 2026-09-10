import { useTranslation } from 'react-i18next'
import type { Asset } from '@shared/domain/asset'
import type { FileFacts } from '@shared/domain/fileInfo'
import { nameOf } from '@shared/domain/folder'
import type { FileCopy } from '@shared/domain/fileCopies'
import type { FileUse } from '@shared/domain/fileUse'
import type { GitStatus } from '@shared/domain/git'
import { PropertySection } from '@/components/PropertySection'
import { PropertyRow } from '@/components/PropertyRow'
import { formatDuration } from '@/engines/timeline/timecode'
import { formatBytes, formatMoment } from '@/helpers/format'
import { itemOfPath } from '@/helpers/projectItem'
import { RoleField } from '@/features/explorer/components/RoleField'
import type { FileInfoSectionId } from './sections'

export type FileInfoWindowBodyProps = {
  id: FileInfoSectionId
  path: string
  facts: FileFacts
  asset: Asset | null
  /** What git says about the whole project, or `null` where it says nothing — see the section. */
  status: GitStatus | null
  /** The documents citing this file. Empty is an answer, and the section says so in words. */
  uses: readonly FileUse[]
  /** The OTHER files holding these bytes. Empty is an answer here too. */
  copies: readonly FileCopy[]
}

/**
 * One run of a file's information, in the inspector's own two columns.
 *
 * The role is the one line that WRITES, and only where the catalogue holds a row to write it in:
 * `RoleField` reads out a domain it cannot correct otherwise, which is the case of every file
 * this window is opened on from outside the project.
 */
export function FileInfoWindowBody({
  id,
  path,
  facts,
  asset,
  status,
  uses,
  copies,
}: FileInfoWindowBodyProps) {
  const { t, i18n } = useTranslation()
  if (id === 'git' && status) return gitSection(path, status, t)
  if (id === 'media' && asset) return mediaSection(asset, t)
  if (id === 'catalogue' && asset) return catalogueSection(asset, i18n.language, t)
  if (id === 'copies') return copiesSection(copies, t)
  if (id === 'uses') return usesSection(uses, t)
  return generalSection(path, facts, asset, i18n.language, t)
}

/**
 * Which documents cite this file — §11's S3, on screen at last (E-19).
 *
 * Each row is labelled by the document's KIND and shows its title: what a person needs before
 * they move or delete the file is which of their own documents would notice.
 *
 * 🛑 It over-reports: a citation is matched on the file's name and on its catalogue ids, so two
 * files of one name in two folders answer for each other. The wording says these documents
 * MENTION the file rather than that they need it, which is what the answer supports.
 */
function usesSection(uses: readonly FileUse[], t: Translate) {
  return (
    <PropertySection title={t('fileInfo.sections.uses')} scId="fileInfo.uses">
      {uses.length === 0 ? (
        // Its own word rather than the section's title or the Git run's « État »: this window
        // stacks every run on one page, so a label repeated across two of them names neither.
        <PropertyRow label={t('fileInfo.documents')}>{t('fileInfo.usedByNone')}</PropertyRow>
      ) : (
        uses.map(use => (
          <PropertyRow key={use.path} label={t(`documents.kinds.${use.kind}`)} shape="path">
            {use.title}
          </PropertyRow>
        ))
      )}
    </PropertySection>
  )
}

/**
 * The other files carrying these exact bytes — §16, narrowed to the one file this window names.
 *
 * The heading says CANDIDATES and the rows say where; nothing here offers to remove anything.
 * What is established is on the row — the path and the store that owns it. Whether a copy is
 * redundant is not, and the window does not pretend otherwise: the project-wide diagnosis is
 * where a person weighs that, with the citations beside it.
 */
function copiesSection(copies: readonly FileCopy[], t: Translate) {
  return (
    <PropertySection title={t('fileInfo.sections.copies')} scId="fileInfo.copies">
      {copies.length === 0 ? (
        <PropertyRow label={t('copies.title')}>{t('fileInfo.copiesNone')}</PropertyRow>
      ) : (
        copies.map(copy => (
          <PropertyRow key={copy.assetId} label={t(`copies.store.${copy.store}`)} shape="path">
            {copy.path}
          </PropertyRow>
        ))
      )}
    </PropertySection>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']

function gitSection(path: string, status: GitStatus, t: Translate) {
  const change = status.files.find(file => file.path === path)?.change
  return (
    <PropertySection title={t('fileInfo.sections.git')} scId="fileInfo.git">
      <PropertyRow label={t('git.ref.branch')}>{status.branch ?? t('git.detached')}</PropertyRow>
      <PropertyRow label={t('inspector.state')}>
        {change ? t(`git.change.${change}`) : t('fileInfo.gitUnchanged')}
      </PropertyRow>
    </PropertySection>
  )
}

function mediaSection(asset: Asset, t: Translate) {
  const width = asset.probe?.width ?? asset.width
  const height = asset.probe?.height ?? asset.height
  return (
    <PropertySection title={t('fileInfo.sections.media')} scId="fileInfo.media">
      {width !== undefined && height !== undefined && (
        <PropertyRow label={t('inspector.dimensions')}>
          {width} × {height}
        </PropertyRow>
      )}
      {asset.probe?.duration !== undefined && (
        <PropertyRow label={t('inspector.duration')}>
          {formatDuration(asset.probe.duration)}
        </PropertyRow>
      )}
      {asset.probe?.codec !== undefined && (
        <PropertyRow label={t('fileInfo.codec')}>{asset.probe.codec}</PropertyRow>
      )}
    </PropertySection>
  )
}

function catalogueSection(asset: Asset, language: string, t: Translate) {
  return (
    <PropertySection title={t('fileInfo.sections.catalogue')} scId="fileInfo.catalogue">
      <PropertyRow label={t('fileInfo.identifier')}>{asset.id}</PropertyRow>
      {asset.hash !== undefined && (
        <PropertyRow label={t('fileInfo.fingerprint')} shape="wrap">
          {asset.hash}
        </PropertyRow>
      )}
      <PropertyRow label={t('fileInfo.added')}>
        {formatMoment(asset.createdAt, language, 'local')}
      </PropertyRow>
    </PropertySection>
  )
}

function generalSection(
  path: string,
  facts: FileFacts,
  asset: Asset | null,
  language: string,
  t: Translate,
) {
  return (
    <PropertySection title={t('fileInfo.sections.general')} scId="fileInfo.general">
      <PropertyRow label={t('inspector.name')}>{nameOf(path)}</PropertyRow>
      {/* The inspector's own word for this question, not a second one: « Nature » already names
          what a thing IS there, and two labels for one idea is how a vocabulary drifts. */}
      <PropertyRow label={t('inspector.kind')}>{t(`fileInfo.kind.${facts.kind}`)}</PropertyRow>
      {/* A folder is not a domain — see `ProjectItem`, which stands for a file and says so. An
          extension cannot always tell a normal map from an albedo, so the guess is offered
          rather than imposed wherever there is a row to remember the answer in. */}
      {facts.kind === 'file' && (
        <RoleField assetId={asset?.id ?? null} domain={itemOfPath(path, { asset }).domain} />
      )}
      <PropertyRow label={t('inspector.path')} shape="path">
        {path}
      </PropertyRow>
      {/* The folder's own entry weighs ninety-six bytes and says nothing about what it holds;
          totalling a tree is a walk this window does not take. */}
      {facts.kind === 'file' && (
        <PropertyRow label={t('inspector.size')}>
          {formatBytes(facts.bytes, unit => t(`units.${unit}`), language)}
        </PropertyRow>
      )}
      {facts.createdAt !== null && (
        <PropertyRow label={t('inspector.created')}>
          {formatMoment(facts.createdAt, language, 'local')}
        </PropertyRow>
      )}
      <PropertyRow label={t('fileInfo.modified')}>
        {formatMoment(facts.modifiedAt, language, 'local')}
      </PropertyRow>
    </PropertySection>
  )
}
