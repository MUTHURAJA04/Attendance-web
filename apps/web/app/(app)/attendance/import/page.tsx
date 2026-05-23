"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { supabaseBrowser } from "../../../../lib/supabase/client";

const LATE_THRESHOLD_MINUTES = 60;

interface ParsedRow {
    rowNum: number;
    employeeId: string;
    employeeName: string;
    date: string;
    inTime: string;
    outTime: string;
    workingHours: number;
}

interface MatchedRow extends ParsedRow {
    dbEmployeeId: string | null;
    dbEmployeeName: string | null;
    branchId: string | null;
    shiftStart: string;
    shiftEnd: string;
    totalWorkingHours: number;
    status: "matched" | "unmatched";
    isLateIn: boolean;
    isEarlyOut: boolean;
    lateMinutes: number;
    earlyMinutes: number;
}

interface ImportResult {
    rowNum: number;
    employeeName: string;
    type: "success" | "late" | "early" | "error" | "new_employee";
    message: string;
}

function parseTimeStr(timeStr: string): { hours: number; minutes: number } | null {
    if (!timeStr) return null;
    const cleaned = String(timeStr).trim();
    if (!isNaN(Number(cleaned)) && cleaned !== "") {
        const totalMins = Math.round(Number(cleaned) * 24 * 60);
        return { hours: Math.floor(totalMins / 60), minutes: totalMins % 60 };
    }
    const match = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
}

function timeDiffMinutes(
    time: { hours: number; minutes: number },
    ref: { hours: number; minutes: number }
): number {
    return (time.hours * 60 + time.minutes) - (ref.hours * 60 + ref.minutes);
}

function formatTime(t: { hours: number; minutes: number }): string {
    return `${String(t.hours).padStart(2, "0")}:${String(t.minutes).padStart(2, "0")}`;
}

function parseDate(val: unknown): string {
    if (!val) return "";
    if (typeof val === "number") {
        const d = XLSX.SSF.parse_date_code(val);
        return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    const s = String(val).trim();
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s;
}

export default function AttendanceImportPage() {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState<"upload" | "preview" | "results">("upload");
    const [filename, setFilename] = useState("");
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [matchedRows, setMatchedRows] = useState<MatchedRow[]>([]);
    const [results, setResults] = useState<ImportResult[]>([]);
    const [importing, setImporting] = useState(false);
    const [parseError, setParseError] = useState("");

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParseError("");
        setFilename(file.name);

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "array" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

            if (data.length === 0) {
                setParseError("No rows found in the spreadsheet.");
                return;
            }

            const headers = Object.keys(data[0]);
            const findCol = (keywords: string[]) =>
                headers.find((h) => keywords.some((k) => h.toLowerCase().includes(k))) || "";

            const empIdCol = findCol(["employee id", "emp id", "empid", "id"]);
            const empNameCol = findCol(["employee name", "name", "emp name"]);
            const dateCol = findCol(["date", "attendance date", "punch date"]);
            const inCol = findCol(["in time", "check in", "punch in", "start", "in"]);
            const outCol = findCol(["out time", "check out", "punch out", "end", "out"]);
            const hoursCol = findCol(["working hours", "hours", "total hours", "duration"]);

            if (!empNameCol && !empIdCol) {
                setParseError(`Could not find Employee Name or ID column. Found: ${headers.join(", ")}`);
                return;
            }

            const rows: ParsedRow[] = data.map((row, i) => ({
                rowNum: i + 2,
                employeeId: String(row[empIdCol] || "").trim(),
                employeeName: String(row[empNameCol] || "").trim(),
                date: parseDate(row[dateCol]),
                inTime: String(row[inCol] || "").trim(),
                outTime: String(row[outCol] || "").trim(),
                workingHours: Number(row[hoursCol]) || 0,
            }));

            setParsedRows(rows);
            await matchEmployees(rows);
        } catch (err) {
            setParseError(`Parse error: ${(err as Error).message}`);
        }
    };

    const matchEmployees = async (rows: ParsedRow[]) => {
        const { data: employees } = await supabaseBrowser
            .from("employees")
            .select("id, full_name, employee_code, branch_id, shift_start, shift_end, total_working_hours");

        const emps = (employees || []) as {
            id: string; full_name: string; employee_code: string | null;
            branch_id: string; shift_start: string | null; shift_end: string | null;
            total_working_hours: number | null;
        }[];

        const matched: MatchedRow[] = rows.map((row) => {
            let emp = emps.find((e) => e.employee_code && e.employee_code === row.employeeId);
            if (!emp) {
                emp = emps.find(
                    (e) => e.full_name.toLowerCase() === row.employeeName.toLowerCase()
                );
            }

            const shiftStart = emp?.shift_start || "10:00";
            const shiftEnd = emp?.shift_end || "22:00";
            const totalHrs = emp?.total_working_hours || 12;

            const inTime = parseTimeStr(row.inTime);
            const outTime = parseTimeStr(row.outTime);
            const refStart = parseTimeStr(shiftStart)!;
            const refEnd = parseTimeStr(shiftEnd)!;

            let isLateIn = false;
            let isEarlyOut = false;
            let lateMinutes = 0;
            let earlyMinutes = 0;

            if (inTime) {
                const diff = timeDiffMinutes(inTime, refStart);
                if (diff > LATE_THRESHOLD_MINUTES) {
                    isLateIn = true;
                    lateMinutes = diff;
                }
            }
            if (outTime) {
                const diff = timeDiffMinutes(refEnd, outTime);
                if (diff > LATE_THRESHOLD_MINUTES) {
                    isEarlyOut = true;
                    earlyMinutes = diff;
                }
            }

            return {
                ...row,
                dbEmployeeId: emp?.id || null,
                dbEmployeeName: emp?.full_name || null,
                branchId: emp?.branch_id || null,
                shiftStart,
                shiftEnd,
                totalWorkingHours: totalHrs,
                status: emp ? "matched" : "unmatched",
                isLateIn,
                isEarlyOut,
                lateMinutes,
                earlyMinutes,
            } as MatchedRow;
        });

        setMatchedRows(matched);
        setStep("preview");
    };

    const handleImport = async () => {
        setImporting(true);
        const importResults: ImportResult[] = [];
        let successCount = 0;
        let errorCount = 0;
        let lateCount = 0;
        let earlyCount = 0;
        let newEmpCount = 0;

        for (const row of matchedRows) {
            if (!row.dbEmployeeId) {
                newEmpCount++;
                importResults.push({
                    rowNum: row.rowNum,
                    employeeName: row.employeeName,
                    type: "new_employee",
                    message: `Employee "${row.employeeName}" (ID: ${row.employeeId || "—"}) not found in database`,
                });
                continue;
            }

            if (!row.date) {
                errorCount++;
                importResults.push({
                    rowNum: row.rowNum,
                    employeeName: row.employeeName,
                    type: "error",
                    message: "Missing or unparseable date",
                });
                continue;
            }

            let status: string = "PRESENT";
            if (row.isLateIn || row.isEarlyOut) status = "LATE";

            const inTime = parseTimeStr(row.inTime);
            const outTime = parseTimeStr(row.outTime);

            const checkInDate = new Date(`${row.date}T${inTime ? formatTime(inTime) : "00:00"}:00`);
            const checkOutDate = outTime ? new Date(`${row.date}T${formatTime(outTime)}:00`) : null;

            const { error } = await supabaseBrowser.from("attendance_logs").insert([{
                employee_id: row.dbEmployeeId,
                branch_id: row.branchId,
                check_in: checkInDate.toISOString(),
                check_out: checkOutDate?.toISOString() || null,
                status,
                source: "XLSX",
                metadata: {
                    late_in: row.isLateIn,
                    early_out: row.isEarlyOut,
                    late_minutes: row.lateMinutes,
                    early_minutes: row.earlyMinutes,
                    working_hours: row.workingHours,
                    import_file: filename,
                },
            }]);

            if (error) {
                errorCount++;
                importResults.push({ rowNum: row.rowNum, employeeName: row.employeeName, type: "error", message: error.message });
            } else {
                successCount++;
                if (row.isLateIn) {
                    lateCount++;
                    importResults.push({ rowNum: row.rowNum, employeeName: row.dbEmployeeName || row.employeeName, type: "late", message: `Late In by ${row.lateMinutes}min (arrived ${row.inTime}, shift starts ${row.shiftStart}). 1hr salary deduction.` });
                }
                if (row.isEarlyOut) {
                    earlyCount++;
                    importResults.push({ rowNum: row.rowNum, employeeName: row.dbEmployeeName || row.employeeName, type: "early", message: `Early Out by ${row.earlyMinutes}min (left ${row.outTime}, shift ends ${row.shiftEnd}). 1hr salary deduction.` });
                }
                if (!row.isLateIn && !row.isEarlyOut) {
                    importResults.push({ rowNum: row.rowNum, employeeName: row.dbEmployeeName || row.employeeName, type: "success", message: `Logged ${row.inTime} – ${row.outTime}` });
                }
            }
        }

        await supabaseBrowser.from("attendance_imports").insert([{
            filename,
            total_rows: matchedRows.length,
            success_count: successCount,
            error_count: errorCount,
            late_in_count: lateCount,
            early_out_count: earlyCount,
            new_employee_count: newEmpCount,
            log: importResults,
        }]);

        setResults(importResults);
        setStep("results");
        setImporting(false);
    };

    const matchedCount = matchedRows.filter((r) => r.status === "matched").length;
    const unmatchedCount = matchedRows.filter((r) => r.status === "unmatched").length;
    const lateInPreview = matchedRows.filter((r) => r.isLateIn).length;
    const earlyOutPreview = matchedRows.filter((r) => r.isEarlyOut).length;

    const typeIcon: Record<string, string> = { success: "✅", late: "⏰", early: "🏃", error: "❌", new_employee: "🆕" };
    const typeBg: Record<string, string> = {
        success: "bg-green-50", late: "bg-yellow-50", early: "bg-yellow-50", error: "bg-red-50", new_employee: "bg-blue-50",
    };

    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <Link href="/attendance" className="text-muted-foreground text-sm">Attendance</Link>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm">Import XLSX</span>
            </div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1>Import Attendance Punches</h1>
                    <p>Upload an XLSX file to bulk-import daily attendance records.</p>
                </div>
            </div>

            {/* Step 1: Upload */}
            {step === "upload" && (
                <div className="card text-center py-12 px-8">
                    <div className="text-5xl mb-4">📥</div>
                    <h2>Upload Attendance XLSX</h2>
                    <p className="mt-2 mb-6">
                        Expected columns: <strong>Employee ID</strong>, <strong>Employee Name</strong>, <strong>Date</strong>, <strong>In Time</strong>, <strong>Out Time</strong>, <strong>Working Hours</strong>
                    </p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                    <button className="button button-primary h-11 px-8" onClick={() => fileRef.current?.click()}>
                        Choose File
                    </button>
                    {parseError && (
                        <div className="mt-4 bg-red-100 text-red-800 p-3 rounded text-[0.8125rem]">
                            {parseError}
                        </div>
                    )}
                </div>
            )}

            {/* Step 2: Preview */}
            {step === "preview" && (
                <div>
                    <div className="stats-grid mb-6">
                        <div className="card stat-card">
                            <span className="stat-label">Total Rows</span>
                            <span className="stat-value">{matchedRows.length}</span>
                        </div>
                        <div className="card stat-card">
                            <span className="stat-label">Matched</span>
                            <span className="stat-value text-accent-2">{matchedCount}</span>
                        </div>
                        <div className="card stat-card">
                            <span className="stat-label">Unmatched</span>
                            <span className={`stat-value ${unmatchedCount > 0 ? "text-destructive" : ""}`}>{unmatchedCount}</span>
                        </div>
                        <div className="card stat-card">
                            <span className="stat-label">Late In</span>
                            <span className={`stat-value ${lateInPreview > 0 ? "text-amber-600" : ""}`}>{lateInPreview}</span>
                        </div>
                        <div className="card stat-card">
                            <span className="stat-label">Early Out</span>
                            <span className={`stat-value ${earlyOutPreview > 0 ? "text-amber-600" : ""}`}>{earlyOutPreview}</span>
                        </div>
                    </div>

                    <div className="card p-0 overflow-auto">
                        <table className="role-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Employee</th>
                                    <th>Match</th>
                                    <th>Date</th>
                                    <th>In</th>
                                    <th>Out</th>
                                    <th>Hours</th>
                                    <th>Flags</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matchedRows.map((row, i) => (
                                    <tr key={i} className={row.status === "unmatched" ? "bg-amber-50" : row.isLateIn || row.isEarlyOut ? "bg-amber-50/50" : ""}>
                                        <td className="text-muted-foreground">{row.rowNum}</td>
                                        <td>
                                            <strong>{row.employeeName}</strong>
                                            {row.employeeId && <div className="text-muted-foreground text-[0.6875rem]">ID: {row.employeeId}</div>}
                                        </td>
                                        <td>
                                            {row.status === "matched" ? (
                                                <span className="pill pill-success">✓ {row.dbEmployeeName}</span>
                                            ) : (
                                                <span className="pill pill-warning">🆕 Not Found</span>
                                            )}
                                        </td>
                                        <td>{row.date}</td>
                                        <td className={row.isLateIn ? "text-amber-600 font-semibold" : ""}>
                                            {row.inTime || "—"}
                                            {row.isLateIn && <div className="text-[0.625rem] text-amber-600">+{row.lateMinutes}min late</div>}
                                        </td>
                                        <td className={row.isEarlyOut ? "text-amber-600 font-semibold" : ""}>
                                            {row.outTime || "—"}
                                            {row.isEarlyOut && <div className="text-[0.625rem] text-amber-600">-{row.earlyMinutes}min early</div>}
                                        </td>
                                        <td>{row.workingHours || "—"}</td>
                                        <td>
                                            <div className="flex gap-1 flex-wrap">
                                                {row.isLateIn && <span className="pill pill-warning">⏰ Late In</span>}
                                                {row.isEarlyOut && <span className="pill pill-warning">🏃 Early Out</span>}
                                                {row.status === "unmatched" && <span className="pill pill-destructive">Unmatched</span>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-between items-center mt-6">
                        <button className="button button-secondary" onClick={() => { setStep("upload"); setParsedRows([]); setMatchedRows([]); }}>
                            ← Back / Re-upload
                        </button>
                        <div className="flex gap-2 items-center">
                            {unmatchedCount > 0 && (
                                <span className="text-muted-foreground text-[0.8125rem]">
                                    ⚠️ {unmatchedCount} unmatched row{unmatchedCount > 1 ? "s" : ""} will be skipped
                                </span>
                            )}
                            <button
                                className="button button-primary h-10 px-6"
                                onClick={handleImport}
                                disabled={importing || matchedCount === 0}
                            >
                                {importing ? "Importing..." : `Import ${matchedCount} Records`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 3: Results */}
            {step === "results" && (
                <div>
                    <div className="stats-grid mb-6">
                        <div className="card stat-card">
                            <span className="stat-label">Imported</span>
                            <span className="stat-value text-accent-2">
                                {results.filter((r) => r.type === "success" || r.type === "late" || r.type === "early").length}
                            </span>
                        </div>
                        <div className="card stat-card">
                            <span className="stat-label">Late / Early Flags</span>
                            <span className="stat-value text-amber-600">
                                {results.filter((r) => r.type === "late" || r.type === "early").length}
                            </span>
                        </div>
                        <div className="card stat-card">
                            <span className="stat-label">Errors</span>
                            <span className="stat-value text-destructive">
                                {results.filter((r) => r.type === "error").length}
                            </span>
                        </div>
                        <div className="card stat-card">
                            <span className="stat-label">New Employees</span>
                            <span className="stat-value text-blue-600">
                                {results.filter((r) => r.type === "new_employee").length}
                            </span>
                        </div>
                    </div>

                    <div className="card p-0 overflow-hidden">
                        <div className="p-4 border-b border-border">
                            <h2>Import Log — {filename}</h2>
                        </div>
                        <div className="max-h-[500px] overflow-y-auto">
                            {results.map((r, i) => (
                                <div
                                    key={i}
                                    className={`flex gap-3 items-start px-5 py-2.5 border-b border-border text-[0.8125rem] ${typeBg[r.type]}`}
                                >
                                    <span className="text-base shrink-0">{typeIcon[r.type]}</span>
                                    <div className="flex-1">
                                        <div className="font-semibold">Row {r.rowNum} — {r.employeeName}</div>
                                        <div className="text-muted-foreground">{r.message}</div>
                                    </div>
                                    <span className={`pill ${r.type === "success" ? "pill-success" : r.type === "error" ? "pill-destructive" : r.type === "new_employee" ? "" : "pill-warning"}`}>
                                        {r.type.replace("_", " ").toUpperCase()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-between mt-6">
                        <Link href="/attendance" className="button button-secondary">← Back to Attendance</Link>
                        <button className="button button-primary" onClick={() => { setStep("upload"); setResults([]); setMatchedRows([]); setParsedRows([]); }}>
                            Import Another File
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
