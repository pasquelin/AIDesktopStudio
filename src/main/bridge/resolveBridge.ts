import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { APP_NAME } from '@shared/constants'
import { exists } from '@main/persistence'

/**
 * The one door DaVinci Resolve leaves open, and it is not an API this side can call.
 *
 * Measured 2026-08-19 on Resolve 21.0.4.5 free: no outside process reaches the scripting API —
 * the free edition answers nothing on it — but a `.lua` dropped in the Utility folder appears
 * under Workspace ▸ Scripts WITHOUT a restart, and is re-read on every run. Removing one is NOT
 * seen live, which is why uninstalling says to restart.
 */

const SCRIPT_FILE = `${APP_NAME}.lua`

/**
 * The window's id, which is also a Lua NAME in the script below. `APP_NAME` holds a space, and a
 * space in an identifier is a syntax error Resolve reports against the whole file.
 */
const SCRIPT_ID = `${APP_NAME.replace(/[^A-Za-z0-9_]/g, '')}Import`

/** No Resolve on this machine. Its own class so the caller can say THAT rather than a path. */
export class ResolveNotInstalledError extends Error {}

/**
 * Resolve's own folder, which this side reads and never creates. Three platforms, three trees —
 * writing the macOS one on Windows would land a script under a `Library` folder nothing reads.
 *
 * `%APPDATA%` on Windows, and `Support` sits INSIDE the product folder there alone.
 *
 * Neither argument has a default: a case that names no platform asserts a different tree per
 * machine, and the compiler is what keeps that from being written — except on Windows, where
 * `%APPDATA%` OUTRANKS the home it is handed: a case there writes into the real Resolve tree
 * unless it clears the variable first.
 */
export function resolveHome(home: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    const roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(roaming, 'Blackmagic Design', 'DaVinci Resolve', 'Support')
  }

  if (platform === 'linux') return join(home, '.local', 'share', 'DaVinciResolve')

  return join(home, 'Library', 'Application Support', 'Blackmagic Design', 'DaVinci Resolve')
}

/**
 * Where Resolve looks, per user. `Fusion/Scripts/Utility` rather than `Comp` or `Tool`: those
 * two are offered only while a composition is open, and this one runs from the edit page.
 */
export function resolveScriptFolder(home: string, platform: NodeJS.Platform): string {
  return join(resolveHome(home, platform), 'Fusion', 'Scripts', 'Utility')
}

export const resolveScriptPath = (home: string, platform: NodeJS.Platform): string =>
  join(resolveScriptFolder(home, platform), SCRIPT_FILE)

/**
 * The script itself. It imports a timeline the studio wrote into the project that is OPEN, which
 * is the whole of what this bridge does — Resolve owns the pool, the page and the undo stack.
 *
 * Lua rather than Python: Resolve ships its own Lua and needs nothing installed, where the Python
 * door wants an interpreter of a version the user has to match.
 */
const SCRIPT_TEXT = `-- ${APP_NAME} bridge. Written by the application; edit at your own risk.
-- Workspace > Scripts > ${APP_NAME}

-- The GLOBAL, before anything calls it: \`Resolve()\` outside Resolve is a call on nil, which
-- raises before the friendly line below can be reached.
if not Resolve then
  print("This script has to run from inside DaVinci Resolve.")
  return
end

local resolve = Resolve()

local manager = resolve:GetProjectManager()
local project = manager and manager:GetCurrentProject()
if not project then
  print("Open a project first: an import needs somewhere to land.")
  return
end

local media = resolve:GetMediaStorage()
local chosen = media and media:RevealInStorage("")

local ui = fu and fu.UIManager
local dispatcher = ui and bmd.UIDispatcher(ui)
if not dispatcher then
  print("No window manager: run this from Workspace > Scripts.")
  return
end

local window = dispatcher:AddWindow(
  { ID = "${SCRIPT_ID}", WindowTitle = "${APP_NAME}", Geometry = { 200, 200, 520, 120 } },
  ui:VGroup{
    ID = "root",
    ui:Label{ Text = "Pick the edit ${APP_NAME} wrote (.otio, .edl, .fcpxml, .xml)." },
    ui:HGroup{
      ui:Button{ ID = "pick", Text = "Choose a file…" },
      ui:Button{ ID = "close", Text = "Close" },
    },
  }
)

window.On.close.Clicked = function(ev)
  dispatcher:ExitLoop()
end

-- Bracketed rather than dotted: the window id is not a bare Lua name in the general case, and a
-- dotted path holding a space is a syntax error that costs the WHOLE file.
window.On["${SCRIPT_ID}"].Close = function(ev)
  dispatcher:ExitLoop()
end

window.On.pick.Clicked = function(ev)
  local picked = fu:RequestFile("", "", {
    FReqB_SeqGather = false,
    FReqS_Title = "Import an edit",
    FReqS_Filter = "Edits (*.otio *.edl *.fcpxml *.xml)|*.otio;*.edl;*.fcpxml;*.xml",
  })
  if not picked then return end

  local timeline = project:ImportTimelineFromFile(picked)
  if timeline then
    print("Imported " .. timeline:GetName())
  else
    print("Resolve refused that file. Its media may be missing from the pool.")
  end
end

window:Show()
dispatcher:RunLoop()
window:Hide()
`

export function resolveScriptText(): string {
  return SCRIPT_TEXT
}

/**
 * Writes the script where Resolve reads it, and answers the path. Throws
 * `ResolveNotInstalledError` when there is no Resolve to write for.
 *
 * The caller is expected to have ASKED: this drops a file into another application's folder on
 * somebody's machine, which is the one thing in this repository that leaves its own sandbox.
 */
export async function installResolveScript(
  home: string,
  platform: NodeJS.Platform,
): Promise<string> {
  // Resolve's own folder is READ, never made: creating a Blackmagic tree on a machine with no
  // Resolve leaves a folder nobody asked for, holding a script nothing will ever read.
  if (!(await exists(resolveHome(home, platform)))) throw new ResolveNotInstalledError()

  // `Utility` itself IS made: Resolve only writes it once somebody has saved a script from it.
  await mkdir(resolveScriptFolder(home, platform), { recursive: true })
  await writeFile(resolveScriptPath(home, platform), resolveScriptText(), 'utf8')
  return resolveScriptPath(home, platform)
}
