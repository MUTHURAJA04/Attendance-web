"use client";

import { useEffect, useState } from "react";
import type { Payslip, PayrollPeriod } from "../lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { supabaseBrowser } from "../lib/supabase/client";

interface PayslipModalProps {
    isOpen: boolean;
    onClose: () => void;
    payslip: Payslip | null;
    period: PayrollPeriod | null;
}

export function PayslipModal({ isOpen, onClose, payslip, period }: PayslipModalProps) {
    const [loanBalance, setLoanBalance] = useState<number>(0);

    useEffect(() => {
        async function fetchLoanBalance() {
            if (!payslip?.employee_id) return;
            const { data, error } = await supabaseBrowser
                .from("loans")
                .select("balance_amount")
                .eq("employee_id", payslip.employee_id)
                .eq("status", "ACTIVE");

            if (!error && data && data.length > 0) {
                const totalBal = data.reduce((sum, l) => sum + Number(l.balance_amount || 0), 0);
                setLoanBalance(totalBal);
            } else {
                setLoanBalance(0);
            }
        }

        if (isOpen && payslip?.employee_id) {
            fetchLoanBalance();
        }
    }, [isOpen, payslip?.employee_id, payslip?.id]);

    const handlePrint = () => {
        document.body.classList.add("printing-payslip");
        window.print();
        setTimeout(() => {
            document.body.classList.remove("printing-payslip");
        }, 1000);
    };

    if (!payslip || !period) return null;

    const emp = payslip.employees;
    const branchName = emp?.branches?.name || "N/A";

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl h-[90vh] overflow-y-auto print:max-w-none print:h-auto print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none print:static">
                <DialogHeader className="flex flex-row items-center justify-between print:hidden">
                    <div>
                        <DialogTitle>Payslip for {period.month}/{period.year}</DialogTitle>
                        <DialogDescription>Detailed salary breakup and attendance metrics.</DialogDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="button button-secondary h-8 px-3 text-xs" onClick={handlePrint}>
                            🖨️ Print Slip
                        </button>
                        <button className="button bg-muted text-muted-foreground hover:bg-muted/80 h-8 px-3 text-xs border" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </DialogHeader>

                <div id="payslip-printable-content" className="flex flex-col gap-6 mt-4 print:mt-0 print:gap-4 print:w-full print:bg-white print:p-0">
                    {/* Employee Context */}
                    <div className="bg-muted p-4 rounded-lg flex justify-between items-center print:bg-muted/40 print:border print:border-border/60">
                        <div>
                            <h2 className="text-xl font-bold mb-1 print:text-black">{emp?.full_name}</h2>
                            <p className="text-muted-foreground print:text-gray-700">{emp?.role} • {branchName}</p>
                        </div>
                        <div className="text-right">
                            <h3 className="text-2xl font-bold text-accent-1 print:text-black">₹{Number(payslip.net_pay).toLocaleString("en-IN")}</h3>
                            <p className="text-muted-foreground text-sm uppercase tracking-wider font-semibold print:text-gray-700">Net Salary</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6 print:gap-4">
                        {/* Attendance Summary */}
                        <div className="card bg-white h-auto print:border print:border-border/50 print:shadow-none print:p-4">
                            <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-4 print:text-black print:font-bold">Attendance Summary</h3>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Present / Half Days</span>
                                <span className="font-semibold print:text-black">{Number(payslip.present_days || 0)} / {Number(payslip.half_days || 0)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Late Instances</span>
                                <span className="font-semibold print:text-black">{Number(payslip.late_days || 0)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Approved Leaves</span>
                                <span className="font-semibold print:text-black">{Number(payslip.leave_days || 0)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-border/50 text-destructive print:text-red-700">
                                <span>Unapproved Absent</span>
                                <span className="font-semibold">{Number(payslip.absent_days || 0)}</span>
                            </div>
                        </div>

                        {/* Earnings */}
                        <div className="card bg-white h-auto print:border print:border-border/50 print:shadow-none print:p-4">
                            <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-4 print:text-black print:font-bold">Earnings</h3>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Basic Pay</span>
                                <span className="print:text-black">₹{Number(payslip.basic_pay || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>House Rent Allowance (HRA)</span>
                                <span className="print:text-black">₹{Number(payslip.hra || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Special Allowances</span>
                                <span className="print:text-black">₹{Number(payslip.allowances || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Overtime Pay</span>
                                <span className="print:text-black">₹{Number(payslip.overtime_pay || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between py-2 border-border/50 text-primary print:text-black">
                                <span>Incentives</span>
                                <span>₹{Number(payslip.incentives || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between py-3 mt-2 border-t border-border font-bold print:text-black">
                                <span>Gross Pay</span>
                                <span>₹{Number(payslip.gross_pay || 0).toLocaleString("en-IN")}</span>
                            </div>
                        </div>

                        {/* Deductions - spans 2 columns on tablet/desktop and print */}
                        <div className="card bg-white md:col-span-2 print:col-span-2 print:border print:border-border/50 print:shadow-none print:p-4">
                            <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-4 print:text-black print:font-bold">Deductions</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-x-12 gap-y-2">
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span>Provident Fund (PF)</span>
                                    <span className="print:text-black">₹{Number(payslip.pf_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50 text-destructive print:text-red-700 font-semibold">
                                    <span>Absence & Late Deductions</span>
                                    <span>₹{Number(payslip.late_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span>ESIC</span>
                                    <span className="print:text-black">₹{Number(payslip.esi_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span>Loan Repayment EMI</span>
                                    <span className="print:text-black">₹{Number(payslip.loan_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span>Professional Tax (PT)</span>
                                    <span className="print:text-black">₹{Number(payslip.pt_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span>TDS</span>
                                    <span className="print:text-black">₹{Number(payslip.tds_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50 col-span-1 md:col-span-2 print:col-span-2 font-medium text-foreground print:text-black">
                                    <span>Balance Loan</span>
                                    <span className="font-semibold text-foreground print:text-black">
                                        ₹{Number(loanBalance).toLocaleString("en-IN")}
                                    </span>
                                </div>
                            </div>
                            <div className="flex justify-between py-3 mt-4 border-t border-border font-bold print:text-black">
                                <span>Total Deductions</span>
                                <span>₹{(
                                    Number(payslip.pf_deduction || 0) +
                                    Number(payslip.esi_deduction || 0) +
                                    Number(payslip.pt_deduction || 0) +
                                    Number(payslip.tds_deduction || 0) +
                                    Number(payslip.loan_deduction || 0) +
                                    Number(payslip.late_deduction || 0)
                                ).toLocaleString("en-IN")}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
