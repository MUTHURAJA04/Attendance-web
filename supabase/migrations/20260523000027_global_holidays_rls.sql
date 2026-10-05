-- Migration: Ensure full RLS access for global_holidays table
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
