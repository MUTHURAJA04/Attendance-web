"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "../../../../lib/supabase/client";
import type { Branch, EmployeeStatus } from "../../../../lib/types";

const STEPS = ["Basic Info", "Address & Bank", "Statutory", "Salary Structure"];

const DEPARTMENTS = ["Front of House", "Back of House", "Management", "Support"];

// Dynamic Wage Master is used instead of static TN_WAGES


const isValidPhone = (v: string) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, ""));
const isValidAadhaar = (v: string) => !v || /^\d{12}$/.test(v.replace(/\s/g, ""));
const isValidPAN = (v: string) => !v || /^[A-Z]{5}\d{4}[A-Z]$/.test(v.toUpperCase());
const isValidIFSC = (v: string) => !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase());

const capitalize = (s: string) => s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function NewEmployeeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedBranch = searchParams.get("branch");

  const [currentStep, setCurrentStep] = useState(0);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    branch_id: preSelectedBranch || "",
    date_of_joining: new Date().toISOString().split("T")[0],
    date_of_birth: "",
    gender: "",
    department: "",
    shift_type: "regular" as "regular" | "break",
    shift_start: "10:00",
    shift_end: "22:00",
    shift_2_start: "18:00",
    shift_2_end: "23:00",
    total_working_hours: "12",
    address: "",
    emergency_contacts: [] as { name: string; phone: string; relation: string }[],
    bank_account_number: "",
    bank_ifsc: "",
    bank_name: "",
    aadhaar: "",
    pan: "",
    pf_uan: "",
    esi_number: "",
  });

  const [validatedFields, setValidatedFields] = useState({
    phone: false,
    bank: false,
    aadhaar: false,
    pan: false,
  });

  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [paidOffDays, setPaidOffDays] = useState<number>(4);
  const [enableOT, setEnableOT] = useState<boolean>(false);
  const [enablePF, setEnablePF] = useState<boolean>(false);
  const [enableESI, setEnableESI] = useState<boolean>(false);
  const [sliderDaysWorked, setSliderDaysWorked] = useState<number>(26);
  const [ctcInput, setCtcInput] = useState("");

  const [salaryData, setSalaryData] = useState({
    basic_pay: "",
    hra: "",
    da: "",
    allowances: "",
    ot_rate: "",
  });

  useEffect(() => {
    supabaseBrowser.from("branches").select("id, name").then(({ data }) => {
      if (data) setBranches(data as any[]);
    });
  }, []);

  useEffect(() => {
    if (!formData.branch_id) {
      setAvailableRoles([]);
      setSelectedSkills([]);
      return;
    }
    supabaseBrowser
      .from("wage_master")
      .select("id, role_name, basic_salary, da")
      .eq("branch_id", formData.branch_id)
      .order("role_name", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setAvailableRoles(data);
        } else {
          setAvailableRoles([]);
        }
      });
    setSelectedSkills([]);
  }, [formData.branch_id]);

  useEffect(() => {
    setSliderDaysWorked(30 - paidOffDays);
  }, [paidOffDays]);

  useEffect(() => {
    const ctc = Number(ctcInput);
    if (!ctc || ctc <= 0 || !selectedRoleId) return;
    const role = availableRoles.find(r => r.id === selectedRoleId);
    if (!role) return;

    const minBasic = Number(role.basic_salary || 0);
    const minDA = Number(role.da || 0);

    const basicPay = Math.max(minBasic, Math.round(ctc * 0.40));
    const da = minDA;
    const remainingAfterBasicDA = Math.max(0, ctc - basicPay - da);
    const hra = Math.min(Math.round(basicPay * 0.5), remainingAfterBasicDA);
    const allowances = Math.max(0, remainingAfterBasicDA - hra);

    const expectedDays = 30 - paidOffDays;
    const hourlyRate = expectedDays > 0 ? (ctc / expectedDays) / 8 : 0;
    const otRate = enableOT ? Math.round(hourlyRate * 2) : 0;

    setSalaryData({
      basic_pay: String(basicPay),
      da: String(da),
      hra: String(hra),
      allowances: String(allowances),
      ot_rate: String(otRate),
    });
  }, [ctcInput, selectedRoleId, paidOffDays, enableOT, availableRoles]);

  const handleOptimizeSalary = () => {
    const ctc = Number(ctcInput);
    if (!ctc || ctc <= 0) {
      alert("Please enter a valid CTC amount.");
      return;
    }
    if (!selectedRoleId) {
      alert("Please select a Wage Master role first.");
      return;
    }
    const role = availableRoles.find(r => r.id === selectedRoleId);
    if (!role) {
      alert("Selected Wage Master role not found.");
      return;
    }

    const minBasic = Number(role.basic_salary || 0);
    const minDA = Number(role.da || 0);
    const minBasicDA = minBasic + minDA;

    if (ctc < minBasicDA) {
      alert(`CTC cannot be less than the minimum Basic + DA (₹${minBasicDA.toLocaleString("en-IN")}) for the role ${role.role_name}.`);
      return;
    }

    let employerPF = 0;
    if (enablePF) {
      employerPF = Math.round(0.12 * Math.min(minBasic + minDA, 15000));
    }

    let gross = 0;
    let employerESI = 0;
    if (enableESI) {
      const tentativeGross = (ctc - employerPF) / 1.0325;
      if (tentativeGross < 21000) {
        gross = Math.round(tentativeGross);
        employerESI = Math.round(gross * 0.0325);
      } else {
        gross = ctc - employerPF;
        employerESI = 0;
      }
    } else {
      gross = ctc - employerPF;
    }

    const remainingAfterBasicDA = Math.max(0, gross - minBasic - minDA);
    const hra = Math.min(Math.round(minBasic * 0.5), remainingAfterBasicDA);
    const allowances = Math.max(0, remainingAfterBasicDA - hra);

    const expectedDays = 30 - paidOffDays;
    const hourlyRate = expectedDays > 0 ? (gross / expectedDays) / 8 : 0;
    const otRate = enableOT ? Math.round(hourlyRate * 2) : 0;

    setSalaryData({
      basic_pay: String(minBasic),
      da: String(minDA),
      hra: String(hra),
      allowances: String(allowances),
      ot_rate: String(otRate),
    });
  };

  const liveProjections = useMemo(() => {
    const basic = Number(salaryData.basic_pay || 0);
    const da = Number(salaryData.da || 0);
    const hra = Number(salaryData.hra || 0);
    const specialAllowance = Number(salaryData.allowances || 0);

    const baseGross = basic + da + hra + specialAllowance;
    const expectedDays = 30 - paidOffDays;
    const dailyRate = expectedDays > 0 ? baseGross / expectedDays : 0;

    const daysWorked = sliderDaysWorked;

    let lopDeduction = 0;
    let extraEarnings = 0;
    let actualGross = baseGross;

    if (daysWorked < expectedDays) {
      lopDeduction = Math.round((expectedDays - daysWorked) * dailyRate);
      actualGross = Math.max(0, baseGross - lopDeduction);
    } else if (daysWorked > expectedDays) {
      extraEarnings = Math.round((daysWorked - expectedDays) * dailyRate);
      actualGross = baseGross + extraEarnings;
    }

    const factor = expectedDays > 0 ? daysWorked / expectedDays : 0;
    const proratedBasic = Math.round(basic * factor);
    const proratedDA = Math.round(da * factor);

    let employeePF = 0;
    let employerPF = 0;
    if (enablePF) {
      const pfBase = Math.min(proratedBasic + proratedDA, 15000);
      employeePF = Math.round(pfBase * 0.12);
      employerPF = Math.round(pfBase * 0.12);
    }

    let employeeESI = 0;
    let employerESI = 0;
    if (enableESI && actualGross < 21000) {
      employeeESI = Math.round(actualGross * 0.0075);
      employerESI = Math.round(actualGross * 0.0325);
    }

    let ptDeduction = 0;
    if (actualGross > 15000) {
      ptDeduction = 200;
    } else if (actualGross > 10000) {
      ptDeduction = 150;
    }

    const totalDeductions = employeePF + employeeESI + ptDeduction;
    const netTakeHome = Math.max(0, actualGross - totalDeductions);
    const totalEmployerCost = actualGross + employerPF + employerESI;

    return {
      baseGross,
      expectedDays,
      dailyRate,
      lopDeduction,
      extraEarnings,
      actualGross,
      employeePF,
      employeeESI,
      ptDeduction,
      totalDeductions,
      netTakeHome,
      employerPF,
      employerESI,
      totalEmployerCost,
      proratedBasic,
      proratedDA,
    };
  }, [salaryData, paidOffDays, enablePF, enableESI, sliderDaysWorked]);

  const field = (key: keyof typeof formData, value: string | any[]) => {
    setFormData({ ...formData, [key]: value });
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const handleIfscChange = async (ifsc: string) => {
    field("bank_ifsc", ifsc);
    if (isValidIFSC(ifsc)) {
      try {
        const res = await fetch(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`);
        if (res.ok) {
          const data = await res.json();
          field("bank_name", `${data.BANK} - ${data.BRANCH}`);
        }
      } catch (err) {
        console.error("IFSC lookup failed", err);
      }
    }
  };

  const addEmergencyContact = () => {
    field("emergency_contacts", [...formData.emergency_contacts, { name: "", phone: "", relation: "" }]);
  };

  const updateEmergencyContact = (index: number, key: string, value: string) => {
    const updated = [...formData.emergency_contacts];
    updated[index] = { ...updated[index], [key]: value };
    field("emergency_contacts", updated);
  };

  const removeEmergencyContact = (index: number) => {
    const updated = formData.emergency_contacts.filter((_, i) => i !== index);
    field("emergency_contacts", updated);
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 0) {
      if (!formData.full_name.trim()) newErrors.full_name = "Name is required";
      if (!formData.branch_id) newErrors.branch_id = "Select a branch";
      if (!formData.phone.trim()) newErrors.phone = "Phone is required";
      else if (!isValidPhone(formData.phone)) newErrors.phone = "Enter a valid phone number";
    }
    if (step === 1) {
      formData.emergency_contacts.forEach((ec, i) => {
        if (!ec.name.trim()) newErrors[`ec_${i}_name`] = "Required";
        if (!ec.phone.trim()) newErrors[`ec_${i}_phone`] = "Required";
      });
    }
    if (step === 2) {
      if (formData.aadhaar && !isValidAadhaar(formData.aadhaar)) newErrors.aadhaar = "Aadhaar must be 12 digits";
      if (formData.pan && !isValidPAN(formData.pan)) newErrors.pan = "PAN must be ABCDE1234F format";
    }
    if (step === 3) {
      if (!selectedRoleId) {
        newErrors.selectedRoleId = "Please select a Wage Master role";
      } else {
        const role = availableRoles.find(r => r.id === selectedRoleId);
        if (!role) {
          newErrors.selectedRoleId = "Selected Wage Master role not found";
        } else {
          if (!salaryData.basic_pay || Number(salaryData.basic_pay) <= 0) {
            newErrors.basic_pay = "Basic pay is required";
          } else if (Number(salaryData.basic_pay) < role.basic_salary) {
            newErrors.basic_pay = `Basic cannot be below role's minimum ₹${role.basic_salary.toLocaleString("en-IN")}`;
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;
    setLoading(true);

    const selectedBranch = branches.find((b) => b.id === formData.branch_id);
    const branchPrefix = (selectedBranch?.name || "STAFF").replace(/\s+/g, "").substring(0, 15);

    const { count } = await supabaseBrowser
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", formData.branch_id);

    const nextNum = String((count || 0) + 1).padStart(3, "0");
    const employeeCode = `${branchPrefix}_${nextNum}`;

    const dbPayload: Record<string, unknown> = {
      full_name: formData.full_name,
      phone: formData.phone,
      branch_id: formData.branch_id,
      date_of_joining: formData.date_of_joining,
      date_of_birth: formData.date_of_birth || null,
      gender: formData.gender || null,
      department: formData.department,
      shift_type: formData.shift_type,
      shift_start: formData.shift_start,
      shift_end: formData.shift_type === "regular" ? formData.shift_end : formData.shift_end,
      shift_2_start: formData.shift_type === "break" ? formData.shift_2_start : null,
      shift_2_end: formData.shift_type === "break" ? formData.shift_2_end : null,
      total_working_hours: Number(formData.total_working_hours) || 12,
      address: formData.address,
      emergency_contacts: formData.emergency_contacts,
      emergency_contact_name: formData.emergency_contacts[0]?.name || "",
      emergency_contact_phone: formData.emergency_contacts[0]?.phone || "",
      bank_account_number: formData.bank_account_number,
      bank_ifsc: formData.bank_ifsc,
      bank_name: formData.bank_name,
      aadhaar: formData.aadhaar,
      pan: formData.pan,
      pf_uan: formData.pf_uan,
      esi_number: formData.esi_number,
      skills: selectedSkills,
      employee_code: employeeCode,
      is_active: true,
      role: "STAFF",
      paid_off_days: Number(paidOffDays),
      enable_ot: enableOT,
      enable_pf: enablePF,
      enable_esi: enableESI,
    };

    const { data: empData, error: empError } = await supabaseBrowser.from("employees").insert([dbPayload]).select("id").single();

    if (empError) {
      alert(empError.message);
      setLoading(false);
      return;
    }

    if (empData?.id) {
      await supabaseBrowser.from("salary_structures").insert([{
        employee_id: empData.id,
        basic_pay: Number(salaryData.basic_pay) || 0,
        hra: Number(salaryData.hra) || 0,
        allowances: Number(salaryData.allowances) + Number(salaryData.da || 0),
        ot_rate: Number(salaryData.ot_rate) || 0,
        effective_from: formData.date_of_joining,
      }]);
    }

    router.push("/employees");
  };

  const next = () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < STEPS.length - 1) setCurrentStep(currentStep + 1);
    else handleSubmit();
  };
  const prev = () => currentStep > 0 && setCurrentStep(currentStep - 1);

  const errorStyle = (key: string) => errors[key] ? "border-destructive" : "";
  const errorMsg = (key: string) => errors[key] ? <span className="text-destructive text-xs">{errors[key]}</span> : null;

  const totalCTC = Number(salaryData.basic_pay || 0) + Number(salaryData.da || 0) + Number(salaryData.hra || 0) + Number(salaryData.allowances || 0);
  const selectedRoleObj = availableRoles.find(r => r.id === selectedRoleId);
  const minRoleTotal = selectedRoleObj ? selectedRoleObj.basic_salary + selectedRoleObj.da : 0;

  return (
    <div className="max-w-[800px]">
      <div className="mb-8">
        <h1>Employee Onboarding</h1>
        <p>Complete the details below to onboard a new staff member.</p>
      </div>

      <div className="flex gap-4 mb-8">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full grid place-items-center text-xs font-semibold ${i <= currentStep
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
              }`}>{i + 1}</div>
            <span className={`text-[0.8125rem] ${i === currentStep ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{step}</span>
            {i < STEPS.length - 1 && <div className="w-[30px] h-px bg-border" />}
          </div>
        ))}
      </div>

      <div className="card">
        {/* Step 1: Basic Info */}
        {currentStep === 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="form-group flex-1">
                <label className="label">Full Name *</label>
                <input className={`input ${errorStyle("full_name")}`} value={formData.full_name} onChange={(e) => field("full_name", e.target.value)} placeholder="Staff name" />
                {errorMsg("full_name")}
              </div>
              <div className="form-group flex-1">
                <label className="label">Phone Number *</label>
                <div className="flex gap-2 items-center">
                  <input className={`input min-w-0 ${errorStyle("phone")}`} value={formData.phone} onChange={(e) => { field("phone", e.target.value); setValidatedFields(p => ({ ...p, phone: false })) }} placeholder="9876543210" maxLength={10} />
                  {validatedFields.phone ? (
                    <span className="text-success text-xs font-semibold shrink-0 flex items-center gap-1">✔ Validated</span>
                  ) : (
                    <button type="button" onClick={() => { if (isValidPhone(formData.phone)) setValidatedFields(p => ({ ...p, phone: true })); else setErrors(e => ({ ...e, phone: "Invalid Indian Number" })) }} className="button button-secondary text-xs h-9 shrink-0">Validate</button>
                  )}
                </div>
                {errorMsg("phone")}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="form-group flex-1">
                <label className="label">Branch *</label>
                <select className={`input ${errorStyle("branch_id")}`} value={formData.branch_id} onChange={(e) => field("branch_id", e.target.value)}>
                  <option value="">Select Branch</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {errorMsg("branch_id")}
              </div>
              <div className="form-group flex-1">
                <label className="label">Department</label>
                <select className="input" value={formData.department} onChange={(e) => field("department", e.target.value)}>
                  <option value="">Select</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group w-[160px]">
                <label className="label">Joining Date</label>
                <input className="input" type="date" value={formData.date_of_joining} onChange={(e) => field("date_of_joining", e.target.value)} />
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="form-group flex-1">
                <label className="label">Date of Birth</label>
                <input className="input" type="date" value={formData.date_of_birth} onChange={(e) => field("date_of_birth", e.target.value)} />
              </div>
              <div className="form-group flex-1">
                <label className="label">Gender</label>
                <select className="input" value={formData.gender} onChange={(e) => field("gender", e.target.value)}>
                  <option value="">Select Gender</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
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
                    onClick={() => field("shift_type", type)}
                  >
                    {type === "regular" ? "🕐 Regular (Single)" : "☀️🌙 Break (Split)"}
                  </button>
                ))}
              </div>

              {formData.shift_type === "regular" ? (
                <div className="flex gap-4">
                  <div className="form-group flex-1">
                    <label className="label">Start Time</label>
                    <input className="input" type="time" value={formData.shift_start} onChange={(e) => field("shift_start", e.target.value)} />
                  </div>
                  <div className="form-group flex-1">
                    <label className="label">End Time</label>
                    <input className="input" type="time" value={formData.shift_end} onChange={(e) => field("shift_end", e.target.value)} />
                  </div>
                  <div className="form-group flex-1">
                    <label className="label">Total Hours</label>
                    <input className="input" type="number" min="1" max="24" step="0.5" value={formData.total_working_hours} onChange={(e) => field("total_working_hours", e.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-4 items-end">
                    <div className="form-group flex-1">
                      <label className="label text-xs">Morning In</label>
                      <input className="input" type="time" value={formData.shift_start} onChange={(e) => field("shift_start", e.target.value)} />
                    </div>
                    <div className="form-group flex-1">
                      <label className="label text-xs">Afternoon Out</label>
                      <input className="input" type="time" value={formData.shift_end} onChange={(e) => field("shift_end", e.target.value)} />
                    </div>
                    <span className="text-muted-foreground pb-2 text-xs">break</span>
                    <div className="form-group flex-1">
                      <label className="label text-xs">Evening In</label>
                      <input className="input" type="time" value={formData.shift_2_start} onChange={(e) => field("shift_2_start", e.target.value)} />
                    </div>
                    <div className="form-group flex-1">
                      <label className="label text-xs">Night Out</label>
                      <input className="input" type="time" value={formData.shift_2_end} onChange={(e) => field("shift_2_end", e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group max-w-[120px]">
                    <label className="label">Total Hours</label>
                    <input className="input" type="number" min="1" max="24" step="0.5" value={formData.total_working_hours} onChange={(e) => field("total_working_hours", e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* Roles & Capabilities from Wage Master */}
            {availableRoles.length > 0 && (
              <div>
                <label className="label mb-2">Roles & Capabilities (Wage Master)</label>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((roleObj) => {
                    const isChecked = selectedSkills.includes(roleObj.role_name);
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
                            setSelectedSkills((prev) =>
                              prev.includes(roleObj.role_name)
                                ? prev.filter((s) => s !== roleObj.role_name)
                                : [...prev, roleObj.role_name]
                            );
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

        {/* Step 2: Address & Bank */}
        {currentStep === 1 && (
          <div className="flex flex-col gap-6">
            <div className="form-group">
              <label className="label">Residential Address</label>
              <textarea className="input h-[70px] p-2" value={formData.address} onChange={(e) => field("address", e.target.value)} placeholder="House No, Street, City..." />
            </div>

            <div className="border-t border-border/50 pt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Emergency Contacts</h3>
                <button type="button" onClick={addEmergencyContact} className="button button-secondary text-xs h-7 py-0">+ Add Contact</button>
              </div>

              {formData.emergency_contacts.length === 0 ? (
                <div className="text-sm text-muted-foreground italic mb-4">No emergency contacts added yet.</div>
              ) : (
                <div className="flex flex-col gap-4">
                  {formData.emergency_contacts.map((ec, i) => (
                    <div key={i} className="flex gap-2 items-start bg-muted/20 p-3 rounded-lg border border-border/50">
                      <div className="form-group flex-1">
                        <label className="label text-[0.65rem]">Name</label>
                        <input className={`input h-8 ${errorStyle(`ec_${i}_name`)}`} value={ec.name} onChange={(e) => updateEmergencyContact(i, "name", e.target.value)} />
                      </div>
                      <div className="form-group flex-1">
                        <label className="label text-[0.65rem]">Phone</label>
                        <input className={`input h-8 ${errorStyle(`ec_${i}_phone`)}`} value={ec.phone} onChange={(e) => updateEmergencyContact(i, "phone", e.target.value)} maxLength={10} />
                      </div>
                      <div className="form-group flex-1">
                        <label className="label text-[0.65rem]">Relation</label>
                        <input className="input h-8" value={ec.relation} onChange={(e) => updateEmergencyContact(i, "relation", e.target.value)} placeholder="e.g. Spouse, Parent" />
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
                  <input className="input uppercase" value={formData.bank_ifsc} onChange={(e) => handleIfscChange(e.target.value)} maxLength={11} placeholder="HDFC0001234" />
                </div>
                <div className="form-group flex-1">
                  <label className="label">Bank & Branch Name</label>
                  <input className="input" value={formData.bank_name} onChange={(e) => field("bank_name", e.target.value)} placeholder="Auto-filled via IFSC" />
                </div>
              </div>
              <div className="form-group max-w-[300px]">
                <label className="label">Account Number</label>
                <div className="flex gap-2 items-center">
                  <input className="input min-w-0" value={formData.bank_account_number} onChange={(e) => { field("bank_account_number", e.target.value); setValidatedFields(p => ({ ...p, bank: false })) }} />
                  {validatedFields.bank ? (
                    <span className="text-success text-xs font-semibold shrink-0 flex items-center gap-1">✔ Validated</span>
                  ) : (
                    <button type="button" onClick={() => { if (formData.bank_account_number) setValidatedFields(p => ({ ...p, bank: true })) }} className="button button-secondary text-xs h-9 shrink-0">Validate</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Statutory */}
        {currentStep === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="form-group flex-1">
                <label className="label">Aadhaar Number</label>
                <div className="flex gap-2 items-center">
                  <input className={`input min-w-0 ${errorStyle("aadhaar")}`} value={formData.aadhaar} onChange={(e) => { field("aadhaar", e.target.value); setValidatedFields(p => ({ ...p, aadhaar: false })) }} placeholder="123456789012" maxLength={12} />
                  {validatedFields.aadhaar ? (
                    <span className="text-success text-xs font-semibold shrink-0 flex items-center gap-1">✔ Validated</span>
                  ) : (
                    <button type="button" onClick={() => { if (isValidAadhaar(formData.aadhaar) && formData.aadhaar) setValidatedFields(p => ({ ...p, aadhaar: true })) }} className="button button-secondary text-xs h-9 shrink-0">Validate</button>
                  )}
                </div>
                {errorMsg("aadhaar")}
              </div>
              <div className="form-group flex-1">
                <label className="label">PAN Number</label>
                <div className="flex gap-2 items-center">
                  <input className={`input min-w-0 ${errorStyle("pan")}`} value={formData.pan} onChange={(e) => { field("pan", e.target.value.toUpperCase()); setValidatedFields(p => ({ ...p, pan: false })) }} placeholder="ABCDE1234F" maxLength={10} />
                  {validatedFields.pan ? (
                    <span className="text-success text-xs font-semibold shrink-0 flex items-center gap-1">✔ Validated</span>
                  ) : (
                    <button type="button" onClick={() => { if (isValidPAN(formData.pan) && formData.pan) setValidatedFields(p => ({ ...p, pan: true })) }} className="button button-secondary text-xs h-9 shrink-0">Validate</button>
                  )}
                </div>
                {errorMsg("pan")}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="form-group flex-1">
                <label className="label">PF UAN</label>
                <input className="input" value={formData.pf_uan} onChange={(e) => field("pf_uan", e.target.value)} />
              </div>
              <div className="form-group flex-1">
                <label className="label">ESI Number</label>
                <input className="input" value={formData.esi_number} onChange={(e) => field("esi_number", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Salary Structure */}
        {currentStep === 3 && (
          <div className="flex flex-col gap-5">
            <div className="bg-blue-50 rounded-lg p-4 text-[0.8125rem] text-blue-800 border border-blue-200 shadow-sm">
              💡 <strong>Compliance-Optimized Salary Structuring</strong>: Select the operational Wage Master role for minimum wage compliance (Basic + DA). Adjust CTC, select Paid Off days and statutory options, then click <strong>Optimize Salary</strong> to maximize employer tax/contribution savings.
            </div>

            <div className="flex gap-4 flex-wrap">
              <div className="form-group flex-1 min-w-[250px]">
                <label className="label">Wage Master Role *</label>
                <select className={`input ${errorStyle("selectedRoleId")}`} value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
                  <option value="">Select Wage Master Role</option>
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.role_name} (Basic: ₹{r.basic_salary.toLocaleString("en-IN")}, DA: ₹{r.da.toLocaleString("en-IN")})
                    </option>
                  ))}
                </select>
                {errorMsg("selectedRoleId")}
              </div>
              
              <div className="form-group flex-1 min-w-[150px]">
                <label className="label">Total Monthly CTC (₹) *</label>
                <input className="input" type="number" min="0" value={ctcInput} onChange={(e) => setCtcInput(e.target.value)} placeholder="e.g. 20000" />
              </div>

              <div className="form-group flex-1 min-w-[150px]">
                <label className="label">Paid Off Days</label>
                <select className="input" value={paidOffDays} onChange={(e) => setPaidOffDays(Number(e.target.value))}>
                  {[0, 1, 2, 3, 4, 5, 6].map((num) => (
                    <option key={num} value={num}>{num} Days/mo</option>
                  ))}
                </select>
                <span className="text-muted-foreground text-[0.6875rem]">Expected Work: {30 - paidOffDays} Days</span>
              </div>
            </div>

            {/* Compliance Toggles */}
            <div className="border border-border rounded-lg p-4 bg-muted/20 flex flex-col gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Statutory & Overtime Options</span>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={enableOT} onChange={(e) => setEnableOT(e.target.checked)} className="rounded border-border text-primary focus:ring-primary h-4 w-4" />
                  Enable OT
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={enablePF} onChange={(e) => setEnablePF(e.target.checked)} className="rounded border-border text-primary focus:ring-primary h-4 w-4" />
                  Enable PF (Provident Fund)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={enableESI} onChange={(e) => setEnableESI(e.target.checked)} className="rounded border-border text-primary focus:ring-primary h-4 w-4" />
                  Enable ESI (Healthcare)
                </label>
              </div>
              
              <button type="button" onClick={handleOptimizeSalary} className="button button-primary w-full mt-2 font-bold py-2">
                ⚡ Run Salary Optimizer
              </button>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="mb-4 text-base font-semibold">Salary Breakup Components</h3>
              <div className="flex gap-4 flex-wrap">
                <div className="form-group flex-1 min-w-[200px]">
                  <label className="label">Basic Pay (₹/mo) *</label>
                  <input className={`input ${errorStyle("basic_pay")}`} type="number" min="0" value={salaryData.basic_pay} onChange={(e) => setSalaryData({ ...salaryData, basic_pay: e.target.value })} />
                  {errorMsg("basic_pay")}
                  {selectedRoleObj && (
                    <span className="text-muted-foreground text-[0.6875rem]">Role Minimum: ₹{selectedRoleObj.basic_salary.toLocaleString("en-IN")}</span>
                  )}
                </div>
                <div className="form-group flex-1 min-w-[200px]">
                  <label className="label">DA (₹/mo)</label>
                  <input className="input" type="number" min="0" value={salaryData.da} onChange={(e) => setSalaryData({ ...salaryData, da: e.target.value })} />
                  {selectedRoleObj && (
                    <span className="text-muted-foreground text-[0.6875rem]">Role Minimum: ₹{selectedRoleObj.da.toLocaleString("en-IN")}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-4 flex-wrap mt-4">
                <div className="form-group flex-1 min-w-[200px]">
                  <label className="label">HRA (₹/mo)</label>
                  <input className="input" type="number" min="0" value={salaryData.hra} onChange={(e) => setSalaryData({ ...salaryData, hra: e.target.value })} />
                </div>
                <div className="form-group flex-1 min-w-[200px]">
                  <label className="label">Special Allowance (₹/mo)</label>
                  <input className="input" type="number" min="0" value={salaryData.allowances} onChange={(e) => setSalaryData({ ...salaryData, allowances: e.target.value })} />
                </div>
              </div>
              <div className="form-group mt-4 max-w-[200px]">
                <label className="label">Overtime Rate (₹/hr)</label>
                <input className="input" type="number" min="0" value={salaryData.ot_rate} onChange={(e) => setSalaryData({ ...salaryData, ot_rate: e.target.value })} placeholder="100" />
              </div>
            </div>

            {/* Interactive Monthly Payout Simulator */}
            <div className="border border-border rounded-lg p-5 bg-card/50 shadow-sm mt-2">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Interactive Monthly Payout Simulator</h3>
                <span className="text-[0.8125rem] font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                  Expected Work: {liveProjections.expectedDays} Days
                </span>
              </div>

              {/* Slider */}
              <div className="flex flex-col gap-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span>Actual Days Worked in Month:</span>
                  <span className="font-bold text-primary text-base">{sliderDaysWorked} Days</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={sliderDaysWorked}
                  onChange={(e) => setSliderDaysWorked(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[0.6875rem] text-muted-foreground">
                  <span>0 days (LOP)</span>
                  <span>15 days (Half Month)</span>
                  <span>30 days (Full Month + Extra)</span>
                </div>
              </div>

              {/* Live Breakdown Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Earnings Side */}
                <div className="bg-muted/30 p-4 rounded-lg flex flex-col gap-2.5 border border-border/40">
                  <span className="text-xs font-semibold tracking-wider text-success uppercase">Actual Earnings</span>
                  
                  <div className="flex justify-between text-xs">
                    <span>Prorated Basic</span>
                    <span>₹{liveProjections.proratedBasic.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Prorated DA</span>
                    <span>₹{liveProjections.proratedDA.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Prorated HRA</span>
                    <span>
                      ₹{Math.round(Number(salaryData.hra || 0) * (liveProjections.expectedDays > 0 ? sliderDaysWorked / liveProjections.expectedDays : 0)).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Prorated Special Allowance</span>
                    <span>
                      ₹{Math.round(Number(salaryData.allowances || 0) * (liveProjections.expectedDays > 0 ? sliderDaysWorked / liveProjections.expectedDays : 0)).toLocaleString("en-IN")}
                    </span>
                  </div>

                  {liveProjections.extraEarnings > 0 && (
                    <div className="flex justify-between text-xs text-success font-semibold">
                      <span>Extra Days Pay ({sliderDaysWorked - liveProjections.expectedDays} days)</span>
                      <span>+₹{liveProjections.extraEarnings.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {liveProjections.lopDeduction > 0 && (
                    <div className="flex justify-between text-xs text-destructive font-semibold">
                      <span>Loss of Pay ({liveProjections.expectedDays - sliderDaysWorked} days)</span>
                      <span>-₹{liveProjections.lopDeduction.toLocaleString("en-IN")}</span>
                    </div>
                  )}

                  <div className="border-t border-border/50 pt-2 flex justify-between font-semibold text-sm">
                    <span>Total Actual Gross</span>
                    <span>₹{liveProjections.actualGross.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                {/* Deductions & Cost Side */}
                <div className="bg-muted/30 p-4 rounded-lg flex flex-col gap-2.5 border border-border/40">
                  <span className="text-xs font-semibold tracking-wider text-destructive uppercase">Employee Deductions</span>
                  
                  <div className="flex justify-between text-xs">
                    <span>PF Contribution (12%)</span>
                    <span>₹{liveProjections.employeePF.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>ESI Contribution (0.75%)</span>
                    <span>₹{liveProjections.employeeESI.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Professional Tax (PT)</span>
                    <span>₹{liveProjections.ptDeduction.toLocaleString("en-IN")}</span>
                  </div>

                  <div className="border-t border-border/50 pt-2 flex justify-between font-semibold text-sm text-destructive">
                    <span>Total Deductions</span>
                    <span>-₹{liveProjections.totalDeductions.toLocaleString("en-IN")}</span>
                  </div>
                  
                  <div className="bg-primary/5 p-2 rounded border border-primary/10 mt-2 flex justify-between items-center">
                    <span className="text-xs font-bold text-primary">Net Take-Home Pay</span>
                    <span className="text-sm font-black text-primary">₹{liveProjections.netTakeHome.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>

              {/* Company Metrics */}
              <div className="mt-4 bg-primary/5 border border-primary/10 rounded-lg p-3 flex justify-between items-center text-xs">
                <div>
                  <span className="font-semibold text-primary block">Actual Employer Cost (CTC)</span>
                  <span className="text-muted-foreground text-[0.6875rem]">Includes Employer PF: ₹{liveProjections.employerPF.toLocaleString("en-IN")} & ESI: ₹{liveProjections.employerESI.toLocaleString("en-IN")}</span>
                </div>
                <span className="text-sm font-black text-primary">₹{liveProjections.totalEmployerCost.toLocaleString("en-IN")}</span>
              </div>
            </div>
            
            {/* CTC Warning */}
            {selectedRoleObj && totalCTC < minRoleTotal && (
              <div className="text-destructive text-xs mt-1 font-semibold">
                ⚠️ Current total CTC (₹{totalCTC.toLocaleString("en-IN")}) is below the selected Wage Master role minimum (₹{minRoleTotal.toLocaleString("en-IN")})
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between mt-8 border-t border-border pt-4">
          <button className="button button-secondary" onClick={prev} disabled={currentStep === 0}>Previous</button>
          <button className="button button-primary" onClick={next} disabled={loading}>
            {currentStep === STEPS.length - 1 ? (loading ? "Onboarding..." : "Finish Onboarding") : "Next Step"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NewEmployeePage() {
  return (
    <Suspense fallback={<div className="centered"><p>Loading form...</p></div>}>
      <NewEmployeeForm />
    </Suspense>
  );
}
