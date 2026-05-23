import type { Payslip, PayrollPeriod } from "../lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

interface PayslipModalProps {
    isOpen: boolean;
    onClose: () => void;
    payslip: Payslip | null;
    period: PayrollPeriod | null;
}

export function PayslipModal({ isOpen, onClose, payslip, period }: PayslipModalProps) {
    if (!payslip || !period) return null;

    const emp = payslip.employees;
    const branchName = emp?.branches?.name || "N/A";

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl h-[90vh] overflow-y-auto print:max-w-none print:h-auto print:overflow-visible print:p-0 print:border-none print:shadow-none">
                <DialogHeader className="flex flex-row items-center justify-between print:hidden">
                    <div>
                        <DialogTitle>Payslip for {period.month}/{period.year}</DialogTitle>
                        <DialogDescription>Detailed salary breakup and attendance metrics.</DialogDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="button button-secondary h-8 px-3 text-xs" onClick={() => window.print()}>
                            🖨️ Print Slip
                        </button>
                        <button className="button bg-muted text-muted-foreground hover:bg-muted/80 h-8 px-3 text-xs border" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </DialogHeader>

                <div className="flex flex-col gap-6 mt-4 print:mt-0">
                    {/* Employee Context */}
                    <div className="bg-muted p-4 rounded-lg flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold mb-1">{emp?.full_name}</h2>
                            <p className="text-muted-foreground">{emp?.role} • {branchName}</p>
                        </div>
                        <div className="text-right">
                            <h3 className="text-2xl font-bold text-accent-1">₹{Number(payslip.net_pay).toLocaleString("en-IN")}</h3>
                            <p className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">Net Salary</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Attendance Summary */}
                        <div className="card bg-white h-auto print:border-border/50 print:shadow-none">
                            <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-4">Attendance Summary</h3>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Present / Half Days</span>
                                <span className="font-semibold">{Number(payslip.present_days || 0)} / {Number(payslip.half_days || 0)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Late Instances</span>
                                <span className="font-semibold">{Number(payslip.late_days || 0)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Approved Leaves</span>
                                <span className="font-semibold">{Number(payslip.leave_days || 0)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-border/50 text-destructive">
                                <span>Unapproved Absent</span>
                                <span className="font-semibold">{Number(payslip.absent_days || 0)}</span>
                            </div>
                        </div>

                        {/* Earnings */}
                        <div className="card bg-white h-auto print:border-border/50 print:shadow-none">
                            <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-4">Earnings</h3>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Basic Pay</span>
                                <span>₹{Number(payslip.basic_pay || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>House Rent Allowance (HRA)</span>
                                <span>₹{Number(payslip.hra || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Special Allowances</span>
                                <span>₹{Number(payslip.allowances || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-border/50">
                                <span>Overtime Pay</span>
                                <span>₹{Number(payslip.overtime_pay || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between py-2 border-border/50 text-primary">
                                <span>Incentives</span>
                                <span>₹{Number(payslip.incentives || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between py-3 mt-2 border-t border-border font-bold">
                                <span>Gross Pay</span>
                                <span>₹{Number(payslip.gross_pay || 0).toLocaleString("en-IN")}</span>
                            </div>
                        </div>

                        {/* Deductions - spans 2 columns on tablet/desktop */}
                        <div className="card bg-white md:col-span-2 print:border-border/50 print:shadow-none">
                            <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-4">Deductions</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span>Provident Fund (PF)</span>
                                    <span>₹{Number(payslip.pf_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50 text-destructive font-semibold">
                                    <span>Absence & Late Deductions</span>
                                    <span>₹{Number(payslip.late_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span>ESIC</span>
                                    <span>₹{Number(payslip.esi_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span>Loan Repayment EMI</span>
                                    <span>₹{Number(payslip.loan_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-b border-border/50">
                                    <span>Professional Tax (PT)</span>
                                    <span>₹{Number(payslip.pt_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between py-2 border-border/50">
                                    <span>TDS</span>
                                    <span>₹{Number(payslip.tds_deduction || 0).toLocaleString("en-IN")}</span>
                                </div>
                            </div>
                            <div className="flex justify-between py-3 mt-4 border-t border-border font-bold">
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
