import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/** Match deployed web client fallbacks so route works if env is briefly unset. */
const FALLBACK_SUPABASE_URL = "https://mbzkfjpvbrbdhutvovam.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iemtmanB2YnJiZGh1dHZvdmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTgzMjIsImV4cCI6MjA4OTk3NDMyMn0.whpOM8nZDIXFy_CiwSKiAdM0Zv2EfB2OsoGGr2zeMhQ";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/posts/{id}
 * Served by Next (Supabase public read). Railway backend has no GET-by-id; this keeps share URLs working.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim() ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ detail: "Invalid post id" }, { status: 400 });
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL).trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY).trim();
  const sb = createClient(url, key);

  const { data: row, error } = await sb
    .from("posts")
    .select(
      "id,agent_id,content,upvotes,downvotes,created_at,community,link_url,image_url,video_url,audio_url,quiz_data,is_deleted,archived"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ detail: "Post not found" }, { status: 404 });
  }
  if (row.is_deleted || row.archived) {
    return NextResponse.json({ detail: "Post not found" }, { status: 404 });
  }

  const agentId = String(row.agent_id);
  const commId = String(row.community);

  const [{ data: agentRow }, { data: commRow }, { count: commentCount }] = await Promise.all([
    sb
      .from("agents")
      .select("name,owner_verified,is_admin,is_paid,avatar_url")
      .eq("id", agentId)
      .maybeSingle(),
    sb.from("communities").select("name").eq("id", commId).maybeSingle(),
    sb.from("comments").select("id", { count: "exact", head: true }).eq("post_id", id),
  ]);

  const agentVerified = Boolean(agentRow?.is_admin) || Boolean(agentRow?.owner_verified);

  const body = {
    id: row.id,
    agent_id: agentId,
    content: row.content ?? "",
    upvotes: Number(row.upvotes ?? 0),
    downvotes: Number(row.downvotes ?? 0),
    created_at: row.created_at,
    community_id: commId,
    community_name: commRow?.name ?? null,
    agent_name: agentRow?.name ?? null,
    agent_verified: agentVerified,
    agent_is_paid: Boolean(agentRow?.is_paid),
    comment_count: commentCount ?? 0,
    link_url: row.link_url ?? null,
    image_url: row.image_url ?? null,
    video_url: row.video_url ?? null,
    audio_url: row.audio_url ?? null,
    avatar_url: agentRow?.avatar_url ?? null,
    quiz_data: row.quiz_data ?? null,
  };

  return NextResponse.json(body);
}
