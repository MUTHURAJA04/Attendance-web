"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EmployeeForm } from "../../../../components/EmployeeForm";

function NewEmployeeFormWrapper() {
  const searchParams = useSearchParams();
  const preSelectedBranch = searchParams.get("branch");

  return <EmployeeForm mode="create" preSelectedBranch={preSelectedBranch} />;
}

export default function NewEmployeePage() {
  return (
    <Suspense fallback={<div className="centered"><p>Loading form...</p></div>}>
      <NewEmployeeFormWrapper />
    </Suspense>
  );
}
