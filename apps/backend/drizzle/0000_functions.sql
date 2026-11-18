-- Hand-written: shared SQL functions. Runs before any table because column defaults use uuidv7().
-- PostgreSQL 18+ ships uuidv7() natively; older servers (CI uses 16) get an equivalent fallback.
DO $do$
BEGIN
  IF to_regprocedure('pg_catalog.uuidv7()') IS NULL THEN
    CREATE FUNCTION public.uuidv7() RETURNS uuid
    LANGUAGE sql VOLATILE PARALLEL SAFE AS $fn$
      SELECT encode(
        set_bit(
          set_bit(
            overlay(
              uuid_send(gen_random_uuid())
              PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
              FROM 1 FOR 6
            ),
            52, 1
          ),
          53, 1
        ),
        'hex'
      )::uuid
    $fn$;
  END IF;
END
$do$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$fn$;
