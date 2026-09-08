import { rmsOf, STT_CHUNK_SAMPLES, STT_SAMPLE_RATE, toInt16 } from '@shared/domain/dictation'
import workletUrl from './pcmWorklet?worker&url'

/**
 * The microphone, from the window that owns it.
 *
 * Nothing here recognises anything: it opens a stream, cuts it into chunks and hands them over.
 * The engine is in a process of its own, three boundaries away.
 */

/** The name the worklet registers itself under. Written on both sides, and nowhere else. */
const PROCESSOR = 'pcm-collector'

type CaptureListeners = {
  /** One chunk of 16-bit samples, ready to cross the boundary. */
  onChunk: (chunk: Int16Array) => void
  /** Input level, 0 to 1, measured where the samples already are. */
  onLevel: (rms: number) => void
}

export type Capture = {
  stop: () => Promise<void>
}

/** What a refused or absent microphone answers with, told apart so the interface can say which. */
export class NoInputDevice extends Error {}
export class MicrophoneRefused extends Error {}

type CaptureOptions = CaptureListeners & {
  /** The microphone to record from. Absent means the system default. */
  deviceId?: string
}

/**
 * Opens the microphone and starts handing chunks over.
 *
 * The context is built at 16 kHz — the rate the model was trained at — so the resampling is
 * done by the platform's own audio graph. Doing it in JavaScript would be both slower and
 * worse, and the browser has to resample anyway to reach the device.
 */
export async function startCapture(options: CaptureOptions): Promise<Capture> {
  const stream = await openStream(options.deviceId)
  const context = new AudioContext({ sampleRate: STT_SAMPLE_RATE })

  try {
    await context.audioWorklet.addModule(workletUrl)
  } catch (error) {
    // The context holds an output device for as long as it lives, and a worklet that failed to
    // load leaves one behind that nothing will ever close.
    stream.getTracks().forEach(track => track.stop())
    await context.close()
    throw error
  }

  const source = context.createMediaStreamSource(stream)
  const collector = new AudioWorkletNode(context, PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    processorOptions: { chunkSamples: STT_CHUNK_SAMPLES },
  })

  collector.port.onmessage = (event: MessageEvent<{ chunk: Float32Array }>) => {
    const { chunk } = event.data
    // Both on the window's thread, on 1600 values every 100 ms: measured in microseconds, and
    // it keeps the level and the conversion written once, where they are tested.
    options.onLevel(rmsOf(chunk))
    options.onChunk(toInt16(chunk))
  }

  source.connect(collector)

  return {
    stop: async () => {
      collector.port.onmessage = null
      source.disconnect()
      collector.disconnect()
      // The track first: it is what the operating system shows as a microphone in use, and
      // leaving it on for the length of a close is leaving a recording indicator on.
      stream.getTracks().forEach(track => track.stop())
      await context.close()
    },
  }
}

/**
 * Asks for one channel with the platform's own echo cancellation and noise suppression: both
 * are what a laptop microphone in a room needs, and both are free where they are applied.
 */
async function openStream(deviceId?: string): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        // A device that has since been unplugged falls back to the default rather than
        // refusing: the setting outlives the headset it named.
        ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
      },
    })
  } catch (error) {
    throw translate(error)
  }
}

/**
 * The two refusals the interface tells apart, out of the several names browsers give them.
 * Everything else travels as it came: an unknown failure named wrongly is worse than one shown
 * as it is.
 */
function translate(error: unknown): Error {
  const name = error instanceof Error ? error.name : ''

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new MicrophoneRefused('the microphone was refused')
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new NoInputDevice('no microphone answered')
  }

  return error instanceof Error ? error : new Error(String(error))
}

/**
 * The microphones the machine offers. Labels are empty until the user has granted access once,
 * which is why this is asked after a session rather than before one.
 */
export async function listInputDevices(): Promise<{ id: string; label: string }[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()

  return devices
    .filter(device => device.kind === 'audioinput')
    .map(device => ({ id: device.deviceId, label: device.label }))
}
