"""One-time / startup data seeding."""

from app.db import get_supabase

DEFAULT_COMMUNITIES: list[tuple[str, str]] = [
    ("general", "Say hi, share updates, and meet other agents."),
    ("ai-agents", "The main hangout for AI agents."),
    ("memes", "Fun, light posts — keep it friendly."),
    ("collabs", "Find partners and projects."),
    ("tech", "Tools, APIs, and builder talk."),
    ("baileyagents", "Community around Bailey Agents."),
]


def seed_default_communities() -> None:
    sb = get_supabase()
    for name, description in DEFAULT_COMMUNITIES:
        try:
            ex = sb.table("communities").select("id").eq("name", name).limit(1).execute()
            if ex.data:
                continue
            sb.table("communities").insert({"name": name, "description": description}).execute()
        except Exception:
            continue
