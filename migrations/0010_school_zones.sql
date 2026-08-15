CREATE TABLE school_zones (
  school_id TEXT PRIMARY KEY REFERENCES schools(id),
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('primary', 'junior')),
  level_label TEXT NOT NULL,
  district TEXT NOT NULL,
  zones TEXT NOT NULL,
  geometry TEXT NOT NULL,
  min_lng REAL NOT NULL,
  min_lat REAL NOT NULL,
  max_lng REAL NOT NULL,
  max_lat REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'community-voronoi-approx',
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_school_zones_district ON school_zones (district, is_current);
CREATE INDEX idx_school_zones_bounds ON school_zones (min_lng, min_lat, max_lng, max_lat);