-- Migration: 11:00 PM Auto Check-Out Cron & Stored Procedure
-- Automatically checks out all employees who checked in but didn't check out by 11:00 PM IST.
-- Generates system notification and audit log containing the full checkout list.

-- 1. Create System Notifications Table (if not exists)
CREATE TABLE IF NOT EXISTS system_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'INFO',
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  details jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS for system_notifications
ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_notifications' AND policyname = 'Allow read system_notifications'
  ) THEN
    CREATE POLICY "Allow read system_notifications" ON system_notifications FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_notifications' AND policyname = 'Allow insert system_notifications'
  ) THEN
    CREATE POLICY "Allow insert system_notifications" ON system_notifications FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_notifications' AND policyname = 'Allow update system_notifications'
  ) THEN
    CREATE POLICY "Allow update system_notifications" ON system_notifications FOR UPDATE USING (true);
  END IF;
END;
$$;

-- 2. Create Stored Function for Auto Check-Out & Notification Generation
CREATE OR REPLACE FUNCTION fn_auto_checkout_unclosed_attendance()
RETURNS jsonb AS $$
DECLARE
  v_now_ist timestamptz;
  v_ist_date date;
  v_ist_time time;
  v_updated_count int := 0;
  v_rec record;
  v_auto_checkout_time timestamptz;
  v_checkout_list jsonb := '[]'::jsonb;
  v_staff_names text[] := ARRAY[]::text[];
BEGIN
  -- Get current timestamp and time in Asia/Kolkata (IST)
  v_now_ist := NOW() AT TIME ZONE 'Asia/Kolkata';
  v_ist_date := v_now_ist::date;
  v_ist_time := v_now_ist::time;

  -- Loop through all unclosed attendance logs where check_out is NULL
  FOR v_rec IN
    SELECT 
      a.id, 
      a.employee_id, 
      a.branch_id, 
      a.check_in, 
      a.metadata,
      COALESCE(e.full_name, 'Staff') AS employee_name,
      b.name AS branch_name
    FROM attendance_logs a
    LEFT JOIN employees e ON e.id = a.employee_id
    LEFT JOIN branches b ON b.id = a.branch_id
    WHERE a.check_out IS NULL
      AND COALESCE((a.metadata->>'exclude_from_auto_checkout')::boolean, false) = false
      AND (
        -- Either check_in was on a previous date (past day unclosed punch)
        (a.check_in AT TIME ZONE 'Asia/Kolkata')::date < v_ist_date
        -- Or check_in is today and current IST time is past 11:00 PM (23:00)
        OR (
          (a.check_in AT TIME ZONE 'Asia/Kolkata')::date = v_ist_date
          AND v_ist_time >= '23:00:00'::time
        )
      )
  LOOP
    -- Target checkout time: 11:00 PM IST on the check-in date
    v_auto_checkout_time := (((v_rec.check_in AT TIME ZONE 'Asia/Kolkata')::date)::text || ' 23:00:00+05:30')::timestamptz;

    -- Update attendance log with 11:00 PM check_out and metadata
    UPDATE attendance_logs
    SET
      check_out = v_auto_checkout_time,
      metadata = jsonb_set(
        jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{auto_checked_out}',
          'true'::jsonb,
          true
        ),
        '{auto_checkout_reason}',
        '"11:00 PM Auto-Checkout Cron"'::jsonb,
        true
      )
    WHERE id = v_rec.id;

    -- Add to checkout list
    v_checkout_list := v_checkout_list || jsonb_build_object(
      'log_id', v_rec.id,
      'employee_id', v_rec.employee_id,
      'employee_name', v_rec.employee_name,
      'branch_name', COALESCE(v_rec.branch_name, 'Main Branch'),
      'branch_id', v_rec.branch_id,
      'check_in', v_rec.check_in,
      'check_out', v_auto_checkout_time,
      'date', (v_rec.check_in AT TIME ZONE 'Asia/Kolkata')::date
    );

    v_staff_names := array_append(v_staff_names, v_rec.employee_name);
    v_updated_count := v_updated_count + 1;
  END LOOP;

  -- Create System Notification & Audit Log if any employees were auto checked out
  IF v_updated_count > 0 THEN
    -- 1. Insert in system_notifications
    INSERT INTO system_notifications (
      title,
      message,
      type,
      details,
      created_at
    ) VALUES (
      '🌙 11:00 PM Auto Check-Out Summary',
      v_updated_count || ' employee(s) automatically checked out at 11:00 PM: ' || array_to_string(v_staff_names, ', '),
      'AUTO_CHECKOUT',
      jsonb_build_object(
        'count', v_updated_count,
        'checkout_time', '23:00:00 IST',
        'staff_names', v_staff_names,
        'employees', v_checkout_list
      ),
      v_now_ist
    );

    -- 2. Insert in audit_logs
    INSERT INTO audit_logs (
      action,
      entity_type,
      entity_id,
      actor_email,
      actor_role,
      branch_id,
      details
    ) VALUES (
      'auto_checkout_cron_executed',
      'attendance_logs',
      'system_cron',
      'System Cron Job',
      'SYSTEM',
      NULL,
      jsonb_build_object(
        'updated_count', v_updated_count,
        'checkout_time', '23:00:00 IST',
        'staff_names', v_staff_names,
        'employees', v_checkout_list,
        'executed_at', v_now_ist
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'employees', v_checkout_list,
    'executed_at', v_now_ist
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Stored Procedure for Pre-Review Alerts
CREATE OR REPLACE FUNCTION fn_pre_auto_checkout_alert()
RETURNS jsonb AS $$
DECLARE
  v_now_ist timestamptz;
  v_ist_date date;
  v_pending_count int := 0;
  v_staff_names text[] := ARRAY[]::text[];
  v_unclosed_list jsonb := '[]'::jsonb;
  v_rec record;
BEGIN
  v_now_ist := NOW() AT TIME ZONE 'Asia/Kolkata';
  v_ist_date := v_now_ist::date;

  FOR v_rec IN
    SELECT 
      a.id, 
      a.employee_id, 
      a.branch_id, 
      a.check_in, 
      COALESCE(e.full_name, 'Staff') AS employee_name,
      b.name AS branch_name
    FROM attendance_logs a
    LEFT JOIN employees e ON e.id = a.employee_id
    LEFT JOIN branches b ON b.id = a.branch_id
    WHERE a.check_out IS NULL
      AND COALESCE((a.metadata->>'exclude_from_auto_checkout')::boolean, false) = false
  LOOP
    v_staff_names := array_append(v_staff_names, v_rec.employee_name);
    v_unclosed_list := v_unclosed_list || jsonb_build_object(
      'log_id', v_rec.id,
      'employee_id', v_rec.employee_id,
      'employee_name', v_rec.employee_name,
      'branch_name', COALESCE(v_rec.branch_name, 'Main Branch'),
      'check_in', v_rec.check_in
    );
    v_pending_count := v_pending_count + 1;
  END LOOP;

  IF v_pending_count > 0 THEN
    INSERT INTO system_notifications (
      title,
      message,
      type,
      details,
      created_at
    ) VALUES (
      '⚠️ 11:00 PM Auto Check-Out Pre-Review Alert',
      v_pending_count || ' employee(s) are currently checked in and pending auto check-out at 11:00 PM.',
      'PRE_AUTO_CHECKOUT',
      jsonb_build_object(
        'eligible_count', v_pending_count,
        'target_time', '11:00 PM IST',
        'staff_names', v_staff_names,
        'employees', v_unclosed_list
      ),
      v_now_ist
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'pending_count', v_pending_count,
    'employees', v_unclosed_list
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Setup pg_cron schedule if pg_cron extension exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('auto-checkout-11pm-daily')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'auto-checkout-11pm-daily'
    );

    -- Schedule to run daily at 11:00 PM IST (17:30 UTC)
    PERFORM cron.schedule(
      'auto-checkout-11pm-daily',
      '30 17 * * *',
      'SELECT fn_auto_checkout_unclosed_attendance();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;
