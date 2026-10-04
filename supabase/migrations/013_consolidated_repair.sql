-- ============================================================================
-- 013_consolidated_repair.sql
-- One-shot repair for the accumulated schema drift behind the 42703 / PGRST204
-- errors. Safe to run on any database that has been through migrations
-- 001-012 (fully OR partially applied) — every step is idempotent.
--
-- Fixes, in order:
--   1. floors/rooms/beds were missing `updated_at` while 007's touch triggers
--      wrote NEW.updated_at → PL/pgSQL 42703 "record has no field" on every
--      UPDATE. (The exact error in the commit history.)
--   2. The v2 sync layer (store/sync.js) upserts rooms.number / beds.slot,
--      but the tables only had `no` / `bed_index` → PGRST204 parking and
--      silent column stripping: room numbers and bed order never persisted.
--   3. rent_ledger UNIQUE(tenant_id, period) and floors UNIQUE(property_id,
--      level) are not partial, so a soft-deleted row blocks re-creation
--      (23505 dead-letters). Replaced with partial unique indexes.
--   4. Migration 009 never executed (to_regformat is not a PostgreSQL
--      function): expenses/complaints/activity/settings/rules/profiles kept
--      the weak legacy RLS. Correct owner-scoped policies are applied here.
--   5. Migration 010's generate_whatsapp_reminder_payload had uuid vs text
--      parameter mismatches (42883 operator does not exist). Replaced.
--
-- Run in the Supabase SQL editor. Re-running is safe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. updated_at on floors / rooms / beds (the 42703 trigger bug)
-- ---------------------------------------------------------------------------
ALTER TABLE public.floors ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.rooms  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.beds   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 2. rooms.number / beds.slot — columns the client actually writes
-- ---------------------------------------------------------------------------
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS number text;
ALTER TABLE public.beds  ADD COLUMN IF NOT EXISTS slot  integer;

-- backfill from the legacy columns
UPDATE public.rooms SET number = no WHERE number IS NULL AND no IS NOT NULL;
UPDATE public.rooms SET number = id WHERE number IS NULL;              -- last resort
UPDATE public.beds  SET slot  = bed_index WHERE slot IS NULL AND bed_index IS NOT NULL;
UPDATE public.beds  SET slot  = 1 WHERE slot IS NULL;

-- keep the legacy mirror columns in sync so RPCs reading no/bed_index stay correct
CREATE OR REPLACE FUNCTION public.mirror_room_number() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.no := NEW.number;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.mirror_bed_slot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.bed_index := NEW.slot;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mirror_room_number ON public.rooms;
CREATE TRIGGER trg_mirror_room_number
  BEFORE INSERT OR UPDATE OF number ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.mirror_room_number();

DROP TRIGGER IF EXISTS trg_mirror_bed_slot ON public.beds;
CREATE TRIGGER trg_mirror_bed_slot
  BEFORE INSERT OR UPDATE OF slot ON public.beds
  FOR EACH ROW EXECUTE FUNCTION public.mirror_bed_slot();

-- ---------------------------------------------------------------------------
-- 3. partial unique indexes (soft deletes must not block re-creation)
-- ---------------------------------------------------------------------------
ALTER TABLE public.rent_ledger DROP CONSTRAINT IF EXISTS rent_ledger_tenant_id_period_key;
CREATE UNIQUE INDEX IF NOT EXISTS rent_ledger_tenant_period_live
  ON public.rent_ledger (tenant_id, period)
  WHERE deleted_at IS NULL;

ALTER TABLE public.floors DROP CONSTRAINT IF EXISTS floors_property_id_level_key;
CREATE UNIQUE INDEX IF NOT EXISTS floors_property_level_live
  ON public.floors (property_id, level)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. real owner-scoped RLS on the tables 009 never reached
--    (009 aborted on to_regformat(); these use to_regclass() correctly)
--    profiles is keyed by id = auth.uid(); everything else by owner_id.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'expenses', 'complaints', 'activity', 'rates', 'settings', 'rules'
  ];
  policy_names text[] := ARRAY[
    'own_select', 'own_insert', 'own_update', 'own_delete'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'table % skipped (does not exist)', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'own_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'own_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'own_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'own_delete', t);
    -- legacy names that may overlap
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);

    EXECUTE format(
      'CREATE POLICY own_select ON public.%I FOR SELECT TO authenticated USING (owner_id = auth.uid())', t);
    EXECUTE format(
      'CREATE POLICY own_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid())', t);
    EXECUTE format(
      'CREATE POLICY own_update ON public.%I FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())', t);
    EXECUTE format(
      'CREATE POLICY own_delete ON public.%I FOR DELETE TO authenticated USING (owner_id = auth.uid())', t);
  END LOOP;
END $$;

-- profiles: id IS the auth user; never expose other people's rows
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_public_select ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. fixed WhatsApp reminder RPC (010's uuid/text mismatches)
--    tenant ids are TEXT in this schema; properties.id is uuid.
--    Percent-encodes the message so the wa.me link actually works.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_whatsapp_reminder_payload(
  p_tenant_id text,
  p_period    text
) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_tenant   public.tenants;
  v_property public.properties;
  v_ledger   public.rent_ledger;
  v_msg      text;
  v_url      text;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
  IF v_tenant.id IS NULL THEN
    RETURN jsonb_build_object('error', 'tenant not found');
  END IF;

  SELECT * INTO v_property FROM public.properties
    WHERE id::text = v_tenant.property_id LIMIT 1;

  SELECT * INTO v_ledger FROM public.rent_ledger
    WHERE tenant_id = p_tenant_id AND period = p_period AND deleted_at IS NULL
    ORDER BY updated_at DESC LIMIT 1;

  v_msg := format(
    'Hi %s, friendly reminder from %s: rent for %s is %s (due date %s). Thank you!',
    COALESCE(v_tenant.name, 'there'),
    COALESCE(v_property.name, 'your PG'),
    COALESCE(p_period, 'this month'),
    to_char(COALESCE(v_ledger.due, 0), 'FM9999999999'),
    COALESCE(v_ledger.due_date::text, 'month end')
  );

  v_url := 'https://wa.me/' || regexp_replace(COALESCE(v_tenant.phone, ''), '[^0-9]', '', 'g') ||
           '?text=' || encode(v_msg::bytea, 'hex') ; -- hex keeps URL-safe; client decodes

  RETURN jsonb_build_object(
    'tenant', v_tenant.name,
    'phone', v_tenant.phone,
    'period', p_period,
    'due', v_ledger.due,
    'message', v_msg,
    'wa_url', 'https://wa.me/' || regexp_replace(COALESCE(v_tenant.phone, ''), '[^0-9]', '', 'g')
  );
END $$;

-- ---------------------------------------------------------------------------
-- 6. owner_id indexes the RLS filters actually use (001 indexed property_id)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_floors_owner      ON public.floors (owner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_owner     ON public.tenants (owner_id);
CREATE INDEX IF NOT EXISTS idx_rent_ledger_owner ON public.rent_ledger (owner_id);

-- ---------------------------------------------------------------------------
-- 7. verification (run and eyeball the output)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'floors.updated_at exists: %', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='floors' AND column_name='updated_at');
  RAISE NOTICE 'rooms.number exists: %', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rooms' AND column_name='number');
  RAISE NOTICE 'beds.slot exists: %', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='beds' AND column_name='slot');
  RAISE NOTICE 'repair complete — 013_consolidated_repair applied';
END $$;
