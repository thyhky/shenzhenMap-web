ALTER TABLE streets
ADD COLUMN is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1));

CREATE INDEX idx_streets_current ON streets (is_current, district, name);
