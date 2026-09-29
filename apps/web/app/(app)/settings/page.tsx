"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";

export interface BiometricKioskSettings {
  // Anti-Spoofing & Liveness
  anti_spoofing_enabled: boolean;
  liveness_blink_required: boolean;
  yaw_angle_tolerance: number;

  // Face Matching & Accuracy
  similarity_threshold: number;
  enrollment_samples: number;
  sample_interval_ms: number;

  // Kiosk Device & Punch Rules
  double_punch_lockout_mins: number;
  allow_offline_punches: boolean;
  kiosk_auto_lock_seconds: number;
}

const DEFAULT_SETTINGS: BiometricKioskSettings = {
  anti_spoofing_enabled: true,
  liveness_blink_required: true,
  yaw_angle_tolerance: 18,
  similarity_threshold: 0.70,
  enrollment_samples: 10,
  sample_interval_ms: 200,
  double_punch_lockout_mins: 2,
  allow_offline_punches: true,
  kiosk_auto_lock_seconds: 60,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<BiometricKioskSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // 1. Load active settings from Supabase
  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseBrowser
        .from("organization_settings")
        .select("key, value");

      if (error) {
        console.error("Error fetching settings:", error);
      }

      if (data && data.length > 0) {
        const merged = { ...DEFAULT_SETTINGS };
        for (const row of data) {
          if (row.key in merged) {
            let val = row.value;
            if (typeof val === "string") {
              try {
                val = JSON.parse(val);
              } catch {
                // Keep raw string
              }
            }
            (merged as Record<string, unknown>)[row.key] = val;
          }
        }
        setSettings(merged);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // 2. Save settings to Supabase
  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(settings);
      const upsertRows = entries.map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabaseBrowser
        .from("organization_settings")
        .upsert(upsertRows, { onConflict: "key" });

      if (error) {
        throw error;
      }

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save settings: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Combined Liveness + Blink toggle
  const isLivenessActive = settings.anti_spoofing_enabled && settings.liveness_blink_required;

  const handleToggleLiveness = (checked: boolean) => {
    setSettings({
      ...settings,
      anti_spoofing_enabled: checked,
      liveness_blink_required: checked,
    });
  };

  if (loading) {
    return (
      <div className="min-h-[400px] grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground font-medium">Loading settings from database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-border">
        <div>
          <span className="text-xs uppercase font-bold tracking-widest text-primary">Biometric AI & Device Rules</span>
          <h1 className="text-2xl font-bold mt-1">Biometrics & Android Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure facial recognition thresholds, liveness anti-spoofing, and tablet punch rules.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Link href="/dashboard" className="button button-secondary text-xs">
            ← Dashboard
          </Link>
          <button
            type="button"
            className="button button-primary text-xs flex items-center gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "💾 Save Changes"}
          </button>
        </div>
      </div>

      {/* Save Success Alert */}
      {showSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">✓</span>
            <span className="text-sm font-semibold">
              Settings saved! Live in database and synced to Android app.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSuccess(false)}
            className="text-xs font-bold opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ========================================================= */}
        {/* 1. ANTI-SPOOFING & LIVENESS (MERGED SINGLE TOGGLE) */}
        {/* ========================================================= */}
        <div className="card space-y-5">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🛡️</span>
              <div>
                <h2 className="text-base font-bold">Anti-Spoofing & Liveness</h2>
                <span className="text-[0.65rem] text-muted-foreground">Rejects photo, screen, and replay attacks</span>
              </div>
            </div>
            <span
              className={`pill text-[0.65rem] font-bold ${
                isLivenessActive ? "pill-success" : "pill-destructive"
              }`}
            >
              {isLivenessActive ? "ON" : "OFF"}
            </span>
          </div>

          <div className="space-y-4">
            {/* Merged Single Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border/50">
              <div className="pr-4">
                <span className="text-sm font-semibold block">Liveness & Eye Blink Check</span>
                <span className="text-xs text-muted-foreground block mt-0.5">
                  Requires real human face motion & eye blink verification
                </span>
              </div>
              <input
                type="checkbox"
                className="w-5 h-5 accent-primary cursor-pointer rounded"
                checked={isLivenessActive}
                onChange={(e) => handleToggleLiveness(e.target.checked)}
              />
            </div>

            {/* Yaw Angle Slider */}
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/50 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm font-semibold block">Head Turn Yaw Tolerance</span>
                  <span className="text-xs text-muted-foreground">Max allowed head angle</span>
                </div>
                <span className="text-xs font-mono font-bold bg-card px-2.5 py-1 rounded-md border border-border text-primary shadow-xs">
                  ±{settings.yaw_angle_tolerance}°
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={30}
                step={1}
                className="w-full accent-primary cursor-pointer mt-2"
                value={settings.yaw_angle_tolerance}
                onChange={(e) => setSettings({ ...settings, yaw_angle_tolerance: Number(e.target.value) })}
              />
              <div className="flex justify-between text-[0.65rem] text-muted-foreground font-medium">
                <span>Strict (±10°)</span>
                <span className="text-foreground font-bold">Recommended (±18°)</span>
                <span>Relaxed (±30°)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 2. FACE MATCHING & ACCURACY */}
        {/* ========================================================= */}
        <div className="card space-y-5">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🎯</span>
              <div>
                <h2 className="text-base font-bold">Face Recognition Matching</h2>
                <span className="text-[0.65rem] text-muted-foreground">Cosine similarity AI threshold</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Similarity Threshold Slider */}
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/50 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm font-semibold block">Similarity Matching Threshold</span>
                  <span className="text-xs text-muted-foreground">Minimum match confidence</span>
                </div>
                <span className="text-xs font-mono font-bold text-primary bg-card px-2.5 py-1 rounded-md border border-border shadow-xs">
                  {Math.round(settings.similarity_threshold * 100)}% ({settings.similarity_threshold.toFixed(2)})
                </span>
              </div>
              <input
                type="range"
                min={0.60}
                max={0.90}
                step={0.01}
                className="w-full accent-primary cursor-pointer mt-2"
                value={settings.similarity_threshold}
                onChange={(e) => setSettings({ ...settings, similarity_threshold: Number(e.target.value) })}
              />
              <div className="flex justify-between text-[0.65rem] text-muted-foreground font-medium">
                <span>60% (Fast)</span>
                <span className="text-foreground font-bold">70% (Recommended)</span>
                <span>90% (Strict)</span>
              </div>
            </div>

            {/* Enrollment Verified Samples & Delay */}
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label className="label text-xs">Enrollment Samples</label>
                <input
                  type="number"
                  min={5}
                  max={25}
                  className="input text-sm"
                  value={settings.enrollment_samples}
                  onChange={(e) => setSettings({ ...settings, enrollment_samples: Number(e.target.value) })}
                />
                <span className="text-[0.65rem] text-muted-foreground">Frames averaged (10)</span>
              </div>

              <div className="form-group">
                <label className="label text-xs">Sample Delay (ms)</label>
                <input
                  type="number"
                  min={100}
                  max={1000}
                  step={50}
                  className="input text-sm"
                  value={settings.sample_interval_ms}
                  onChange={(e) => setSettings({ ...settings, sample_interval_ms: Number(e.target.value) })}
                />
                <span className="text-[0.65rem] text-muted-foreground">Frame interval (200ms)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 3. KIOSK RULES & COOLDOWN (FULL WIDTH) */}
        {/* ========================================================= */}
        <div className="card space-y-5 md:col-span-2">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⏱️</span>
              <div>
                <h2 className="text-base font-bold">Kiosk Rules & Double-Punch Lockout</h2>
                <span className="text-[0.65rem] text-muted-foreground">Punch interval cooldown and offline settings</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="form-group">
              <label className="label text-xs">Double-Punch Lockout (Minutes)</label>
              <input
                type="number"
                min={1}
                max={30}
                className="input text-sm"
                value={settings.double_punch_lockout_mins}
                onChange={(e) => setSettings({ ...settings, double_punch_lockout_mins: Number(e.target.value) })}
              />
              <span className="text-[0.65rem] text-muted-foreground">
                Prevents accidental double punches (2 mins)
              </span>
            </div>

            <div className="form-group">
              <label className="label text-xs">Auto-Reset to Camera (Seconds)</label>
              <input
                type="number"
                min={15}
                max={300}
                className="input text-sm"
                value={settings.kiosk_auto_lock_seconds}
                onChange={(e) => setSettings({ ...settings, kiosk_auto_lock_seconds: Number(e.target.value) })}
              />
              <span className="text-[0.65rem] text-muted-foreground">
                Screen reset timeout (60s)
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border/50">
              <div className="pr-3">
                <span className="text-sm font-semibold block">Offline Punches</span>
                <span className="text-xs text-muted-foreground block">
                  Cache punches when offline
                </span>
              </div>
              <input
                type="checkbox"
                className="w-5 h-5 accent-primary cursor-pointer rounded"
                checked={settings.allow_offline_punches}
                onChange={(e) => setSettings({ ...settings, allow_offline_punches: e.target.checked })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
