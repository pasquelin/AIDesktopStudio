import type { StudioBridge } from '@shared/ipc'

/** The slices the six doors below take — their own, never the whole overrides object. */
type WindowOverrides = {
  [K in AuxiliaryWindow]?: Partial<StudioBridge[K]>
}

type AuxiliaryWindow =
  'mirror' | 'retargetWindow' | 'playerModuleWindow' | 'gameWindow' | 'help' | 'fileInfo'

const fakeRetargetWindow = (overrides: WindowOverrides): StudioBridge['retargetWindow'] => ({
  open: async () => {},
  focusOrigin: async () => {},
  ...overrides.retargetWindow,
})
const fakeMirror = (overrides: WindowOverrides): StudioBridge['mirror'] => ({
  open: () => Promise.resolve(),
  ...overrides.mirror,
})

const fakePlayerModuleWindow = (
  overrides: WindowOverrides,
): StudioBridge['playerModuleWindow'] => ({
  open: () => Promise.resolve(),
  ...overrides.playerModuleWindow,
})

const fakeGameWindow = (overrides: WindowOverrides): StudioBridge['gameWindow'] => ({
  open: () => Promise.resolve(),
  close: () => Promise.resolve(),
  onClosed: () => () => {},
  ...overrides.gameWindow,
})

const fakeHelp = (overrides: WindowOverrides): StudioBridge['help'] => ({
  open: () => Promise.resolve(),
  ...overrides.help,
})

const fakeFileInfo = (overrides: WindowOverrides): StudioBridge['fileInfo'] => ({
  open: () => Promise.resolve(),
  ...overrides.fileInfo,
})

/** The six windows that only OPEN, grouped so the assembly below reads as one list of doors. */
export function fakeAuxiliaryWindows(
  overrides: WindowOverrides,
): Pick<StudioBridge, AuxiliaryWindow> {
  return {
    mirror: fakeMirror(overrides),
    retargetWindow: fakeRetargetWindow(overrides),
    playerModuleWindow: fakePlayerModuleWindow(overrides),
    gameWindow: fakeGameWindow(overrides),
    help: fakeHelp(overrides),
    fileInfo: fakeFileInfo(overrides),
  }
}
