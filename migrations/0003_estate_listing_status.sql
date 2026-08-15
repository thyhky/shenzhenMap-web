ALTER TABLE estates
ADD COLUMN is_listed INTEGER NOT NULL DEFAULT 1 CHECK (is_listed IN (0, 1));

CREATE INDEX idx_estates_listed_location ON estates (is_listed, lng, lat);
