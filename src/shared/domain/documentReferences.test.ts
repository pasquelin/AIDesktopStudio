import { describe, expect, it } from 'vitest'
import { documentReferencesOf } from './documentReferences'

const gltf = (body: Record<string, unknown>): string =>
  JSON.stringify({ asset: { version: '2.0' }, ...body })

describe('documentReferencesOf', () => {
  it('names the binary and the pictures a glTF hangs its scene on', () => {
    const text = gltf({
      buffers: [{ uri: 'Niveau.bin' }],
      images: [{ uri: 'textures/peau.png' }, { uri: 'textures/normale.png' }],
    })

    expect(documentReferencesOf('gltf', text)).toEqual([
      'Niveau.bin',
      'textures/peau.png',
      'textures/normale.png',
    ])
  })

  it('names the picture a sky hangs off its node rather than off images', () => {
    const text = gltf({
      nodes: [{ name: 'Horizon', extras: { iastudio: { source: 'Ciel.hdr' } } }],
    })

    expect(documentReferencesOf('gltf', text)).toEqual(['Ciel.hdr'])
  })

  it('follows nothing that names a file outside the folder the document sits in', () => {
    const text = gltf({
      buffers: [
        { uri: 'data:application/octet-stream;base64,AAAA' },
        { uri: 'https://ailleurs.example/Niveau.bin' },
        { uri: '/etc/passwd' },
        { uri: '../voisin/Niveau.bin' },
        { uri: '..\\voisin\\Niveau.bin' },
      ],
    })

    expect(documentReferencesOf('gltf', text)).toEqual([])
  })

  it('reads a reference back through its percent encoding', () => {
    expect(documentReferencesOf('gltf', gltf({ buffers: [{ uri: 'mon%20niveau.bin' }] }))).toEqual([
      'mon niveau.bin',
    ])
  })

  it('names every filename input of a material, whatever graph holds it', () => {
    const text = [
      '<materialx version="1.39">',
      '  <nodegraph name="NG_dautrui">',
      '    <tiledimage name="quelconque" type="color3">',
      '      <input name="file" type="filename" value="bois_albedo.png" />',
      '    </tiledimage>',
      '    <image name="autre" type="vector3">',
      '      <input name="file" type="filename" value="bois_normale.png" />',
      '      <input name="default" type="vector3" value="0, 0, 1" />',
      '    </image>',
      '  </nodegraph>',
      '</materialx>',
    ].join('\n')

    expect(documentReferencesOf('mtlx', text)).toEqual(['bois_albedo.png', 'bois_normale.png'])
  })

  it('names each file once, however many times the document points at it', () => {
    const text = gltf({ buffers: [{ uri: 'Niveau.bin' }], images: [{ uri: 'Niveau.bin' }] })

    expect(documentReferencesOf('gltf', text)).toEqual(['Niveau.bin'])
  })

  it('reads nothing out of a document that does not parse, leaving the refusal to the import', () => {
    expect(documentReferencesOf('gltf', '{ pas du json')).toEqual([])
  })

  it('names the material libraries an OBJ asks for, several to a line', () => {
    const text = '# robot\nmtllib robot.mtl extra.mtl\nv 0 0 0\nusemtl skin\nf 1 1 1\n'

    expect(documentReferencesOf('obj', text)).toEqual(['robot.mtl', 'extra.mtl'])
  })

  it('names the pictures a material library maps, options and all', () => {
    const text = [
      'newmtl skin',
      'Kd 0.8 0.8 0.8',
      'map_Kd textures/skin.png',
      'bump -bm 0.5 textures/skin_n.png',
      'map_Kd -s 1 1 1 -o 0 0 0 textures/metal body.png',
      'map_Ks textures/skin.png',
    ].join('\n')

    expect(documentReferencesOf('mtl', text)).toEqual([
      'textures/skin.png',
      'textures/skin_n.png',
      'textures/metal body.png',
    ])
  })

  it('names the pictures a Collada file initialises its images from, in both spellings', () => {
    const text =
      '<COLLADA><library_images><image id="a"><init_from>tex/a.png</init_from></image>' +
      '<image id="b"><init_from><ref>tex/b&amp;c.png</ref></init_from></image></library_images></COLLADA>'

    expect(documentReferencesOf('dae', text)).toEqual(['tex/a.png', 'tex/b&c.png'])
  })

  it('reads nothing out of an extension that carries its parts inside itself', () => {
    expect(documentReferencesOf('ora', gltf({ buffers: [{ uri: 'a.bin' }] }))).toEqual([])
  })
})
