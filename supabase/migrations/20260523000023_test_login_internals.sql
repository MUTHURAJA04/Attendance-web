-- Test exactly what query fails during login
CREATE OR REPLACE FUNCTION fn_test_login_internals(p_email text)
RETURNS jsonb AS $$
DECLARE
  v_u RECORD;
  v_i RECORD;
  v_err text;
BEGIN
  -- Step 1: Query auth.users
  BEGIN
    SELECT * INTO v_u FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
    IF v_u.id IS NULL THEN
      RETURN jsonb_build_object('step', 'select_user', 'status', 'not_found');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RETURN jsonb_build_object('step', 'select_user', 'error', v_err);
  END;

  -- Step 2: Query auth.identities
  BEGIN
    SELECT * INTO v_i FROM auth.identities WHERE user_id = v_u.id LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RETURN jsonb_build_object('step', 'select_identity', 'error', v_err);
  END;

  -- Step 3: Test UPDATE auth.users (what GoTrue runs on sign in)
  BEGIN
    UPDATE auth.users SET last_sign_in_at = now(), updated_at = now() WHERE id = v_u.id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RETURN jsonb_build_object('step', 'update_user', 'error', v_err);
  END;

  -- Step 4: Test UPDATE auth.identities
  BEGIN
    UPDATE auth.identities SET last_sign_in_at = now(), updated_at = now() WHERE user_id = v_u.id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RETURN jsonb_build_object('step', 'update_identity', 'error', v_err);
  END;

  -- Step 5: Test profiles query (RLS check)
  BEGIN
    PERFORM * FROM public.profiles WHERE id = v_u.id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RETURN jsonb_build_object('step', 'select_profile', 'error', v_err);
  END;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_u.id,
    'email', v_u.email,
    'identity_id', v_i.id,
    'identity_provider_id', v_i.provider_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_test_login_internals(text) TO anon, authenticated, service_role;
