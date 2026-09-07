import { useEffect } from 'react'
import { connectRemoteActions } from '@/features/assistant/remoteActions'
import { connectThoughtStream } from '@/features/assistant/thoughtStream'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { useConnections } from '@/hooks/useConnections'
import { useMainLogs } from '@/hooks/useMainLogs'
import { useNativeMenu } from '@/hooks/useNativeMenu'
import { useMissionProjection } from '@/hooks/useMissionProjection'
import { useDictationShortcut } from '@/hooks/useDictationShortcut'
import { useAccounts } from '@/stores/accounts'
import { useAiModels } from '@/stores/aiModels'
import { useAssets } from '@/stores/assets'
import { useTasks } from '@/stores/tasks'
import { useJobs } from '@/stores/jobs'
import { useDictation } from '@/stores/dictation'
import { useMedia } from '@/stores/media'
import { useFolderRoles } from '@/stores/folderRoles'
import { useProject } from '@/stores/project'
import { useProjectContext } from '@/stores/projectContext'
import { useSettings } from '@/stores/settings'
import { useActivity } from '@/stores/activity'
import { useUpdates } from '@/stores/updates'
import { connectImageGeneration } from '@/stores/imageGeneration'
import { connectAudioGeneration } from '@/stores/audioGeneration'
import { connectModelGeneration } from '@/stores/modelGeneration'
import { connectSequenceGeneration } from '@/stores/sequenceGeneration'
import { connectCodeGeneration } from '@/stores/codeGeneration'
import { connectMaterialGeneration } from '@/stores/materialGeneration'
import { connectPreparation } from '@/stores/preparation'
import { connectSubSelectionRelease } from '@/stores/subSelection'
import { connectSkyboxGeneration } from '@/stores/skyboxGeneration'
import { Shell } from './Shell/Shell'
import { StudioQueries } from './StudioQueries'

export function Application() {
  useMainLogs()
  useNativeMenu()
  const missionProjectId = useProject(state => state.project?.path)
  useMissionProjection(missionProjectId)

  const connectSettings = useSettings(state => state.connect)
  const connectAccounts = useAccounts(state => state.connect)
  const connectAiModels = useAiModels(state => state.connect)
  const connectProject = useProject(state => state.connect)
  const connectFolderRoles = useFolderRoles(state => state.connect)
  const connectJobs = useJobs(state => state.connect)
  const connectMedia = useMedia(state => state.connect)
  const connectDictation = useDictation(state => state.connect)
  const connectUpdates = useUpdates(state => state.connect)
  const connectActivity = useActivity(state => state.connect)
  const connectAssets = useAssets(state => state.connect)
  const connectProjectContext = useProjectContext(state => state.connect)
  const connectTasks = useTasks(state => state.connect)

  useConnections([
    connectSettings,
    connectAccounts,
    connectAiModels,
    connectProject,
    connectFolderRoles,
    connectJobs,
    connectMedia,
    connectDictation,
    connectUpdates,
    connectActivity,
    connectAssets,
    connectProjectContext,
  ])

  // Apart from the batch above, which awaits a promise each: this one hands back its unsubscribe
  // straight away — there is nothing to read before it can listen.
  useEffect(() => connectTasks(), [connectTasks])

  // Store to store rather than through the main process, so each subscribes on its own: what a
  // generation produced lands in the document that asked for it, whichever workspace that was.
  useEffect(() => connectSkyboxGeneration(), [])
  useEffect(() => connectImageGeneration(), [])
  useEffect(() => connectModelGeneration(), [])
  useEffect(() => connectSequenceGeneration(), [])
  useEffect(() => connectAudioGeneration(), [])
  useEffect(() => connectMaterialGeneration(), [])
  useEffect(() => connectCodeGeneration(), [])

  // Same reason, the other way round: what an edit asked the generator to open on belongs to the
  // space that asked, and has to close when the user leaves it.
  useEffect(() => connectPreparation(), [])

  // An action asked for from outside the application lands on the same gate the modal uses, so
  // a generation started from a terminal still asks on this screen before it spends.
  useEffect(() => connectRemoteActions(), [])
  useEffect(() => connectThoughtStream(), [])

  // Same reason again: a scene selects from four doors — the outliner, the viewport, the node
  // panels and its own COMMANDS — and only the inspector needs to hear about all four.
  useEffect(() => connectSubSelectionRelease(), [])

  useAppliedSettings()
  useDictationShortcut()

  return (
    <StudioQueries>
      <Shell />
    </StudioQueries>
  )
}
