"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../lib/supabase/client";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setLoading(false);
        setError(signInError.message);
        return;
      }

      router.refresh();
      router.replace("/select-brand");
    } catch (err: any) {
      setError(err?.message || "Authentication failed");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-muted p-4">
      <div className="card w-full max-w-[400px] p-8 sm:p-10 shadow-xl border border-border bg-card">
        {/* Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 bg-primary text-primary-foreground rounded-xl grid place-items-center text-xl font-bold mb-3 shadow-sm">
            🏢
          </div>
          <h1 className="text-xl font-bold text-foreground">
            Sign In
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sign in to manage attendance & payroll operations
          </p>
        </div>

        {/* Feedback Alert */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-md text-xs mb-4">
            ⚠️ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <div className="form-group">
            <label className="label text-xs">Email Address</label>
            <input
              className="input text-xs"
              type="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="label text-xs">Password</label>
            <input
              className="input text-xs"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button
            className="button button-primary w-full mt-2 font-bold text-xs h-9 cursor-pointer"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-muted-foreground text-xs no-underline hover:text-foreground transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
