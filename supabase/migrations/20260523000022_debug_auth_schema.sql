-- Diagnostic Function: Inspect schema, columns, triggers, constraints, and raw rows
CREATE OR REPLACE FUNCTION fn_get_auth_debug_info()
RETURNS jsonb AS $$
DECLARE
  v_cols jsonb;
  v_triggers jsonb;
  v_constraints jsonb;
  v_users jsonb;
  v_identities jsonb;
BEGIN
  -- 1. Columns
  SELECT jsonb_agg(row_to_json(c)) INTO v_cols
  FROM (
    SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name IN ('users', 'identities')
    ORDER BY table_name, ordinal_position
  ) c;

  -- 2. Triggers
  SELECT jsonb_agg(row_to_json(t)) INTO v_triggers
  FROM (
    SELECT event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE event_object_schema IN ('auth', 'public')
  ) t;

  -- 3. Constraints
  SELECT jsonb_agg(row_to_json(con)) INTO v_constraints
  FROM (
    SELECT conname, contype, conrelid::regclass AS table_name, pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname IN ('auth', 'public')
  ) con;

  -- 4. Sample Users (safe columns)
  SELECT jsonb_agg(row_to_json(u)) INTO v_users
  FROM (
    SELECT id, email, role, aud, instance_id, email_confirmed_at, confirmation_token, recovery_token, is_super_admin, is_sso_user, raw_app_meta_data, raw_user_meta_data
    FROM auth.users
  ) u;

  -- 5. Sample Identities
  SELECT jsonb_agg(row_to_json(i)) INTO v_identities
  FROM auth.identities i;

  RETURN jsonb_build_object(
    'columns', v_cols,
    'triggers', v_triggers,
    'constraints', v_constraints,
    'users', v_users,
    'identities', v_identities
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_get_auth_debug_info() TO anon, authenticated, service_role;
