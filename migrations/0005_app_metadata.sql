CREATE TABLE app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('data_version', 'legacy', datetime('now'));
