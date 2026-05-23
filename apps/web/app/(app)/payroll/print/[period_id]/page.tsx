"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../../../lib/supabase/client";
import { useTenant } from "../../../../../components/TenantContext";
import type { Payslip, PayrollPeriod } from "../../../../../lib/types";

export default function BulkPrintPayslips() {
    const params = useParams();
    const router = useRouter();
    const { selectedBranch, selectedOrg } = useTenant();

    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [period, setPeriod] = useState<PayrollPeriod | null>(null);
    const [orgName, setOrgName] = useState<string>("Company Name");
    const [branchName, setBranchName] = useState<string>("Branch Name");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const periodId = params.period_id as string;
        if (!periodId || !selectedBranch) {
            setLoading(false);
            return;
        }

        async function loadData() {
            setLoading(true);

            // Fetch Organization details
            if (selectedOrg) {
                const { data: orgData } = await supabaseBrowser.from('organizations').select('name').eq('id', selectedOrg.id).single();
                if (orgData) setOrgName(orgData.name);
            }

            // Fetch Branch details
            if (selectedBranch) {
                const { data: branchData } = await supabaseBrowser.from('branches').select('name').eq('id', selectedBranch.id).single();
                if (branchData) setBranchName(branchData.name);
            }

            // Fetch Period details
            const { data: periodData } = await supabaseBrowser.from('payroll_periods').select('*').eq('id', periodId).single();
            if (periodData) setPeriod(periodData);

            // Fetch ALL Payslips for this branch and period
            const { data: slipData } = await supabaseBrowser
                .from('payslips')
                .select(`
                    *,
                    employees!inner (
                        full_name,
                        role,
                        branch_id,
                        branches ( name )
                    )
                `)
                .eq('period_id', periodId)
                .eq('employees.branch_id', selectedBranch?.id);

            if (slipData) {
                setPayslips(slipData as any);
            }

            setLoading(false);
        }

        loadData();
    }, [params.period_id, selectedBranch, selectedOrg]);

    // Automatically trigger print when loaded
    useEffect(() => {
        if (!loading && payslips.length > 0) {
            // Small delay to ensure CSS and DOM is fully painted
            setTimeout(() => {
                window.print();
            }, 500);
        }
    }, [loading, payslips]);

    if (!selectedBranch) {
        return <div className="p-8 text-center bg-destructive/10 text-destructive rounded-lg m-8">Please select a branch from the top navigation to print payslips.</div>;
    }

    if (loading) {
        return <div className="p-8 text-center text-muted-foreground">Loading payslips for printing...</div>;
    }

    if (payslips.length === 0) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold mb-4">No Payslips Found</h2>
                <p className="text-muted-foreground mb-4">There are no generated payslips for this period in the selected branch.</p>
                <button className="button button-primary" onClick={() => router.back()}>Go Back</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 print:bg-white flex flex-col items-center py-8 print:py-0">
            {/* Action Bar (Hidden when printing) */}
            <div className="w-[148mm] flex justify-between items-center mb-6 print:hidden">
                <button className="button bg-white border shadow-sm h-9 px-4" onClick={() => router.back()}>
                    &larr; Back to Payroll
                </button>
                <div className="flex gap-2">
                    <button className="button button-primary shadow-sm h-9 px-4" onClick={() => window.print()}>
                        🖨️ Print Now
                    </button>
                </div>
            </div>

            {/* A5 Print Containers */}
            <div className="print-container">
                <style dangerouslySetInnerHTML={{
                    __html: `
                    @page {
                        size: A5 portrait;
                        margin: 10mm;
                    }
                    @media print {
                        body { background: white; }
                        .print-page {
                            page-break-after: always;
                            box-shadow: none !important;
                            border: none !important;
                            border-radius: 0 !important;
                            margin: 0 !important;
                            width: 100% !important;
                            height: 100% !important;
                        }
                        /* Remove the last page break */
                        .print-page:last-child {
                            page-break-after: auto;
                        }
                    }
                `}} />

                {payslips.map((slip, index) => {
                    const emp = slip.employees as any;
                    return (
                        <div key={slip.id} className="print-page w-[148mm] min-h-[210mm] bg-white border border-gray-200 shadow-md mb-8 mx-auto p-6 rounded-md flex flex-col relative text-[11px] leading-relaxed">

                            {/* Company Header */}
                            <div className="text-center border-b-2 border-primary/20 pb-4 mb-4">
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight uppercase">{orgName}</h1>
                                <p className="text-gray-600 font-medium">{branchName}</p>
                            </div>

                            {/* Payslip Title */}
                            <div className="text-center mb-6">
                                <h2 className="text-base font-bold text-primary tracking-wider uppercase bg-primary/5 inline-block px-4 py-1 rounded-full">Payslip for {period?.month}/{period?.year}</h2>
                            </div>

                            {/* Employee Details Row */}
                            <div className="flex justify-between items-end mb-6 bg-gray-50 p-3 rounded-md border border-gray-100">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">{emp?.full_name}</h3>
                                    <p className="text-gray-500 uppercase tracking-widest text-[9px] mt-0.5">{emp?.role}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-gray-500 uppercase tracking-widest text-[9px] mb-0.5">Net Salary</p>
                                    <h3 className="text-lg font-bold text-accent-1">₹{Number(slip.net_pay || 0).toLocaleString("en-IN")}</h3>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                                {/* Left Column: Attendance & Earnings */}
                                <div className="flex flex-col gap-4">
                                    {/* Attendance */}
                                    <div>
                                        <h4 className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2 border-b pb-1">Attendance</h4>
                                        <div className="space-y-1.5 pt-1">
                                            <div className="flex justify-between items-center"><span className="text-gray-600">Present/Half</span><span className="font-semibold text-gray-900">{Number(slip.present_days || 0)} / {Number(slip.half_days || 0)}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">Late Days</span><span className="font-semibold text-gray-900">{Number(slip.late_days || 0)}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">Leaves</span><span className="font-semibold text-gray-900">{Number(slip.leave_days || 0)}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">Absent</span><span className="font-semibold text-destructive">{Number(slip.absent_days || 0)}</span></div>
                                        </div>
                                    </div>

                                    {/* Earnings */}
                                    <div>
                                        <h4 className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2 border-b pb-1">Earnings</h4>
                                        <div className="space-y-1.5 pt-1">
                                            <div className="flex justify-between items-center"><span className="text-gray-600">Basic Pay</span><span className="font-medium text-gray-900">₹{Number(slip.basic_pay || 0).toLocaleString("en-IN")}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">HRA</span><span className="font-medium text-gray-900">₹{Number(slip.hra || 0).toLocaleString("en-IN")}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">Allowances</span><span className="font-medium text-gray-900">₹{Number(slip.allowances || 0).toLocaleString("en-IN")}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">Overtime</span><span className="font-medium text-gray-900">₹{Number(slip.overtime_pay || 0).toLocaleString("en-IN")}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">Incentives</span><span className="font-medium text-gray-900">₹{Number(slip.incentives || 0).toLocaleString("en-IN")}</span></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Deductions & Totals */}
                                <div className="flex flex-col gap-4">
                                    {/* Deductions */}
                                    <div>
                                        <h4 className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2 border-b pb-1">Deductions</h4>
                                        <div className="space-y-1.5 pt-1">
                                            <div className="flex justify-between items-center"><span className="text-gray-600">PF</span><span className="font-medium text-gray-900">₹{Number(slip.pf_deduction || 0).toLocaleString("en-IN")}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600 text-destructive">Absence/Late</span><span className="font-medium text-destructive">₹{Number(slip.late_deduction || 0).toLocaleString("en-IN")}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">ESIC</span><span className="font-medium text-gray-900">₹{Number(slip.esi_deduction || 0).toLocaleString("en-IN")}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">Loan EMI</span><span className="font-medium text-gray-900">₹{Number(slip.loan_deduction || 0).toLocaleString("en-IN")}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">PT</span><span className="font-medium text-gray-900">₹{Number(slip.pt_deduction || 0).toLocaleString("en-IN")}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-gray-600">TDS</span><span className="font-medium text-gray-900">₹{Number(slip.tds_deduction || 0).toLocaleString("en-IN")}</span></div>
                                        </div>
                                    </div>

                                    {/* Totals Box */}
                                    <div className="mt-auto bg-gray-50 border border-gray-200 rounded-md p-3">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-gray-500 font-bold uppercase tracking-wider text-[9px]">Gross Pay</span>
                                            <span className="font-bold text-gray-900 text-[11px]">₹{Number(slip.gross_pay || 0).toLocaleString("en-IN")}</span>
                                        </div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-gray-500 font-bold uppercase tracking-wider text-[9px]">Total Deductions</span>
                                            <span className="font-bold text-gray-900 text-[11px]">₹{(
                                                Number(slip.pf_deduction || 0) +
                                                Number(slip.esi_deduction || 0) +
                                                Number(slip.pt_deduction || 0) +
                                                Number(slip.tds_deduction || 0) +
                                                Number(slip.loan_deduction || 0) +
                                                Number(slip.late_deduction || 0)
                                            ).toLocaleString("en-IN")}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-200">
                                            <span className="text-accent-1 font-black uppercase tracking-widest text-[10px]">Net Payable</span>
                                            <span className="text-accent-1 font-black text-sm">₹{Number(slip.net_pay || 0).toLocaleString("en-IN")}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Signatures */}
                            <div className="mt-auto pt-10 flex justify-between items-end border-t border-gray-100">
                                <div className="text-center w-32 border-t border-gray-300 pt-1">
                                    <p className="text-[9px] text-gray-500 uppercase tracking-widest">Employer Auth</p>
                                </div>
                                <div className="text-center w-32 border-t border-gray-300 pt-1">
                                    <p className="text-[9px] text-gray-500 uppercase tracking-widest">Employee Sign</p>
                                </div>
                            </div>

                            <div className="absolute bottom-2 left-0 right-0 text-center text-[8px] text-gray-300">
                                Generated systematically on {new Date().toLocaleDateString('en-IN')}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
