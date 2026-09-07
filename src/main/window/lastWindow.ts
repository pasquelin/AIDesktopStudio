/** macOS keeps the process so a Dock click can reopen; other desktops quit with the last window. */
export function quitsOnLastWindow(platform: NodeJS.Platform): boolean {
  return platform !== 'darwin'
}
