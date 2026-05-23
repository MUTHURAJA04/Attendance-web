"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "../../../lib/supabase/client";

interface OrgSettings {
    timezone: string;
    country: string;
    currency: string;
    pf_employee_pct: number;
    pf_employer_pct: number;
    pf_cap_basic: number;
    esi_employee_pct: number;
    esi_employer_pct: number;
    esi_wage_limit: number;
}

const DEFAULT_SETTINGS: OrgSettings = {
    timezone: "UTC+5:30",
    country: "India",
    currency: "INR",
    pf_employee_pct: 12,
    pf_employer_pct: 12,
    pf_cap_basic: 15000,
    esi_employee_pct: 0.75,
    esi_employer_pct: 3.25,
    esi_wage_limit: 21000,
};

export default function SettingsPage() {
    const [saving, setSaving] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);

    useEffect(() => {
        async function loadSettings() {
            const { data } = await supabaseBrowser
                .from("organization_settings")
                .select("key, value");

            if (data && data.length > 0) {
                const merged = { ...DEFAULT_SETTINGS };
                for (const row of data) {
                    if (row.key in merged) {
                        (merged as Record<string, unknown>)[row.key] = row.value;
                    }
                }
                setSettings(merged);
            }
            setLoaded(true);
        }
        loadSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        const entries = Object.entries(settings);
        for (const [key, value] of entries) {
            await supabaseBrowser
                .from("organization_settings")
                .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: "key" });
        }
        setSaving(false);
        alert("Settings saved successfully!");
    };

    if (!loaded) return <div className="centered">Loading configuration...</div>;

    return (
        <div>
            <div className="mb-8">
                <h1>Global Settings</h1>
                <p>Configure payroll rules, localized settings, and statutory compliance parameters.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-8">
                    <div className="card">
                        <h2 className="mb-4">Localization</h2>
                        <div className="flex flex-col gap-4">
                            <div className="form-group">
                                <label className="label">Base Timezone</label>
                                <select className="input" value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}>
                                    <option value="UTC+5:30">India (UTC+5:30)</option>
                                    <option value="UTC+0:00">UTC</option>
                                    <option value="UTC-5:00">Eastern Time (UTC-5:00)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Default Currency</label>
                                <select className="input" value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}>
                                    <option value="INR">Indian Rupee (₹)</option>
                                    <option value="USD">US Dollar ($)</option>
                                    <option value="AED">UAE Dirham (DH)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <h2 className="mb-4">Statutory Rules (India)</h2>
                        <div className="flex flex-col gap-4">
                            <div className="flex gap-4">
                                <div className="form-group flex-1">
                                    <label className="label">PF Employee %</label>
                                    <input className="input" type="number" value={settings.pf_employee_pct} onChange={(e) => setSettings({ ...settings, pf_employee_pct: Number(e.target.value) })} />
                                </div>
                                <div className="form-group flex-1">
                                    <label className="label">PF Employer %</label>
                                    <input className="input" type="number" value={settings.pf_employer_pct} onChange={(e) => setSettings({ ...settings, pf_employer_pct: Number(e.target.value) })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="label">PF Cap on Basic (₹)</label>
                                <input className="input" type="number" value={settings.pf_cap_basic} onChange={(e) => setSettings({ ...settings, pf_cap_basic: Number(e.target.value) })} />
                            </div>
                            <div className="flex gap-4">
                                <div className="form-group flex-1">
                                    <label className="label">ESI Employee %</label>
                                    <input className="input" type="number" step="0.01" value={settings.esi_employee_pct} onChange={(e) => setSettings({ ...settings, esi_employee_pct: Number(e.target.value) })} />
                                </div>
                                <div className="form-group flex-1">
                                    <label className="label">ESI Employer %</label>
                                    <input className="input" type="number" step="0.01" value={settings.esi_employer_pct} onChange={(e) => setSettings({ ...settings, esi_employer_pct: Number(e.target.value) })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="label">ESI Wage Limit (₹)</label>
                                <input className="input" type="number" value={settings.esi_wage_limit} onChange={(e) => setSettings({ ...settings, esi_wage_limit: Number(e.target.value) })} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-8">
                    <div className="card bg-primary text-primary-foreground">
                        <h2 className="mb-2">Save Changes</h2>
                        <p className="opacity-80 mb-6 text-sm">
                            Update global parameters for all branches and payroll calculations.
                        </p>
                        <button
                            className="button w-full font-semibold bg-white text-black hover:bg-gray-100"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? "Saving to Database..." : "Save Configuration"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
