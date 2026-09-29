"use client";

import React, { useState, useEffect } from "react";
import { supabaseBrowser } from "../lib/supabase/client";
import { logAudit } from "../lib/audit";
import type { BranchRule, BranchRuleType, Employee } from "../lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

const AVAILABLE_ROLES = [
    { value: "ALL", label: "All Roles" },
    { value: "STAFF", label: "Staff" },
    { value: "MANAGER", label: "Manager" },
    { value: "KITCHEN", label: "Kitchen" },
    { value: "CASHIER", label: "Cashier" },
    { value: "BRANCH_MANAGER", label: "Branch Manager" },
    { value: "PAYROLL_MANAGER", label: "Payroll Manager" },
];

const LEAVE_TYPES = [
    { value: "ALL", label: "All Leave Types" },
    { value: "APPROVED", label: "Approved Leave" },
    { value: "UNAPPROVED", label: "Unapproved / Pending Leave" },
    { value: "UNINFORMED_ABSENT", label: "Uninformed Absence (No Show)" },
];

interface BranchRuleBuilderProps {
    isOpen: boolean;
    onClose: () => void;
    branchId: string;
    branchName: string;
    employees?: Employee[];
    onRulesUpdated?: () => void;
}

export function BranchRuleBuilder({
    isOpen,
    onClose,
    branchId,
    branchName,
    employees = [],
    onRulesUpdated,
}: BranchRuleBuilderProps) {
    const [rules, setRules] = useState<BranchRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<string>("ALL");
    const [isEditing, setIsEditing] = useState(false);
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Form State
    const [ruleType, setRuleType] = useState<BranchRuleType>("LATE_COMING");
    const [title, setTitle] = useState("");
    const [thresholdMinutes, setThresholdMinutes] = useState(30);
    const [deductionPercentage, setDeductionPercentage] = useState(10);
    const [rateMultiplier, setRateMultiplier] = useState(1.5);
    const [leaveType, setLeaveType] = useState("UNAPPROVED");
    const [eligibleRoles, setEligibleRoles] = useState<string[]>(["ALL"]);
    const [eligibleEmployeeIds, setEligibleEmployeeIds] = useState<string[]>([]);
    const [isActive, setIsActive] = useState(true);
    const [eligibilityMode, setEligibilityMode] = useState<"ROLES" | "CUSTOM_EMPLOYEES">("ROLES");

    // Staff Selection State
    const [branchEmployees, setBranchEmployees] = useState<Employee[]>(employees);
    const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");

    // Sync employees list
    useEffect(() => {
        if (employees && employees.length > 0) {
            setBranchEmployees(employees);
        } else if (branchId) {
            supabaseBrowser
                .from("employees")
                .select("*")
                .eq("branch_id", branchId)
                .eq("status", "ACTIVE")
                .then(({ data }) => {
                    if (data) setBranchEmployees(data as Employee[]);
                });
        }
    }, [employees, branchId, isOpen]);

    async function loadRules() {
        setLoading(true);
        const { data, error } = await supabaseBrowser
            .from("branch_rules")
            .select("*")
            .or(`branch_id.eq.${branchId},branch_id.is.null`)
            .order("created_at", { ascending: false });

        if (!error && data) {
            setRules(data as BranchRule[]);
        }
        setLoading(false);
    }

    useEffect(() => {
        if (isOpen) {
            loadRules();
            resetForm();
        }
    }, [isOpen, branchId]);

    const resetForm = () => {
        setIsEditing(false);
        setEditingRuleId(null);
        setRuleType("LATE_COMING");
        setTitle("");
        setThresholdMinutes(30);
        setDeductionPercentage(10);
        setRateMultiplier(1.5);
        setLeaveType("UNAPPROVED");
        setEligibleRoles(["ALL"]);
        setEligibleEmployeeIds([]);
        setIsActive(true);
        setEligibilityMode("ROLES");
        setEmployeeSearchQuery("");
    };

    const handleEditRule = (rule: BranchRule) => {
        setEditingRuleId(rule.id);
        setRuleType(rule.rule_type);
        setTitle(rule.title);
        setThresholdMinutes(Number(rule.threshold_minutes || 0));
        setDeductionPercentage(Number(rule.deduction_percentage || 0));
        setRateMultiplier(Number(rule.rate_multiplier || 1.0));
        setLeaveType(rule.leave_type || "ALL");
        setEligibleRoles(rule.eligible_roles && rule.eligible_roles.length > 0 ? rule.eligible_roles : ["ALL"]);
        setEligibleEmployeeIds(rule.eligible_employee_ids || []);
        setIsActive(rule.is_active);
        setEligibilityMode((rule.eligible_employee_ids && rule.eligible_employee_ids.length > 0) ? "CUSTOM_EMPLOYEES" : "ROLES");
        setEmployeeSearchQuery("");
        setIsEditing(true);
    };

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

    const handleToggleEmployee = (empId: string) => {
        if (eligibleEmployeeIds.includes(empId)) {
            setEligibleEmployeeIds(eligibleEmployeeIds.filter((id) => id !== empId));
        } else {
            setEligibleEmployeeIds([...eligibleEmployeeIds, empId]);
        }
    };

    const handleToggleRuleActive = async (rule: BranchRule) => {
        const nextState = !rule.is_active;
        const { error } = await supabaseBrowser
            .from("branch_rules")
            .update({ is_active: nextState })
            .eq("id", rule.id);

        if (!error) {
            setRules(rules.map((r) => (r.id === rule.id ? { ...r, is_active: nextState } : r)));
            logAudit(`branch_rule_${nextState ? "activated" : "deactivated"}`, {
                rule_id: rule.id,
                title: rule.title,
                branch_id: branchId,
            }, { branchId, entityType: "branch_rules", entityId: rule.id });
            onRulesUpdated?.();
        }
    };

    const handleDeleteRule = async (ruleId: string) => {
        if (!confirm("Are you sure you want to delete this rule?")) return;
        const { error } = await supabaseBrowser.from("branch_rules").delete().eq("id", ruleId);
        if (!error) {
            setRules(rules.filter((r) => r.id !== ruleId));
            logAudit("branch_rule_deleted", { rule_id: ruleId, branch_id: branchId }, { branchId, entityType: "branch_rules", entityId: ruleId });
            onRulesUpdated?.();
        }
    };

    const handleSaveRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            alert("Please enter a title for this rule.");
            return;
        }

        setSaving(true);

        const payload: Partial<BranchRule> = {
            branch_id: branchId,
            rule_type: ruleType,
            title: title.trim(),
            threshold_minutes: ruleType === "LEAVE_POLICY" ? 0 : Number(thresholdMinutes),
            deduction_percentage: ruleType === "OVERTIME" ? 0 : Number(deductionPercentage),
            rate_multiplier: ruleType === "OVERTIME" ? Number(rateMultiplier) : 1.0,
            leave_type: ruleType === "LEAVE_POLICY" ? leaveType : null,
            eligible_roles: eligibilityMode === "ROLES" ? eligibleRoles : [],
            eligible_employee_ids: eligibilityMode === "CUSTOM_EMPLOYEES" ? eligibleEmployeeIds : [],
            is_active: isActive,
        };

        if (editingRuleId) {
            const { error } = await supabaseBrowser
                .from("branch_rules")
                .update(payload)
                .eq("id", editingRuleId);

            if (error) {
                if (error.message.includes("schema cache") || error.message.includes("branch_rules")) {
                    alert("Database table 'branch_rules' not found. Please run migration 20260523000003_branch_rules.sql in your Supabase SQL Editor.");
                } else {
                    alert(`Error updating rule: ${error.message}`);
                }
            } else {
                logAudit("branch_rule_updated", { rule_id: editingRuleId, ...payload }, { branchId, entityType: "branch_rules", entityId: editingRuleId });
                resetForm();
                await loadRules();
                onRulesUpdated?.();
            }
        } else {
            const { error } = await supabaseBrowser
                .from("branch_rules")
                .insert([payload]);

            if (error) {
                if (error.message.includes("schema cache") || error.message.includes("branch_rules")) {
                    alert("Database table 'branch_rules' not found. Please run migration 20260523000003_branch_rules.sql in your Supabase SQL Editor.");
                } else {
                    alert(`Error creating rule: ${error.message}`);
                }
            } else {
                logAudit("branch_rule_created", { ...payload }, { branchId, entityType: "branch_rules" });
                resetForm();
                await loadRules();
                onRulesUpdated?.();
            }
        }
        setSaving(false);
    };

    const filteredRules = filterType === "ALL"
        ? rules
        : rules.filter((r) => r.rule_type === filterType);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6">
                <DialogHeader className="flex flex-row items-center justify-between border-b pb-4 mb-6">
                    <div>
                        <DialogTitle>Leave & Late Rules — {branchName}</DialogTitle>
                        <DialogDescription>
                            Configure automated salary deductions and overtime payout rules for this location.
                        </DialogDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isEditing && (
                            <button
                                className="button button-primary h-8 px-3 text-xs"
                                onClick={() => {
                                    resetForm();
                                    setIsEditing(true);
                                }}
                            >
                                + New Rule
                            </button>
                        )}
                        <button
                            className="button bg-muted text-muted-foreground hover:bg-muted/80 h-8 px-3 text-xs border"
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </DialogHeader>

                {isEditing ? (
                    <form onSubmit={handleSaveRule} className="flex flex-col gap-6 animate-in fade-in-50 duration-150">
                        <div className="flex items-center justify-between bg-muted/60 p-4 rounded-lg border">
                            <h3 className="font-semibold text-base">
                                {editingRuleId ? "Edit Rule" : "Create New Branch Rule"}
                            </h3>
                            <button
                                type="button"
                                onClick={resetForm}
                                className="text-xs text-muted-foreground hover:text-foreground underline"
                            >
                                Cancel & View List
                            </button>
                        </div>

                        {/* Rule Type Selector */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setRuleType("LATE_COMING");
                                    if (!title || title.includes("Overtime") || title.includes("Leave")) {
                                        setTitle("Late Arrival Penalty");
                                    }
                                }}
                                className={`p-4 rounded-lg border text-left flex flex-col gap-1 transition ${ruleType === "LATE_COMING"
                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                    : "border-border hover:bg-muted/50"
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sm">⏱️ Late Coming</span>
                                    {ruleType === "LATE_COMING" && <span className="pill pill-success text-[0.65rem]">Selected</span>}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    Deduct salary % when check-in exceeds threshold.
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setRuleType("LEAVE_POLICY");
                                    if (!title || title.includes("Overtime") || title.includes("Late")) {
                                        setTitle("Unapproved Leave Policy");
                                    }
                                }}
                                className={`p-4 rounded-lg border text-left flex flex-col gap-1 transition ${ruleType === "LEAVE_POLICY"
                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                    : "border-border hover:bg-muted/50"
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sm">🏖️ Leave Policy</span>
                                    {ruleType === "LEAVE_POLICY" && <span className="pill pill-success text-[0.65rem]">Selected</span>}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    Deduct daily rate % for unapproved or uninformed leaves.
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setRuleType("OVERTIME");
                                    if (!title || title.includes("Penalty") || title.includes("Leave")) {
                                        setTitle("Overtime Payout Rule");
                                    }
                                }}
                                className={`p-4 rounded-lg border text-left flex flex-col gap-1 transition ${ruleType === "OVERTIME"
                                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                                    : "border-border hover:bg-muted/50"
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sm">⚡ Overtime (OT)</span>
                                    {ruleType === "OVERTIME" && <span className="pill pill-success text-[0.65rem]">Selected</span>}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    Min OT duration and payout hourly rate multiplier.
                                </span>
                            </button>
                        </div>

                        {/* Title & Basic Config */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider text-muted-foreground">
                                    Rule Title <span className="text-destructive">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-3 py-2 text-sm border rounded bg-background"
                                    placeholder="e.g. Late by > 30m = 10% deduction"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                />
                            </div>

                            <div className="flex items-center gap-3 pt-6">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={(e) => setIsActive(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                    <span className="ml-3 text-sm font-medium">
                                        Rule Status: {isActive ? <span className="text-emerald-600 font-bold">Active</span> : <span className="text-muted-foreground">Inactive</span>}
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Dynamic Parameters based on Rule Type */}
                        <div className="p-4 bg-muted/40 border rounded-lg flex flex-col gap-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Parameter Configurations
                            </h4>

                            {ruleType === "LATE_COMING" && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium mb-1">
                                            Late Grace Threshold (Minutes)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={1}
                                                max={300}
                                                required
                                                className="w-full px-3 py-2 text-sm border rounded bg-background"
                                                value={thresholdMinutes}
                                                onChange={(e) => setThresholdMinutes(Number(e.target.value))}
                                            />
                                            <span className="text-xs text-muted-foreground shrink-0">mins late</span>
                                        </div>
                                        <p className="text-[0.7rem] text-muted-foreground mt-1">
                                            Triggers when arrival is past scheduled time by this many minutes.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium mb-1">
                                            Salary Deduction (% of Daily Salary)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={0}
                                                max={100}
                                                step={1}
                                                required
                                                className="w-full px-3 py-2 text-sm border rounded bg-background"
                                                value={deductionPercentage}
                                                onChange={(e) => setDeductionPercentage(Number(e.target.value))}
                                            />
                                            <span className="text-xs text-muted-foreground shrink-0">%</span>
                                        </div>
                                        <p className="text-[0.7rem] text-muted-foreground mt-1">
                                            e.g., 25% of 1 day&apos;s basic salary per late arrival.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {ruleType === "LEAVE_POLICY" && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium mb-1">
                                            Applicable Leave Type
                                        </label>
                                        <select
                                            className="w-full px-3 py-2 text-sm border rounded bg-background"
                                            value={leaveType}
                                            onChange={(e) => setLeaveType(e.target.value)}
                                        >
                                            {LEAVE_TYPES.map((lt) => (
                                                <option key={lt.value} value={lt.value}>
                                                    {lt.label}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-[0.7rem] text-muted-foreground mt-1">
                                            Which absence condition applies to this penalty rule.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium mb-1">
                                            Deduction Multiplier (% of Daily Salary)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={0}
                                                max={300}
                                                step={5}
                                                required
                                                className="w-full px-3 py-2 text-sm border rounded bg-background"
                                                value={deductionPercentage}
                                                onChange={(e) => setDeductionPercentage(Number(e.target.value))}
                                            />
                                            <span className="text-xs text-muted-foreground shrink-0">%</span>
                                        </div>
                                        <p className="text-[0.7rem] text-muted-foreground mt-1">
                                            100% = 1x daily rate | 150% = 1.5x daily rate | 200% = 2x daily rate.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {ruleType === "OVERTIME" && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium mb-1">
                                            Minimum Extra Threshold (Minutes)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={0}
                                                max={300}
                                                step={15}
                                                required
                                                className="w-full px-3 py-2 text-sm border rounded bg-background"
                                                value={thresholdMinutes}
                                                onChange={(e) => setThresholdMinutes(Number(e.target.value))}
                                            />
                                            <span className="text-xs text-muted-foreground shrink-0">mins</span>
                                        </div>
                                        <p className="text-[0.7rem] text-muted-foreground mt-1">
                                            Minimum OT minutes before extra hours qualify for payout (e.g. 60 min).
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium mb-1">
                                            OT Payout Rate Multiplier
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={0.5}
                                                max={5}
                                                step={0.1}
                                                required
                                                className="w-full px-3 py-2 text-sm border rounded bg-background"
                                                value={rateMultiplier}
                                                onChange={(e) => setRateMultiplier(Number(e.target.value))}
                                            />
                                            <span className="text-xs text-muted-foreground shrink-0">x hourly rate</span>
                                        </div>
                                        <p className="text-[0.7rem] text-muted-foreground mt-1">
                                            e.g., 1.5x hourly pay (computed as Daily Salary / 8 hrs * 1.5).
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Automation & Eligibility Section */}
                        <div className="p-4 bg-muted/40 border rounded-lg flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Automation & Eligibility
                                </h4>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEligibilityMode("ROLES")}
                                        className={`px-3 py-1 text-xs rounded border transition ${eligibilityMode === "ROLES" ? "bg-primary text-primary-foreground font-semibold" : "bg-background"}`}
                                    >
                                        By Role
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEligibilityMode("CUSTOM_EMPLOYEES")}
                                        className={`px-3 py-1 text-xs rounded border transition ${eligibilityMode === "CUSTOM_EMPLOYEES" ? "bg-primary text-primary-foreground font-semibold" : "bg-background"}`}
                                    >
                                        Specific Staff ({eligibleEmployeeIds.length})
                                    </button>
                                </div>
                            </div>

                            {eligibilityMode === "ROLES" ? (
                                <div>
                                    <label className="block text-xs font-medium mb-2">
                                        Select Eligible Staff Roles:
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {AVAILABLE_ROLES.map((role) => {
                                            const isSelected = eligibleRoles.includes(role.value);
                                            return (
                                                <button
                                                    key={role.value}
                                                    type="button"
                                                    onClick={() => handleToggleRole(role.value)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${isSelected
                                                        ? "bg-primary text-primary-foreground border-primary"
                                                        : "bg-background text-foreground border-border hover:bg-muted"
                                                    }`}
                                                >
                                                    {isSelected ? "✓ " : "+ "}
                                                    {role.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[0.7rem] text-muted-foreground mt-2">
                                        Selecting &apos;All Roles&apos; applies this calculation automatically to every active staff member in this branch.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="block text-xs font-semibold text-foreground">
                                                Target Employees Selection:
                                            </label>
                                            <p className="text-[0.7rem] text-muted-foreground">
                                                Choose which active staff members this rule applies to.
                                            </p>
                                        </div>
                                        <span className="pill pill-primary text-[0.68rem] font-bold">
                                            {eligibleEmployeeIds.length} of {branchEmployees.length} Selected
                                        </span>
                                    </div>

                                    {branchEmployees.length === 0 ? (
                                        <p className="text-xs text-muted-foreground bg-background p-3 rounded-lg border text-center">
                                            No active staff members found for this branch.
                                        </p>
                                    ) : (
                                        <div className="flex flex-col gap-2.5 bg-background p-3 rounded-xl border border-border shadow-2xs">
                                            {/* Search and Bulk Controls Bar */}
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pb-2 border-b border-border/60">
                                                <div className="relative flex-1">
                                                    <input
                                                        type="text"
                                                        placeholder="Search staff name..."
                                                        className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border bg-muted/30 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                                        value={employeeSearchQuery}
                                                        onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                                                    />
                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                                                        🔍
                                                    </span>
                                                    {employeeSearchQuery && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEmployeeSearchQuery("")}
                                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 justify-between sm:justify-end text-[0.7rem]">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const visibleIds = branchEmployees
                                                                .filter((emp) => {
                                                                    const q = employeeSearchQuery.toLowerCase().trim();
                                                                    if (!q) return true;
                                                                    return emp.full_name?.toLowerCase().includes(q);
                                                                })
                                                                .map((e) => e.id);
                                                            const combined = Array.from(new Set([...eligibleEmployeeIds, ...visibleIds]));
                                                            setEligibleEmployeeIds(combined);
                                                        }}
                                                        className="button button-secondary h-7 px-2.5 text-[0.7rem] font-medium"
                                                    >
                                                        ✓ Select All Visible
                                                    </button>
                                                    {eligibleEmployeeIds.length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEligibleEmployeeIds([])}
                                                            className="button button-secondary h-7 px-2.5 text-[0.7rem] text-destructive hover:bg-destructive/10 font-medium"
                                                        >
                                                            ✕ Clear All
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 4-Way Staff Selection Table / Grid (Employee Name only) */}
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1 border rounded-lg bg-background">
                                                {branchEmployees
                                                    .filter((emp) => {
                                                        const q = employeeSearchQuery.toLowerCase().trim();
                                                        if (!q) return true;
                                                        return emp.full_name?.toLowerCase().includes(q);
                                                    })
                                                    .map((emp) => {
                                                        const isChecked = eligibleEmployeeIds.includes(emp.id);
                                                        return (
                                                            <label
                                                                key={emp.id}
                                                                className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer transition-colors select-none ${
                                                                    isChecked
                                                                        ? "bg-primary/10 border-primary font-semibold text-primary"
                                                                        : "border-border bg-card hover:bg-muted text-foreground"
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => handleToggleEmployee(emp.id)}
                                                                    className="rounded border-gray-300 accent-primary shrink-0 cursor-pointer"
                                                                />
                                                                <span className="truncate text-xs font-medium" title={emp.full_name}>
                                                                    {emp.full_name}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}

                                                {branchEmployees.filter((emp) => {
                                                    const q = employeeSearchQuery.toLowerCase().trim();
                                                    if (!q) return true;
                                                    return emp.full_name?.toLowerCase().includes(q);
                                                }).length === 0 && (
                                                    <div className="col-span-full p-4 text-center text-xs text-muted-foreground">
                                                        No employees match &quot;{employeeSearchQuery}&quot;
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={resetForm}
                                className="button button-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="button button-primary"
                            >
                                {saving ? "Saving Rule..." : editingRuleId ? "Update Rule" : "Create Rule"}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="flex flex-col gap-4">
                        {/* Tabs Filter */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                            <div className="flex items-center gap-2">
                                {[
                                    { key: "ALL", label: "All Rules" },
                                    { key: "LATE_COMING", label: "⏱️ Late Coming" },
                                    { key: "LEAVE_POLICY", label: "🏖️ Leave Policy" },
                                    { key: "OVERTIME", label: "⚡ Overtime (OT)" },
                                ].map((tab) => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setFilterType(tab.key)}
                                        className={`px-3 py-1.5 text-xs rounded-lg transition font-medium ${filterType === tab.key
                                            ? "bg-primary text-primary-foreground"
                                            : "text-muted-foreground hover:bg-muted"
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {filteredRules.length} {filteredRules.length === 1 ? "rule" : "rules"} found
                            </span>
                        </div>

                        {/* Rules List */}
                        {loading ? (
                            <div className="centered py-12 text-sm text-muted-foreground">
                                Loading branch rules...
                            </div>
                        ) : filteredRules.length === 0 ? (
                            <div className="centered py-12 text-center border border-dashed rounded-lg">
                                <p className="text-sm font-semibold mb-1">No rules configured</p>
                                <p className="text-xs text-muted-foreground mb-4">
                                    Create a late, leave, or overtime rule to automate payroll calculations.
                                </p>
                                <button
                                    className="button button-primary h-8 text-xs"
                                    onClick={() => {
                                        resetForm();
                                        setIsEditing(true);
                                    }}
                                >
                                    + Add First Rule
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {filteredRules.map((rule) => {
                                    const isLate = rule.rule_type === "LATE_COMING";
                                    const isLeave = rule.rule_type === "LEAVE_POLICY";
                                    const isOT = rule.rule_type === "OVERTIME";

                                    return (
                                        <div
                                            key={rule.id}
                                            className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${rule.is_active ? "bg-card shadow-xs" : "bg-muted/40 opacity-70"
                                            }`}
                                        >
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`pill text-xs ${isLate ? "pill-warning" : isLeave ? "pill-destructive" : "pill-success"}`}>
                                                        {isLate ? "⏱️ Late Coming" : isLeave ? "🏖️ Leave Policy" : "⚡ Overtime"}
                                                    </span>
                                                    <h4 className="font-bold text-sm">{rule.title}</h4>
                                                    {!rule.branch_id && (
                                                        <span className="pill text-[0.65rem]">Global Org Default</span>
                                                    )}
                                                </div>

                                                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                                                    {isLate && (
                                                        <>
                                                            <span>Threshold: <strong>&gt; {rule.threshold_minutes} mins</strong></span>
                                                            <span>•</span>
                                                            <span className="text-destructive font-medium">Deduction: <strong>{rule.deduction_percentage}% of daily pay</strong></span>
                                                        </>
                                                    )}
                                                    {isLeave && (
                                                        <>
                                                            <span>Type: <strong>{rule.leave_type || "ALL"}</strong></span>
                                                            <span>•</span>
                                                            <span className="text-destructive font-medium">Deduction: <strong>{rule.deduction_percentage}% daily rate</strong></span>
                                                        </>
                                                    )}
                                                    {isOT && (
                                                        <>
                                                            <span>Min Duration: <strong>{rule.threshold_minutes} mins</strong></span>
                                                            <span>•</span>
                                                            <span className="text-emerald-600 font-medium">Rate: <strong>{rule.rate_multiplier}x hourly rate</strong></span>
                                                        </>
                                                    )}
                                                    <span>•</span>
                                                    <span>
                                                        Eligible:{" "}
                                                        <strong>
                                                            {rule.eligible_employee_ids && rule.eligible_employee_ids.length > 0
                                                                ? `${rule.eligible_employee_ids.length} specific employees`
                                                                : rule.eligible_roles?.includes("ALL") || !rule.eligible_roles?.length
                                                                ? "All Roles"
                                                                : rule.eligible_roles.join(", ")}
                                                        </strong>
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                                                <button
                                                    onClick={() => handleToggleRuleActive(rule)}
                                                    className={`pill cursor-pointer transition ${rule.is_active ? "pill-success" : "pill-muted"}`}
                                                    title="Click to toggle active status"
                                                >
                                                    {rule.is_active ? "● Active" : "○ Inactive"}
                                                </button>
                                                <button
                                                    onClick={() => handleEditRule(rule)}
                                                    className="button button-secondary h-7 px-2.5 text-xs"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                    className="button button-secondary h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                                                    title="Delete Rule"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
