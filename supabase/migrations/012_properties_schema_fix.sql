-- ============================================================================
-- PG MANAGER — properties_schema_fix.sql  (REPAIR PATCH)
-- ============================================================================
-- Fixes the properties table on the live database, which is missing:
--   1. updated_at  — causes PGRST204/42703 on every v2 sync write
--   2. property_id — expected by the v2 client (db.js sends it)
--
-- Run in Supabase Dashboard → SQL Editor → paste → Run.
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- 1. Add missing columns
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS property_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Backfill property_id for existing rows (from the property name / id)
--    The v2 client always sets property_id on new writes; this just covers
--    whatever legacy rows might exist.
UPDATE public.properties
   SET property_id = id
 WHERE property_id = '';

-- 3. Add the updated_at touch trigger (007 adds it for all 6 tables, but
--    the column must exist first or the trigger creation itself errors).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS properties_touch ON public.properties;
CREATE TRIGGER properties_touch
  BEFORE UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 4. Self-check: every column below must report EXISTS
SELECT column_name,
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='properties'
                 and column_name = c.column_name) as exists
FROM (values ('id'), ('owner_id'), ('name'), ('phone'), ('upi_id'),
             ('property_id'), ('created_at'), ('updated_at')) as c(column_name)
ORDER BY column_name;

-- Expected: all rows show exists = true
