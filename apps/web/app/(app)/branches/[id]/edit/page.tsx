"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabaseBrowser } from "../../../../../lib/supabase/client";
import { useTenant } from "../../../../../components/TenantContext";

export default function EditBranchPage() {
    const router = useRouter();
    const { id } = useParams();
    const { brands } = useTenant();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        brand_id: "",
        city: "",
        state: "",
        address: "",
    });

    useEffect(() => {
        async function loadData() {
            const { data } = await supabaseBrowser.from("branches").select("name, brand_id, city, state, address").eq("id", id).single();
            if (data) setFormData({ name: data.name || "", brand_id: data.brand_id || "", city: data.city || "", state: data.state || "", address: data.address || "" });
            setLoading(false);
        }
        loadData();
    }, [id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const { error } = await supabaseBrowser.from("branches").update(formData).eq("id", id);
        if (!error) {
            router.push("/branches");
        } else {
            alert(error.message);
            setSaving(false);
        }
    };

    if (loading) return <div className="centered">Loading branch...</div>;

    return (
        <div className="max-w-[600px]">
            <div className="mb-8">
                <h1>Edit Branch: {formData.name}</h1>
                <p>Update location details.</p>
            </div>

            <div className="card">
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="form-group">
                        <label className="label">Brand *</label>
                        <select
                            className="input"
                            value={formData.brand_id}
                            onChange={(e) => setFormData({ ...formData, brand_id: e.target.value })}
                            required
                        >
                            <option value="" disabled>Select Brand</option>
                            {brands.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="label">Branch Name *</label>
                        <input className="input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                    </div>

                    <div className="flex gap-4">
                        <div className="form-group flex-1">
                            <label className="label">City *</label>
                            <input className="input" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} required />
                        </div>
                        <div className="form-group flex-1">
                            <label className="label">State *</label>
                            <input className="input" value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} required />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="label">Address</label>
                        <textarea className="input h-20 p-2" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Full address..." />
                    </div>

                    <div className="flex justify-end gap-3 mt-4 border-t border-border pt-4">
                        <button type="button" className="button button-secondary" onClick={() => router.back()}>Cancel</button>
                        <button type="submit" className="button button-primary" disabled={saving}>
                            {saving ? "Saving..." : "Update Branch"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
