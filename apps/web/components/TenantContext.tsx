"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabaseBrowser } from "../lib/supabase/client";

export type Organization = { id: string; name: string };
export type Brand = { id: string; name: string; organization_id: string; code?: string | null };
export type Branch = { id: string; name: string; brand_id: string; city?: string; state?: string | null };

type TenantContextType = {
    organizations: Organization[];
    brands: Brand[];
    branches: Branch[];

    selectedOrg: Organization | null;
    selectedBrand: Brand | null;
    selectedBranch: Branch | null;

    setSelectedOrg: (org: Organization | null) => void;
    setSelectedBrand: (brand: Brand | null) => void;
    setSelectedBranch: (branch: Branch | null) => void;
    isLoading: boolean;
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);

    const [selectedOrg, setSelectedOrgState] = useState<Organization | null>(null);
    const [selectedBrand, setSelectedBrandState] = useState<Brand | null>(null);
    const [selectedBranch, setSelectedBranchState] = useState<Branch | null>(null);

    const [isLoading, setIsLoading] = useState(true);

    const fetchHierarchy = async () => {
        setIsLoading(true);
        try {
            const { data: { user } } = await supabaseBrowser.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabaseBrowser
                .from("profiles")
                .select("role, brand_id, branch_id, brand_ids, branch_ids")
                .eq("id", user.id)
                .maybeSingle();

            const meta = user.user_metadata || {};
            const userRole = profile?.role || (meta.role as string) || "BRANCH_STAFF";
            const userBrandId = profile?.brand_id || (meta.brand_id as string) || null;
            const userBranchId = profile?.branch_id || (meta.branch_id as string) || null;

            const userBrandIds: string[] = Array.isArray(profile?.brand_ids) && profile.brand_ids.length > 0
                ? profile.brand_ids
                : Array.isArray(meta.brand_ids) && meta.brand_ids.length > 0
                ? meta.brand_ids
                : userBrandId ? [userBrandId] : [];

            const userBranchIds: string[] = Array.isArray(profile?.branch_ids) && profile.branch_ids.length > 0
                ? profile.branch_ids
                : Array.isArray(meta.branch_ids) && meta.branch_ids.length > 0
                ? meta.branch_ids
                : userBranchId ? [userBranchId] : [];

            // Fetch available orgs, brands, branches
            const { data: orgData } = await supabaseBrowser.from("organizations").select("*").order("name");
            const { data: brandData } = await supabaseBrowser.from("brands").select("*").order("name");
            const { data: branchData } = await supabaseBrowser.from("branches").select("*").order("name");

            const allOrgs = orgData || [];
            let availableBrands = brandData || [];
            let availableBranches = branchData || [];

            // Scope based on RBAC rules:
            if (userRole === "BRAND_ADMIN") {
                if (userBrandIds.length > 0) {
                    availableBrands = availableBrands.filter((b) => userBrandIds.includes(b.id));
                    availableBranches = availableBranches.filter((br) => userBrandIds.includes(br.brand_id));
                }
            } else if (userRole === "BRANCH_ADMIN" || userRole === "BRANCH_MANAGER" || userRole === "BRANCH_STAFF" || userRole === "MANAGER") {
                if (userBranchIds.length > 0) {
                    availableBranches = availableBranches.filter((br) => userBranchIds.includes(br.id));
                    availableBrands = availableBrands.filter((b) => availableBranches.some((br) => br.brand_id === b.id));
                } else if (userBrandIds.length > 0) {
                    availableBrands = availableBrands.filter((b) => userBrandIds.includes(b.id));
                    availableBranches = availableBranches.filter((br) => userBrandIds.includes(br.brand_id));
                }
            }

            setOrganizations(allOrgs);
            setBrands(availableBrands);
            setBranches(availableBranches);

            // Restore from localStorage or pick defaults
            const savedBranchId = localStorage.getItem("selectedBranchId");

            let initialBranch = null;
            if (savedBranchId && availableBranches.some((b) => b.id === savedBranchId)) {
                initialBranch = availableBranches.find((b) => b.id === savedBranchId) || availableBranches[0] || null;
            } else if (availableBranches.length > 0) {
                initialBranch = availableBranches[0];
            }

            if (initialBranch) {
                setSelectedBranchState(initialBranch);
                localStorage.setItem("selectedBranchId", initialBranch.id);

                const parentBrand = (brandData || []).find((b) => b.id === initialBranch.brand_id) || null;
                setSelectedBrandState(parentBrand);

                if (parentBrand) {
                    const parentOrg = (allOrgs || []).find((o) => o.id === parentBrand.organization_id) || null;
                    setSelectedOrgState(parentOrg);
                }
            } else if (availableBrands.length > 0) {
                setSelectedBrandState(availableBrands[0]);
                const parentOrg = (allOrgs || []).find((o) => o.id === availableBrands[0].organization_id) || null;
                setSelectedOrgState(parentOrg);
            }
        } catch (err) {
            console.error("Failed to fetch tenant hierarchy:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchHierarchy();
    }, []);

    const handleSetSelectedBranch = (branch: Branch | null) => {
        setSelectedBranchState(branch);
        if (branch) {
            localStorage.setItem("selectedBranchId", branch.id);

            const parentBrand = brands.find((b) => b.id === branch.brand_id) || null;
            handleSetSelectedBrand(parentBrand);
        } else {
            localStorage.removeItem("selectedBranchId");
        }
    };

    const handleSetSelectedBrand = (brand: Brand | null) => {
        setSelectedBrandState(brand);
        if (brand) {
            const parentOrg = organizations.find((o) => o.id === brand.organization_id) || null;
            setSelectedOrgState(parentOrg);

            // Auto-select first branch of this brand if the current branch doesn't belong to it
            if (!selectedBranch || selectedBranch.brand_id !== brand.id) {
                const firstBranchOfBrand = branches.find((b) => b.brand_id === brand.id);
                if (firstBranchOfBrand) {
                    handleSetSelectedBranch(firstBranchOfBrand);
                }
            }
        }
    };

    const handleSetSelectedOrg = (org: Organization | null) => {
        setSelectedOrgState(org);
        if (org) {
            // Auto-select first brand of this org if the current brand doesn't belong to it
            if (!selectedBrand || selectedBrand.organization_id !== org.id) {
                const firstBrandOfOrg = brands.find((b) => b.organization_id === org.id);
                if (firstBrandOfOrg) {
                    handleSetSelectedBrand(firstBrandOfOrg);
                }
            }
        }
    };

    return (
        <TenantContext.Provider
            value={{
                organizations,
                brands,
                branches,
                selectedOrg,
                selectedBrand,
                selectedBranch,
                setSelectedOrg: handleSetSelectedOrg,
                setSelectedBrand: handleSetSelectedBrand,
                setSelectedBranch: handleSetSelectedBranch,
                isLoading,
            }}
        >
            {children}
        </TenantContext.Provider>
    );
}

export function useTenant() {
    const context = useContext(TenantContext);
    if (!context) {
        throw new Error("useTenant must be used within a TenantProvider");
    }
    return context;
}
