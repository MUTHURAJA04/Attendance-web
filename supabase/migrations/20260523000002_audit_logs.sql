-- Schema Patch: Audit Logs Table and Policies
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Select policy: SUPER_ADMIN, PAYROLL_MANAGER, BRANCH_MANAGER can view audit logs
DROP POLICY IF EXISTS "audit_logs_read" ON audit_logs;
CREATE POLICY "audit_logs_read" ON audit_logs
  FOR SELECT USING (
    is_any_role(ARRAY['SUPER_ADMIN', 'PAYROLL_MANAGER', 'BRANCH_MANAGER'])
  );

-- Insert policy: Authenticated users can insert audit logs
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
