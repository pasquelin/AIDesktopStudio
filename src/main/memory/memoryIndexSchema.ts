/**
 * The searchable half — DERIVED, and thrown away without a second thought. `memoryStore.ts` is
 * what HOLDS the memories, which is why this lives under the `.index/` the `.gitignore` excludes.
 */

/**
 * Schema history. Append only: an existing index carries its version in `user_version`, and
 * rewriting a past entry would leave already-created indexes on a schema nobody describes.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE memories (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    summary     TEXT NOT NULL,
    body        TEXT NOT NULL,
    importance  INTEGER NOT NULL,
    created_at  TEXT NOT NULL,
    used_at     TEXT,
    source_kind TEXT NOT NULL,
    source_ref  TEXT,
    state       TEXT NOT NULL,
    supersedes  TEXT
  );

  CREATE TABLE memory_refs (
    memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    kind      TEXT NOT NULL,
    ref       TEXT NOT NULL,
    PRIMARY KEY (memory_id, kind, ref)
  );

  -- \`to_id\` carries no reference on purpose: a link may name a memory this file has not read
  -- yet, and a constraint would refuse the first half of a pair written in one order.
  CREATE TABLE memory_links (
    from_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    to_id   TEXT NOT NULL,
    PRIMARY KEY (from_id, to_id)
  );

  -- \`content='memories'\`: the words are indexed, the columns are not stored a second time.
  -- Diacritics folded, so « taillé » is found by someone who typed « taille » in a hurry.
  CREATE VIRTUAL TABLE memories_fts USING fts5(
    summary,
    body,
    content='memories',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  );

  -- An external-content table indexes nothing by itself: these three are what keep it true, and
  -- a delete is written as a command rather than as a DELETE — that is the fts5 contract.
  CREATE TRIGGER memories_fts_insert AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, summary, body) VALUES (new.rowid, new.summary, new.body);
  END;

  CREATE TRIGGER memories_fts_delete AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, summary, body)
      VALUES ('delete', old.rowid, old.summary, old.body);
  END;

  CREATE TRIGGER memories_fts_update AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, summary, body)
      VALUES ('delete', old.rowid, old.summary, old.body);
    INSERT INTO memories_fts(rowid, summary, body) VALUES (new.rowid, new.summary, new.body);
  END;

  -- What the file was when this index was built. One row, replaced whole — it is what lets an
  -- opening decide in a single query whether anything needs reading at all.
  CREATE TABLE memory_source (
    bytes       INTEGER NOT NULL,
    modified_at INTEGER NOT NULL
  );

  CREATE INDEX memories_state_idx  ON memories(state);
  CREATE INDEX memories_type_idx   ON memories(type);
  CREATE INDEX memory_refs_ref_idx ON memory_refs(kind, ref);
  `,
  `
  -- What was embedded, so a rebuild does not throw every vector away. See \`digestOf\`.
  ALTER TABLE memories ADD COLUMN text_digest TEXT NOT NULL DEFAULT '';

  -- 🛑 NO foreign key, and that is the whole point: \`memories\` is emptied and rewritten every
  -- time the file is read back, and a cascade would take every embedding with it — 24 ms each,
  -- so four minutes for ten thousand of them on an opening that changed nothing. What ties a
  -- vector to a memory is the DIGEST of what was embedded; what removes an orphan is \`sweep\`.
  --
  -- 🛑 No \`vec0\` either, and that was measured before it was decided: sqlite-vec loads under
  -- \`better-sqlite3\` and answers \`no such module\` under \`node:sqlite\`, the driver the suite
  -- exercises — half the retrieval would have been untestable. Brute force over 20 000 vectors
  -- of 384 dimensions took 9 ms, so it buys nothing at this size either.
  CREATE TABLE memory_vectors (
    memory_id   TEXT PRIMARY KEY,
    text_digest TEXT NOT NULL,
    model       TEXT NOT NULL,
    vector      BLOB NOT NULL
  );

  CREATE INDEX memory_vectors_model_idx ON memory_vectors(model, text_digest);

  -- What the pending page is ordered by. [M] 10 000 memories in batches of eight: 3,53 ms a
  -- page without it, 2,24 with, and 2 ms to build.
  CREATE INDEX memories_created_idx ON memories(created_at, id);
  `,
]

/**
 * What the index believes the file to be — a `stat`, since hashing would read the whole file to
 * add one line. 🛑 Its blind spot: a rewrite of the SAME size in the same millisecond is not seen.
 * The file only grows between compactions, and a compaction changes its size.
 */
