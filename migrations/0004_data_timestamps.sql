ALTER TABLE estates ADD COLUMN source_observed_at TEXT;
ALTER TABLE estates ADD COLUMN imported_at TEXT;
ALTER TABLE estates ADD COLUMN record_changed_at TEXT;

UPDATE estates
SET imported_at = updated_at,
    record_changed_at = updated_at;

ALTER TABLE price_history ADD COLUMN source_observed_at TEXT;

DROP TRIGGER estates_price_history_after_insert;
DROP TRIGGER estates_price_history_after_price_update;

CREATE TRIGGER estates_price_history_after_insert
AFTER INSERT ON estates
WHEN NEW.has_price = 1 AND NEW.price IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO price_history (estate_id, price, source, captured_at, source_observed_at)
  VALUES (
    NEW.id,
    NEW.price,
    COALESCE(NEW.price_source, 'unknown'),
    COALESCE(NEW.imported_at, NEW.updated_at, datetime('now')),
    NEW.source_observed_at
  );
END;

CREATE TRIGGER estates_price_history_after_price_update
AFTER UPDATE OF price, has_price ON estates
WHEN NEW.has_price = 1
  AND NEW.price IS NOT NULL
  AND (OLD.has_price <> 1 OR OLD.price IS NOT NEW.price)
BEGIN
  INSERT OR IGNORE INTO price_history (estate_id, price, source, captured_at, source_observed_at)
  VALUES (
    NEW.id,
    NEW.price,
    COALESCE(NEW.price_source, 'unknown'),
    COALESCE(NEW.imported_at, NEW.updated_at, datetime('now')),
    NEW.source_observed_at
  );
END;
