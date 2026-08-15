ALTER TABLE estates ADD COLUMN ref_price INTEGER;
CREATE INDEX idx_estates_ref_price ON estates (ref_price);