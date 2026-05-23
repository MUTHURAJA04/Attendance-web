"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../../lib/supabase/client";
import { useTenant } from "../../../../components/TenantContext";

export default function NewBranchPage() {
  const router = useRouter();
  const { brands, selectedBrand } = useTenant();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    brand_id: selectedBrand?.id || "",
    city: "",
    state: "",
    address: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.brand_id) return alert("Branch name and Brand are required");
    setLoading(true);

    const { error } = await supabaseBrowser.from("branches").insert([{
      ...formData,
      is_active: true,
    }]);

    if (!error) {
      router.push("/branches");
    } else {
      alert(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[600px]">
      <div className="mb-8">
        <h1>Add New Branch</h1>
        <p>Create a new restaurant location and assign it to a brand.</p>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-group mb-4">
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
          <input className="input" type="text" required placeholder="e.g. Indiranagar" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        </div>

        <div className="flex gap-4">
          <div className="form-group flex-1">
            <label className="label">City *</label>
            <input className="input" type="text" required placeholder="e.g. Bangalore" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
          </div>
          <div className="form-group flex-1">
            <label className="label">State *</label>
            <input className="input" type="text" required placeholder="e.g. Karnataka" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} />
          </div>
        </div>

        <div className="form-group">
          <label className="label">Address</label>
          <textarea className="input h-[60px] p-2" placeholder="Full address..." value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="button button-secondary" onClick={() => router.back()}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={loading}>
            {loading ? "Creating..." : "Create Branch"}
          </button>
        </div>
      </form>
    </div>
  );
}
