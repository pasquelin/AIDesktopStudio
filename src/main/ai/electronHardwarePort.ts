import { readFile, statfs } from 'node:fs/promises'
import { availableParallelism, freemem, totalmem } from 'node:os'
import { dirname } from 'node:path'
import { app } from 'electron'
import type { VramReading } from '@shared/domain/aiMemory'
import type { HardwarePort } from './hardwareProbe'

/**
 * `MemAvailable` rather than `os.freemem()`, which on Linux reports `MemFree` and therefore
 * excludes the page cache: on a healthy machine it answers a few hundred MB and the probe would
 * refuse every model. `[D]` `MemAvailable` is the kernel's own estimate of what a new workload
 * could take.
 */
async function linuxAvailableBytes(): Promise<number | null> {
  const line = (await readFile('/proc/meminfo', 'utf8'))
    .split('\n')
    .find(entry => entry.startsWith('MemAvailable:'))
  const kilobytes = Number(line?.split(/\s+/)[1])

  return Number.isFinite(kilobytes) ? kilobytes * 1024 : null
}

/**
 * Free space on the volume a path names, walking up to a folder that exists: the model folder is
 * created at install time, and a path that is not there yet still names a volume.
 */
export async function freeBytesAt(path: string): Promise<number> {
  for (let at = path; ; at = dirname(at)) {
    try {
      const stats = await statfs(at)
      return stats.bavail * stats.bsize
    } catch (error) {
      if (dirname(at) === at) throw error
    }
  }
}

/**
 * The real machine behind `HardwarePort` — the only file of the probe that touches Electron or
 * `os`. `weightsPath` is a getter: the model folder is a setting, and it moves while this runs.
 *
 * `vram` is the one reading `os` cannot give: it comes from the inference runtime, which is what
 * makes a snapshot answer `runtime` and a verdict answer anything but `unknown`.
 */
export function electronHardwarePort(
  weightsPath: () => string,
  vram: () => Promise<VramReading | null>,
): HardwarePort {
  return {
    platform: () => process.platform,
    arch: () => process.arch,
    cpuCount: availableParallelism,
    totalBytes: totalmem,
    // Measured 2026-08-21 on Apple Silicon: `freemem()` answers free + speculative pages and
    // ignores reclaimable inactive ones — 29.51 GB reported against 31.58 GB left uncounted. It is
    // an under-estimate everywhere, and only Linux offers a better reading without a subprocess.
    availableBytes: () =>
      process.platform === 'linux' ? linuxAvailableBytes() : Promise.resolve(freemem()),
    // The volume the weights would land ON, which is the model folder and not the application:
    // that folder is a setting, and pointing it at an external disk is what the setting is for.
    diskFreeBytes: () => freeBytesAt(weightsPath()),
    // `complete` rather than `basic`: same four keys, but only `complete` fills `glRenderer`.
    gpuInfo: () => app.getGPUInfo('complete'),
    vram,
  }
}
