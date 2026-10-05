-- Migration: Create Security Definer RPC functions for Holiday CRUD operations & Fix RLS policies for global_holidays

-- 1. Ensure RLS Policies for global_holidays
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_holidays') THEN
    EXECUTE 'ALTER TABLE global_holidays ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "global_holidays_read" ON global_holidays';
    EXECUTE 'DROP POLICY IF EXISTS "global_holidays_write" ON global_holidays';
    EXECUTE 'DROP POLICY IF EXISTS "global_holidays_read_all" ON global_holidays';
    EXECUTE 'DROP POLICY IF EXISTS "global_holidays_write_all" ON global_holidays';
    EXECUTE 'DROP POLICY IF EXISTS "global_holidays_all" ON global_holidays';

    EXECUTE 'CREATE POLICY "global_holidays_all" ON global_holidays FOR ALL TO authenticated, anon USING (true) WITH CHECK (true)';
    EXECUTE 'GRANT ALL ON global_holidays TO authenticated, anon';
  END IF;
END;
$$;

-- 2. SECURITY DEFINER RPC Functions (bypasses RLS limits)
CREATE OR REPLACE FUNCTION fn_create_holiday(
  p_name text,
  p_date date,
  p_type text DEFAULT 'PAID',
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_holiday_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO global_holidays (name, date, type, branch_id)
  VALUES (p_name, p_date, COALESCE(p_type, 'PAID'), p_branch_id)
  RETURNING id INTO v_holiday_id;

  BEGIN
    INSERT INTO audit_logs (action, entity_type, entity_id, details)
    VALUES ('holiday_created', 'SETTINGS', v_holiday_id,
            jsonb_build_object('name', p_name, 'date', p_date, 'type', p_type, '_branch_id', p_branch_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT jsonb_build_object('id', v_holiday_id, 'name', p_name, 'date', p_date, 'type', p_type, 'branch_id', p_branch_id)
  INTO v_result;

  RETURN jsonb_build_object('success', true, 'holiday', v_result);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION fn_update_holiday(
  p_id uuid,
  p_name text,
  p_date date,
  p_type text DEFAULT 'PAID',
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE global_holidays
  SET name = p_name,
      date = p_date,
      type = COALESCE(p_type, 'PAID'),
      branch_id = p_branch_id
  WHERE id = p_id;

  BEGIN
    INSERT INTO audit_logs (action, entity_type, entity_id, details)
    VALUES ('holiday_updated', 'SETTINGS', p_id,
            jsonb_build_object('name', p_name, 'date', p_date, 'type', p_type, '_branch_id', p_branch_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION fn_delete_holiday(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM global_holidays WHERE id = p_id;

  BEGIN
    INSERT INTO audit_logs (action, entity_type, entity_id, details)
    VALUES ('holiday_deleted', 'SETTINGS', p_id, jsonb_build_object('id', p_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_create_holiday TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_update_holiday TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_delete_holiday TO authenticated, anon;
