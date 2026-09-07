import { useEffect } from 'react'
import type { CommandId, CommandScope } from '@shared/domain/command'
import { getBridge } from '@/services/bridge'
import { useLatest } from './useLatest'

/**
 * The native menu's two doors, for a window that shows no space: it tells the menu whose history
 * it holds — or ⌘Z stays reserved for the platform's own undo — and takes back the rows the menu
 * fires at it, ⌘S among them since the menu carries that key on macOS.
 */
export function useMenuScope(scope: CommandScope, onCommand: (command: CommandId) => void): void {
  const handler = useLatest(onCommand)

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge) return

    void bridge.window.setWorkspace(null, [], [], [], scope)
    return bridge.menu.onCommand(command => handler.current(command))
  }, [scope, handler])
}
