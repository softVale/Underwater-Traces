PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('fish', 'trace')),
  author TEXT NOT NULL DEFAULT 'self',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  fish_state TEXT CHECK (fish_state IN ('curious', 'exploring', 'resting', 'changed')),
  status TEXT NOT NULL DEFAULT 'current'
    CHECK (status IN ('current', 'superseded', 'uncertain', 'contradicted')),
  previous_id TEXT REFERENCES entries(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (kind = 'fish' AND fish_state IS NOT NULL) OR
    (kind = 'trace' AND fish_state IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_entries_kind_status
  ON entries(kind, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entries_previous
  ON entries(previous_id);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id),
  to_entry_id TEXT REFERENCES entries(id),
  source_type TEXT,
  source_id TEXT,
  excerpt TEXT,
  original_datetime TEXT,
  relation TEXT NOT NULL DEFAULT 'evidence',
  created_at TEXT NOT NULL,
  CHECK (
    to_entry_id IS NOT NULL OR
    (source_type IS NOT NULL AND source_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_links_entry
  ON links(entry_id, created_at);

CREATE INDEX IF NOT EXISTS idx_links_source
  ON links(source_type, source_id);
