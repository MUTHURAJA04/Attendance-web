-- Migration: Prevent leave application after shift start
-- Enforces that employees cannot apply for leave once their shift has already started.

CREATE OR REPLACE FUNCTION trg_check_leave_shift_start()
RETURNS TRIGGER AS $$
DECLARE
  v_shift_start time;
  v_ist_date date;
  v_ist_time time;
BEGIN
  -- Calculate current date and time in Asia/Kolkata (IST)
  v_ist_date := (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
  v_ist_time := (NOW() AT TIME ZONE 'Asia/Kolkata')::time;

  -- Fetch employee's shift start time
  SELECT COALESCE(shift_start, '10:00:00'::time)
  INTO v_shift_start
  FROM employees
  WHERE id = NEW.employee_id;

  -- Block if leave is for today and shift has already started
  IF NEW.start_date <= v_ist_date AND NEW.end_date >= v_ist_date THEN
    IF v_ist_time >= v_shift_start THEN
      RAISE EXCEPTION 'Cannot apply leave: Shift started at % (Current IST time: %). Leave cannot be applied once shift begins.', v_shift_start, v_ist_time;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leave_shift_start_check ON leave_requests;
CREATE TRIGGER trg_leave_shift_start_check
BEFORE INSERT ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION trg_check_leave_shift_start();
