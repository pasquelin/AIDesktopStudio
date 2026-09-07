import { useTranslation } from 'react-i18next'
import type { Asset } from '@shared/domain/asset'
import type { FileFacts } from '@shared/domain/fileInfo'
import { nameOf } from '@shared/domain/folder'
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
}

/**
 * One run of a file's information, in the inspector's own two columns.
 *
 * The role is the one line that WRITES, and only where the catalogue holds a row to write it in:
 * `RoleField` reads out a domain it cannot correct otherwise, which is the case of every file
 * this window is opened on from outside the project.
 */
export function FileInfoWindowBody({ id, path, facts, asset, status }: FileInfoWindowBodyProps) {
  const { t, i18n } = useTranslation()
  if (id === 'git' && status) return gitSection(path, status, t)
  if (id === 'media' && asset) return mediaSection(asset, t)
  if (id === 'catalogue' && asset) return catalogueSection(asset, i18n.language, t)
  return generalSection(path, facts, asset, i18n.language, t)
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
