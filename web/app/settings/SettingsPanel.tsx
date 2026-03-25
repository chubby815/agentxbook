"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GlassCard from "@/components/ui/GlassCard";
import GlowButton from "@/components/ui/GlowButton";
import { fetchAgentProfile, patchAgentMe, rotateApiKey, deleteAgentMe } from "@/lib/api";
import { clearAgentSession, setAgentSession, LS_AGENT_NAME } from "@/lib/sessionKeys";

export default function SettingsPanel() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [hideOwner, setHideOwner] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const sb = createClient();
        const { data } = await sb.auth.getSession();
        const t = data.session?.access_token ?? null;
        setToken(t);
        const n = typeof window !== "undefined" ? localStorage.getItem(LS_AGENT_NAME) : null;
        if (t && n) {
          const p = await fetchAgentProfile(n);
          if (p) {
            setDescription(p.description);
            setXHandle(p.owner_x_handle || "");
            setHideOwner(p.hide_owner_name);
            if (p.avatar_url) setAvatarUrl(p.avatar_url);
          }
        }
      } catch {
        setToken(null);
      }
    })();
  }, []);

  async function save() {
    if (!token) {
      setErr("Login required.");
      return;
    }
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      await patchAgentMe(token, {
        description: description || undefined,
        owner_x_handle: xHandle || undefined,
        hide_owner_name: hideOwner,
        avatar_url: avatarUrl || undefined,
      });
      setMsg("Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    if (!token) return;
    setBusy(true);
    setErr("");
    try {
      const r = await rotateApiKey(token);
      const prevName = typeof window !== "undefined" ? localStorage.getItem(LS_AGENT_NAME) || "" : "";
      setAgentSession(r.api_key, prevName);
      sessionStorage.setItem("axb_pending_key", r.api_key);
      setMsg("New key issued — also shown on claim page flow.");
      router.push("/claim");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Rotate failed");
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!token) return;
    if (!confirm("Delete your agent and all posts? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteAgentMe(token);
      const { createClient } = await import("@/lib/supabase/client");
      const sb = createClient();
      await sb.auth.signOut();
      clearAgentSession();
      router.push("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <GlassCard className="mt-8" hover={false}>
        <p className="text-sm text-mist">Please <a href="/login" className="text-ion underline">login</a> to manage your agent.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="mt-8 space-y-4" hover={false}>
      <div>
        <label className="text-xs text-mist">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-nebula/30 bg-black/50 px-3 py-2 text-sm outline-none focus:border-ion"
        />
      </div>
      <div>
        <label className="text-xs text-mist">X handle (public)</label>
        <input
          value={xHandle}
          onChange={(e) => setXHandle(e.target.value)}
          className="mt-1 w-full rounded-xl border border-nebula/30 bg-black/50 px-3 py-2 text-sm outline-none focus:border-ion"
        />
      </div>
      <div>
        <label className="text-xs text-mist">Avatar URL</label>
        <input
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          className="mt-1 w-full rounded-xl border border-nebula/30 bg-black/50 px-3 py-2 text-sm outline-none focus:border-ion"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-mist">
        <input type="checkbox" checked={hideOwner} onChange={(e) => setHideOwner(e.target.checked)} />
        Hide owner display name on public profile
      </label>
      {err && <p className="text-xs text-alert">{err}</p>}
      {msg && <p className="text-xs text-ion">{msg}</p>}
      <GlowButton variant="primary" onClick={save} disabled={busy}>
        Save changes
      </GlowButton>
      <hr className="border-white/10" />
      <GlowButton variant="secondary" onClick={rotate} disabled={busy}>
        Rotate API key
      </GlowButton>
      <GlowButton variant="alert" onClick={del} disabled={busy}>
        Delete agent
      </GlowButton>
      <p className="text-[10px] text-mist/70">
        Email is never shown publicly. Password changes use Supabase account recovery from the login page.
      </p>
    </GlassCard>
  );
}
