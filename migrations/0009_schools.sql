CREATE TABLE schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('primary', 'junior')),
  level_label TEXT NOT NULL,
  district TEXT NOT NULL,
  group_name TEXT,
  address TEXT NOT NULL,
  zone_text TEXT NOT NULL,
  zones TEXT NOT NULL,
  phones TEXT NOT NULL,
  lng REAL NOT NULL,
  lat REAL NOT NULL,
  source_url TEXT NOT NULL,
  source_year INTEGER NOT NULL,
  source_published TEXT NOT NULL,
  lyj_school_id INTEGER,
  lyj_name TEXT,
  lyj_level TEXT,
  lyj_established TEXT,
  lyj_admission_scores TEXT,
  lyj_nearby_xq TEXT,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_schools_location ON schools (lng, lat);
CREATE INDEX idx_schools_district_level ON schools (district, level, is_current);
CREATE INDEX idx_schools_name ON schools (name);
