/**
 * What an explorer entry stands for, which decides the SHAPE a tile draws: a folder, a plain
 * file, or a file the studio opens as a document and which keeps the glyph of its own space.
 */
export type EntryKind = 'folder' | 'file' | 'document'
