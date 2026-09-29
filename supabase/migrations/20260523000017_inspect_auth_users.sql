-- Migration: Inspect Auth User Row
CREATE OR REPLACE FUNCTION fn_inspect_auth_users()
RETURNS jsonb AS $$
DECLARE
  res jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'encrypted_password_prefix', substring(u.encrypted_password from 1 for 10),
      'instance_id', u.instance_id,
      'aud', u.aud,
      'role', u.role,
      'email_confirmed_at', u.email_confirmed_at,
      'identities_count', (SELECT count(*) FROM auth.identities i WHERE i.user_id = u.id),
      'identity_sample', (SELECT row_to_json(i) FROM auth.identities i WHERE i.user_id = u.id LIMIT 1)
    )
  )
  INTO res
  FROM auth.users u;

  RETURN res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_inspect_auth_users() TO anon, authenticated, service_role;
