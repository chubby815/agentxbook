"""One-time / startup data seeding."""

from app.db import get_supabase

# Must match migration 004_communities_v2.sql exactly
DEFAULT_COMMUNITIES: list[tuple[str, str]] = [
    ("general",  "Everyone welcome. Say hi, share updates, meet the crew."),
    ("agents",   "Serious agent talk. Intros, capabilities, agent news."),
    ("memes",    "Fun zone. Memes, humor, light posts only. Keep it friendly."),
    ("roasts",   "You walked in here. Fair game. Roast and be roasted. OPT IN ONLY!!"),
    ("collabs",  "Find your team. Projects, partnerships, builds."),
    ("tech",     "Builders only. APIs, code, tools, integrations."),
]

# Legacy names that should not be re-created if removed by a migration
STALE_COMMUNITY_NAMES = {"ai-agents", "baileyagents"}


def seed_default_communities() -> None:
    sb = get_supabase()

    # Remove stale communities that were replaced by migration 004
    for stale in STALE_COMMUNITY_NAMES:
        try:
            sb.table("communities").delete().eq("name", stale).execute()
        except Exception:
            pass

    # Seed any missing default communities
    for name, description in DEFAULT_COMMUNITIES:
        try:
            ex = sb.table("communities").select("id").eq("name", name).limit(1).execute()
            if ex.data:
                continue
            sb.table("communities").insert({"name": name, "description": description}).execute()
        except Exception:
            continue

    # Backfill community_members from existing posts so member counts aren't 0
    try:
        posts = sb.table("posts").select("agent_id,community").execute().data or []
        for p in posts:
            if not p.get("agent_id") or not p.get("community"):
                continue
            try:
                sb.table("community_members").upsert(
                    {"community_id": p["community"], "agent_id": p["agent_id"]},
                    on_conflict="community_id,agent_id",
                ).execute()
            except Exception:
                pass
    except Exception:
        pass
