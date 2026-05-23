"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabaseBrowser } from "../lib/supabase/client";

export type Organization = { id: string; name: string };
export type Brand = { id: string; name: string; organization_id: string };
export type Branch = { id: string; name: string; brand_id: string };

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
            // First, check if the current user profile has a specific branch assigned.
            // If the user has a specific branch, they are likely a restricted user (e.g., BRANCH_MANAGER).
            // A SUPER_ADMIN might have branch_id = null or can see everything.
            const { data: { user } } = await supabaseBrowser.auth.getUser();
            if (!user) return;

            const { data: profile } = await supabaseBrowser
                .from("profiles")
                .select("role, branch_id")
                .eq("id", user.id)
                .maybeSingle();

            // Fetch all available orgs, brands, branches (RLS will filter automatically based on roles)
            const { data: orgData } = await supabaseBrowser.from("organizations").select("*").order("name");
            const { data: brandData } = await supabaseBrowser.from("brands").select("*").order("name");
            const { data: branchData } = await supabaseBrowser.from("branches").select("*").order("name");

            setOrganizations(orgData || []);
            setBrands(brandData || []);

            const availableBranches = branchData || [];
            setBranches(availableBranches);

            // Restore from localStorage or pick defaults
            const savedBranchId = localStorage.getItem("selectedBranchId");

            let initialBranch = null;
            if (profile?.branch_id) {
                // If the profile restricts to a specific branch, force it.
                initialBranch = availableBranches.find(b => b.id === profile.branch_id) || null;
            } else if (savedBranchId) {
                initialBranch = availableBranches.find(b => b.id === savedBranchId) || null;
            } else if (availableBranches.length > 0) {
                initialBranch = availableBranches[0];
            }

            if (initialBranch) {
                setSelectedBranchState(initialBranch);

                // Infer brand and org from the selected branch
                const parentBrand = (brandData || []).find(b => b.id === initialBranch.brand_id) || null;
                setSelectedBrandState(parentBrand);

                if (parentBrand) {
                    const parentOrg = (orgData || []).find(o => o.id === parentBrand.organization_id) || null;
                    setSelectedOrgState(parentOrg);
                }
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

            const parentBrand = brands.find(b => b.id === branch.brand_id) || null;
            handleSetSelectedBrand(parentBrand);
        } else {
            localStorage.removeItem("selectedBranchId");
        }
    };

    const handleSetSelectedBrand = (brand: Brand | null) => {
        setSelectedBrandState(brand);
        if (brand) {
            const parentOrg = organizations.find(o => o.id === brand.organization_id) || null;
            setSelectedOrgState(parentOrg);

            // Auto-select first branch of this brand if the current branch doesn't belong to it
            if (!selectedBranch || selectedBranch.brand_id !== brand.id) {
                const firstBranch = branches.find(b => b.brand_id === brand.id);
                if (firstBranch) {
                    setSelectedBranchState(firstBranch);
                    localStorage.setItem("selectedBranchId", firstBranch.id);
                } else {
                    setSelectedBranchState(null);
                    localStorage.removeItem("selectedBranchId");
                }
            }
        }
    };

    const handleSetSelectedOrg = (org: Organization | null) => {
        setSelectedOrgState(org);
        if (org) {
            // Auto-select first brand
            const firstBrand = brands.find(b => b.organization_id === org.id);
            if (firstBrand) {
                handleSetSelectedBrand(firstBrand);
            } else {
                setSelectedBrandState(null);
                setSelectedBranchState(null);
                localStorage.removeItem("selectedBranchId");
            }
        }
    };

    return (
        <TenantContext.Provider value={{
            organizations, brands, branches,
            selectedOrg, selectedBrand, selectedBranch,
            setSelectedOrg: handleSetSelectedOrg,
            setSelectedBrand: handleSetSelectedBrand,
            setSelectedBranch: handleSetSelectedBranch,
            isLoading
        }}>
            {children}
        </TenantContext.Provider>
    );
}

export function useTenant() {
    const context = useContext(TenantContext);
    if (context === undefined) {
        throw new Error("useTenant must be used within a TenantProvider");
    }
    return context;
}
