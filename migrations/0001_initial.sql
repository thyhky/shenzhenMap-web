CREATE TABLE estates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  street TEXT NOT NULL,
  area_name TEXT,
  place_name TEXT,
  price REAL,
  has_price INTEGER NOT NULL DEFAULT 0 CHECK (has_price IN (0, 1)),
  price_source TEXT,
  lng REAL NOT NULL,
  lat REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_estates_location ON estates (lng, lat);
CREATE INDEX idx_estates_district_street ON estates (district, street);
CREATE INDEX idx_estates_price ON estates (has_price, price);
CREATE INDEX idx_estates_name ON estates (name);

CREATE TABLE streets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  geometry TEXT NOT NULL,
  min_lng REAL NOT NULL,
  min_lat REAL NOT NULL,
  max_lng REAL NOT NULL,
  max_lat REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (district, name)
);

CREATE INDEX idx_streets_bounds ON streets (min_lng, max_lng, min_lat, max_lat);

CREATE TABLE price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estate_id INTEGER NOT NULL REFERENCES estates(id) ON DELETE CASCADE,
  price REAL NOT NULL,
  source TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (estate_id, source, captured_at)
);

CREATE INDEX idx_price_history_estate_time ON price_history (estate_id, captured_at DESC);
