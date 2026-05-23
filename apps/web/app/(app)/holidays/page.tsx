"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "../../../lib/supabase/client";

interface Holiday {
    id: string;
    name: string;
    date: string;
    branch_id: string | null;
    type: "PAID" | "UNPAID" | "COMP_OFF";
    created_at: string;
    branches?: { name: string } | null;
}

interface Branch {
    id: string;
    name: string;
}

export default function HolidaysPage() {
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [form, setForm] = useState({
        name: "",
        date: new Date().toISOString().split("T")[0],
        branch_id: "" as string | "",
        type: "PAID" as "PAID" | "UNPAID" | "COMP_OFF",
    });

    async function loadData() {
        setLoading(true);
        const [hRes, bRes] = await Promise.all([
            supabaseBrowser
                .from("global_holidays")
                .select("*, branches(name)")
                .order("date", { ascending: true }),
            supabaseBrowser.from("branches").select("id, name"),
        ]);
        setHolidays((hRes.data as Holiday[]) || []);
        setBranches((bRes.data as Branch[]) || []);
        setLoading(false);
    }

    useEffect(() => {
        loadData();
    }, []);

    const resetForm = () => {
        setForm({ name: "", date: new Date().toISOString().split("T")[0], branch_id: "", type: "PAID" });
        setEditingId(null);
    };

    const openEdit = (h: Holiday) => {
        setForm({ name: h.name, date: h.date, branch_id: h.branch_id || "", type: h.type });
        setEditingId(h.id);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = { ...form, branch_id: form.branch_id || null };

        if (editingId) {
            await supabaseBrowser.from("global_holidays").update(payload).eq("id", editingId);
        } else {
            await supabaseBrowser.from("global_holidays").insert([payload]);
        }
        setShowModal(false);
        resetForm();
        loadData();
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this holiday?")) return;
        await supabaseBrowser.from("global_holidays").delete().eq("id", id);
        loadData();
    };

    const TYPE_COLORS: Record<string, string> = {
        PAID: "pill-success",
        UNPAID: "pill-destructive",
        COMP_OFF: "pill-warning",
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1>Holiday Calendar</h1>
                    <p>Manage public holidays, branch-specific days off, and compensatory offs.</p>
                </div>
                <button className="button button-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                    + Declare Holiday
                </button>
            </div>

            <div className="card p-0 overflow-hidden">
                <table className="role-table">
                    <thead>
                        <tr>
                            <th>Holiday</th>
                            <th>Date</th>
                            <th>Applicable To</th>
                            <th>Type</th>
                            <th className="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading holidays...</td></tr>
                        ) : holidays.length === 0 ? (
                            <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No holidays declared yet.</td></tr>
                        ) : (
                            holidays.map((h) => (
                                <tr key={h.id}>
                                    <td><strong>{h.name}</strong></td>
                                    <td>{new Date(h.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                                    <td>
                                        <span className="pill">{h.branches?.name || "All Branches"}</span>
                                    </td>
                                    <td>
                                        <span className={`pill ${TYPE_COLORS[h.type]}`}>{h.type.replace("_", " ")}</span>
                                    </td>
                                    <td className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <button className="button button-secondary h-8 text-xs" onClick={() => openEdit(h)}>Edit</button>
                                            <button className="button button-secondary h-8 text-xs text-destructive" onClick={() => handleDelete(h.id)}>Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
                    <div className="card w-full max-w-[450px]">
                        <h2>{editingId ? "Edit Holiday" : "Declare New Holiday"}</h2>
                        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
                            <div className="form-group">
                                <label className="label">Holiday Name</label>
                                <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Republic Day" />
                            </div>
                            <div className="flex gap-4">
                                <div className="form-group flex-1">
                                    <label className="label">Date</label>
                                    <input className="input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                                </div>
                                <div className="form-group flex-1">
                                    <label className="label">Type</label>
                                    <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "PAID" | "UNPAID" | "COMP_OFF" })}>
                                        <option value="PAID">Paid</option>
                                        <option value="UNPAID">Unpaid</option>
                                        <option value="COMP_OFF">Comp Off</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="label">Applicable Branch</label>
                                <select className="input" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
                                    <option value="">All Branches</option>
                                    {branches.map((b) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 mt-4 border-t border-border pt-4">
                                <button type="button" className="button button-secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
                                <button type="submit" className="button button-primary">{editingId ? "Update Holiday" : "Declare Holiday"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
