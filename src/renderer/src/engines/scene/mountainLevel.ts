// SPDX-License-Identifier: MIT

/** 🛑 An empty plain gives a machine no way to tell a hundred knots from a hover — measured on a
 * first pass where the ground was one flat colour. */
import {
  climbSurface,
  dense,
  fieldNode,
  fixedBody,
  grassSurface,
  groundSurface,
  markSurface,
  obstacleSurface,
} from './levelParts'
import { groupNode, meshNode, transformAt } from './nodeFactory'
import { IDENTITY_TRANSFORM, type SceneNode } from './sceneState'

/** How far the world reaches, edge to edge — so it stands from −1000 to +1000. */
export const MOUNTAIN_WORLD = 2000

/**
 * 🛑 Sized against the CRUISE ALTITUDE of 120 m: peaks of 420 to 900 m were a wall from the
 * cockpit, and a massif spread over 6 km turned every shadow into a 3,7 m staircase.
 */
const LOW = 60
const HIGH = 240

/** Twenty-four sides: a drawn decagon is FELT as the cone around it, 20 m outside the rock. */
const SIDES = 24

/** Where the weather sits, and how deep it is — flown under, through, or over. */
const CLOUD_FLOOR = 260
const CLOUD_RISE = 90

/**
 * 🛑 Metres between squares. At a kilometre the studio default of one is an aliasing shimmer, and
 * `TILES_PER_METRE.min` puts the other wall at twenty — past it a reopened document is clamped.
 */
const FIELD_TILE = 20
const LINE_TILE = 20
const ROCK_TILE = 20
const CLOUD_TILE = 20

type Peak = { x: number; z: number; radius: number; height: number }

/** The country under the field: strips of farmland, a river, and the roads between them. */
function country(): SceneNode[] {
  const land = groupNode(IDENTITY_TRANSFORM, 'Country')
  const strips: SceneNode[] = [land]

  // 🛑 Split either side of the RUNWAY, never laid across it: a full-width strip 5 cm above the
  // ground buried 535 of the runway's 600 m under green, and the airfield vanished from the air.
  const half = (index: number, side: number, name: string): SceneNode =>
    fieldNode({
      at: { x: side * 300, y: 0.05, z: -650 + index * 260 },
      width: 500,
      depth: 250,
      // Standing and cut, alternately — the two roles the playground paints in green and orange.
      material: index % 2 === 0 ? grassSurface() : climbSurface(),
      tilesPerMetre: 1 / FIELD_TILE,
      parentId: land.id,
      name,
    })

  for (let index = 0; index < 6; index++) {
    strips.push(
      half(index, -1, `Field West ${index + 1}`),
      half(index, 1, `Field East ${index + 1}`),
    )
  }

  // A river and a road, crossing them: two lines that say where one is GOING, not just how fast.
  // A centimetre above the fields, or the two fight for the same pixel where they meet.
  for (const line of [
    { x: -620, width: 80, material: markSurface(), name: 'River' },
    { x: 640, width: 36, material: groundSurface(), name: 'Road' },
  ]) {
    strips.push(
      fieldNode({
        at: { x: line.x, y: 0.06, z: 0 },
        width: line.width,
        depth: 1400,
        material: line.material,
        tilesPerMetre: 1 / LINE_TILE,
        parentId: land.id,
        name: line.name,
      }),
    )
  }

  return strips
}

/** Weather, drawn and never felt: a plane flies through a cloud, it does not land on one. */
function clouds(): SceneNode[] {
  const sky = groupNode(IDENTITY_TRANSFORM, 'Clouds')
  const puffs: SceneNode[] = [sky]
  const spots = [
    { x: -420, z: -300, size: 260 },
    { x: 380, z: -700, size: 300 },
    { x: -660, z: -480, size: 220 },
    { x: 600, z: 200, size: 280 },
    { x: -150, z: 620, size: 320 },
    { x: 700, z: -160, size: 240 },
    { x: -540, z: 620, size: 200 },
  ]

  spots.forEach((spot, index) => {
    puffs.push(
      meshNode(
        { kind: 'box', width: spot.size, height: CLOUD_RISE, depth: spot.size * 0.7 },
        {
          transform: transformAt({ x: spot.x, y: CLOUD_FLOOR + (index % 3) * 70, z: spot.z }),
          // The loosest a document will keep: at `TILES_PER_METRE.min` a 300 m cloud shows some
          // fifteen squares, which reads as a mass rather than as a crate.
          material: { ...dense(groundSurface(), CLOUD_TILE), color: '#f2f5f8' },
          castShadow: false,
          parentId: sky.id,
          name: `Cloud ${index + 1}`,
        },
      ),
    )
  })
  return puffs
}

/**
 * 🛑 None on the strip, none past `DEFAULT_CAMERA.far`. They stood at 1620 to 1780 m — clipped
 * away whole, on a map whose emptiness was then blamed on its textures.
 */
function peaks(): Peak[] {
  const ridge = (side: number): Peak[] =>
    Array.from({ length: 5 }, (_, index) => ({
      x: side * (300 + (index % 2) * 110),
      z: -160 - index * 150,
      radius: 90 + (index % 3) * 40,
      height: LOW + ((index * 47) % (HIGH - LOW)),
    }))

  return [
    ...ridge(-1),
    ...ridge(1),
    { x: 0, z: -780, radius: 190, height: HIGH },
    { x: -500, z: -560, radius: 150, height: 190 },
    { x: 500, z: -570, radius: 140, height: 175 },
    { x: -600, z: 420, radius: 160, height: 165 },
    { x: 620, z: 520, radius: 130, height: 140 },
    { x: 80, z: 760, radius: 150, height: 130 },
  ]
}

export function mountainNodes(): SceneNode[] {
  const massif = groupNode(IDENTITY_TRANSFORM, 'Massif')
  const rock = dense(obstacleSurface(), ROCK_TILE)

  return [
    ...country(),
    ...clouds(),
    massif,
    ...peaks().map((peak, index) => ({
      ...meshNode(
        // A cylinder with NO top is a cone — the studio has no cone of its own.
        {
          kind: 'cylinder',
          radiusTop: 0,
          radiusBottom: peak.radius,
          height: peak.height,
          segments: SIDES,
        },
        {
          transform: {
            position: { x: peak.x, y: peak.height / 2, z: peak.z },
            rotation: { x: 0, y: index * 0.7, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          material: rock,
          parentId: massif.id,
          name: `Peak ${index + 1}`,
        },
      ),
      // 🛑 Fixed, or the massif falls through the world on its first step.
      components: fixedBody(),
    })),
  ]
}
