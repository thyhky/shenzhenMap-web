-- Self-healing daily price snapshots.
-- The previous trigger (0014) recorded at most one history row per calendar day,
-- guarded by `captured_at >= date(imported_at)`. That broke same-day re-runs:
-- when daily-update re-fetches, source_observed_at drifts (e.g. 10:50:43 -> 11:19:35),
-- so the new snapshot never gets recorded and verification fails on an exact
-- source_observed_at match.
-- This version records a new row whenever price OR source_observed_at differs
-- from the latest row already logged today, so corrected/re-fetched runs
-- overwrite the stale entry instead of being suppressed by it.

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
AFTER UPDATE OF price, has_price, source_observed_at ON estates
WHEN NEW.has_price = 1
  AND NEW.price IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM price_history
    WHERE estate_id = NEW.id
      AND price = NEW.price
      AND source_observed_at = NEW.source_observed_at
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
