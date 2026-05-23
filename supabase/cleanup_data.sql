-- Database Cleanup Script
-- This script will remove all data from all tables in the public schema.
-- WARNING: This action is irreversible!
DO $$
DECLARE r RECORD;
BEGIN -- Loop through all tables in the public schema and truncate them
FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
) LOOP EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
END LOOP;
END $$;