import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { bytes } from './sqlRow'

function isByteView(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]'
  )
}

describe('SQL row values', () => {
  it('reads byte views created in another JavaScript realm', () => {
    const foreignValue: unknown = runInNewContext('new Uint8Array([1, 2, 3])')
    if (!isByteView(foreignValue)) throw new Error('The fixture is not a byte view')

    expect(foreignValue).not.toBeInstanceOf(Uint8Array)
    expect(bytes({ value: foreignValue }, 'value')).toEqual(new Uint8Array([1, 2, 3]))
  })
})
