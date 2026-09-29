"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant, type Brand, type Branch } from "../../../components/TenantContext";
import { useAuth } from "../../../components/AuthGate";

type BrandItem = Brand & { code?: string | null };
type BranchItem = Branch & { city?: string; state?: string | null };

export default function SelectBrandPage() {
  const router = useRouter();
  const { role, email } = useAuth();
  const { setSelectedBranch, setSelectedBrand } = useTenant();

  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Brand / Branch Modal states (for Super Admin)
  const [showNewBrandModal, setShowNewBrandModal] = useState(false);
  const [showNewBranchModal, setShowNewBranchModal] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandCode, setNewBrandCode] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchCity, setNewBranchCity] = useState("Chennai");

  const loadData = async () => {
    try {
      setLoading(true);
      const [brandRes, branchRes] = await Promise.all([
        supabaseBrowser.from("brands").select("*").order("name"),
        supabaseBrowser.from("branches").select("*").order("name"),
      ]);

      const brandList = (brandRes.data || []) as BrandItem[];
      const branchList = (branchRes.data || []) as BranchItem[];

      setBrands(brandList);
      setBranches(branchList);

      if (brandList.length > 0) {
        setSelectedBrandId(brandList[0].id);
      }
    } catch (err) {
      console.error("Error loading brands and branches:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectWorkspace = (branch: BranchItem) => {
    const parentBrand = brands.find((b) => b.id === branch.brand_id) || null;
    if (parentBrand) {
      setSelectedBrand(parentBrand);
    }
    setSelectedBranch(branch);
    localStorage.setItem("selectedBranchId", branch.id);
    router.replace("/dashboard");
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim()) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabaseBrowser
        .from("brands")
        .insert({
          name: newBrandName.trim(),
          code: newBrandCode.trim().toUpperCase() || null,
        })
        .select()
        .single();

      if (error) throw error;

      setShowNewBrandModal(false);
      setNewBrandName("");
      setNewBrandCode("");
      await loadData();
      if (data) {
        setSelectedBrandId(data.id);
      }
    } catch (err) {
      alert("Failed to create brand: " + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim() || !selectedBrandId) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabaseBrowser
        .from("branches")
        .insert({
          brand_id: selectedBrandId,
          name: newBranchName.trim(),
          city: newBranchCity.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      setShowNewBranchModal(false);
      setNewBranchName("");
      await loadData();
      if (data) {
        handleSelectWorkspace(data as BranchItem);
      }
    } catch (err) {
      alert("Failed to create branch: " + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.push("/login");
  };

  const activeBrand = brands.find((b) => b.id === selectedBrandId) || brands[0];
  const brandBranches = branches.filter((b) => b.brand_id === activeBrand?.id);

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-muted/40 p-4">
        <div className="card p-8 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Loading your brands & workspaces...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 p-6 md:p-12 flex flex-col justify-between">
      <div className="max-w-5xl mx-auto w-full">
        {/* Top Header */}
        <div className="flex justify-between items-center mb-8 pb-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground font-extrabold grid place-items-center text-lg shadow-md">
              A
            </div>
            <div>
              <h1 className="text-xl font-bold">Attendance & Payroll Suite</h1>
              <p className="text-xs text-muted-foreground">
                Signed in as <span className="font-semibold text-foreground">{email}</span> ({role || "Staff"})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="button button-secondary text-xs"
          >
            Sign Out
          </button>
        </div>

        {/* Brand & Workspace Selection Section */}
        <div className="space-y-8">
          <div>
            <span className="text-xs uppercase font-bold tracking-widest text-primary">Workspace Navigation</span>
            <h2 className="text-2xl font-bold mt-1">Select Brand & Working Branch</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose the brand and branch location to manage daily attendance, roster, and payroll.
            </p>
          </div>

          {/* 1. Brand Selection Strip */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                1. Select Brand ({brands.length})
              </label>
              {(role === "SUPER_ADMIN" || !role) && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline font-semibold"
                  onClick={() => setShowNewBrandModal(true)}
                >
                  + Add New Brand
                </button>
              )}
            </div>

            {brands.length === 0 ? (
              <div className="card p-6 text-center border-dashed">
                <p className="text-muted-foreground text-sm">No brands found.</p>
                <button
                  type="button"
                  className="button button-primary text-xs mt-3"
                  onClick={() => setShowNewBrandModal(true)}
                >
                  + Create First Brand
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {brands.map((brand) => {
                  const isSelected = brand.id === activeBrand?.id;
                  const count = branches.filter((b) => b.brand_id === brand.id).length;

                  return (
                    <div
                      key={brand.id}
                      onClick={() => setSelectedBrandId(brand.id)}
                      className={`card p-5 cursor-pointer transition-all duration-150 relative ${
                        isSelected
                          ? "ring-2 ring-primary border-primary bg-primary/5 shadow-md scale-[1.02]"
                          : "hover:border-primary/50 hover:bg-card"
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <div
                          className={`w-11 h-11 rounded-xl grid place-items-center font-bold text-base ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {brand.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-base truncate">{brand.name}</h3>
                          <span className="text-xs text-muted-foreground block mt-0.5">
                            {count} {count === 1 ? "Branch" : "Branches"}
                          </span>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="absolute top-3 right-3 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          Selected
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Branch Selection Grid */}
          {activeBrand && (
            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  2. Select Branch for <span className="text-foreground">{activeBrand.name}</span> ({brandBranches.length})
                </label>
                {(role === "SUPER_ADMIN" || !role) && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline font-semibold"
                    onClick={() => setShowNewBranchModal(true)}
                  >
                    + Add New Branch
                  </button>
                )}
              </div>

              {brandBranches.length === 0 ? (
                <div className="card p-8 text-center border-dashed">
                  <span className="text-3xl block mb-2">🏢</span>
                  <h4 className="font-bold text-base">No branches created for this brand yet</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Add your first physical branch location (e.g. Main Branch, Kitchen Center) to begin tracking attendance.
                  </p>
                  <button
                    type="button"
                    className="button button-primary text-xs mt-4"
                    onClick={() => setShowNewBranchModal(true)}
                  >
                    + Add Branch to {activeBrand.name}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {brandBranches.map((branch) => (
                    <div
                      key={branch.id}
                      onClick={() => handleSelectWorkspace(branch)}
                      className="card p-5 cursor-pointer hover:border-primary hover:shadow-lg transition-all duration-150 hover:-translate-y-0.5 flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xl">🏢</span>
                          <span className="text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {branch.city || "Location"}
                          </span>
                        </div>
                        <h4 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                          {branch.name}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {branch.city} {branch.state ? `• ${branch.state}` : ""}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-border/40 flex justify-between items-center text-xs font-bold text-primary">
                        <span>Enter Dashboard</span>
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-muted-foreground">
        Attendance & Payroll Suite • Multi-Tenant Enterprise
      </footer>

      {/* New Brand Modal */}
      {showNewBrandModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs grid place-items-center z-50 p-4" onClick={() => setShowNewBrandModal(false)}>
          <div className="card w-full max-w-[420px] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Create New Brand</h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">
              Add a restaurant brand or business vertical to your organization.
            </p>

            <form onSubmit={handleCreateBrand} className="space-y-4">
              <div className="form-group">
                <label className="label text-xs">Brand Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Biryani House"
                  className="input text-sm"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="label text-xs">Brand Code (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. BH01"
                  className="input text-sm uppercase"
                  value={newBrandCode}
                  onChange={(e) => setNewBrandCode(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  className="button button-secondary text-xs"
                  onClick={() => setShowNewBrandModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary text-xs"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating..." : "Create Brand"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Branch Modal */}
      {showNewBranchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs grid place-items-center z-50 p-4" onClick={() => setShowNewBranchModal(false)}>
          <div className="card w-full max-w-[420px] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Add Branch to {activeBrand?.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">
              Add a branch location under this brand.
            </p>

            <form onSubmit={handleCreateBranch} className="space-y-4">
              <div className="form-group">
                <label className="label text-xs">Branch Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Velachery Express Branch"
                  className="input text-sm"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="label text-xs">City / Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chennai"
                  className="input text-sm"
                  value={newBranchCity}
                  onChange={(e) => setNewBranchCity(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  className="button button-secondary text-xs"
                  onClick={() => setShowNewBranchModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary text-xs"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Adding..." : "Add Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
