-- ═══════════════════════════════════════════════════
-- Loan Write-off Trigger
-- Automatically writes off ACTIVE loans when an
-- employee's status transitions to 'LEFT'
-- ═══════════════════════════════════════════════════

-- Trigger function
CREATE OR REPLACE FUNCTION handle_employee_left_writeoff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    loan_record RECORD;
BEGIN
    -- Only fire when status changes TO 'LEFT' from something else
    IF NEW.status = 'LEFT' AND (OLD.status IS DISTINCT FROM 'LEFT') THEN

        -- Loop through all ACTIVE loans for this employee
        FOR loan_record IN
            SELECT id, balance_amount
            FROM loans
            WHERE employee_id = NEW.id
              AND status = 'ACTIVE'
        LOOP
            -- Create a write-off record
            INSERT INTO loan_writeoffs (employee_id, loan_id, amount, reason)
            VALUES (
                NEW.id,
                loan_record.id,
                loan_record.balance_amount,
                'EMPLOYEE_LEFT'
            );

            -- Mark the loan as WRITTEN_OFF
            UPDATE loans
            SET status = 'WRITTEN_OFF'
            WHERE id = loan_record.id;
        END LOOP;

    END IF;

    RETURN NEW;
END;
$$;

-- Attach trigger to employees table
DROP TRIGGER IF EXISTS trg_employee_left_writeoff ON employees;
CREATE TRIGGER trg_employee_left_writeoff
    AFTER UPDATE OF status ON employees
    FOR EACH ROW
    WHEN (NEW.status = 'LEFT' AND OLD.status IS DISTINCT FROM 'LEFT')
    EXECUTE FUNCTION handle_employee_left_writeoff();

-- Add a comment for documentation
COMMENT ON FUNCTION handle_employee_left_writeoff() IS
    'Automatically writes off all ACTIVE loans when employee status transitions to LEFT. Creates loan_writeoffs records and marks loans as WRITTEN_OFF.';
