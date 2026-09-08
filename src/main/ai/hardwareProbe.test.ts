import { describe, expect, it } from 'vitest'
import {
  asRuntimeSnapshot,
  gpuIdentityOf,
  hardwareProbe,
  isNvidia,
  memoryDomainOf,
  memorySnapshotOf,
  type GpuIdentity,
  type HardwareFacts,
  type HardwarePort,
} from './hardwareProbe'

/** What `app.getGPUInfo('complete')` actually answered here on 2026-08-21, Electron 43.4.0. */
const REAL_GPU_INFO = {
  auxAttributes: {
    glRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Version 26.5.2)',
    glVendor: 'Google Inc. (Apple)',
    inProcessGpu: false,
  },
  gpuDevice: [{ active: true, deviceId: 0, gpuPreference: 0, vendorId: 4203 }],
  machineModelName: 'Mac',
  machineModelVersion: '14.6',
}

/** Round figures, chosen for arithmetic that reads — unlike `REAL_GPU_INFO`, nothing here is measured. */
const port = (over: Partial<HardwarePort> = {}): HardwarePort => ({
  platform: () => 'linux',
  arch: () => 'x64',
  cpuCount: () => 12,
  totalBytes: () => 100_000_000_000,
  availableBytes: () => Promise.resolve(60_000_000_000),
  diskFreeBytes: () => Promise.resolve(310_000_000_000),
  gpuInfo: () => Promise.resolve(REAL_GPU_INFO),
  vram: () => Promise.resolve(null),
  ...over,
})

const facts = (over: Partial<HardwareFacts> = {}): HardwareFacts => ({
  platform: 'darwin',
  arch: 'arm64',
  cpuCount: 12,
  physicalBytes: 100_000_000_000,
  freeBytes: 60_000_000_000,
  diskFreeBytes: 310_000_000_000,
  gpu: null,
  vram: null,
  ...over,
})

describe('hardwareProbe', () => {
  // The port answers `linux`, so a test cannot pass by inheriting the Mac it was written on.
  it('reports the machine the port describes, not the one it runs on', async () => {
    await expect(hardwareProbe(port())).resolves.toMatchObject({
      platform: 'linux',
      arch: 'x64',
      cpuCount: 12,
      physicalBytes: 100_000_000_000,
      diskFreeBytes: 310_000_000_000,
    })
  })

  // A probe that invented a zero would read as "no room left" and refuse every model.
  it('reports a reading it could not take as absent rather than as zero', async () => {
    await expect(
      hardwareProbe(
        port({
          availableBytes: () => Promise.resolve(null),
          diskFreeBytes: () => Promise.reject(new Error('ENOENT')),
        }),
      ),
    ).resolves.toMatchObject({ freeBytes: null, diskFreeBytes: null })
  })

  it('still answers when a reading rejects outright', async () => {
    const probed = await hardwareProbe(port({ gpuInfo: () => Promise.reject(new Error('no gpu')) }))

    expect(probed.gpu).toBeNull()
    expect(probed.physicalBytes).toBe(100_000_000_000)
  })
})

describe('gpuIdentityOf', () => {
  it('reads the answer this machine really gave', () => {
    expect(gpuIdentityOf(REAL_GPU_INFO)).toEqual({
      vendorId: 4203,
      deviceId: 0,
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Version 26.5.2)',
      machineModel: 'Mac',
    })
  })

  // Electron declares no shape at all, so every field is optional in practice — a missing one
  // reads as unknown, never as a number.
  it('answers null fields rather than throwing on a shape it was not promised', () => {
    expect(gpuIdentityOf({})).toEqual({
      vendorId: null,
      deviceId: null,
      renderer: null,
      machineModel: null,
    })
    expect(gpuIdentityOf(null)).toBeNull()
    expect(gpuIdentityOf('not an object')).toBeNull()
  })

  it('takes the active device when the machine lists several', () => {
    expect(
      gpuIdentityOf({
        gpuDevice: [
          { active: false, vendorId: 1, deviceId: 1 },
          { active: true, vendorId: 2, deviceId: 2 },
        ],
      }),
    ).toMatchObject({ vendorId: 2, deviceId: 2 })
  })
})

describe('isNvidia', () => {
  const card = (over: Partial<GpuIdentity>): GpuIdentity => ({
    vendorId: null,
    deviceId: null,
    renderer: null,
    machineModel: null,
    ...over,
  })

  it('reads NVIDIA off the vendor id', () => {
    expect(isNvidia(card({ vendorId: 0x10de }))).toBe(true)
    expect(isNvidia(card({ vendorId: 0x8086 }))).toBe(false)
    expect(isNvidia(null)).toBe(false)
  })

  /**
   * Some drivers answer a renderer and no id at all, and a card nobody identified is a card whose
   * owner generates on the processor without ever being told.
   */
  it('falls back to the name where the driver gave no id', () => {
    expect(isNvidia(card({ renderer: 'ANGLE (NVIDIA GeForce RTX 4090 Direct3D11)' }))).toBe(true)
    expect(isNvidia(card({ renderer: 'ANGLE (Apple, ANGLE Metal Renderer)' }))).toBe(false)
  })
})

describe('memoryDomainOf', () => {
  it('calls Apple Silicon unified and everything else split when nothing answered', () => {
    expect(memoryDomainOf('darwin', 'arm64', null)).toBe('unified')
    expect(memoryDomainOf('darwin', 'x64', null)).toBe('split')
    expect(memoryDomainOf('win32', 'x64', null)).toBe('split')
    expect(memoryDomainOf('linux', 'arm64', null)).toBe('split')
  })

  // The reading outranks the deduction, in BOTH directions: an ARM Mac in a virtual machine with
  // a paravirtual GPU is split, and an SoC nobody thought of is unified.
  it('takes a runtime reading over the deduction', () => {
    const shared = { totalBytes: 8, freeBytes: 4, unifiedBytes: 8 }
    const dedicated = { totalBytes: 8, freeBytes: 4, unifiedBytes: 0 }

    expect(memoryDomainOf('linux', 'x64', shared)).toBe('unified')
    expect(memoryDomainOf('darwin', 'arm64', dedicated)).toBe('split')
  })
})

describe('memorySnapshotOf', () => {
  const budget = {
    appBudgetBytes: 40_000_000_000,
    headroomBytes: 2_000_000_000,
    rendererReservedBytes: 500_000_000,
  }

  // R1: a probe sorts a catalogue and explains a refusal. It may never admit a job, and `source`
  // is what says so — no runtime answered, so nothing here is an occupation.
  it('answers as a probe holding no runtime', () => {
    const snapshot = memorySnapshotOf(facts(), budget, 1_700_000_000_000)

    expect(snapshot.source).toBe('probe')
    expect(snapshot.runtimeBytes).toEqual({})
    expect(snapshot.at).toBe(1_700_000_000_000)
  })

  it('takes the machine domain from the facts it was handed', () => {
    expect(memorySnapshotOf(facts(), budget, 0).domain).toBe('unified')
    expect(memorySnapshotOf(facts({ platform: 'win32', arch: 'x64' }), budget, 0).domain).toBe(
      'split',
    )
  })

  // The window comes off the BUDGET, which is gross — never off a free-memory reading, which is a
  // residue the window is already out of. Taking it off both counted it twice.
  it('offers the budget less the window and the headroom', () => {
    expect(memorySnapshotOf(facts(), budget, 0).availableBytes).toBe(37_500_000_000)
  })

  // The budget is a ceiling, not an entitlement: a machine with less free than that wins.
  it('never offers more than the machine actually has free', () => {
    expect(memorySnapshotOf(facts({ freeBytes: 3_000_000_000 }), budget, 0).availableBytes).toBe(
      1_000_000_000,
    )
  })

  // A port that could not read free memory must not make the probe refuse everything: the budget
  // then stands alone, which is the honest reading of "we know what we allow, not what is left".
  it('falls back to the budget when free memory could not be read', () => {
    expect(memorySnapshotOf(facts({ freeBytes: null }), budget, 0).availableBytes).toBe(
      37_500_000_000,
    )
  })

  // Refusing is an answer; a negative figure would be read as a number and budgeted.
  it('answers zero rather than a negative when the reserves exceed what is free', () => {
    expect(memorySnapshotOf(facts({ freeBytes: 1_000_000_000 }), budget, 0).availableBytes).toBe(0)
  })

  // The whole of point B: on a machine with a dedicated card the weights come out of the VIDEO
  // memory, and a system reading answers for the wrong pot — in both directions.
  it('weighs a split machine against its video memory, not its system memory', () => {
    const split = facts({
      platform: 'linux',
      arch: 'x64',
      freeBytes: 60_000_000_000,
      vram: { totalBytes: 8_000_000_000, freeBytes: 7_000_000_000, unifiedBytes: 0 },
    })

    // 7 GB free of the card, less the headroom — never the 60 GB of system memory free.
    expect(memorySnapshotOf(split, budget, 0).availableBytes).toBe(5_000_000_000)
  })

  /**
   * 🛑 On a unified machine too, and this is the case that was wrong: `[M]` on an M2 Max with
   * 96 GiB, `os.freemem()` answers 27,0 GiB where llama.cpp answers 77,8 GiB allocatable — the
   * 29,9 GiB of inactive pages the system reading never counts. Reading the system there because
   * "it is the same memory" threw away the better of two readings.
   */
  it('weighs a unified machine against the runtime reading too, not the system one', () => {
    const unified = facts({
      freeBytes: 27_000_000_000,
      vram: { totalBytes: 77_800_000_000, freeBytes: 77_800_000_000, unifiedBytes: 77_800_000_000 },
    })

    // The card's own free figure, less the window and the headroom — not the 27 GiB `freemem` saw.
    expect(memorySnapshotOf(unified, budget, 0).availableBytes).toBe(75_300_000_000)
  })

  /**
   * 🛑 A build with no GPU answers zeroes rather than refusing, and the port turns that into `null`
   * — but if one ever reached here, a machine that runs models on its CPU would be told it holds
   * nothing at all, and every candidate would read as too heavy.
   */
  it('never lets an empty card decide for a machine that has none', () => {
    const cpuOnly = facts({
      platform: 'linux',
      arch: 'x64',
      vram: { totalBytes: 0, freeBytes: 0, unifiedBytes: 0 },
    })

    expect(memorySnapshotOf(cpuOnly, budget, 0).availableBytes).toBe(37_500_000_000)
  })

  // R1 of ADR-19, held by the TYPE: a reading no runtime answered for cannot reach an admission
  // at all, and this is the one door through which one that did can.
  it('is a runtime reading exactly when a runtime answered for the memory', () => {
    const answered = facts({ vram: { totalBytes: 8, freeBytes: 4, unifiedBytes: 0 } })

    expect(asRuntimeSnapshot(memorySnapshotOf(facts(), budget, 0))).toBeNull()
    expect(asRuntimeSnapshot(memorySnapshotOf(answered, budget, 0))?.source).toBe('runtime')
  })
})
