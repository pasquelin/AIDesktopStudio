import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLE_PATHS } from './folderRole'
import { filingFolderOf, filingRoleOf, filingTypeOf } from './filingType'

const ROLES = {}

describe('filingTypeOf', () => {
  it('files a Mixamo FBX as a motion unless it was dropped on Models', () => {
    expect(filingTypeOf('Walking.fbx', '', ROLES)).toBe('animation')
    expect(filingTypeOf('Walking.fbx', DEFAULT_ROLE_PATHS.animations, ROLES)).toBe('animation')
    expect(filingTypeOf('Walking.fbx', DEFAULT_ROLE_PATHS.models, ROLES)).toBe('mesh')
  })

  it('files a glb as a model unless it was dropped on Animations', () => {
    expect(filingTypeOf('character.glb', '', ROLES)).toBe('mesh')
    expect(filingTypeOf('character.glb', DEFAULT_ROLE_PATHS.models, ROLES)).toBe('mesh')
    expect(filingTypeOf('walk.glb', DEFAULT_ROLE_PATHS.animations, ROLES)).toBe('animation')
  })

  it('files a BVH as a motion whatever folder it was dropped on, having no mesh to be', () => {
    expect(filingTypeOf('walk.bvh', '', ROLES)).toBe('animation')
    expect(filingTypeOf('walk.bvh', DEFAULT_ROLE_PATHS.models, ROLES)).toBe('animation')
  })

  it('lets the models and animations folders classify every convertible 3D format', () => {
    expect(filingTypeOf('Walking.dae', DEFAULT_ROLE_PATHS.animations, ROLES)).toBe('animation')
    expect(filingTypeOf('Prop.obj', DEFAULT_ROLE_PATHS.animations, ROLES)).toBe('animation')
    expect(filingTypeOf('Walking.dae', DEFAULT_ROLE_PATHS.models, ROLES)).toBe('mesh')
    expect(filingTypeOf('Prop.usdz', DEFAULT_ROLE_PATHS.models, ROLES)).toBe('mesh')
  })

  it('keeps a glTF a scene document, except in the animations folder', () => {
    expect(filingTypeOf('Level.gltf', '', ROLES)).toBeNull()
    expect(filingTypeOf('Level.gltf', DEFAULT_ROLE_PATHS.scenes, ROLES)).toBeNull()
    expect(filingTypeOf('clip.gltf', DEFAULT_ROLE_PATHS.animations, ROLES)).toBe('animation')
  })

  it('still reads every other kind from the extension alone', () => {
    expect(filingTypeOf('facade.png', DEFAULT_ROLE_PATHS.animations, ROLES)).toBe('image')
    expect(filingTypeOf('rush.mp4', '', ROLES)).toBe('video')
    expect(filingTypeOf('take.wav', DEFAULT_ROLE_PATHS.models, ROLES)).toBe('audio')
  })

  it('follows a renamed animations folder', () => {
    expect(filingTypeOf('walk.glb', 'Motions', { animations: 'Motions' })).toBe('animation')
    expect(filingTypeOf('walk.glb', 'Motions/mixamo', { animations: 'Motions' })).toBe('animation')
  })

  it('files a picture under the skyboxes folder as a skybox, and leaves the rest alone', () => {
    expect(filingTypeOf('noon.png', DEFAULT_ROLE_PATHS.skyboxes, ROLES)).toBe('skybox')
    expect(filingTypeOf('noon.png', 'Skyboxes/dusk', ROLES)).toBe('skybox')
    expect(filingTypeOf('noon.png', 'Ciels', { skyboxes: 'Ciels' })).toBe('skybox')
    expect(filingTypeOf('noon.png', DEFAULT_ROLE_PATHS.image, ROLES)).toBe('image')
    expect(filingTypeOf('notes.glb', DEFAULT_ROLE_PATHS.skyboxes, ROLES)).toBe('mesh')
  })

  it('files what another route already read, and only where the name says nothing', () => {
    expect(filingTypeOf('noon', DEFAULT_ROLE_PATHS.skyboxes, ROLES, 'image')).toBe('skybox')
    expect(filingTypeOf('noon', DEFAULT_ROLE_PATHS.image, ROLES, 'image')).toBe('image')
    expect(filingTypeOf('Level.gltf', DEFAULT_ROLE_PATHS.scenes, ROLES, 'mesh')).toBe('mesh')
    expect(filingTypeOf('Walking.fbx', DEFAULT_ROLE_PATHS.models, ROLES, 'animation')).toBe('mesh')
    expect(filingTypeOf('noon', DEFAULT_ROLE_PATHS.skyboxes, ROLES)).toBeNull()
  })
})

describe('filingRoleOf', () => {
  it('names the role a mixed drop files each kind under', () => {
    expect(filingRoleOf('character.glb', ROLES)).toBe('models')
    expect(filingRoleOf('Walking.fbx', ROLES)).toBe('animations')
    expect(filingRoleOf('facade.png', ROLES)).toBe('image')
    expect(filingRoleOf('planche.ora', ROLES)).toBe('image')
    expect(filingRoleOf('Level.gltf', ROLES)).toBe('scenes')
    expect(filingRoleOf('Brick.mtlx', ROLES)).toBe('materials')
    expect(filingRoleOf('Bande.otioz', ROLES)).toBe('video')
  })
})

describe('filingFolderOf', () => {
  it('routes a mixed drop to the folder each kind is filed under', () => {
    expect(filingFolderOf('character.glb', ROLES)).toBe(DEFAULT_ROLE_PATHS.models)
    expect(filingFolderOf('Walking.fbx', ROLES)).toBe(DEFAULT_ROLE_PATHS.animations)
    expect(filingFolderOf('facade.png', ROLES)).toBe(DEFAULT_ROLE_PATHS.image)
    expect(filingFolderOf('planche.ora', ROLES)).toBe(DEFAULT_ROLE_PATHS.image)
    expect(filingFolderOf('Level.gltf', ROLES)).toBe(DEFAULT_ROLE_PATHS.scenes)
    expect(filingFolderOf('Brick.mtlx', ROLES)).toBe(DEFAULT_ROLE_PATHS.materials)
    expect(filingFolderOf('Bande.otioz', ROLES)).toBe(DEFAULT_ROLE_PATHS.video)
  })
})
