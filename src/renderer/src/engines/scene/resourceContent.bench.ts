import { bench } from '@shared/vitestBench'
import { SphereGeometry } from 'three'
import { describe } from 'vitest'
import { GEOMETRY_CONTENT } from './resourceContent'

const geometry = new SphereGeometry(1, 256, 128)
const copy = geometry.clone()

describe('content comparison of a 33,000-vertex geometry', () => {
  bench('fingerprints every buffer', () => {
    void GEOMETRY_CONTENT.key(geometry)
  })

  bench('confirms an equal fingerprint byte for byte', () => {
    void GEOMETRY_CONTENT.equals(geometry, copy)
  })
})
