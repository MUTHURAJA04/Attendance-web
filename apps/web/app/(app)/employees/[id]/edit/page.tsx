"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabaseBrowser } from "../../../../../lib/supabase/client";

const isValidPhone = (v: string) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, ""));
const isValidAadhaar = (v: string) => !v || /^\d{12}$/.test(v.replace(/\s/g, ""));
const isValidPAN = (v: string) => !v || /^[A-Z]{5}\d{4}[A-Z]$/.test(v.toUpperCase());
const isValidIFSC = (v: string) => !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase());

const STEPS = ["Basic Info", "Contact & Bank", "Statutory", "Salary Structure"];

const DEPARTMENTS = ["Front of House", "Back of House", "Management", "Support"];

const TN_WAGES = {
    unskilled: { basic: 8238, da: 2245, total: 10483, label: "Unskilled (Cleaner, Dishwasher)" },
    semi_skilled: { basic: 8438, da: 2309, total: 10747, label: "Semi-Skilled (Helper, Waiter)" },
    skilled: { basic: 8648, da: 2399, total: 11047, label: "Skilled (Cook, Captain, Cashier)" },
};

type WageCategory = keyof typeof TN_WAGES;

const capitalize = (s: string) => s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export default function EditEmployeePage() {
    const router = useRouter();
    const { id } = useParams();
    const [currentStep, setCurrentStep] = useState(0);
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [availableRoles, setAvailableRoles] = useState<any[]>([]);

    const [formData, setFormData] = useState<any>({
        full_name: "",
        role: "STAFF",
        branch_id: "",
        date_of_joining: "",
        phone: "",
        address: "",
        emergency_contacts: [] as { name: string; phone: string; relation: string }[],
        bank_account_number: "",
        bank_ifsc: "",
        bank_name: "",
        upi_id: "",
        aadhaar: "",
        pan: "",
        pf_uan: "",
        esi_number: "",
        department: "",
        shift_type: "regular" as "regular" | "break",
        shift_start: "10:00",
        shift_end: "22:00",
        shift_2_start: "18:00",
        shift_2_end: "23:00",
        total_working_hours: "12",
        skills: [] as string[],
    });

    const [validatedFields, setValidatedFields] = useState({
        phone: false,
        bank: false,
        aadhaar: false,
        pan: false,
    });

    const [wageCategory, setWageCategory] = useState<WageCategory>("unskilled");
    const [ctcInput, setCtcInput] = useState("");
    const [salaryData, setSalaryData] = useState({
        id: "",
        basic_pay: "",
        hra: "",
        da: "",
        allowances: "",
        ot_rate: "",
    });

    useEffect(() => {
        async function loadData() {
            const [branchRes, employeeRes, salaryRes] = await Promise.all([
                supabaseBrowser.from("branches").select("id, name"),
                supabaseBrowser.from("employees").select("*").eq("id", id).single(),
                supabaseBrowser.from("salary_structures").select("*").eq("employee_id", id).order("effective_from", { ascending: false }).limit(1).maybeSingle()
            ]);

            if (branchRes.data) setBranches(branchRes.data);
            if (employeeRes.data) {
                const empData = employeeRes.data;
                if (!empData.emergency_contacts || !Array.isArray(empData.emergency_contacts)) {
                    empData.emergency_contacts = [];
                }
                if (!empData.skills || !Array.isArray(empData.skills)) {
                    empData.skills = [];
                }
                setFormData(empData);
            }
            if (salaryRes.data) {
                setSalaryData({
                    id: salaryRes.data.id,
                    basic_pay: salaryRes.data.basic_pay?.toString() || "",
                    hra: salaryRes.data.hra?.toString() || "",
                    allowances: salaryRes.data.allowances?.toString() || "",
                    da: "",
                    ot_rate: salaryRes.data.ot_rate?.toString() || "",
                });
                const total = (Number(salaryRes.data.basic_pay) || 0) + (Number(salaryRes.data.hra) || 0) + (Number(salaryRes.data.allowances) || 0);
                setCtcInput(total > 0 ? total.toString() : "");
            }
            setLoading(false);
        }
        loadData();
    }, [id]);

    useEffect(() => {
        if (!formData.branch_id) {
            setAvailableRoles([]);
            return;
        }
        supabaseBrowser
            .from("wage_master")
            .select("id, role_name, basic_salary, da")
            .eq("branch_id", formData.branch_id)
            .order("role_name", { ascending: true })
            .then(({ data }) => {
                if (data) setAvailableRoles(data);
                else setAvailableRoles([]);
            });
    }, [formData.branch_id]);

    useEffect(() => {
        const ctc = Number(ctcInput);
        if (!ctc || ctc <= 0) return;
        const wage = TN_WAGES[wageCategory];
        const basicPay = Math.max(wage.basic, Math.round(ctc * 0.40));
        const da = wage.da;
        const remaining = ctc - (basicPay + da);
        const hra = Math.round(remaining * 0.40);
        const allowances = remaining - hra;

        setSalaryData(prev => ({
            ...prev,
            basic_pay: basicPay.toString(),
            da: da.toString(),
            hra: hra.toString(),
            allowances: allowances.toString(),
            ot_rate: Math.round(ctc / 26 / 8).toString(),
        }));
    }, [ctcInput, wageCategory]);

    const handleIfscChange = async (ifsc: string) => {
        setFormData((p: any) => ({ ...p, bank_ifsc: ifsc }));
        if (isValidIFSC(ifsc)) {
            try {
                const res = await fetch(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`);
                if (res.ok) {
                    const data = await res.json();
                    setFormData((p: any) => ({ ...p, bank_name: `${data.BANK} - ${data.BRANCH}` }));
                }
            } catch (err) {
                console.error("IFSC lookup failed", err);
            }
        }
    };

    const addEmergencyContact = () => {
        setFormData((p: any) => ({ ...p, emergency_contacts: [...p.emergency_contacts, { name: "", phone: "", relation: "" }] }));
    };

    const updateEmergencyContact = (index: number, key: string, value: string) => {
        const updated = [...formData.emergency_contacts];
        updated[index] = { ...updated[index], [key]: value };
        setFormData((p: any) => ({ ...p, emergency_contacts: updated }));
    };

    const removeEmergencyContact = (index: number) => {
        const updated = formData.emergency_contacts.filter((_: any, i: number) => i !== index);
        setFormData((p: any) => ({ ...p, emergency_contacts: updated }));
    };

    const handleSubmit = async () => {
        setSaving(true);
        const submitPayload = {
            ...formData,
            emergency_contact_name: formData.emergency_contacts?.[0]?.name || "",
            emergency_contact_phone: formData.emergency_contacts?.[0]?.phone || "",
        };

        const { error: empError } = await supabaseBrowser
            .from("employees")
            .update(submitPayload)
            .eq("id", id);

        if (empError) {
            alert(empError.message);
            setSaving(false);
            return;
        }

        if (salaryData.basic_pay) {
            const salPayload = {
                employee_id: id,
                basic_pay: Number(salaryData.basic_pay) || 0,
                hra: Number(salaryData.hra) || 0,
                allowances: Number(salaryData.allowances) + Number(salaryData.da || 0),
                ot_rate: Number(salaryData.ot_rate) || 0,
            };

            if (salaryData.id) {
                await supabaseBrowser.from("salary_structures").update(salPayload).eq("id", salaryData.id);
            } else {
                await supabaseBrowser.from("salary_structures").insert([{ ...salPayload, effective_from: new Date().toISOString().split("T")[0] }]);
            }
        }

        router.push(`/employees/${id}`);
    };

    const next = () => currentStep < STEPS.length - 1 ? setCurrentStep(currentStep + 1) : handleSubmit();
    const prev = () => currentStep > 0 && setCurrentStep(currentStep - 1);

    if (loading) return <div className="centered">Loading employee data...</div>;

    return (
        <div className="max-w-[800px]">
            <div className="mb-8">
                <h1>Edit Employee: {formData.full_name}</h1>
                <p>Update the records for this staff member.</p>
            </div>

            <div className="flex gap-4 mb-8">
                {STEPS.map((step, i) => (
                    <div key={step} className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full grid place-items-center text-xs font-semibold ${i <= currentStep
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                            }`}>
                            {i + 1}
                        </div>
                        <span className={`text-sm ${i === currentStep ? "font-semibold text-foreground" : "text-muted-foreground"
                            }`}>
                            {step}
                        </span>
                        {i < STEPS.length - 1 && <div className="w-10 h-px bg-border" />}
                    </div>
                ))}
            </div>

            <div className="card">
                {currentStep === 0 && (
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-4">
                            <div className="form-group flex-1">
                                <label className="label">Full Name</label>
                                <input className="input" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} />
                            </div>
                            <div className="form-group flex-1">
                                <label className="label">Joining Date</label>
                                <input className="input" type="date" value={formData.date_of_joining} onChange={e => setFormData({ ...formData, date_of_joining: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="form-group flex-1">
                                <label className="label">Role</label>
                                <select className="input" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                                    <option value="STAFF">Staff</option>
                                    <option value="MANAGER">Manager</option>
                                    <option value="KITCHEN">Kitchen</option>
                                    <option value="CASHIER">Cashier</option>
                                </select>
                            </div>
                            <div className="form-group flex-1">
                                <label className="label">Branch</label>
                                <select className="input" value={formData.branch_id} onChange={e => setFormData({ ...formData, branch_id: e.target.value })}>
                                    <option value="">Select Branch</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="form-group flex-1">
                                <label className="label">Department</label>
                                <select className="input" value={formData.department || ""} onChange={e => setFormData({ ...formData, department: e.target.value })}>
                                    <option value="">Select</option>
                                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Shift Configuration */}
                        <div>
                            <label className="label mb-2">Shift Type</label>
                            <div className="flex gap-2 mb-4">
                                {(["regular", "break"] as const).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        className={`button flex-1 ${formData.shift_type === type ? "button-primary" : "button-secondary"}`}
                                        onClick={() => setFormData({ ...formData, shift_type: type })}
                                    >
                                        {type === "regular" ? "🕐 Regular (Single)" : "☀️🌙 Break (Split)"}
                                    </button>
                                ))}
                            </div>

                            {formData.shift_type === "regular" ? (
                                <div className="flex gap-4">
                                    <div className="form-group flex-1">
                                        <label className="label">Start Time</label>
                                        <input className="input" type="time" value={formData.shift_start || ""} onChange={e => setFormData({ ...formData, shift_start: e.target.value })} />
                                    </div>
                                    <div className="form-group flex-1">
                                        <label className="label">End Time</label>
                                        <input className="input" type="time" value={formData.shift_end || ""} onChange={e => setFormData({ ...formData, shift_end: e.target.value })} />
                                    </div>
                                    <div className="form-group flex-1">
                                        <label className="label">Total Hours</label>
                                        <input className="input" type="number" min="1" max="24" step="0.5" value={formData.total_working_hours || ""} onChange={e => setFormData({ ...formData, total_working_hours: e.target.value })} />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    <div className="flex gap-4 items-end">
                                        <div className="form-group flex-1">
                                            <label className="label text-xs">Morning In</label>
                                            <input className="input" type="time" value={formData.shift_start || ""} onChange={e => setFormData({ ...formData, shift_start: e.target.value })} />
                                        </div>
                                        <div className="form-group flex-1">
                                            <label className="label text-xs">Afternoon Out</label>
                                            <input className="input" type="time" value={formData.shift_end || ""} onChange={e => setFormData({ ...formData, shift_end: e.target.value })} />
                                        </div>
                                        <span className="text-muted-foreground pb-2 text-xs">break</span>
                                        <div className="form-group flex-1">
                                            <label className="label text-xs">Evening In</label>
                                            <input className="input" type="time" value={formData.shift_2_start || ""} onChange={e => setFormData({ ...formData, shift_2_start: e.target.value })} />
                                        </div>
                                        <div className="form-group flex-1">
                                            <label className="label text-xs">Night Out</label>
                                            <input className="input" type="time" value={formData.shift_2_end || ""} onChange={e => setFormData({ ...formData, shift_2_end: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="form-group max-w-[120px]">
                                        <label className="label">Total Hours</label>
                                        <input className="input" type="number" min="1" max="24" step="0.5" value={formData.total_working_hours || ""} onChange={e => setFormData({ ...formData, total_working_hours: e.target.value })} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Roles & Capabilities from Wage Master */}
                        {availableRoles.length > 0 && (
                            <div>
                                <label className="label mb-2">Roles & Capabilities (Wage Master)</label>
                                <div className="flex flex-wrap gap-2">
                                    {availableRoles.map((roleObj: any) => {
                                        const isChecked = formData.skills.includes(roleObj.role_name);
                                        return (
                                            <label
                                                key={roleObj.id}
                                                className={`text-[0.8125rem] cursor-pointer px-2.5 py-1 rounded border transition-all ${isChecked
                                                    ? "border-primary bg-primary text-primary-foreground"
                                                    : "border-border bg-background text-foreground"
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {
                                                        const newSkills = isChecked
                                                            ? formData.skills.filter((s: string) => s !== roleObj.role_name)
                                                            : [...formData.skills, roleObj.role_name];
                                                        setFormData({ ...formData, skills: newSkills });
                                                    }}
                                                    className="hidden"
                                                />
                                                {roleObj.role_name} (₹{(roleObj.basic_salary + roleObj.da).toLocaleString("en-IN")})
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {formData.branch_id && availableRoles.length === 0 && (
                            <p className="text-muted-foreground text-[0.8125rem]">
                                No operational roles configured for this branch. Please add them in the Wage Master page.
                            </p>
                        )}
                    </div>
                )}

                {currentStep === 1 && (
                    <div className="flex flex-col gap-4">
                        <div className="form-group flex-1">
                            <label className="label">Phone Number *</label>
                            <div className="flex gap-2 items-center">
                                <input className="input min-w-0" value={formData.phone} onChange={e => { setFormData({ ...formData, phone: e.target.value }); setValidatedFields((p: any) => ({ ...p, phone: false })) }} placeholder="9876543210" maxLength={10} />
                                {validatedFields.phone ? (
                                    <span className="text-success text-xs font-semibold shrink-0 flex items-center gap-1">✔ Validated</span>
                                ) : (
                                    <button type="button" onClick={() => { if (isValidPhone(formData.phone)) setValidatedFields((p: any) => ({ ...p, phone: true })); else alert("Invalid Indian Number") }} className="button button-secondary text-xs h-9 shrink-0">Validate</button>
                                )}
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="label">Full Address</label>
                            <textarea className="input h-20 p-2" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                        </div>

                        <div className="border-t border-border/50 pt-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Emergency Contacts</h3>
                                <button type="button" onClick={addEmergencyContact} className="button button-secondary text-xs h-7 py-0">+ Add Contact</button>
                            </div>

                            {(!formData.emergency_contacts || formData.emergency_contacts.length === 0) ? (
                                <div className="text-sm text-muted-foreground italic mb-4">No emergency contacts added yet.</div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {formData.emergency_contacts.map((ec: any, i: number) => (
                                        <div key={i} className="flex gap-2 items-start bg-muted/20 p-3 rounded-lg border border-border/50">
                                            <div className="form-group flex-1">
                                                <label className="label text-[0.65rem]">Name</label>
                                                <input className="input h-8" value={ec.name} onChange={(e) => updateEmergencyContact(i, "name", e.target.value)} />
                                            </div>
                                            <div className="form-group flex-1">
                                                <label className="label text-[0.65rem]">Phone</label>
                                                <input className="input h-8" value={ec.phone} onChange={(e) => updateEmergencyContact(i, "phone", e.target.value)} maxLength={10} />
                                            </div>
                                            <div className="form-group flex-1">
                                                <label className="label text-[0.65rem]">Relation</label>
                                                <input className="input h-8" value={ec.relation} onChange={(e) => updateEmergencyContact(i, "relation", e.target.value)} placeholder="e.g. Spouse" />
                                            </div>
                                            <button type="button" onClick={() => removeEmergencyContact(i)} className="button button-secondary text-xs h-8 px-2 text-destructive mt-[22px]">✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="border-t border-border/50 pt-4 flex flex-col gap-4">
                            <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Bank Details</h3>
                            <div className="flex gap-4">
                                <div className="form-group max-w-[200px]">
                                    <label className="label">IFSC Code</label>
                                    <input className="input uppercase" value={formData.bank_ifsc} onChange={e => handleIfscChange(e.target.value)} maxLength={11} placeholder="HDFC0001234" />
                                </div>
                                <div className="form-group flex-1">
                                    <label className="label">Bank & Branch Name</label>
                                    <input className="input" value={formData.bank_name} onChange={e => setFormData({ ...formData, bank_name: e.target.value })} placeholder="Auto-filled via IFSC" />
                                </div>
                            </div>
                            <div className="form-group max-w-[300px]">
                                <label className="label">Account Number</label>
                                <div className="flex gap-2 items-center">
                                    <input className="input min-w-0" value={formData.bank_account_number} onChange={e => { setFormData({ ...formData, bank_account_number: e.target.value }); setValidatedFields((p: any) => ({ ...p, bank: false })) }} />
                                    {validatedFields.bank ? (
                                        <span className="text-success text-xs font-semibold shrink-0 flex items-center gap-1">✔ Validated</span>
                                    ) : (
                                        <button type="button" onClick={() => { if (formData.bank_account_number) setValidatedFields((p: any) => ({ ...p, bank: true })) }} className="button button-secondary text-xs h-9 shrink-0">Validate</button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-4">
                            <div className="form-group flex-1">
                                <label className="label">Aadhaar Number</label>
                                <div className="flex gap-2 items-center">
                                    <input className="input min-w-0" value={formData.aadhaar} onChange={e => { setFormData({ ...formData, aadhaar: e.target.value }); setValidatedFields((p: any) => ({ ...p, aadhaar: false })) }} placeholder="123456789012" maxLength={12} />
                                    {validatedFields.aadhaar ? (
                                        <span className="text-success text-xs font-semibold shrink-0 flex items-center gap-1">✔ Validated</span>
                                    ) : (
                                        <button type="button" onClick={() => { if (isValidAadhaar(formData.aadhaar) && formData.aadhaar) setValidatedFields((p: any) => ({ ...p, aadhaar: true })) }} className="button button-secondary text-xs h-9 shrink-0">Validate</button>
                                    )}
                                </div>
                            </div>
                            <div className="form-group flex-1">
                                <label className="label">PAN Number</label>
                                <div className="flex gap-2 items-center">
                                    <input className="input min-w-0" value={formData.pan} onChange={e => { setFormData({ ...formData, pan: e.target.value.toUpperCase() }); setValidatedFields((p: any) => ({ ...p, pan: false })) }} placeholder="ABCDE1234F" maxLength={10} />
                                    {validatedFields.pan ? (
                                        <span className="text-success text-xs font-semibold shrink-0 flex items-center gap-1">✔ Validated</span>
                                    ) : (
                                        <button type="button" onClick={() => { if (isValidPAN(formData.pan) && formData.pan) setValidatedFields((p: any) => ({ ...p, pan: true })) }} className="button button-secondary text-xs h-9 shrink-0">Validate</button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="form-group flex-1">
                                <label className="label">PF UAN</label>
                                <input className="input" value={formData.pf_uan} onChange={e => setFormData({ ...formData, pf_uan: e.target.value })} />
                            </div>
                            <div className="form-group flex-1">
                                <label className="label">ESI Number</label>
                                <input className="input" value={formData.esi_number} onChange={e => setFormData({ ...formData, esi_number: e.target.value })} />
                            </div>
                        </div>
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="flex flex-col gap-4">
                        <div className="bg-blue-50 rounded p-3 text-[0.8125rem] text-blue-800 border border-blue-200">
                            💡 Salary structure logic calculates standard splits. All historical data will remain intact in payroll history.
                        </div>

                        <div className="flex gap-4">
                            <div className="form-group flex-1">
                                <label className="label">Worker Category</label>
                                <select className="input" value={wageCategory} onChange={(e) => setWageCategory(e.target.value as WageCategory)}>
                                    {Object.entries(TN_WAGES).map(([key, val]) => (
                                        <option key={key} value={key}>{val.label} — Min ₹{val.total.toLocaleString("en-IN")}/mo</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group flex-1">
                                <label className="label">Total Monthly CTC (₹)</label>
                                <input className="input" type="number" min="0" value={ctcInput} onChange={(e) => setCtcInput(e.target.value)} placeholder={`Min ₹${TN_WAGES[wageCategory].total.toLocaleString("en-IN")}`} />
                            </div>
                        </div>

                        <div className="border-t border-border pt-4">
                            <h3 className="mb-4">Salary Breakup</h3>
                            <div className="flex gap-4">
                                <div className="form-group flex-1">
                                    <label className="label">Basic Pay (₹/mo) *</label>
                                    <input className="input" type="number" min="0" value={salaryData.basic_pay} onChange={(e) => setSalaryData({ ...salaryData, basic_pay: e.target.value })} />
                                    <span className="text-muted-foreground text-[0.6875rem]">TN Min: ₹{TN_WAGES[wageCategory].basic.toLocaleString("en-IN")}</span>
                                </div>
                                <div className="form-group flex-1">
                                    <label className="label">DA (₹/mo)</label>
                                    <input className="input" type="number" min="0" value={salaryData.da} onChange={(e) => setSalaryData({ ...salaryData, da: e.target.value })} />
                                    <span className="text-muted-foreground text-[0.6875rem]">TN Gazette: ₹{TN_WAGES[wageCategory].da.toLocaleString("en-IN")}</span>
                                </div>
                            </div>
                            <div className="flex gap-4 mt-4">
                                <div className="form-group flex-1">
                                    <label className="label">HRA (₹/mo)</label>
                                    <input className="input" type="number" min="0" value={salaryData.hra} onChange={(e) => setSalaryData({ ...salaryData, hra: e.target.value })} />
                                </div>
                                <div className="form-group flex-1">
                                    <label className="label">Special Allowance (₹/mo)</label>
                                    <input className="input" type="number" min="0" value={salaryData.allowances} onChange={(e) => setSalaryData({ ...salaryData, allowances: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group mt-4 max-w-[200px]">
                                <label className="label">Overtime Rate (₹/hr)</label>
                                <input className="input" type="number" min="0" value={salaryData.ot_rate} onChange={(e) => setSalaryData({ ...salaryData, ot_rate: e.target.value })} placeholder="100" />
                            </div>
                        </div>

                        {/* CTC Summary */}
                        <div className="bg-muted rounded p-4">
                            <div className="flex justify-between mb-2 text-[0.8125rem]"><span>Basic Pay</span><span>₹{Number(salaryData.basic_pay || 0).toLocaleString("en-IN")}</span></div>
                            <div className="flex justify-between mb-2 text-[0.8125rem]"><span>Dearness Allowance</span><span>₹{Number(salaryData.da || 0).toLocaleString("en-IN")}</span></div>
                            <div className="flex justify-between mb-2 text-[0.8125rem]"><span>HRA</span><span>₹{Number(salaryData.hra || 0).toLocaleString("en-IN")}</span></div>
                            <div className="flex justify-between mb-2 text-[0.8125rem]"><span>Special Allowance</span><span>₹{Number(salaryData.allowances || 0).toLocaleString("en-IN")}</span></div>
                            <div className="border-t border-border mt-2 pt-2 flex justify-between">
                                <strong>Monthly CTC</strong>
                                <strong>
                                    ₹{((Number(salaryData.basic_pay) || 0) + (Number(salaryData.da) || 0) + (Number(salaryData.hra) || 0) + (Number(salaryData.allowances) || 0)).toLocaleString("en-IN")}
                                </strong>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-between mt-8 border-t border-border pt-4">
                    <button className="button button-secondary" onClick={prev} disabled={currentStep === 0}>Previous</button>
                    <button className="button button-primary" onClick={next} disabled={saving}>
                        {currentStep === STEPS.length - 1 ? (saving ? "Updating..." : "Save Changes") : "Next Step"}
                    </button>
                </div>
            </div>
        </div>
    );
}
