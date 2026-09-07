import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  GEOMETRY_SIMPLIFICATIONS,
  NO_LOSSY_OPTIMIZATION,
  TEXTURE_COMPRESSIONS,
  TEXTURE_REDUCTIONS,
  type LossyOptimization,
} from '@shared/domain/gameExport'
import type { SelectOption } from '@/components/SelectField'
import type { OptimizationPlan } from '@/engines/scene/worldAnalyzer'
import { exportGameProject, type GameOptimizationEstimate } from '@/game/gameExportCompiler'
import { formatDecimal } from '@/helpers/format'
import { useBytes } from '@/hooks/useBytes'
import { useGameExportDialog } from '@/hooks/useGameExportDialog'
import { useOptimizationAnalysis } from '@/hooks/useOptimizationAnalysis'

const choices = <V extends string>(
  values: readonly V[],
  labelOf: (value: V) => string,
): readonly SelectOption<V>[] => values.map(value => ({ value, label: labelOf(value) }))

export function useExportDialogState(documentId: string) {
  const { t, i18n } = useTranslation()
  const close = useGameExportDialog(state => state.close)
  const bytes = useBytes()
  const [options, setOptions] = useState<LossyOptimization>(NO_LOSSY_OPTIMIZATION)
  const [plan, setPlan] = useState<OptimizationPlan | null>(null)
  const [projectEstimate, setProjectEstimate] = useState<GameOptimizationEstimate | null>(null)
  const [exporting, setExporting] = useState(false)
  const [failed, setFailed] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useOptimizationAnalysis(documentId, setPlan, setProjectEstimate, setFailed)
  const geometryOptions = useMemo(
    () => choices(GEOMETRY_SIMPLIFICATIONS, value => t(`game.export.quality.${value}`)),
    [t],
  )
  const textureCompressionOptions = useMemo(
    () => choices(TEXTURE_COMPRESSIONS, value => t(`game.export.quality.${value}`)),
    [t],
  )
  const textureReductionOptions = useMemo(
    () => choices(TEXTURE_REDUCTIONS, value => t(`game.export.reduction.${value}`)),
    [t],
  )
  const number = (value: number) => formatDecimal(value, i18n.language, { digits: 0 })
  async function submit(): Promise<void> {
    const current = new AbortController()
    controller.current = current
    setExporting(true)
    setFailed(false)
    try {
      const outcome = await exportGameProject({
        // 🛑 The id, never the title: an untitled scene sent `''`, which `exportGameProject` reads
        // as « no scene named » and answers with the project's FIRST scene, silently.
        entryScene: documentId,
        lossyOptimization: options,
        signal: current.signal,
      })
      if (!current.signal.aborted) {
        if (outcome.ok) close()
        else setFailed(true)
      }
    } catch {
      if (!current.signal.aborted) setFailed(true)
    }
    controller.current = null
    if (!current.signal.aborted) setExporting(false)
  }
  const cancel = () => {
    controller.current?.abort()
    close()
  }
  return {
    t,
    options,
    setOptions,
    plan,
    projectEstimate,
    exporting,
    failed,
    geometryOptions,
    textureCompressionOptions,
    textureReductionOptions,
    number,
    bytes,
    submit,
    cancel,
  }
}

export type ExportDialogState = ReturnType<typeof useExportDialogState>
