"use client";

import { useParams } from "next/navigation";
import { EmployeeForm } from "../../../../../components/EmployeeForm";

export default function EditEmployeePage() {
  const { id } = useParams();
  const employeeId = Array.isArray(id) ? id[0] : id;

  return <EmployeeForm mode="edit" employeeId={employeeId} />;
}
