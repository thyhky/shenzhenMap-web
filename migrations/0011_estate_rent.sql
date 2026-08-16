ALTER TABLE estates ADD COLUMN rent_price REAL;
ALTER TABLE estates ADD COLUMN rent_yield REAL;
ALTER TABLE estates ADD COLUMN rent_samples INTEGER DEFAULT 0;
ALTER TABLE estates ADD COLUMN rent_source TEXT;
ALTER TABLE estates ADD COLUMN rent_observed_at TEXT;
CREATE INDEX idx_estates_rent_yield ON estates (rent_yield);