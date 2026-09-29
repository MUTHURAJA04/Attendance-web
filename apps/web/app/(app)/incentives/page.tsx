"use client";

import { useState, useEffect, useMemo } from "react";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";
import { logAudit } from "../../../lib/audit";
import type { IncentiveRule, IncentiveType } from "../../../lib/types";

const AVAILABLE_ROLES = [
    { value: "ALL", label: "All Roles" },
    { value: "STAFF", label: "Staff" },
    { value: "MANAGER", label: "Manager" },
    { value: "KITCHEN", label: "Kitchen" },
    { value: "CASHIER", label: "Cashier" },
    { value: "BRANCH_MANAGER", label: "Branch Manager" },
    { value: "PAYROLL_MANAGER", label: "Payroll Manager" },
];

export default function IncentivesPage() {
    const { selectedBranch: globalBranch } = useTenant();
    const [rules, setRules] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [salesLoading, setSalesLoading] = useState(false);
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [showAddSales, setShowAddSales] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);
    const [savingRule, setSavingRule] = useState(false);

    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const [selectedMonth, setSelectedMonth] = useState(nowIST.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(nowIST.getFullYear());
    const [selectedBranchFilter, setSelectedBranchFilter] = useState("");
    const [sales, setSales] = useState<any[]>([]);

    // Rule Form State
    const [ruleName, setRuleName] = useState("");
    const [ruleBranchId, setRuleBranchId] = useState<string>("");
    const [ruleType, setRuleType] = useState<IncentiveType>("PERCENTAGE");
    const [minSales, setMinSales] = useState<number>(100000);
    const [incentiveAmount, setIncentiveAmount] = useState<number>(5);
    const [eligibleRoles, setEligibleRoles] = useState<string[]>(["ALL"]);

    // Sales Form State
    const [newSales, setNewSales] = useState({
        branch_id: "",
        amount: 0,
        date: new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().split("T")[0],
    });

    // Load initial rules and branches
    const loadInitialData = async () => {
        setLoading(true);
        const [rulesRes, branchesRes] = await Promise.all([
            supabaseBrowser.from("incentive_rules").select("*, branches(name)").order("created_at", { ascending: false }),
            supabaseBrowser.from("branches").select("*").eq("is_active", true),
        ]);

        if (rulesRes.data) setRules(rulesRes.data);
        if (branchesRes.data) setBranches(branchesRes.data);
        setLoading(false);
    };

    useEffect(() => {
        loadInitialData();
    }, []);

    // Set default branch in sales filter from tenant if active
    useEffect(() => {
        if (globalBranch?.id && !selectedBranchFilter) {
            setSelectedBranchFilter(globalBranch.id);
        }
    }, [globalBranch]);

    // Load Sales Ledger
    const loadSalesData = async () => {
        setSalesLoading(true);
        const startOfMonth = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
        const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
        const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
        const endOfMonth = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

        let query = supabaseBrowser
            .from("branch_daily_sales")
            .select("*, branches(name)")
            .gte("date", startOfMonth)
            .lt("date", endOfMonth)
            .order("date", { ascending: false });

        if (selectedBranchFilter) {
            query = query.eq("branch_id", selectedBranchFilter);
        }

        const { data } = await query;
        if (data) setSales(data);
        setSalesLoading(false);
    };

    useEffect(() => {
        loadSalesData();
    }, [selectedMonth, selectedYear, selectedBranchFilter]);

    // Role Toggle Handler (identical to Leave & Late Rules modal)
    const handleToggleRole = (role: string) => {
        if (role === "ALL") {
            setEligibleRoles(["ALL"]);
            return;
        }

        let updated = eligibleRoles.filter((r) => r !== "ALL");
        if (updated.includes(role)) {
            updated = updated.filter((r) => r !== role);
            if (updated.length === 0) updated = ["ALL"];
        } else {
            updated.push(role);
        }
        setEligibleRoles(updated);
    };

    const resetRuleForm = () => {
        setEditingRuleId(null);
        setRuleName("");
        setRuleBranchId(globalBranch?.id || "");
        setRuleType("PERCENTAGE");
        setMinSales(100000);
        setIncentiveAmount(5);
        setEligibleRoles(["ALL"]);
    };

    const handleOpenAddRule = () => {
        resetRuleForm();
        setShowRuleModal(true);
    };

    const handleEditRule = (rule: any) => {
        setEditingRuleId(rule.id);
        setRuleName(rule.name || "");
        setRuleBranchId(rule.branch_id || "");
        setRuleType(rule.type || "PERCENTAGE");
        setMinSales(Number(rule.target_amount || 0));
        setIncentiveAmount(Number(rule.incentive_amount || 0));
        
        let roles = ["ALL"];
        if (rule.role_id) {
            roles = rule.role_id.split(",").map((r: string) => r.trim()).filter(Boolean);
            if (roles.length === 0) roles = ["ALL"];
        }
        setEligibleRoles(roles);
        setShowRuleModal(true);
    };

    const handleDeleteRule = async (ruleId: string, name: string) => {
        if (!confirm(`Are you sure you want to delete incentive rule "${name || "this rule"}"?`)) return;
        const { error } = await supabaseBrowser.from("incentive_rules").delete().eq("id", ruleId);
        if (!error) {
            setRules(rules.filter((r) => r.id !== ruleId));
            logAudit("incentive_rule_deleted", { rule_id: ruleId, name }, { entityType: "incentive_rules", entityId: ruleId });
        } else {
            alert(`Error deleting rule: ${error.message}`);
        }
    };

    const handleSaveRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ruleName.trim()) {
            alert("Please enter a rule name.");
            return;
        }

        setSavingRule(true);
        const roleString = eligibleRoles.includes("ALL") ? "ALL" : eligibleRoles.join(",");
        const payload = {
            name: ruleName.trim(),
            branch_id: ruleBranchId || null,
            role_id: roleString,
            target_amount: Number(minSales),
            incentive_amount: Number(incentiveAmount),
            type: ruleType,
        };

        if (editingRuleId) {
            const { error } = await supabaseBrowser
                .from("incentive_rules")
                .update(payload)
                .eq("id", editingRuleId);

            if (!error) {
                logAudit("incentive_rule_updated", { rule_id: editingRuleId, ...payload }, { entityType: "incentive_rules", entityId: editingRuleId });
                setShowRuleModal(false);
                loadInitialData();
            } else {
                alert(`Error updating rule: ${error.message}`);
            }
        } else {
            const { error } = await supabaseBrowser.from("incentive_rules").insert([payload]);
            if (!error) {
                logAudit("incentive_rule_created", { ...payload }, { entityType: "incentive_rules" });
                setShowRuleModal(false);
                loadInitialData();
            } else {
                alert(`Error creating rule: ${error.message}`);
            }
        }
        setSavingRule(false);
    };

    const handleAddSales = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSales.branch_id) {
            setFeedback({ message: "Please select a branch.", type: "error" });
            return;
        }
        if (newSales.amount <= 0) {
            setFeedback({ message: "Sales amount must be greater than zero.", type: "error" });
            return;
        }
        setFeedback(null);
        const { error } = await supabaseBrowser.from("branch_daily_sales").upsert([{
            branch_id: newSales.branch_id,
            date: newSales.date,
            sales_amount: Number(newSales.amount),
        }], { onConflict: "branch_id,date" });

        if (!error) {
            logAudit("branch_daily_sales_logged", {
                branch_id: newSales.branch_id,
                date: newSales.date,
                amount: newSales.amount,
            }, { branchId: newSales.branch_id, entityType: "branch_daily_sales" });

            setFeedback({ message: "Sales record logged successfully!", type: "success" });
            loadSalesData();
            setTimeout(() => {
                setShowAddSales(false);
                setFeedback(null);
                setNewSales({
                    branch_id: "",
                    amount: 0,
                    date: new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().split("T")[0],
                });
            }, 1200);
        } else {
            setFeedback({ message: error.message, type: "error" });
        }
    };

    const totalSalesAmount = useMemo(() => {
        return sales.reduce((sum, s) => sum + Number(s.sales_amount || 0), 0);
    }, [sales]);

    if (loading) return <div className="centered">Loading incentive modules...</div>;

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <span>🎯</span> Incentive Rule Engine
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Define sales-target bonuses, configure role eligibility, and monitor monthly outlet performance.
                    </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                        type="button"
                        className="button button-secondary text-xs flex items-center gap-1.5"
                        onClick={() => {
                            setNewSales({
                                branch_id: selectedBranchFilter || (branches[0]?.id || ""),
                                amount: 0,
                                date: new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().split("T")[0],
                            });
                            setShowAddSales(true);
                        }}
                    >
                        📊 Log Daily Sales
                    </button>
                    <button
                        type="button"
                        className="button button-primary text-xs flex items-center gap-1.5"
                        onClick={handleOpenAddRule}
                    >
                        + New Incentive Rule
                    </button>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
                {/* Left Column: Active Incentive Rules */}
                <div className="flex flex-col gap-6">
                    <div className="card">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h2 className="text-base font-bold">Active Incentive Rules</h2>
                                <p className="text-xs text-muted-foreground">Performance targets for staff rewards</p>
                            </div>
                            <span className="pill pill-neutral text-xs font-mono">{rules.length} Rules</span>
                        </div>

                        {rules.length === 0 ? (
                            <div className="bg-muted/40 p-6 rounded-lg border text-center space-y-2">
                                <p className="text-sm font-semibold">No rules configured</p>
                                <p className="text-xs text-muted-foreground">
                                    Create target-based incentive rules to reward high-performing staff.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleOpenAddRule}
                                    className="button button-primary text-xs mt-2"
                                >
                                    + Add First Rule
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {rules.map((rule) => {
                                    const isPercentage = rule.type === "PERCENTAGE";
                                    const rolesList = rule.role_id ? rule.role_id.split(",") : ["ALL"];
                                    const isGlobal = !rule.branch_id;

                                    return (
                                        <div
                                            key={rule.id}
                                            className="p-3.5 rounded-xl border border-border bg-card hover:shadow-xs transition flex flex-col gap-2"
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-sm text-foreground">
                                                            {rule.name || "Sales Target Rule"}
                                                        </h3>
                                                        <span className={`pill text-[0.65rem] ${isGlobal ? "pill-neutral" : "pill-primary"}`}>
                                                            {isGlobal ? "🌐 Global (All Outlets)" : `🏢 ${rule.branches?.name || "Branch"}`}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        Min Sales Target: <strong className="text-foreground">₹{Number(rule.target_amount || 0).toLocaleString("en-IN")}</strong>
                                                    </p>
                                                </div>

                                                <span className="pill pill-success text-xs font-bold shrink-0">
                                                    {isPercentage ? `${rule.incentive_amount}% Basic` : `₹${Number(rule.incentive_amount || 0).toLocaleString("en-IN")} Bonus`}
                                                </span>
                                            </div>

                                            {/* Role Badges */}
                                            <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                                                <div className="flex items-center gap-1 flex-wrap">
                                                    <span className="text-[0.68rem] text-muted-foreground">Eligible:</span>
                                                    {rolesList.map((r: string) => (
                                                        <span key={r} className="pill text-[0.62rem] pill-neutral py-0 px-1.5 font-medium">
                                                            {r === "ALL" ? "All Roles" : r}
                                                        </span>
                                                    ))}
                                                </div>

                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEditRule(rule)}
                                                        className="button button-secondary h-6 px-2 text-[0.68rem]"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteRule(rule.id, rule.name)}
                                                        className="button button-secondary h-6 px-1.5 text-[0.68rem] text-destructive hover:bg-destructive/10"
                                                        title="Delete Rule"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="card bg-muted/30 border">
                        <h3 className="text-sm font-bold flex items-center gap-1.5">
                            <span>💡</span> How Incentive Engine Works
                        </h3>
                        <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                            Incentives are evaluated during monthly payroll generation. If an outlet achieves or exceeds the target sales revenue in that month, active employees in eligible roles receive the designated reward (% of base salary or fixed bonus) automatically on their payslips.
                        </p>
                    </div>
                </div>

                {/* Right Column: Performance Ledger */}
                <div className="card p-0 overflow-hidden">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border-b border-border bg-muted/20 gap-3">
                        <div>
                            <h2 className="text-base font-bold">Outlet Performance Ledger</h2>
                            <p className="text-xs text-muted-foreground">Daily sales logged across restaurant branches</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                            <select
                                className="input text-xs h-8"
                                value={selectedBranchFilter}
                                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                            >
                                <option value="">All Outlets</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="input text-xs h-8"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            >
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i + 1} value={i + 1}>
                                        {new Date(2000, i).toLocaleString("default", { month: "long" })}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="input text-xs h-8"
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                            >
                                {Array.from({ length: 5 }, (_, i) => (
                                    <option key={i} value={new Date().getFullYear() - i}>
                                        {new Date().getFullYear() - i}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {salesLoading ? (
                        <div className="centered py-12 text-muted-foreground text-xs">
                            Loading branch sales records...
                        </div>
                    ) : sales.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground space-y-2">
                            <span className="text-3xl block">📊</span>
                            <p className="text-sm font-semibold">No sales logged for this period</p>
                            <p className="text-xs">
                                Click &quot;Log Daily Sales&quot; above to record performance revenue for this month.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="role-table text-xs">
                                <thead>
                                    <tr>
                                        <th className="py-2.5 px-4">Date</th>
                                        <th className="py-2.5 px-4">Branch Location</th>
                                        <th className="py-2.5 px-4 text-right">Daily Sales Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {sales.map((s) => (
                                        <tr key={s.id} className="hover:bg-muted/30">
                                            <td className="py-2.5 px-4 font-mono">
                                                {new Date(s.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                            </td>
                                            <td className="py-2.5 px-4 font-medium">
                                                🏢 {s.branches?.name || "Branch"}
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-bold tabular-nums text-foreground">
                                                ₹{Number(s.sales_amount || 0).toLocaleString("en-IN")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-muted/60 border-t-2 border-border font-bold">
                                        <td colSpan={2} className="py-3 px-4 text-xs">
                                            Total Monthly Revenue
                                        </td>
                                        <td className="py-3 px-4 text-right text-sm text-primary font-bold tabular-nums">
                                            ₹{totalSalesAmount.toLocaleString("en-IN")}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* New / Edit Incentive Rule Modal */}
            {showRuleModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs grid place-items-center z-50 p-4 animate-in fade-in duration-150">
                    <div className="card w-full max-w-lg p-0 overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center">
                            <div>
                                <h2 className="text-base font-bold">
                                    {editingRuleId ? "Edit Incentive Rule" : "New Incentive Rule"}
                                </h2>
                                <p className="text-xs text-muted-foreground">Configure sales targets and role rewards</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowRuleModal(false)}
                                className="text-muted-foreground hover:text-foreground text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveRule} className="p-5 flex flex-col gap-4">
                            {/* Rule Name */}
                            <div className="form-group">
                                <label className="label text-xs">
                                    Rule Name <span className="text-destructive">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    className="input text-xs w-full"
                                    placeholder="e.g. Monthly Revenue Bonus"
                                    value={ruleName}
                                    onChange={(e) => setRuleName(e.target.value)}
                                />
                            </div>

                            {/* Branch Scope & Reward Type */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="form-group">
                                    <label className="label text-xs">Branch Scope</label>
                                    <select
                                        className="input text-xs w-full"
                                        value={ruleBranchId}
                                        onChange={(e) => setRuleBranchId(e.target.value)}
                                    >
                                        <option value="">🌐 All Outlets (Global)</option>
                                        {branches.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                🏢 {b.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="label text-xs">Reward Calculation Type</label>
                                    <select
                                        className="input text-xs w-full"
                                        value={ruleType}
                                        onChange={(e) => setRuleType(e.target.value as IncentiveType)}
                                    >
                                        <option value="PERCENTAGE">% of Base Salary</option>
                                        <option value="FIXED">Fixed Cash Amount (₹)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Target Amount & Reward Value */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="form-group">
                                    <label className="label text-xs">Min Monthly Sales Target (₹)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={5000}
                                        required
                                        className="input text-xs w-full"
                                        value={minSales}
                                        onChange={(e) => setMinSales(Number(e.target.value))}
                                    />
                                    <span className="text-[0.68rem] text-muted-foreground mt-0.5 block">
                                        Target revenue to trigger reward
                                    </span>
                                </div>

                                <div className="form-group">
                                    <label className="label text-xs">
                                        {ruleType === "PERCENTAGE" ? "Reward Percentage (%)" : "Reward Amount (₹)"}
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={ruleType === "PERCENTAGE" ? 0.5 : 100}
                                        required
                                        className="input text-xs w-full"
                                        value={incentiveAmount}
                                        onChange={(e) => setIncentiveAmount(Number(e.target.value))}
                                    />
                                    <span className="text-[0.68rem] text-muted-foreground mt-0.5 block">
                                        {ruleType === "PERCENTAGE" ? "Added on top of basic salary" : "Fixed bonus per eligible employee"}
                                    </span>
                                </div>
                            </div>

                            {/* Select Eligible Staff Roles (Pills matching Leave & Late Rules modal) */}
                            <div className="p-3.5 bg-muted/40 rounded-xl border border-border flex flex-col gap-2">
                                <label className="block text-xs font-semibold text-foreground">
                                    Select Eligible Staff Roles:
                                </label>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {AVAILABLE_ROLES.map((role) => {
                                        const isSelected = eligibleRoles.includes(role.value);
                                        return (
                                            <button
                                                key={role.value}
                                                type="button"
                                                onClick={() => handleToggleRole(role.value)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition cursor-pointer ${
                                                    isSelected
                                                        ? "bg-primary text-primary-foreground border-primary shadow-2xs font-semibold"
                                                        : "bg-background text-foreground border-border hover:bg-muted"
                                                }`}
                                            >
                                                {isSelected ? "✓ " : "+ "}
                                                {role.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[0.7rem] text-muted-foreground mt-1">
                                    Selecting &apos;All Roles&apos; applies this reward automatically to every active staff member in the chosen branch.
                                </p>
                            </div>

                            {/* Modal Actions */}
                            <div className="flex justify-end gap-2 border-t border-border pt-3">
                                <button
                                    type="button"
                                    className="button button-secondary text-xs"
                                    onClick={() => setShowRuleModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingRule}
                                    className="button button-primary text-xs"
                                >
                                    {savingRule ? "Saving..." : editingRuleId ? "Update Rule" : "Create Rule"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Log Sales Modal */}
            {showAddSales && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs grid place-items-center z-50 p-4 animate-in fade-in duration-150">
                    <div className="card w-full max-w-md p-0 overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center">
                            <div>
                                <h2 className="text-base font-bold">Log Branch Daily Sales</h2>
                                <p className="text-xs text-muted-foreground">Record daily revenue for performance tracking</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddSales(false);
                                    setFeedback(null);
                                }}
                                className="text-muted-foreground hover:text-foreground text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleAddSales} className="p-5 flex flex-col gap-4">
                            {feedback && (
                                <div
                                    className={`p-3 rounded-lg text-xs font-medium border ${
                                        feedback.type === "success"
                                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                            : "bg-destructive/10 text-destructive border-destructive/20"
                                    }`}
                                >
                                    {feedback.message}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="label text-xs">Branch Outlet <span className="text-destructive">*</span></label>
                                <select
                                    className="input text-xs w-full"
                                    required
                                    value={newSales.branch_id}
                                    onChange={(e) => setNewSales({ ...newSales, branch_id: e.target.value })}
                                >
                                    <option value="">Select Branch</option>
                                    {branches.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            🏢 {b.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="form-group">
                                    <label className="label text-xs">Daily Sales (₹) <span className="text-destructive">*</span></label>
                                    <input
                                        type="number"
                                        min={1}
                                        required
                                        className="input text-xs w-full"
                                        value={newSales.amount}
                                        onChange={(e) => setNewSales({ ...newSales, amount: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="label text-xs">Sales Date <span className="text-destructive">*</span></label>
                                    <input
                                        type="date"
                                        required
                                        className="input text-xs w-full"
                                        value={newSales.date}
                                        onChange={(e) => setNewSales({ ...newSales, date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 border-t border-border pt-3">
                                <button
                                    type="button"
                                    className="button button-secondary text-xs"
                                    onClick={() => {
                                        setShowAddSales(false);
                                        setFeedback(null);
                                    }}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="button button-primary text-xs">
                                    Log Sales Record
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
