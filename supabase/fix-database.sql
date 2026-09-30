-- ============================================================================
-- PG MANAGER — fix-database.sql
-- ============================================================================
-- Run this in Supabase Dashboard → SQL Editor → paste → Run.
--
-- WHAT THIS FIXES
--   The properties table was missing two columns that the v2 sync client
--   sends on every write:
--     1. updated_at  → caused PGRST204 / 42703 on every sync attempt
--     2. property_id → sent by db.js ensureProperty() / addRoom() etc.
--
--   Without these columns, EVERY sync write to properties fails, which
--   blocks the entire outbox queue (properties is the first table written
--   in the chain: property → floor → room → bed → tenant → ledger).
--
-- AFTER RUNNING
--   1. Hard-reload the app (Ctrl+Shift+R / Cmd+Shift+R)
--   2. Sign in again
--   3. Add a room — it should sync to the cloud without errors
-- ============================================================================

-- --------------------------------------------------------------------
-- 1. ADD MISSING COLUMNS TO properties
-- --------------------------------------------------------------------
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS property_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- --------------------------------------------------------------------
-- 2. BACKFILL property_id for any existing rows
-- --------------------------------------------------------------------
UPDATE public.properties
   SET property_id = id
 WHERE property_id = '';

-- --------------------------------------------------------------------
-- 3. CREATEupdated_at TOUCH TRIGGER for properties
-- --------------------------------------------------------------------
-- (The trigger function may already exist from 007; this is safe to re-run.)
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

-- --------------------------------------------------------------------
-- 4. VERIFY — every row below MUST show exists = true
-- --------------------------------------------------------------------
SELECT column_name,
       exists (select 1 from information_schema.columns
               where table_schema = 'public'
                 and table_name   = 'properties'
                 and column_name  = c.column_name) as exists
FROM (values ('id'), ('owner_id'), ('name'), ('phone'), ('upi_id'),
             ('property_id'), ('created_at'), ('updated_at')) as c(column_name)
ORDER BY column_name;

-- Expected output: all 8 rows show exists = true
-- If any row shows exists = false, the migration did not apply correctly.

-- --------------------------------------------------------------------
-- 5. VERIFY THE TRIGGER IS ACTIVE
-- --------------------------------------------------------------------
SELECT tgrelid::regclass AS table_name, tgname
FROM pg_trigger
WHERE not tgisinternal
  and tgname = 'properties_touch';

-- Expected: one row showing public.properties / properties_touch

-- ============================================================================
-- DONE — hard-reload the app and test by adding a room.
-- ============================================================================
