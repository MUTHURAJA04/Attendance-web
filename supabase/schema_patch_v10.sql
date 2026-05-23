-- Schema Patch v10: Employee Documents
CREATE TABLE IF NOT EXISTS employee_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    category text NOT NULL DEFAULT 'Other',
    -- Aadhaar, PAN, Bank Passbook, Address Proof, Photo, Offer Letter, Other
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_type text NOT NULL DEFAULT 'pdf',
    -- pdf, jpg, png
    uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employee_documents read" ON employee_documents;
CREATE POLICY "employee_documents read" ON employee_documents FOR
SELECT USING (
        is_any_role(
            array ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
        )
    );
DROP POLICY IF EXISTS "employee_documents write" ON employee_documents;
CREATE POLICY "employee_documents write" ON employee_documents FOR
INSERT WITH CHECK (
        is_any_role(array ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "employee_documents delete" ON employee_documents;
CREATE POLICY "employee_documents delete" ON employee_documents FOR DELETE USING (
    is_any_role(array ['SUPER_ADMIN','PAYROLL_MANAGER'])
);
-- Create storage bucket for employee documents (run via Supabase Dashboard or SQL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', true) ON CONFLICT (id) DO NOTHING;