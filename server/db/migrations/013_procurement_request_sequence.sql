CREATE SEQUENCE IF NOT EXISTS procurement_request_no_seq;

SELECT setval(
  'procurement_request_no_seq',
  GREATEST(
    COALESCE((SELECT max((regexp_match(request_no, '([0-9]+)$'))[1]::bigint) FROM procurement_requests WHERE request_no ~ '[0-9]+$'), 0),
    1
  ),
  true
);
