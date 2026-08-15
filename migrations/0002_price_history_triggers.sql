CREATE TRIGGER estates_price_history_after_insert
AFTER INSERT ON estates
WHEN NEW.has_price = 1 AND NEW.price IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO price_history (estate_id, price, source, captured_at)
  VALUES (
    NEW.id,
    NEW.price,
    COALESCE(NEW.price_source, 'unknown'),
    NEW.updated_at
  );
END;

CREATE TRIGGER estates_price_history_after_price_update
AFTER UPDATE OF price, has_price ON estates
WHEN NEW.has_price = 1
  AND NEW.price IS NOT NULL
  AND (OLD.has_price <> 1 OR OLD.price IS NOT NEW.price)
BEGIN
  INSERT OR IGNORE INTO price_history (estate_id, price, source, captured_at)
  VALUES (
    NEW.id,
    NEW.price,
    COALESCE(NEW.price_source, 'unknown'),
    NEW.updated_at
  );
END;
