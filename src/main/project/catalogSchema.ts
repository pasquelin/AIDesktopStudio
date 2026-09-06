import type { SqliteDriver } from './sqlite'
import { migrateTo } from './sqlMigrate'

/**
 * Schema history. Append only: an existing project carries its version in `user_version`, and
 * rewriting a past entry would leave already-created catalogues on a schema nobody describes.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE assets (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    location        TEXT NOT NULL,
    path            TEXT,
    remote_asset_id TEXT,
    job_id          TEXT,
    width           INTEGER,
    height          INTEGER,
    bytes           INTEGER,
    created_at      TEXT NOT NULL,
    derived_from    TEXT
  );

  CREATE TABLE asset_tags (
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    tag      TEXT NOT NULL,
    PRIMARY KEY (asset_id, tag)
  );

  CREATE INDEX assets_type_idx       ON assets(type);
  CREATE INDEX assets_created_at_idx ON assets(created_at DESC);
  CREATE INDEX asset_tags_tag_idx    ON asset_tags(tag);
  `,
  `
  ALTER TABLE assets ADD COLUMN source_path TEXT;
  ALTER TABLE assets ADD COLUMN hash        TEXT;
  ALTER TABLE assets ADD COLUMN probe       TEXT;
  ALTER TABLE assets ADD COLUMN proxy_path  TEXT;
  ALTER TABLE assets ADD COLUMN peaks_path  TEXT;

  CREATE INDEX assets_hash_idx ON assets(hash);
  `,
  `
  ALTER TABLE assets ADD COLUMN map          TEXT;
  ALTER TABLE assets ADD COLUMN map_inverted INTEGER;

  -- The channels of one texture are read together, from the asset they derive from.
  CREATE INDEX assets_derived_from_idx ON assets(derived_from);
  -- Resolving an API parent to the local asset it became, when a generation reports one.
  CREATE INDEX assets_remote_asset_id_idx ON assets(remote_asset_id);
  `,
  `
  -- Provenance, at last persisted. Columns rather than one JSON blob for the three that are
  -- searched — "everything made with Flux", "the one whose prompt said moss" — and JSON for
  -- the parameters, which are open by nature and never filtered on, as the probe already is.
  ALTER TABLE assets ADD COLUMN model_id    TEXT;
  ALTER TABLE assets ADD COLUMN model_label TEXT;
  ALTER TABLE assets ADD COLUMN prompt      TEXT;
  ALTER TABLE assets ADD COLUMN seed        INTEGER;
  ALTER TABLE assets ADD COLUMN gen_params  TEXT;

  -- The twin in the library, and the three stamps that place the two sides against each other.
  -- Only two of the six sync states are ever written today, because pushing and pulling are
  -- explicit; the stamps are recorded from the start so that computing the rest later is a
  -- change of policy rather than a migration.
  ALTER TABLE assets ADD COLUMN remote_owner_id   TEXT;
  ALTER TABLE assets ADD COLUMN remote_updated_at TEXT;
  ALTER TABLE assets ADD COLUMN remote_synced_at  TEXT;
  ALTER TABLE assets ADD COLUMN local_changed_at  TEXT;
  ALTER TABLE assets ADD COLUMN sync_state        TEXT;
  ALTER TABLE assets ADD COLUMN sync_error        TEXT;

  -- What ties the outputs of one generation together. The API has no notion of a set.
  ALTER TABLE assets ADD COLUMN group_id     TEXT;
  ALTER TABLE assets ADD COLUMN output_index INTEGER;

  CREATE INDEX assets_model_id_idx   ON assets(model_id);
  CREATE INDEX assets_group_id_idx   ON assets(group_id);
  CREATE INDEX assets_sync_state_idx ON assets(sync_state);
  -- Paired: a twin is only meaningful under the project whose key opens onto it.
  CREATE INDEX assets_remote_owner_idx ON assets(remote_owner_id, remote_asset_id);
  `,
  `
  -- What the studio did, and what it failed to do. Append-only: a line is a fact about a moment,
  -- and rewriting one would make the journal argue with what the user saw.
  --
  -- The message is a KEY and its parameters rather than a sentence, so a journal written in one
  -- language reads in whichever the interface is in later. \`detail\` carries \`describeFailure\`
  -- and nothing else — an SDK message embeds the request that produced it, hence the API key.
  CREATE TABLE activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          TEXT NOT NULL,
    level       TEXT NOT NULL,
    topic       TEXT NOT NULL,
    message_key TEXT NOT NULL,
    params      TEXT,
    detail      TEXT,
    asset_id    TEXT
  );

  -- No index: \`id INTEGER PRIMARY KEY\` IS the rowid, so the table is already stored in the one
  -- order the journal is ever read in. A second B-tree would be maintained on every insert —
  -- two hundred of them on a push of two hundred assets — and answer no query the first cannot.
  `,
  `
  -- The page every browser opens on, and the one the audit measured at 15,17 ms: one kind,
  -- newest first. Neither simple index could answer it whole — SQLite picks the one that
  -- narrows, then walks what it found to sort it. The tie-break column is here because the
  -- query carries it: without \`id DESC\` in the index, the sort survives the seek.
  CREATE INDEX assets_type_created_idx ON assets(type, created_at DESC, id DESC);

  -- Full text over what one remembers of an asset — its name, and what was asked for. The
  -- \`LIKE '%…%'\` it replaces could not use any index by construction: 22,53 ms to answer that
  -- nothing matched, because answering that means reading everything.
  --
  -- \`content='assets'\`: the words are indexed, the columns are not stored a second time.
  -- Diacritics folded, so « mousse » finds "Mousse" typed without its accent in a hurry.
  CREATE VIRTUAL TABLE assets_fts USING fts5(
    name,
    prompt,
    content='assets',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  );

  -- An external-content table indexes nothing by itself: these three are what keep it true, and
  -- a delete is written as a command rather than as a DELETE — that is the fts5 contract.
  CREATE TRIGGER assets_fts_insert AFTER INSERT ON assets BEGIN
    INSERT INTO assets_fts(rowid, name, prompt) VALUES (new.rowid, new.name, new.prompt);
  END;

  CREATE TRIGGER assets_fts_delete AFTER DELETE ON assets BEGIN
    INSERT INTO assets_fts(assets_fts, rowid, name, prompt)
      VALUES ('delete', old.rowid, old.name, old.prompt);
  END;

  CREATE TRIGGER assets_fts_update AFTER UPDATE ON assets BEGIN
    INSERT INTO assets_fts(assets_fts, rowid, name, prompt)
      VALUES ('delete', old.rowid, old.name, old.prompt);
    INSERT INTO assets_fts(rowid, name, prompt) VALUES (new.rowid, new.name, new.prompt);
  END;

  -- What is already there. A project opened after this migration must be searchable at once,
  -- not from its next import onwards.
  INSERT INTO assets_fts(rowid, name, prompt) SELECT rowid, name, prompt FROM assets;
  `,
  `
  -- « Is the file the explorer is showing one of ours? », asked on every double-click over a
  -- folder that can hold thousands. Without it the equality is a full scan of \`assets\`, and the
  -- gesture waits on it: the thread it blocks is the catalogue's own worker, not the main
  -- process — \`catalogClient\` is what keeps that true, and it is why no window freezes here.
  CREATE INDEX assets_path_idx ON assets(path);
  `,
  `
  -- The still of an asset whose own file no browser can decode — a mesh's, above all. Kept as a
  -- path like the proxy and the waveform, and rebuildable like both: the file is the library's
  -- own thumbnail, brought down beside the bytes so a downloaded model stays a picture in a grid.
  ALTER TABLE assets ADD COLUMN poster_path TEXT;
  `,
  `
  -- When the rescan last found nothing at this row's path. A file that has gone is DATED, never
  -- deleted: the row carries the prompt, the seed and the lineage, and none of that is on the
  -- disk. Cleared the moment the file is found again, under this path or another.
  --
  -- It is also what makes the rescan idempotent where it is visible: a second pass over the same
  -- state finds the absence already dated and says nothing to the journal, so running it on
  -- every open and every focus does not write a line each time.
  ALTER TABLE assets ADD COLUMN missing_at TEXT;

  -- PARTIAL, and it has to be: in the ordinary project every row is NULL here, so a plain index
  -- would be the size of the table, maintained on every insert, and answer nothing — the two
  -- queries that read this column ask \`IS NULL\`, which no index serves. What IS worth an index
  -- is the handful of dated rows, which is what a listing of them would seek.
  CREATE INDEX assets_missing_at_idx ON assets(missing_at) WHERE missing_at IS NOT NULL;
  `,
  `
  -- The glTF slot an extracted picture came out of, for the ones \`map\` cannot name. A
  -- \`metallicRoughnessTexture\` packs two of the studio's channels into one image and an ORM
  -- three; a \`clearcoatTexture\` names something the studio has no channel for at all. Both
  -- arrived here with no channel claimed, indistinguishable — so nothing could offer to unpack
  -- one without offering it on the other, which would have written a roughness out of a coat.
  --
  -- No index: it is read for the rows of ONE model, already narrowed by \`derived_from\`.
  ALTER TABLE assets ADD COLUMN packed_slot TEXT;
  `,
  `
  -- A texture IS a picture, and the studio no longer files it apart. Rows written under the old
  -- kind would answer no filter and show under no shelf — the type is what the explorer, the
  -- picture guard and every search read, and none of them knows this word any more.
  --
  -- What told a channel from a plain picture was never the kind: \`map\` carries it, and it is
  -- untouched here. Nothing moves on disk — a row keeps the path it has.
  UPDATE assets SET type = 'image' WHERE type = 'texture';
  `,
  `
  ALTER TABLE assets ADD COLUMN model_texture_uses TEXT;
  ALTER TABLE assets ADD COLUMN model_material_ids TEXT;
  `,
  `
  -- A 3D file that arrived as something else — an FBX, an OBJ, a USDZ — is converted once into
  -- the .glb this row now points at. Where the original was kept, and what the conversion could
  -- not carry, both out of the catalogue's own reading: the presence of the first is what tells
  -- an arrival already converted from one still waiting. No index: read for one row at a time.
  ALTER TABLE assets ADD COLUMN converted_from TEXT;
  ALTER TABLE assets ADD COLUMN import_losses  TEXT;
  `,
]

export const CATALOG_DEFAULT_LIMIT = 200

export function migrate(driver: SqliteDriver): void {
  migrateTo(driver, MIGRATIONS)
}
