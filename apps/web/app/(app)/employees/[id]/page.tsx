"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "../../../../lib/supabase/client";
import type { Employee, SalaryStructure, Loan, EmployeeStatus, WriteOff, Payslip, PayrollPeriod, AttendanceLog, AttendanceStatus, EmployeeDocument, DocumentCategory } from "../../../../lib/types";
import { PayslipModal } from "../../../../components/PayslipModal";

// ── Attendance Status Map ──
const STATUS_MAP: Record<string, { label: string; short: string; bg: string; color: string }> = {
    PRESENT: { label: "Present", short: "P", bg: "#dcfce7", color: "#166534" },
    ABSENT: { label: "Uninformed Absence", short: "A", bg: "#fef2f2", color: "#991b1b" },
    HALF_DAY: { label: "Half Day", short: "H", bg: "#fef9c3", color: "#854d0e" },
    LATE: { label: "Late", short: "L", bg: "#fff7ed", color: "#9a3412" },
    OT: { label: "Overtime", short: "OT", bg: "#ede9fe", color: "#5b21b6" },
    LEAVE_APPROVED: { label: "Informed Approved", short: "✓", bg: "#dbeafe", color: "#1e40af" },
    LEAVE_UNAPPROVED: { label: "Informed Unapproved", short: "✗", bg: "#fce7f3", color: "#9d174d" },
    "-": { label: "No Record", short: "-", bg: "var(--muted)", color: "var(--muted-foreground)" },
};

const DOCUMENT_CATEGORIES: DocumentCategory[] = ["Aadhaar", "PAN", "Bank Passbook", "Address Proof", "Photo", "Offer Letter", "Other"];

export default function EmployeeDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [employee, setEmployee] = useState<Employee | null>(null);
    const [salary, setSalary] = useState<SalaryStructure | null>(null);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("profile");

    // Action states
    const [actionLoading, setActionLoading] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ action: "DISABLE" | "ENABLE" | "DELETE" } | null>(null);
    const [writeOffData, setWriteOffData] = useState<{ loans: Loan[] } | null>(null);
    const [writeBackData, setWriteBackData] = useState<{ writeoffs: WriteOff[] } | null>(null);

    // Payroll tab states
    const [payslips, setPayslips] = useState<(Payslip & { payroll_periods?: PayrollPeriod })[]>([]);
    const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);

    // Attendance tab states
    const [attMonth, setAttMonth] = useState(new Date().getMonth());
    const [attYear, setAttYear] = useState(new Date().getFullYear());
    const [attLogs, setAttLogs] = useState<AttendanceLog[]>([]);
    const [attLoading, setAttLoading] = useState(false);
    const [empLeaveRequests, setEmpLeaveRequests] = useState<{ id: string; start_date: string; end_date: string; status: string }[]>([]);

    // Documents tab states
    const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
    const [docUploading, setDocUploading] = useState(false);
    const [docCategory, setDocCategory] = useState<DocumentCategory>("Aadhaar");
    const [viewingDoc, setViewingDoc] = useState<EmployeeDocument | null>(null);

    async function loadEmployeeData() {
        setLoading(true);
        const { data: empRes } = await supabaseBrowser
            .from("employees")
            .select("*, branches(name)")
            .eq("id", id)
            .single();

        if (empRes) {
            setEmployee(empRes as Employee);
            const [loanRes, salRes] = await Promise.all([
                supabaseBrowser.from("loans").select("*").eq("employee_id", id).order("created_at", { ascending: false }),
                supabaseBrowser.from("salary_structures").select("*").eq("employee_id", id),
            ]);
            setLoans((loanRes.data as Loan[]) || []);
            setSalary((salRes.data?.[0] as SalaryStructure) || null);
        }
        setLoading(false);
    }

    async function loadPayslips() {
        const { data } = await supabaseBrowser
            .from("payslips")
            .select("*, payroll_periods(*)")
            .eq("employee_id", id)
            .order("created_at", { ascending: false })
            .limit(12);
        setPayslips((data || []) as any);
    }

    async function loadAttendance() {
        setAttLoading(true);
        const start = new Date(attYear, attMonth, 1);
        const end = new Date(attYear, attMonth + 1, 0, 23, 59, 59);
        const lastDay = new Date(attYear, attMonth + 1, 0).getDate();
        const monthStr = String(attMonth + 1).padStart(2, '0');

        const [attRes, leavesRes] = await Promise.all([
            supabaseBrowser
                .from("attendance_logs")
                .select("*")
                .eq("employee_id", id)
                .gte("check_in", start.toISOString())
                .lte("check_in", end.toISOString())
                .order("check_in", { ascending: true }),
            supabaseBrowser
                .from("leave_requests")
                .select("id, start_date, end_date, status")
                .eq("employee_id", id)
                .in("status", ["APPROVED", "PENDING"])
                .gte("start_date", `${attYear}-${monthStr}-01`)
                .lte("end_date", `${attYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`),
        ]);

        setAttLogs((attRes.data || []) as AttendanceLog[]);
        setEmpLeaveRequests((leavesRes.data || []) as typeof empLeaveRequests);
        setAttLoading(false);
    }

    async function loadDocuments() {
        const { data } = await supabaseBrowser
            .from("employee_documents")
            .select("*")
            .eq("employee_id", id)
            .order("uploaded_at", { ascending: false });
        setDocuments((data || []) as EmployeeDocument[]);
    }

    useEffect(() => { loadEmployeeData(); }, [id]);
    useEffect(() => { if (activeTab === "payroll") loadPayslips(); }, [activeTab, id]);
    useEffect(() => { if (activeTab === "attendance") loadAttendance(); }, [activeTab, attMonth, attYear, id]);
    useEffect(() => { if (activeTab === "documents") loadDocuments(); }, [activeTab, id]);

    // ── Simple Toggle (Enable/Disable) ──
    const toggleStatus = async () => {
        if (!employee) return;
        const currentStatus = employee.status || (employee.is_active ? "ACTIVE" : "DISABLED");
        const newActive = currentStatus !== "ACTIVE";
        const newStatus = newActive ? "ACTIVE" : "DISABLED";

        setActionLoading(true);
        const { error } = await supabaseBrowser.from("employees").update({ is_active: newActive, status: newStatus }).eq("id", employee.id);
        if (!error) {
            setEmployee({ ...employee, is_active: newActive, status: newStatus as EmployeeStatus });
            setConfirmAction(null);
        } else {
            alert("Failed: " + error.message);
        }
        setActionLoading(false);
    };

    const executeDelete = async () => {
        if (!employee) return;
        setActionLoading(true);

        try {
            // Delete dependent records
            await Promise.all([
                supabaseBrowser.from("attendance_logs").delete().eq("employee_id", employee.id),
                supabaseBrowser.from("loans").delete().eq("employee_id", employee.id),
                supabaseBrowser.from("loan_writeoffs").delete().eq("employee_id", employee.id),
                supabaseBrowser.from("leave_requests").delete().eq("employee_id", employee.id),
                supabaseBrowser.from("payslips").delete().eq("employee_id", employee.id),
                supabaseBrowser.from("salary_structures").delete().eq("employee_id", employee.id),
                supabaseBrowser.from("employee_documents").delete().eq("employee_id", employee.id)
            ]);

            // Delete the employee
            const { error } = await supabaseBrowser.from("employees").delete().eq("id", employee.id);
            if (error) throw error;

            router.push("/employees");
        } catch (error: any) {
            alert("Failed to delete employee: " + error.message);
        } finally {
            setActionLoading(false);
            setConfirmAction(null);
        }
    };

    // ── Mark Left Flow ──
    const initiateMarkLeft = async () => {
        if (!employee) return;
        const activeLoans = loans.filter(l => l.status === "ACTIVE");
        if (activeLoans.length > 0) {
            setWriteOffData({ loans: activeLoans });
        } else {
            if (confirm(`Mark "${employee.full_name}" as Left?`)) {
                setActionLoading(true);
                const { error } = await supabaseBrowser.from("employees").update({ status: "LEFT", is_active: false }).eq("id", employee.id);
                if (!error) {
                    setEmployee({ ...employee, status: "LEFT", is_active: false });
                } else {
                    alert("Failed: " + error.message);
                }
                setActionLoading(false);
            }
        }
    };

    const executeWriteOff = async () => {
        if (!employee || !writeOffData) return;
        setActionLoading(true);

        // Simply mark employee as LEFT — the DB trigger
        // (trg_employee_left_writeoff) automatically handles:
        // 1. Creating loan_writeoffs records for each ACTIVE loan
        // 2. Marking all ACTIVE loans as WRITTEN_OFF
        const { error: empError } = await supabaseBrowser
            .from("employees")
            .update({ status: "LEFT", is_active: false })
            .eq("id", employee.id);

        if (!empError) {
            setEmployee({ ...employee, status: "LEFT", is_active: false });
            setWriteOffData(null);
            loadEmployeeData();
        } else {
            alert("Failed: " + empError.message);
        }
        setActionLoading(false);
    };

    // ── Re-activate Flow ──
    const initiateReactivate = async () => {
        if (!employee) return;
        const { data: writeoffs } = await supabaseBrowser
            .from("loan_writeoffs")
            .select("*, loans(type, amount)")
            .eq("employee_id", employee.id)
            .eq("restored", false);

        if (writeoffs && writeoffs.length > 0) {
            setWriteBackData({ writeoffs: writeoffs as WriteOff[] });
        } else {
            toggleStatus();
        }
    };

    const executeWriteBack = async () => {
        if (!employee || !writeBackData) return;
        setActionLoading(true);

        const now = new Date();
        let nextMonth = now.getMonth() + 2;
        let nextYear = now.getFullYear();
        if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }

        for (const wo of writeBackData.writeoffs) {
            const { data: insertedLoan, error: loanErr } = await supabaseBrowser.from("loans").insert([{
                employee_id: employee.id,
                type: wo.loans?.type || "LOAN",
                amount: wo.amount,
                balance_amount: wo.amount,
                disbursement_date: new Date().toISOString().split("T")[0],
                status: "ACTIVE",
                tenure_months: 1,
                monthly_emi: wo.amount,
                repayment_schedule: [],
                deduction_month: nextMonth,
                deduction_year: nextYear
            }]).select("id").single();
            if (!loanErr) await supabaseBrowser.from("loan_writeoffs").update({ restored: true, restored_loan_id: insertedLoan.id }).eq("id", wo.id);
        }
        const { error } = await supabaseBrowser.from("employees").update({ status: "ACTIVE", is_active: true }).eq("id", employee.id);
        if (!error) {
            setEmployee({ ...employee, status: "ACTIVE", is_active: true });
            setWriteBackData(null);
            loadEmployeeData();
        } else {
            alert("Failed: " + error.message);
        }
        setActionLoading(false);
    };

    const skipWriteBackAndActivate = async () => {
        if (!employee) return;
        setActionLoading(true);
        const { error } = await supabaseBrowser.from("employees").update({ status: "ACTIVE", is_active: true }).eq("id", employee.id);
        if (!error) {
            setEmployee({ ...employee, status: "ACTIVE", is_active: true });
            setWriteBackData(null);
        } else {
            alert("Failed: " + error.message);
        }
        setActionLoading(false);
    };

    // ── Document Upload ──
    const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !id) return;
        setDocUploading(true);

        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const filePath = `${id}/${Date.now()}_${file.name}`;

        const { error: uploadError } = await supabaseBrowser.storage
            .from("employee-documents")
            .upload(filePath, file);

        if (uploadError) {
            alert("Upload failed: " + uploadError.message);
            setDocUploading(false);
            return;
        }

        const { data: urlData } = supabaseBrowser.storage
            .from("employee-documents")
            .getPublicUrl(filePath);

        const { error: insertError } = await supabaseBrowser.from("employee_documents").insert([{
            employee_id: id,
            category: docCategory,
            file_name: file.name,
            file_url: urlData.publicUrl,
            file_type: ext,
        }]);

        if (insertError) {
            alert("Save failed: " + insertError.message);
        } else {
            loadDocuments();
        }
        setDocUploading(false);
        e.target.value = "";
    };

    const handleDocDelete = async (doc: EmployeeDocument) => {
        if (!confirm(`Delete "${doc.file_name}"?`)) return;
        // Extract path from URL
        const urlParts = doc.file_url.split("/employee-documents/");
        if (urlParts[1]) {
            await supabaseBrowser.storage.from("employee-documents").remove([decodeURIComponent(urlParts[1])]);
        }
        await supabaseBrowser.from("employee_documents").delete().eq("id", doc.id);
        loadDocuments();
    };

    if (loading) return <div className="centered">Loading profile...</div>;
    if (!employee) return <div className="centered">Employee not found.</div>;

    const empStatus = employee.status || (employee.is_active ? "ACTIVE" : "DISABLED");
    const basicPay = Number(salary?.basic_pay || 0);
    const hra = Number(salary?.hra || 0);
    const allowances = Number(salary?.allowances || 0);
    const totalCTC = basicPay + hra + allowances;

    // ── Attendance helpers ──
    const DAYS_IN_MONTH = new Date(attYear, attMonth + 1, 0).getDate();
    const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const getAttStatus = (day: number) => {
        const log = attLogs.find((l) => new Date(l.check_in).getDate() === day);
        // If we have a definitive non-ABSENT status, use it
        if (log && log.status !== "ABSENT") return log.status;

        // Check leave requests for this day
        const dayDate = new Date(attYear, attMonth, day);
        const leave = empLeaveRequests.find((lr) => {
            const start = new Date(lr.start_date + "T00:00:00");
            const end = new Date(lr.end_date + "T23:59:59");
            return dayDate >= start && dayDate <= end;
        });

        if (leave) {
            return leave.status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_UNAPPROVED";
        }

        // If ABSENT log exists with no leave request = uninformed
        if (log) return "ABSENT";

        return "-";
    };

    // Compute stats using getAttStatus which now considers leave_requests
    const DAYS_IN_ATT_MONTH = new Date(attYear, attMonth + 1, 0).getDate();
    let attPresent = 0, attAbsentUninformed = 0, attLate = 0, attHalfDay = 0, attApprLeave = 0, attUnapprLeave = 0;
    for (let d = 1; d <= DAYS_IN_ATT_MONTH; d++) {
        const s = getAttStatus(d);
        if (s === "PRESENT") attPresent++;
        else if (s === "ABSENT") attAbsentUninformed++;
        else if (s === "LATE") attLate++;
        else if (s === "HALF_DAY") attHalfDay++;
        else if (s === "LEAVE_APPROVED") attApprLeave++;
        else if (s === "LEAVE_UNAPPROVED") attUnapprLeave++;
    }

    // ── Loans ledger helpers ──
    const activeLoans = loans.filter(l => l.status === "ACTIVE");
    const totalDebt = activeLoans.reduce((a, b) => a + Number(b.balance_amount || 0), 0);
    const monthlyEmi = activeLoans.reduce((a, b) => a + Number(b.monthly_emi || 0), 0);
    const estSalary = totalCTC - monthlyEmi;

    // Build ledger entries
    type LedgerEntry = { date: string; desc: string; debit: number; credit: number; balance: number; type: "disbursement" | "repayment" | "upcoming" };
    const ledgerEntries: LedgerEntry[] = [];
    let runningBalance = 0;
    // Sort all loans by disbursement date
    const sortedLoans = [...loans].sort((a, b) => new Date(a.disbursement_date || a.created_at).getTime() - new Date(b.disbursement_date || b.created_at).getTime());
    for (const loan of sortedLoans) {
        // Disbursement
        runningBalance += Number(loan.amount || 0);
        ledgerEntries.push({
            date: loan.disbursement_date || loan.created_at.split("T")[0],
            desc: `${loan.type} Disbursed (₹${Number(loan.amount || 0).toLocaleString("en-IN")})`,
            debit: Number(loan.amount || 0),
            credit: 0,
            balance: runningBalance,
            type: "disbursement",
        });
        // Past repayments from schedule
        if (loan.repayment_schedule) {
            for (const entry of loan.repayment_schedule) {
                const now = new Date();
                const entryDate = new Date(entry.year, entry.month - 1, 28);
                if (entryDate <= now) {
                    runningBalance -= Number(entry.amount || 0);
                    ledgerEntries.push({
                        date: `${entry.year}-${String(entry.month).padStart(2, "0")}-28`,
                        desc: `EMI Deducted (${loan.type})`,
                        debit: 0,
                        credit: Number(entry.amount || 0),
                        balance: runningBalance,
                        type: "repayment",
                    });
                } else {
                    ledgerEntries.push({
                        date: `${entry.year}-${String(entry.month).padStart(2, "0")}-28`,
                        desc: `Upcoming EMI (${loan.type})`,
                        debit: 0,
                        credit: Number(entry.amount || 0),
                        balance: runningBalance - Number(entry.amount || 0),
                        type: "upcoming",
                    });
                }
            }
        }
    }
    // sort ledger entries by date
    ledgerEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const tabs = ["profile", "payroll", "attendance", "documents", "loans"];

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-bold">{employee.full_name}</h1>
                    <div className="flex gap-2 items-center mt-1.5">
                        <span className="text-sm text-muted-foreground font-medium">{employee.employee_code || "No ID"}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span className={`pill text-xs ${empStatus === "ACTIVE" ? "pill-success" : empStatus === "LEFT" ? "pill-secondary" : "pill-destructive"}`}>
                            {empStatus}
                        </span>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="text-sm text-muted-foreground font-medium">{employee.branches?.name || "Unassigned"}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Link href={`/employees/${id}/edit`} className="button button-secondary">Edit Profile</Link>
                    {empStatus === "ACTIVE" && (
                        <>
                            <button onClick={() => setConfirmAction({ action: "DISABLE" })} className="button button-secondary text-warning">Disable</button>
                            <button onClick={initiateMarkLeft} className="button button-secondary text-destructive">Mark Left</button>
                        </>
                    )}
                    {empStatus === "DISABLED" && (
                        <button onClick={() => setConfirmAction({ action: "ENABLE" })} className="button button-secondary text-accent-2">Enable</button>
                    )}
                    {empStatus === "LEFT" && (
                        <button onClick={initiateReactivate} className="button button-secondary text-accent-2">Re-activate</button>
                    )}
                    <button onClick={() => setConfirmAction({ action: "DELETE" })} className="button button-secondary bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:text-red-700">Delete</button>
                </div>
            </div>

            {/* ── Tab Bar ── */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg mb-6 w-fit">
                {tabs.map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-6 py-2 text-sm rounded-md transition-all ${activeTab === tab ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>
                        {tab === "loans" ? "Loans & Advances" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            <div className="card">
                {/* ══════════ PROFILE TAB ══════════ */}
                {activeTab === "profile" && (
                    <div className="flex flex-col gap-8">
                        <section>
                            <h3 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Personal & Contact Info
                            </h3>
                            <div className="bg-card rounded-xl p-6 shadow-sm border border-border/40 flex flex-col gap-6">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Full Name</span>
                                        <span className="text-sm font-medium">{employee.full_name}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Phone</span>
                                        <span className="text-sm font-medium">{employee.phone}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Gender</span>
                                      {(employee as any).gender?.toLowerCase() || "Not specified"}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Date of Birth</span>
                                        <span className="text-sm font-medium">
                                            {employee.date_of_birth 
                                                ? new Date(employee.date_of_birth).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) 
                                                : "Not specified"}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 pt-6 border-t border-border/40">
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Address</span>
                                    <span className="text-sm font-medium">{employee.address || "N/A"}</span>
                                </div>
                                <div className="grid grid-cols-1 gap-6 pt-6 border-t border-border/40">
                                    <div className="flex flex-col gap-2">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Emergency Contacts</span>
                                        {(!employee.emergency_contacts || employee.emergency_contacts.length === 0) ? (
                                            <span className="text-sm font-medium">{employee.emergency_contact_name || "N/A"} <span className="text-muted-foreground mx-1">—</span> {employee.emergency_contact_phone || "N/A"}</span>
                                        ) : (
                                            <div className="flex flex-col gap-2 mt-1">
                                                {employee.emergency_contacts.map((ec: any, idx: number) => (
                                                    <div key={idx} className="flex gap-2 items-center text-sm font-medium bg-muted/40 px-3 py-2 rounded-md w-fit border border-border/50">
                                                        <span className="text-foreground">{ec.name}</span>
                                                        <span className="text-muted-foreground/40 mx-1">—</span>
                                                        <span className="text-foreground font-mono tracking-wide">{ec.phone}</span>
                                                        {ec.relation && <span className="pill text-[0.6rem] !bg-indigo-100 !text-indigo-800 uppercase ml-2">{ec.relation}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <section>
                                <h3 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Bank Details
                                </h3>
                                <div className="bg-card rounded-xl p-6 shadow-sm border border-border/40 flex flex-col gap-6 h-[calc(100%-2.5rem)]">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Account Number</span>
                                        <span className="text-sm font-mono font-medium tracking-wider bg-muted/40 px-3 py-1.5 rounded-md w-fit border border-border/50">{employee.bank_account_number || "Not specified"}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border/40">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">IFSC Code</span>
                                            <span className="text-sm font-medium uppercase">{employee.bank_ifsc || "N/A"}</span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Bank Name</span>
                                            <span className="text-sm font-medium">{employee.bank_name || "N/A"}</span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span> Statutory & Compliance
                                </h3>
                                <div className="bg-card rounded-xl p-6 shadow-sm border border-border/40 flex flex-col gap-6 h-[calc(100%-2.5rem)]">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Aadhaar Number</span>
                                            <span className="text-sm font-mono font-medium tracking-widest bg-muted/40 px-3 py-1.5 rounded-md w-fit border border-border/50">{employee.aadhaar ? employee.aadhaar.replace(/(\d{4})/g, '$1 ').trim() : "Not specified"}</span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">PAN</span>
                                            <span className="text-sm font-mono font-medium uppercase tracking-widest">{employee.pan || "Not specified"}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6 pt-5 border-t border-border/40">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">PF Status</span>
                                            <span className="text-sm font-medium">{employee.enable_pf !== false ? "ENABLED (12%)" : "DISABLED"}</span>
                                            {employee.pf_uan && <span className="text-xs text-muted-foreground font-mono">UAN: {employee.pf_uan}</span>}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">ESI Status</span>
                                            <span className="text-sm font-medium">{employee.enable_esi !== false ? "ENABLED (0.75%)" : "DISABLED"}</span>
                                            {employee.esi_number && <span className="text-xs text-muted-foreground font-mono">ESI #: {employee.esi_number}</span>}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6 pt-5 border-t border-border/40">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Professional Tax (PT)</span>
                                            <span className="text-sm font-medium">{employee.enable_pt !== false ? "ENABLED (TN Slab)" : "DISABLED"}</span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Overtime (OT)</span>
                                            <span className="text-sm font-medium">{employee.enable_ot ? "ENABLED" : "DISABLED"}</span>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <section>
                            <h3 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-rose-500"></span> Operations
                            </h3>
                            <div className="bg-card rounded-xl p-6 shadow-sm border border-border/40 flex flex-col gap-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Department</span>
                                        <span className="text-sm font-medium">{employee.department || "Not assigned"}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Shift Timing</span>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="pill text-[0.7rem] !bg-rose-50 !text-rose-700 !border-rose-200 !py-1">{employee.shift_start || "10:00"} – {employee.shift_end || "22:00"}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 pt-6 border-t border-border/40">
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Roles & Capabilities</span>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {employee.skills?.map((s: string) => <span key={s} className="pill pill-primary text-xs !bg-primary/5 !text-primary !border-primary/20 shadow-sm">{s.replace("_", " ")}</span>) || <span className="text-muted-foreground text-sm italic">No roles or capabilities documented</span>}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {/* ══════════ PAYROLL TAB ══════════ */}
                {activeTab === "payroll" && (
                    <div className="flex flex-col gap-6">
                        {/* Salary Structure */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-muted/30 rounded-xl p-5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Basic Pay</span>
                                <div className="text-xl font-bold mt-1">₹{basicPay.toLocaleString("en-IN")}</div>
                            </div>
                            <div className="bg-muted/30 rounded-xl p-5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">HRA</span>
                                <div className="text-xl font-bold mt-1">₹{hra.toLocaleString("en-IN")}</div>
                            </div>
                            <div className="bg-muted/30 rounded-xl p-5">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Allowances</span>
                                <div className="text-xl font-bold mt-1">₹{allowances.toLocaleString("en-IN")}</div>
                            </div>
                            <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-5 border border-primary/20">
                                <span className="text-xs font-medium text-primary uppercase tracking-widest">Monthly CTC</span>
                                <div className="text-xl font-bold mt-1 text-primary">₹{totalCTC.toLocaleString("en-IN")}</div>
                            </div>
                        </div>

                        {/* Payslip History */}
                        <div>
                            <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-4">Payslip History</h3>
                            {payslips.length === 0 ? (
                                <div className="text-center text-muted-foreground py-8 italic">No payslips generated yet.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead><tr className="border-b border-border">
                                            <th className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Period</th>
                                            <th className="text-right py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Basic</th>
                                            <th className="text-right py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Gross</th>
                                            <th className="text-right py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Deductions</th>
                                            <th className="text-right py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Net Pay</th>
                                            <th className="text-center py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Action</th>
                                        </tr></thead>
                                        <tbody>
                                            {payslips.map((slip) => {
                                                const p = slip.payroll_periods;
                                                const totalDed = Number(slip.pf_deduction || 0) + Number(slip.esi_deduction || 0) + Number(slip.pt_deduction || 0) + Number(slip.tds_deduction || 0) + Number(slip.loan_deduction || 0);
                                                return (
                                                    <tr key={slip.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                                                        <td className="py-3 px-4 font-medium">{p ? `${MONTH_NAMES[p.month - 1]} ${p.year}` : "—"}</td>
                                                        <td className="py-3 px-4 text-right">₹{Number(slip.basic_pay || 0).toLocaleString("en-IN")}</td>
                                                        <td className="py-3 px-4 text-right font-medium">₹{Number(slip.gross_pay || 0).toLocaleString("en-IN")}</td>
                                                        <td className="py-3 px-4 text-right text-destructive">₹{totalDed.toLocaleString("en-IN")}</td>
                                                        <td className="py-3 px-4 text-right font-bold">₹{Number(slip.net_pay || 0).toLocaleString("en-IN")}</td>
                                                        <td className="py-3 px-4 text-center">
                                                            <button className="text-primary hover:underline text-xs font-medium"
                                                                onClick={() => { setSelectedPayslip(slip); setSelectedPeriod(p || null); }}>
                                                                View Slip
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ══════════ ATTENDANCE TAB ══════════ */}
                {activeTab === "attendance" && (
                    <div className="flex flex-col gap-6">
                        {/* Month/Year Picker */}
                        <div className="flex items-center gap-4">
                            <select value={attMonth} onChange={(e) => setAttMonth(Number(e.target.value))} className="input-field w-auto">
                                {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                            <select value={attYear} onChange={(e) => setAttYear(Number(e.target.value))} className="input-field w-auto">
                                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            <div className="stat-card" style={{ borderColor: "#dcfce7" }}>
                                <span className="stat-value text-3xl" style={{ color: "#166534" }}>{attPresent}</span>
                                <span className="stat-label">Present</span>
                            </div>
                            <div className="stat-card" style={{ borderColor: "#fef2f2" }}>
                                <span className="stat-value text-3xl" style={{ color: "#991b1b" }}>{attAbsentUninformed}</span>
                                <span className="stat-label">Uninformed</span>
                            </div>
                            <div className="stat-card" style={{ borderColor: "#fef9c3" }}>
                                <span className="stat-value text-3xl" style={{ color: "#92400e" }}>{attLate}</span>
                                <span className="stat-label">Late</span>
                            </div>
                            <div className="stat-card" style={{ borderColor: "#fff7ed" }}>
                                <span className="stat-value text-3xl" style={{ color: "#854d0e" }}>{attHalfDay}</span>
                                <span className="stat-label">Half Day</span>
                            </div>
                            <div className="stat-card" style={{ borderColor: "#dbeafe" }}>
                                <span className="stat-value text-3xl" style={{ color: "#3730a3" }}>{attApprLeave}</span>
                                <span className="stat-label">Appr. Leave</span>
                            </div>
                            <div className="stat-card" style={{ borderColor: "#fce7f3" }}>
                                <span className="stat-value text-3xl" style={{ color: "#9d174d" }}>{attUnapprLeave}</span>
                                <span className="stat-label">Unappr. Leave</span>
                            </div>
                        </div>

                        {/* Day-by-day Grid */}
                        {attLoading ? (
                            <div className="text-center py-8 text-muted-foreground">Loading...</div>
                        ) : (
                            <div className="grid grid-cols-7 gap-2">
                                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                                    <div key={d} className="text-center text-xs font-bold text-muted-foreground py-1">{d}</div>
                                ))}
                                {/* Blank cells for offset */}
                                {Array.from({ length: new Date(attYear, attMonth, 1).getDay() }).map((_, i) => (
                                    <div key={`blank-${i}`} />
                                ))}
                                {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map(day => {
                                    const status = getAttStatus(day);
                                    const info = STATUS_MAP[status] || STATUS_MAP["-"];
                                    return (
                                        <div key={day} className="rounded-lg p-2 text-center border border-transparent hover:border-border/50 transition-all cursor-default"
                                            style={{ background: info.bg, color: info.color }}
                                            title={`${day} ${MONTH_NAMES[attMonth]} — ${info.label}`}>
                                            <div className="text-xs font-medium opacity-60">{day}</div>
                                            <div className="text-sm font-bold mt-0.5">{info.short}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ══════════ DOCUMENTS TAB ══════════ */}
                {activeTab === "documents" && (
                    <div className="flex flex-col gap-6">
                        {/* Upload Form */}
                        <div className="flex flex-wrap items-end gap-4 p-5 bg-muted/30 rounded-xl">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Category</label>
                                <select value={docCategory} onChange={(e) => setDocCategory(e.target.value as DocumentCategory)} className="input-field w-auto min-w-[160px]">
                                    {DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Upload File</label>
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleDocUpload} disabled={docUploading}
                                    className="input-field w-auto file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary file:text-white file:cursor-pointer" />
                            </div>
                            {docUploading && <span className="text-sm text-muted-foreground animate-pulse">Uploading...</span>}
                        </div>

                        {/* Document Grid */}
                        {documents.length === 0 ? (
                            <div className="text-center text-muted-foreground py-10 italic">No documents uploaded yet. Use the form above to upload employee documents.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {documents.map(doc => (
                                    <div key={doc.id} className="flex flex-col gap-3 p-5 bg-card rounded-xl border border-border hover:shadow-md transition-shadow">
                                        <div className="flex items-start justify-between">
                                            <span className="pill text-[0.65rem] !bg-primary/10 !text-primary !border-primary/20 font-semibold">{doc.category}</span>
                                            <button onClick={() => handleDocDelete(doc)} className="text-destructive/60 hover:text-destructive text-xs">✕</button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">{doc.file_type === "pdf" ? "📄" : "🖼️"}</span>
                                            <span className="text-sm font-medium truncate flex-1" title={doc.file_name}>{doc.file_name}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[0.65rem] text-muted-foreground">{new Date(doc.uploaded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                                            <button onClick={() => setViewingDoc(doc)} className="text-xs font-medium text-primary hover:underline">View →</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ══════════ LOANS & ADVANCES TAB ══════════ */}
                {activeTab === "loans" && (
                    <div className="flex flex-col gap-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-amber-50 rounded-xl p-5">
                                <span className="text-xs font-medium text-amber-700 uppercase tracking-widest">Total Active Debt</span>
                                <div className="text-2xl font-bold text-amber-800 mt-1">₹{totalDebt.toLocaleString("en-IN")}</div>
                                <div className="text-xs text-amber-600 mt-1">{activeLoans.length} active loan(s)</div>
                            </div>
                            <div className="bg-blue-50 rounded-xl p-5">
                                <span className="text-xs font-medium text-blue-700 uppercase tracking-widest">Monthly EMI Outgo</span>
                                <div className="text-2xl font-bold text-blue-800 mt-1">₹{monthlyEmi.toLocaleString("en-IN")}</div>
                            </div>
                            <div className="bg-emerald-50 rounded-xl p-5">
                                <span className="text-xs font-medium text-emerald-700 uppercase tracking-widest">Est. Next Salary</span>
                                <div className="text-2xl font-bold text-emerald-800 mt-1">₹{Math.max(0, estSalary).toLocaleString("en-IN")}</div>
                                <div className="text-xs text-emerald-600 mt-1">CTC minus EMIs</div>
                            </div>
                        </div>

                        {/* Active Loans Summary */}
                        {activeLoans.length > 0 && (
                            <div>
                                <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active Loans</h3>
                                <div className="grid gap-3">
                                    {activeLoans.map(loan => (
                                        <div key={loan.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                                            <div>
                                                <span className="text-sm font-bold">{loan.type}</span>
                                                <span className="text-xs text-muted-foreground ml-2">Disbursed: {loan.disbursement_date || "N/A"}</span>
                                            </div>
                                            <div className="flex gap-6 text-sm">
                                                <div><span className="text-muted-foreground text-xs">Principal: </span><span className="font-medium">₹{Number(loan.amount || 0).toLocaleString("en-IN")}</span></div>
                                                <div><span className="text-muted-foreground text-xs">Balance: </span><span className="font-bold text-amber-700">₹{Number(loan.balance_amount || 0).toLocaleString("en-IN")}</span></div>
                                                <div><span className="text-muted-foreground text-xs">EMI: </span><span className="font-medium">₹{Number(loan.monthly_emi || 0).toLocaleString("en-IN")}</span></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Running Ledger */}
                        <div>
                            <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-3">Running Ledger</h3>
                            {ledgerEntries.length === 0 ? (
                                <div className="text-center text-muted-foreground py-8 italic">No loan or advance transactions found.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead><tr className="border-b border-border">
                                            <th className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Date</th>
                                            <th className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Description</th>
                                            <th className="text-right py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Debit (₹)</th>
                                            <th className="text-right py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Credit (₹)</th>
                                            <th className="text-right py-3 px-4 font-semibold text-muted-foreground text-xs uppercase">Balance (₹)</th>
                                        </tr></thead>
                                        <tbody>
                                            {ledgerEntries.map((entry, idx) => (
                                                <tr key={idx} className={`border-b border-border/50 ${entry.type === "upcoming" ? "opacity-50 italic" : ""}`}>
                                                    <td className="py-3 px-4 font-mono text-xs">{entry.date}</td>
                                                    <td className="py-3 px-4">{entry.desc}</td>
                                                    <td className="py-3 px-4 text-right text-red-600 font-medium">{entry.debit > 0 ? entry.debit.toLocaleString("en-IN") : "—"}</td>
                                                    <td className="py-3 px-4 text-right text-emerald-600 font-medium">{entry.credit > 0 ? entry.credit.toLocaleString("en-IN") : "—"}</td>
                                                    <td className="py-3 px-4 text-right font-bold">{entry.balance.toLocaleString("en-IN")}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── PayslipModal ── */}
            <PayslipModal
                isOpen={!!selectedPayslip}
                onClose={() => { setSelectedPayslip(null); setSelectedPeriod(null); }}
                payslip={selectedPayslip}
                period={selectedPeriod}
            />

            {/* ── Document Viewer Modal ── */}
            {viewingDoc && (
                <div className="fixed inset-0 bg-black/60 grid place-items-center z-50" onClick={() => setViewingDoc(null)}>
                    <div className="bg-background rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <span className="pill text-[0.65rem] !bg-primary/10 !text-primary !border-primary/20 font-semibold">{viewingDoc.category}</span>
                                <span className="text-sm font-medium">{viewingDoc.file_name}</span>
                            </div>
                            <button onClick={() => setViewingDoc(null)} className="button button-secondary text-sm">✕ Close</button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            {viewingDoc.file_type === "pdf" ? (
                                <iframe src={viewingDoc.file_url} className="w-full h-[75vh] rounded-lg border border-border" />
                            ) : (
                                <img src={viewingDoc.file_url} alt={viewingDoc.file_name} className="max-w-full max-h-[75vh] mx-auto rounded-lg shadow-sm" />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Action Modals ── */}
            {confirmAction && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
                    <div className="card w-full max-w-sm">
                        <h2 className="text-lg font-bold mb-2">
                            {confirmAction.action === "DISABLE" ? "Disable Employee?" : confirmAction.action === "ENABLE" ? "Enable Employee?" : "Delete Employee Permanently?"}
                        </h2>
                        <p className="text-sm text-muted-foreground mb-6">
                            {confirmAction.action === "DELETE" 
                                ? "Are you sure you want to completely delete this employee? This will irreversibly remove all attendance, loans, payslips, and profile records."
                                : `Are you sure you want to ${confirmAction.action.toLowerCase()} this employee profile?`}
                        </p>
                        <div className="flex justify-end gap-3">
                            <button className="button button-secondary" onClick={() => setConfirmAction(null)} disabled={actionLoading}>Cancel</button>
                            <button className={`button ${confirmAction.action === "DELETE" ? "button-primary bg-red-600 border-red-600 hover:bg-red-700" : "button-primary"}`} onClick={confirmAction.action === "DELETE" ? executeDelete : toggleStatus} disabled={actionLoading}>
                                {actionLoading ? "Processing..." : "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {writeOffData && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 overflow-y-auto py-10">
                    <div className="card w-full max-w-[500px] my-auto">
                        <h2 className="text-lg font-bold mb-2">Notice: Active Debts</h2>
                        <p className="text-sm text-muted-foreground mb-4">You are marking this employee as Left, but they have outstanding balances. These will be written off:</p>
                        <div className="space-y-2 mb-6">
                            {writeOffData.loans.map(l => (
                                <div key={l.id} className="flex justify-between p-3 bg-muted rounded border border-border">
                                    <span className="text-sm">{l.type} - Principal ₹{Number(l.amount).toLocaleString()}</span>
                                    <span className="font-bold text-destructive">₹{Number(l.balance_amount).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button className="button button-secondary" onClick={() => setWriteOffData(null)}>Cancel</button>
                            <button className="button button-primary bg-red-600 border-red-600 hover:bg-red-700" onClick={executeWriteOff} disabled={actionLoading}>Confirm Write-off & Mark Left</button>
                        </div>
                    </div>
                </div>
            )}

            {writeBackData && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 overflow-y-auto py-10">
                    <div className="card w-full max-w-[500px] my-auto">
                        <h2 className="text-lg font-bold mb-2">Previous Debts Found</h2>
                        <p className="text-sm text-muted-foreground mb-4">Restore previously written off balances?</p>
                        <div className="space-y-2 mb-6">
                            {writeBackData.writeoffs.map(wo => (
                                <div key={wo.id} className="flex justify-between p-3 bg-muted rounded border border-border text-sm">
                                    <span>{wo.loans?.type || "LOAN"} (Written off)</span>
                                    <span className="font-bold">₹{Number(wo.amount).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button className="button button-secondary" onClick={() => setWriteBackData(null)}>Cancel</button>
                            <button className="button button-secondary" onClick={skipWriteBackAndActivate}>Skip Restoration</button>
                            <button className="button button-primary" onClick={executeWriteBack} disabled={actionLoading}>Restore & Re-activate</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
