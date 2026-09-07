// SPDX-License-Identifier: MIT
import type { IDockviewPanelProps } from 'dockview-react'
import type { FileViewId } from '@shared/domain/fileView'
import { lazy, type FC } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export type FileViewPanelParams = { path: string }

const InputMapDocument = lazy(async () => ({
  default: (await import('@/features/input/components/InputMapDocument')).InputMapDocument,
}))

function fileViewPanelFor(
  Space: FC<{ path: string }>,
): FC<IDockviewPanelProps<FileViewPanelParams>> {
  return props => (
    <div className="size-full">
      <ErrorBoundary>
        <Space path={props.params.path} />
      </ErrorBoundary>
    </div>
  )
}

export const FILE_VIEW_COMPONENTS: Record<
  FileViewId,
  FC<IDockviewPanelProps<FileViewPanelParams>>
> = {
  inputMap: fileViewPanelFor(InputMapDocument),
}
