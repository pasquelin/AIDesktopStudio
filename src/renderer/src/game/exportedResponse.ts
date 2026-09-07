import { gunzip, strFromU8 } from 'fflate'

export async function exportedJson<T>(file: string, compression?: 'gzip'): Promise<T> {
  if (compression === 'gzip') return JSON.parse(await exportedText(file, compression)) as T
  return (await (await answering(file)).json()) as T
}

export async function exportedText(file: string, compression?: 'gzip'): Promise<string> {
  return strFromU8(await exportedBytes(file, compression))
}

export async function exportedBytes(file: string, compression?: 'gzip'): Promise<Uint8Array> {
  const source = new Uint8Array(await (await answering(file)).arrayBuffer())
  if (compression !== 'gzip') return source
  return await new Promise<Uint8Array>((resolve, reject) => {
    gunzip(source, (error, bytes) => {
      if (error) reject(error)
      else resolve(bytes)
    })
  })
}

/** A 404 answers normally from fetch, so reject it before a parser obscures the useful fault. */
export async function answering(file: string): Promise<Response> {
  const response = await fetch(file)
  if (!response.ok) throw new Error(`${file}: ${response.status}`)
  return response
}
