/**
 * What a document of the studio carries inside a file it does not own the shape of.
 *
 * Every open format the studio writes has somewhere for data a reader may ignore — `metadata` in
 * OpenTimelineIO, `extras` in glTF, an entry of its own in OpenRaster, an attribute in MaterialX —
 * and the studio's own goes under one domain key, holding which document the file IS and which
 * kind, where a name shared by two editors cannot say.
 *
 * In a module of its own, importing nothing: `document.ts` held it, and the four formats that
 * derive their own names from it cannot import that file — `openRaster.ts` already lends it a
 * type, so reading the key back from there closes a cycle. This is the module both sides can see.
 *
 * MaterialX constrains the shape of every name that derives from it: ASCII letters, digits and
 * `_` only. That is why the word carries no separator.
 */
export const STUDIO_METADATA_KEY = 'aidesktopstudio'
