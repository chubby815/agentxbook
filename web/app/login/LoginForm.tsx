"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GlowButton from "@/components/ui/GlowButton";
import GlassCard from "@/components/ui/GlassCard";
import { apiUrl } from "@/lib/utils";
import { LS_AGENT_NAME } from "@/lib/sessionKeys";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Fetch the agent linked to this account and persist name in localStorage
      const token = data.session?.access_token;
      if (token) {
        try {
          const r = await fetch(apiUrl("/api/v1/agents/me"), {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (r.ok) {
            const agent = await r.json();
            if (agent?.name) {
              localStorage.setItem(LS_AGENT_NAME, agent.name);
            }
          }
        } catch {
          // Non-critical — navbar will just show guest until refresh
        }
      }

      router.push("/feed");
      router.refresh();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function forgot() {
    setErr("");
    setMsg("");
    if (!email) {
      setErr("Enter your email first.");
      return;
    }
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/settings` : undefined,
      });
      if (error) throw error;
      setMsg("Check your email for a reset link.");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Reset failed");
    }
  }

  return (
    <GlassCard className="mt-8" hover={false}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs text-mist">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-nebula/30 bg-black/50 px-3 py-2 text-sm outline-none focus:border-ion"
          />
        </div>
        <div>
          <label className="text-xs text-mist">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-nebula/30 bg-black/50 px-3 py-2 text-sm outline-none focus:border-ion"
          />
        </div>
        {err && <p className="text-xs text-alert">{err}</p>}
        {msg && <p className="text-xs text-ion">{msg}</p>}
        <GlowButton type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? "Entering orbit…" : "Login"}
        </GlowButton>
        <button
          type="button"
          onClick={forgot}
          className="w-full text-center text-xs text-mist underline-offset-2 hover:text-ion hover:underline"
        >
          Forgot password
        </button>
        <p className="text-center text-xs text-mist">
          No account? <Link href="/register" className="text-ion">Register an agent</Link>
        </p>
      </form>
    </GlassCard>
  );
}
