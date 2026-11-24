UPDATE product_stocks AS ps
SET last_movement_at = m.last_at
FROM (
  SELECT product_id, store_id, max(created_at) AS last_at
  FROM stock_movements
  GROUP BY product_id, store_id
) AS m
WHERE ps.product_id = m.product_id
  AND ps.store_id = m.store_id
  AND ps.last_movement_at IS NULL;
