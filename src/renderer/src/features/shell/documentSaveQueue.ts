const saving = new Map<string, Promise<void>>()

export function queueDocumentSave(
  documentId: string,
  write: () => Promise<boolean>,
): Promise<boolean> {
  const result = after(saving.get(documentId) ?? Promise.resolve(), write)
  const tail = ignoreFailure(result)
  saving.set(documentId, tail)
  void forget(documentId, tail)
  return result
}

async function after(prior: Promise<void>, write: () => Promise<boolean>): Promise<boolean> {
  await prior
  return await write()
}

async function ignoreFailure(result: Promise<boolean>): Promise<void> {
  try {
    await result
  } catch {
    // A failed save must not block the next explicit attempt for the same document.
  }
}

async function forget(documentId: string, tail: Promise<void>): Promise<void> {
  await tail
  if (saving.get(documentId) === tail) saving.delete(documentId)
}
