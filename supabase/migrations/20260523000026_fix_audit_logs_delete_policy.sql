-- Migration: Add ALL (SELECT, INSERT, UPDATE, DELETE) policy for audit_logs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    EXECUTE 'ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs_delete_all" ON audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs_all" ON audit_logs';
    EXECUTE 'CREATE POLICY "audit_logs_all" ON audit_logs FOR ALL TO authenticated, anon USING (true) WITH CHECK (true)';
    EXECUTE 'GRANT ALL ON audit_logs TO authenticated, anon';
  END IF;
END;
$$;
