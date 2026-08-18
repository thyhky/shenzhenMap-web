-- Daily price snapshots: one history row per estate per import day, even
-- when the price is unchanged, so the site can show day-level trends.
-- Retention is bounded by scripts/prune-price-history.mjs (90 days).

DROP TRIGGER IF EXISTS estates_price_history_after_insert;

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

DROP TRIGGER IF EXISTS estates_price_history_after_price_update;

CREATE TRIGGER estates_price_history_after_price_update
AFTER UPDATE OF price, has_price ON estates
WHEN NEW.has_price = 1
  AND NEW.price IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM price_history
    WHERE estate_id = NEW.id
      AND captured_at >= date(NEW.imported_at)
  )
BEGIN
  INSERT INTO price_history (estate_id, price, source, captured_at, source_observed_at)
  VALUES (
    NEW.id,
    NEW.price,
    COALESCE(NEW.price_source, 'unknown'),
    COALESCE(NEW.imported_at, NEW.updated_at, datetime('now')),
    NEW.source_observed_at
  );
END;

CREATE INDEX IF NOT EXISTS idx_price_history_estate_captured
ON price_history (estate_id, captured_at);
