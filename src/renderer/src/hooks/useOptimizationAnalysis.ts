import { useEffect } from 'react'
import type { OptimizationPlan } from '@/engines/scene/worldAnalyzer'
import { analyzeGameOptimization, type GameOptimizationEstimate } from '@/game/gameExportCompiler'
import { sceneEngineOf } from '@/stores/sceneEngines'

export function useOptimizationAnalysis(
  documentId: string,
  setPlan: (plan: OptimizationPlan) => void,
  setProject: (estimate: GameOptimizationEstimate) => void,
  setFailed: (failed: boolean) => void,
) {
  useEffect(() => {
    let active = true
    const engine = sceneEngineOf(documentId)
    if (!engine) return
    const activeEngine = engine
    async function analyze() {
      try {
        // 🛑 Measured FIRST and handed on: the project pass walks every scene of the project, this
        // one included, so running the two at once analysed the open scene twice on one thread.
        const measured = await activeEngine.analyzeWorldOptimization()
        const project = await analyzeGameOptimization({ [documentId]: measured })
        if (active) {
          setPlan(measured)
          setProject(project)
        }
      } catch {
        if (active) setFailed(true)
      }
    }
    void analyze()
    return () => {
      active = false
    }
  }, [documentId, setFailed, setPlan, setProject])
}
