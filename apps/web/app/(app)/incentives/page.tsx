"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "../../../lib/supabase/client";

export default function IncentivesPage() {
    const [rules, setRules] = useState<any[]>([]);
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [salesLoading, setSalesLoading] = useState(false);
    const [showAddRule, setShowAddRule] = useState(false);
    const [showAddSales, setShowAddSales] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string, type: "success" | "error" } | null>(null);

    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const [selectedMonth, setSelectedMonth] = useState(nowIST.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(nowIST.getFullYear());
    const [selectedBranch, setSelectedBranch] = useState("");
    const [sales, setSales] = useState<any[]>([]);

    const [newRule, setNewRule] = useState({
        name: "",
        min_sales: 0,
        incentive_pct: 0,
        role_restriction: "STAFF"
    });

    const [newSales, setNewSales] = useState({
        branch_id: "",
        amount: 0,
        date: new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().split('T')[0]
    });

    async function loadSalesData() {
        setSalesLoading(true);
        const startOfMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
        const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
        const endOfMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        let query = supabaseBrowser
            .from("branch_daily_sales")
            .select("*, branches(name)")
            .gte("date", startOfMonth)
            .lt("date", endOfMonth)
            .order("date", { ascending: false });

        if (selectedBranch) {
            query = query.eq("branch_id", selectedBranch);
        }

        const { data } = await query;
        if (data) setSales(data);
        setSalesLoading(false);
    }

    useEffect(() => {
        async function loadInitialData() {
            const { data: rulesData } = await supabaseBrowser.from("incentive_rules").select("*");
            const { data: branchesData } = await supabaseBrowser.from("branches").select("*");
            if (rulesData) setRules(rulesData);
            if (branchesData) setBranches(branchesData);
            setLoading(false);
        }
        loadInitialData();
    }, []);

    useEffect(() => {
        loadSalesData();
    }, [selectedMonth, selectedYear, selectedBranch]);

    const handleAddRule = async () => {
        const { error } = await supabaseBrowser.from("incentive_rules").insert([{
            name: newRule.name,
            branch_id: null,
            role_id: newRule.role_restriction,
            target_amount: newRule.min_sales,
            incentive_amount: newRule.incentive_pct,
            type: "PERCENTAGE",
        }]);
        if (!error) {
            setShowAddRule(false);
            const { data } = await supabaseBrowser.from("incentive_rules").select("*");
            if (data) setRules(data);
        } else {
            alert(error.message);
        }
    };

    const handleAddSales = async () => {
        if (!newSales.branch_id) {
            setFeedback({ message: "Please select a branch.", type: "error" });
            return;
        }
        setFeedback(null);
        const { error } = await supabaseBrowser.from("branch_daily_sales").upsert([{
            branch_id: newSales.branch_id,
            date: newSales.date,
            sales_amount: newSales.amount,
        }], { onConflict: 'branch_id,date' });

        if (!error) {
            setFeedback({ message: "Sales record logged successfully!", type: "success" });
            loadSalesData();
            setTimeout(() => {
                setShowAddSales(false);
                setFeedback(null);
                setNewSales({ branch_id: "", amount: 0, date: new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().split('T')[0] });
            }, 1500);
        } else {
            setFeedback({ message: error.message, type: "error" });
        }
    };

    if (loading) return <div className="centered">Loading incentive modules...</div>;

    const totalSalesAmount = sales.reduce((sum, s) => sum + s.sales_amount, 0);

    return (
        <div>
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1>Incentive Rule Engine</h1>
                    <p className="text-muted-foreground">Define sales-based rewards and log branch performance.</p>
                </div>
                <div className="flex gap-2">
                    <button className="button button-secondary" onClick={() => setShowAddSales(true)}>Log Branch Sales</button>
                    <button className="button button-primary" onClick={() => setShowAddRule(true)}>+ Define Rule</button>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2.5fr] gap-6">
                {/* Left Column */}
                <div className="flex flex-col gap-6">
                    <div className="card">
                        <h2 className="mb-4">Active Rules</h2>
                        {rules.length === 0 ? (
                            <p className="text-muted-foreground">No rules defined yet.</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {rules.map(rule => (
                                    <div key={rule.id} className="p-3 rounded border border-border hover:shadow-sm transition-shadow">
                                        <div className="flex justify-between items-center">
                                            <strong>{rule.name || "Incentive Rule"}</strong>
                                            <span className="pill pill-success">{rule.incentive_amount}%</span>
                                        </div>
                                        <div className="text-muted-foreground text-xs mt-1">
                                            Target: ₹{(rule.target_amount ?? 0).toLocaleString()} &nbsp;·&nbsp; {rule.role_id}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <h3>How it works</h3>
                        <p className="text-muted-foreground mt-2 text-[0.8125rem]">
                            Incentives are calculated monthly. If a branch exceeds the target, staff members receive the specified % extra on their base salary.
                        </p>
                    </div>
                </div>

                {/* Right Column: Performance Ledger */}
                <div className="card p-0">
                    <div className="flex justify-between items-center p-4 border-b border-border">
                        <h2 className="mb-0">Performance Ledger</h2>
                        <div className="flex gap-2">
                            <select className="input w-[140px]" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
                                <option value="">All Outlets</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                            <select className="input w-[130px]" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i + 1} value={i + 1}>
                                        {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                            <select className="input w-[90px]" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                                {Array.from({ length: 5 }, (_, i) => (
                                    <option key={i} value={new Date().getFullYear() - i}>
                                        {new Date().getFullYear() - i}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {salesLoading ? (
                        <div className="centered">
                            <p className="text-muted-foreground">Loading sales records...</p>
                        </div>
                    ) : sales.length === 0 ? (
                        <div className="centered">
                            <p className="text-muted-foreground">No sales records found for the selected period.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="role-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Branch</th>
                                        <th className="text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sales.map(s => (
                                        <tr key={s.id}>
                                            <td className="font-medium">
                                                {new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td>{s.branches?.name}</td>
                                            <td className="text-right font-semibold tabular-nums">
                                                ₹{s.sales_amount.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-muted border-t-2 border-border">
                                        <td colSpan={2} className="font-bold py-3 px-4">
                                            Monthly Total
                                        </td>
                                        <td className="text-right font-bold text-[0.9375rem] py-3 px-4 tabular-nums">
                                            ₹{totalSalesAmount.toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Rule Modal */}
            {showAddRule && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
                    <div className="card w-[420px] p-0">
                        <div className="p-5 border-b border-border">
                            <h2 className="mb-0.5">New Incentive Rule</h2>
                            <p className="text-muted-foreground text-[0.8125rem]">Configure performance-based rewards</p>
                        </div>
                        <div className="flex flex-col gap-4 p-5">
                            <div className="form-group">
                                <label className="label">Rule Name</label>
                                <input className="input" placeholder="e.g. Staff High Performer" value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="form-group">
                                    <label className="label">Min Sales Target (₹)</label>
                                    <input className="input" type="number" value={newRule.min_sales} onChange={e => setNewRule({ ...newRule, min_sales: Number(e.target.value) })} />
                                </div>
                                <div className="form-group">
                                    <label className="label">Incentive (%)</label>
                                    <input className="input" type="number" value={newRule.incentive_pct} onChange={e => setNewRule({ ...newRule, incentive_pct: Number(e.target.value) })} />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button type="button" className="button button-secondary flex-1" onClick={() => setShowAddRule(false)}>Cancel</button>
                                <button type="button" className="button button-primary flex-1" onClick={handleAddRule}>Create Rule</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Log Sales Modal */}
            {showAddSales && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
                    <div className="card w-[420px] p-0">
                        <div className="p-5 border-b border-border">
                            <h2 className="mb-0.5">Log Branch Sales</h2>
                            <p className="text-muted-foreground text-[0.8125rem]">Record daily performance data</p>
                        </div>
                        <div className="flex flex-col gap-4 p-5">
                            {feedback && (
                                <div className={`p-3 rounded text-[0.8125rem] font-medium border ${feedback.type === 'success'
                                        ? 'bg-green-100 text-green-800 border-green-200'
                                        : 'bg-red-100 text-red-800 border-red-200'
                                    }`}>
                                    {feedback.message}
                                </div>
                            )}
                            <div className="form-group">
                                <label className="label">Branch</label>
                                <select className="input w-full" value={newSales.branch_id} onChange={e => setNewSales({ ...newSales, branch_id: e.target.value })}>
                                    <option value="">Select Branch</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="form-group">
                                    <label className="label">Total Amount (₹)</label>
                                    <input className="input w-full" type="number" value={newSales.amount} onChange={e => setNewSales({ ...newSales, amount: Number(e.target.value) })} />
                                </div>
                                <div className="form-group">
                                    <label className="label">Date</label>
                                    <input className="input w-full" type="date" value={newSales.date} onChange={e => setNewSales({ ...newSales, date: e.target.value })} />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button type="button" className="button button-secondary flex-1" onClick={() => { setShowAddSales(false); setFeedback(null); }}>Cancel</button>
                                <button type="button" className="button button-primary flex-1" onClick={handleAddSales}>Log Sales</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
