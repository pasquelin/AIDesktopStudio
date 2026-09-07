export const ACTION_INDEX_MIGRATIONS: readonly string[] = [
  `CREATE TABLE action_index_metadata (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   CREATE TABLE indexed_actions (
     name TEXT PRIMARY KEY,
     family TEXT NOT NULL,
     title TEXT NOT NULL,
     description TEXT NOT NULL,
     searchable TEXT NOT NULL,
     descriptor TEXT NOT NULL,
     ordinal INTEGER NOT NULL
   );
   CREATE TABLE action_fields (
     action_name TEXT NOT NULL REFERENCES indexed_actions(name) ON DELETE CASCADE,
     ordinal INTEGER NOT NULL,
     key TEXT NOT NULL,
     kind TEXT NOT NULL,
     label TEXT NOT NULL,
     required INTEGER NOT NULL,
     options TEXT,
     picks TEXT,
     minimum REAL,
     maximum REAL,
     repeated INTEGER NOT NULL,
     PRIMARY KEY(action_name, ordinal)
   );
   CREATE TABLE action_vectors (
     action_name TEXT PRIMARY KEY REFERENCES indexed_actions(name) ON DELETE CASCADE,
     model TEXT NOT NULL,
     embedding BLOB NOT NULL
   );
   CREATE VIRTUAL TABLE indexed_actions_fts USING fts5(
     name, family, title, description, searchable,
     content='indexed_actions', content_rowid='rowid'
   );
   CREATE TRIGGER indexed_actions_ai AFTER INSERT ON indexed_actions BEGIN
     INSERT INTO indexed_actions_fts(rowid, name, family, title, description, searchable)
     VALUES (new.rowid, new.name, new.family, new.title, new.description, new.searchable);
   END;
   CREATE TRIGGER indexed_actions_ad AFTER DELETE ON indexed_actions BEGIN
     INSERT INTO indexed_actions_fts(indexed_actions_fts, rowid, name, family, title, description, searchable)
     VALUES ('delete', old.rowid, old.name, old.family, old.title, old.description, old.searchable);
   END;`,
]
