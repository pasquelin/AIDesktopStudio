import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, posix, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { documentReferencesOf } from '@shared/domain/documentReferences'
import { orElse } from '@shared/promises'

/**
 * 🛑 A whole document at once, so bounded: `JSON.parse` and the XML readers need all of it, and a
 * 300 Mo file would be a 600 Mo string on the main process — every window frozen for the read.
 * Above this a glTF carries its buffers inside it anyway, and names no neighbour to fetch.
 */
const SCANNED_BYTES = 8 * 1024 * 1024

/** The files the source points at, read off its own text before any dependency is copied. */
async function textReferencesOf(source: string, extension: string): Promise<readonly string[]> {
  const size = (await orElse(stat(source), null))?.size ?? 0
  if (size === 0 || size > SCANNED_BYTES) return []
  const text = await orElse(readFile(source, 'utf8'), null)
  return text === null ? [] : documentReferencesOf(extension, text)
}

/**
 * The same, LINE by line: an OBJ names its libraries and a MTL its pictures one per line, and
 * both sit anywhere in a file whose geometry runs to hundreds of megabytes. Read as one string it
 * would hold all of that in memory at once; read as lines it holds one.
 */
async function lineReferencesOf(source: string, extension: string): Promise<readonly string[]> {
  const found = new Set<string>()
  try {
    const lines = createInterface({ input: createReadStream(source), crlfDelay: Infinity })
    try {
      for await (const line of lines) {
        for (const reference of documentReferencesOf(extension, line)) found.add(reference)
      }
    } finally {
      lines.close()
    }
  } catch {
    // A source that will not open names no neighbour; the copy that follows says what is missing.
    return []
  }
  return [...found]
}

/** Reads an OBJ's material libraries too; their pictures are relative to each library's folder. */
export async function referencesOf(source: string, extension: string): Promise<readonly string[]> {
  if (!['dae', 'gltf', 'mtlx', 'obj'].includes(extension)) return []
  if (extension !== 'obj') return await textReferencesOf(source, extension)
  const direct = await lineReferencesOf(source, 'obj')

  const deeper: string[] = []
  for (const library of direct.filter(one => one.toLowerCase().endsWith('.mtl'))) {
    const pictures = await lineReferencesOf(resolve(dirname(source), library), 'mtl')
    deeper.push(...pictures.map(picture => posix.join(posix.dirname(library), picture)))
  }
  return [...new Set([...direct, ...deeper])]
}
