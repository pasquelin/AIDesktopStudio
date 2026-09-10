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
/**
 * The four doors that only OPEN, written once rather than four times over one key. Their `open`
 * takes different arguments — one names an asset — so the shape is what they share, not the call.
 */
const opensOnly = <Held extends { open: (...args: never[]) => Promise<void> }>(
  overrides: Partial<Held> | undefined,
): Held =>
  // `as`: the spread of a `Partial` cannot prove completeness, and `open` is the whole of each.
  ({ open: () => Promise.resolve(), ...overrides }) as Held

const fakeGameWindow = (overrides: WindowOverrides): StudioBridge['gameWindow'] => ({
  open: () => Promise.resolve(),
  close: () => Promise.resolve(),
  onClosed: () => () => {},
  ...overrides.gameWindow,
})

/** The six windows that only OPEN, grouped so the assembly below reads as one list of doors. */
export function fakeAuxiliaryWindows(
  overrides: WindowOverrides,
): Pick<StudioBridge, AuxiliaryWindow> {
  return {
    mirror: opensOnly(overrides.mirror),
    retargetWindow: fakeRetargetWindow(overrides),
    playerModuleWindow: opensOnly(overrides.playerModuleWindow),
    gameWindow: fakeGameWindow(overrides),
    help: opensOnly(overrides.help),
    fileInfo: opensOnly(overrides.fileInfo),
  }
}
