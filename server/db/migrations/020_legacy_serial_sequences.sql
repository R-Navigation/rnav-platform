DO $sequences$
DECLARE
  target record;
  maximum bigint;
BEGIN
  FOR target IN
    SELECT c.table_schema, c.table_name, c.column_name,
      pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS sequence_name
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema()
      AND c.column_default LIKE 'nextval%'
  LOOP
    EXECUTE format('SELECT max(%I) FROM %I.%I', target.column_name, target.table_schema, target.table_name)
      INTO maximum;
    PERFORM setval(target.sequence_name, COALESCE(maximum, 1), maximum IS NOT NULL);
  END LOOP;
END
$sequences$;
