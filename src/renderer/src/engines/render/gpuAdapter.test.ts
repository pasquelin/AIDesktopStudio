import { afterEach, describe, expect, it, vi } from 'vitest'
import { askedGpuAdapter, forgetGpuAdapter, probeGpuAdapter } from './gpuAdapter'

/** What `navigator.gpu` answers for the length of one test. jsdom exposes none of its own. */
function gpuAnswering(requestAdapter: () => Promise<unknown>): void {
  Reflect.set(navigator, 'gpu', { requestAdapter })
}

afterEach(() => {
  forgetGpuAdapter()
  Reflect.deleteProperty(navigator, 'gpu')
})

describe('whether this machine has a WebGPU adapter', () => {
  it('answers nothing at all until somebody asks', () => {
    expect(askedGpuAdapter()).toBe(null)
  })

  it('reads no adapter on a browser that exposes no WebGPU', async () => {
    expect(await probeGpuAdapter()).toBe(false)
  })

  it('reads no adapter when the request is refused', async () => {
    gpuAnswering(() => Promise.resolve(null))

    expect(await probeGpuAdapter()).toBe(false)
  })

  it('reads no adapter when the request throws, which is the same answer', async () => {
    gpuAnswering(() => Promise.reject(new Error('no device')))

    expect(await probeGpuAdapter()).toBe(false)
  })

  it('reads the adapter the browser handed back', async () => {
    gpuAnswering(() => Promise.resolve({}))

    expect(await probeGpuAdapter()).toBe(true)
    expect(askedGpuAdapter()).toBe(true)
  })

  it('asks the driver once however many viewports mount', async () => {
    const asking = vi.fn(() => Promise.resolve({}))
    gpuAnswering(asking)

    await Promise.all([probeGpuAdapter(), probeGpuAdapter()])
    await probeGpuAdapter()

    expect(asking).toHaveBeenCalledOnce()
  })
})
