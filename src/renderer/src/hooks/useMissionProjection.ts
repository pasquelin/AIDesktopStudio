import { useEffect } from 'react'
import { useMissions } from '@/stores/missions'

export function useMissionProjection(projectId?: string): void {
  const connectMissions = useMissions(state => state.connectMissions)
  const disconnectMissions = useMissions(state => state.disconnectMissions)

  useEffect(() => {
    const connect = async (): Promise<void> => {
      await connectMissions(projectId ? { projectId } : {})
    }
    void connect()
    return () => {
      disconnectMissions()
    }
  }, [connectMissions, disconnectMissions, projectId])
}
