"use client";

import { useState } from "react";
import { useTenant } from "../../../components/TenantContext";
import { supabaseBrowser } from "../../../lib/supabase/client";

export default function HierarchyPage() {
    const { organizations, brands, branches, isLoading } = useTenant();

    const [newOrgName, setNewOrgName] = useState("");
    const [newBrandName, setNewBrandName] = useState("");
    const [selectedOrgForBrand, setSelectedOrgForBrand] = useState("");

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreateOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOrgName) return;
        setIsSubmitting(true);
        const { error } = await supabaseBrowser
            .from("organizations")
            .insert([{ name: newOrgName }]);

        if (error) {
            alert("Failed to create Organization: " + error.message);
        } else {
            setNewOrgName("");
            window.location.reload(); // Quick refresh to update context state
        }
        setIsSubmitting(false);
    };

    const handleCreateBrand = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBrandName || !selectedOrgForBrand) return;
        setIsSubmitting(true);
        const { error } = await supabaseBrowser
            .from("brands")
            .insert([{ name: newBrandName, organization_id: selectedOrgForBrand }]);

        if (error) {
            alert("Failed to create Brand: " + error.message);
        } else {
            setNewBrandName("");
            window.location.reload(); // Quick refresh
        }
        setIsSubmitting(false);
    };

    if (isLoading) return <div className="centered">Loading Hierarchy...</div>;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h2>Manage Brand</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Organization Management */}
                <div className="card">
                    <h3 className="mb-4">Organizations</h3>

                    <form onSubmit={handleCreateOrg} className="form-group mb-6 flex gap-2">
                        <input
                            type="text"
                            className="input flex-1"
                            placeholder="New Organization Name"
                            value={newOrgName}
                            onChange={(e) => setNewOrgName(e.target.value)}
                        />
                        <button type="submit" disabled={isSubmitting || !newOrgName} className="button button-primary whitespace-nowrap">
                            Create Org
                        </button>
                    </form>

                    <div className="flex flex-col gap-2">
                        {organizations.map(org => (
                            <div key={org.id} className="p-3 border border-border rounded bg-background flex justify-between items-center">
                                <strong>{org.name}</strong>
                                <span className="text-xs text-muted-foreground">{brands.filter(b => b.organization_id === org.id).length} Brands</span>
                            </div>
                        ))}
                        {organizations.length === 0 && <span className="text-muted-foreground">No organizations found.</span>}
                    </div>
                </div>

                {/* Brand Management */}
                <div className="card">
                    <h3 className="mb-4">Brands</h3>

                    <form onSubmit={handleCreateBrand} className="form-group mb-6 flex flex-col gap-3">
                        <select
                            className="input"
                            value={selectedOrgForBrand}
                            onChange={(e) => setSelectedOrgForBrand(e.target.value)}
                            required
                        >
                            <option value="" disabled>Select Organization</option>
                            {organizations.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                className="input flex-1"
                                placeholder="New Brand Name"
                                value={newBrandName}
                                onChange={(e) => setNewBrandName(e.target.value)}
                            />
                            <button type="submit" disabled={isSubmitting || !newBrandName || !selectedOrgForBrand} className="button button-primary whitespace-nowrap">
                                Create Brand
                            </button>
                        </div>
                    </form>

                    <div className="flex flex-col gap-4">
                        {organizations.map(org => {
                            const orgBrands = brands.filter(b => b.organization_id === org.id);
                            if (orgBrands.length === 0) return null;
                            return (
                                <div key={org.id} className="border border-border rounded p-3 bg-muted/50">
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">{org.name}</h4>
                                    <div className="flex flex-col gap-1">
                                        {orgBrands.map(brand => (
                                            <div key={brand.id} className="bg-background border border-border px-3 py-2 rounded flex justify-between items-center text-sm">
                                                <span>{brand.name}</span>
                                                <span className="text-xs text-muted-foreground">{branches.filter(b => b.brand_id === brand.id).length} Branches</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                        {brands.length === 0 && <span className="text-muted-foreground">No brands found.</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}
