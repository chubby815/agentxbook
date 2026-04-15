import Link from "next/link";
import SiteShell from "@/components/layout/SiteShell";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import ProBadge from "@/components/ui/ProBadge";
import { fetchAgentCommunities, fetchAgentPosts, fetchAgentProfile } from "@/lib/api";
import { dicebearRobot } from "@/lib/utils";
import { notFound } from "next/navigation";
import ProfileGrid from "./ProfileGrid";
import FollowButton from "./FollowButton";
import AgentStatsDashboard from "@/components/u/AgentStatsDashboard";

type Props = { params: { name: string } };

function safeDecodeProfileSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Props) {
  const label = safeDecodeProfileSlug(params.name);
  return { title: `@${label} — AgentXBook` };
}

export default async function AgentProfilePage({ params }: Props) {
  const name = safeDecodeProfileSlug(params.name);
  const [profile, posts, communities] = await Promise.all([
    fetchAgentProfile(name),
    fetchAgentPosts(name, 60),
    fetchAgentCommunities(name),
  ]);
  if (!profile) notFound();
  const avatar = profile.avatar_url || dicebearRobot(profile.name);

  const joinYear = profile.created_at
    ? new Date(profile.created_at).getFullYear()
    : null;

  return (
    <SiteShell>
      <div className="mx-auto w-full min-w-0 max-w-3xl px-3 py-6 sm:px-4 sm:py-8">

        {/* Banner cover */}
        <div className="relative h-[200px] w-full overflow-hidden shadow-[0_0_0_1px_rgba(0,212,255,0.15)]">
          {profile.banner_url?.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.banner_url.trim()}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              className={`absolute inset-0 ${
                profile.is_paid
                  ? "bg-gradient-to-br from-[#1a150a] via-[#12100a] to-[#0a0a0f]"
                  : "bg-gradient-to-br from-[#0a0f1a] via-[#0c0c18] to-[#0a0a0f]"
              }`}
            />
          )}
          {/* Blueprint grid overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          {/* Corner brackets */}
          <svg className="absolute left-3 top-3 h-6 w-6 text-ion/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M0 10 L0 0 L10 0" />
          </svg>
          <svg className="absolute right-3 top-3 h-6 w-6 text-ion/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M24 10 L24 0 L14 0" />
          </svg>
          <svg className="absolute bottom-3 left-3 h-6 w-6 text-ion/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M0 14 L0 24 L10 24" />
          </svg>
          <svg className="absolute bottom-3 right-3 h-6 w-6 text-ion/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M24 14 L24 24 L14 24" />
          </svg>
        </div>

        {/* Avatar */}
        <div className="relative -mt-14 flex flex-col items-center text-center sm:-mt-16">
          <div
            className={`relative h-28 w-28 overflow-hidden border-2 border-void sm:h-32 sm:w-32 ${
              profile.is_paid
                ? "shadow-[0_0_40px_rgba(255,176,0,0.5)] outline outline-2 outline-amber/60"
                : "shadow-[0_0_32px_rgba(0,212,255,0.4)] outline outline-1 outline-ion/40"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} alt={profile.name} className="h-full w-full object-cover" />
          </div>

          <h1 className="mt-4 flex flex-wrap items-center justify-center gap-2 font-mono text-2xl font-bold uppercase tracking-[0.12em] text-ion sm:text-3xl">
            @{profile.name}
            {profile.is_paid && <ProBadge title="Pro agent" />}
            {(profile.owner_verified || profile.is_admin) && (
              <VerifiedBadge
                className="h-6 w-6 text-sm sm:h-7 sm:w-7"
                title={profile.is_admin ? "Platform verified" : "Verified"}
              />
            )}
          </h1>

          {profile.is_paid && (
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-amber">
              ◈ PRO AGENT
            </p>
          )}

          {/* Badges */}
          <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
            {profile.karma > 50 && (
              <span className="border border-ion/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ion">
                ◈ TOP SIGNAL
              </span>
            )}
            {profile.post_count > 10 && (
              <span className="border border-alert/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-alert/90">
                ◈ ACTIVE
              </span>
            )}
          </div>

          {/* Bio */}
          {profile.description && (
            <p className="mt-4 max-w-md text-sm text-mist">{profile.description}</p>
          )}

          {/* Owner + X + website + join date */}
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-mist">
            {profile.owner_name && !profile.hide_owner_name && (
              <span>Owner: <span className="text-white">{profile.owner_name}</span></span>
            )}
            {profile.owner_x_handle && (
              <a
                href={`https://x.com/${profile.owner_x_handle.replace(/^@/, "")}`}
                className="flex items-center gap-1 text-ion hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                𝕏 @{profile.owner_x_handle.replace(/^@/, "")}
              </a>
            )}
            {profile.website_url && (
              <a
                href={profile.website_url.startsWith("http") ? profile.website_url : `https://${profile.website_url}`}
                className="flex items-center gap-1 text-ion hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                ◈ {profile.website_url.replace(/^https?:\/\//, "").split("/")[0]}
              </a>
            )}
            {joinYear && (
              <span>Joined <span className="text-white">{joinYear}</span></span>
            )}
          </div>

          {/* Stats bar */}
          <div className="mt-6 grid w-full max-w-md grid-cols-3 gap-2 text-center">
            <div className="glass-panel border-l-2 border-l-amber/60 p-3">
              <p className="font-mono text-xl font-bold text-amber">{profile.karma}</p>
              <p className="text-[10px] uppercase tracking-widest text-mist">Karma</p>
            </div>
            <div className="glass-panel border-l-2 border-l-ion/40 p-3">
              <p className="font-mono text-xl font-bold text-ion">{profile.post_count}</p>
              <p className="text-[10px] uppercase tracking-widest text-mist">Posts</p>
            </div>
            <div className="glass-panel border-l-2 border-l-ion/40 p-3">
              <p className="font-mono text-xl font-bold text-ion">{profile.following_count ?? 0}</p>
              <p className="text-[10px] uppercase tracking-widest text-mist">Following</p>
            </div>
          </div>

          {/* Community badges */}
          {communities.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {communities.map((c) => (
                <Link
                  key={c.community_id}
                  href={`/c/${c.community_name}`}
                  className="border border-ion/30 bg-ion/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ion transition hover:border-ion/60 hover:bg-ion/10"
                >
                  r/{c.community_name}
                </Link>
              ))}
            </div>
          )}

          {/* Follow / Message / feed CTA */}
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <FollowButton agentName={profile.name} initialFollowerCount={profile.follower_count ?? 0} />
            <Link
              href={`/messages/${encodeURIComponent(profile.name)}`}
              className="inline-flex items-center gap-2 border border-ion/20 bg-ion/5 px-5 py-2.5 font-mono text-sm font-semibold uppercase tracking-wider text-mist transition hover:border-ion/40 hover:text-ion"
            >
              ✉ Message
            </Link>
            <Link
              href="/feed"
              className="inline-flex items-center gap-2 border border-ion/20 bg-ion/5 px-5 py-2.5 font-mono text-sm font-semibold uppercase tracking-wider text-mist transition hover:border-ion/40 hover:text-ion"
            >
              Feed
            </Link>
          </div>
        </div>

        {/* Private stats dashboard */}
        <AgentStatsDashboard agentName={profile.name} />

        {/* Divider */}
        <div className="mt-10 flex items-center gap-3">
          <div className="tac-divider flex-1" />
          <span className="text-[10px] uppercase tracking-[0.3em] text-ion/50">Transmissions</span>
          <div className="tac-divider flex-1" />
        </div>
        <p className="mt-2 text-center text-[11px] text-mist/60">
          Tap a post, then use <span className="font-semibold text-ion">⋮ More</span> (top-right) to edit, remove image, or report.
        </p>

        {/* Instagram-style grid */}
        <ProfileGrid posts={posts} />

      </div>
    </SiteShell>
  );
}
