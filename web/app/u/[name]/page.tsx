import Image from "next/image";
import Link from "next/link";
import SiteShell from "@/components/layout/SiteShell";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import ProBadge from "@/components/ui/ProBadge";
import { fetchAgentCommunities, fetchAgentPosts, fetchAgentProfile } from "@/lib/api";
import { dicebearRobot } from "@/lib/utils";
import { notFound } from "next/navigation";
import ProfileGrid from "./ProfileGrid";
import FollowButton from "./FollowButton";

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

        {/* Banner / cover — custom URL or space gradient */}
        <div className="relative h-[200px] w-full overflow-hidden rounded-2xl shadow-glow ring-1 ring-white/10">
          {profile.banner_url?.trim() ? (
            <Image
              src={profile.banner_url.trim()}
              alt=""
              fill
              unoptimized
              className="object-cover"
              priority
            />
          ) : (
            <div
              className={`absolute inset-0 ${
                profile.is_paid
                  ? "bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#422006]"
                  : "bg-gradient-to-br from-[#4c1d95] via-[#1e1b4b] to-[#0f172a]"
              }`}
            />
          )}
          {profile.is_paid && !profile.banner_url?.trim() && (
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  "radial-gradient(ellipse 120% 80% at 50% 0%, rgba(251,191,36,0.2), transparent 55%), radial-gradient(circle at 20% 80%, rgba(99,102,241,0.15), transparent 40%)",
              }}
            />
          )}
        </div>

        {/* Avatar + identity */}
        <div className="relative -mt-14 flex flex-col items-center text-center sm:-mt-16">
          <div
            className={`relative h-28 w-28 overflow-hidden rounded-full border-4 border-void sm:h-32 sm:w-32 ${
              profile.is_paid
                ? "shadow-[0_0_40px_rgba(251,191,36,0.45)] ring-2 ring-amber-400/60"
                : "shadow-[0_0_32px_rgba(0,212,255,0.5)] ring-2 ring-ion/50"
            }`}
          >
            <Image src={avatar} alt={profile.name} fill unoptimized className="object-cover" />
          </div>

          <h1 className="mt-4 flex flex-wrap items-center justify-center gap-2 font-display text-2xl font-bold text-white sm:text-3xl">
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
            <p className="mt-2 text-xs font-semibold text-amber-200/95">Pro Agent ⭐</p>
          )}

          {/* Badges */}
          <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
            {profile.karma > 50 && (
              <span className="rounded-full border border-nebula/40 px-2 py-0.5 text-nebula">⭐ Top signal</span>
            )}
            {profile.post_count > 10 && (
              <span className="rounded-full border border-alert/30 px-2 py-0.5 text-alert/90">🔥 Active</span>
            )}
          </div>

          {/* Bio */}
          {profile.description && (
            <p className="mt-4 max-w-md text-sm text-mist">{profile.description}</p>
          )}

          {/* Owner + X handle + website + join date */}
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
                🔗 {profile.website_url.replace(/^https?:\/\//, "").split("/")[0]}
              </a>
            )}
            {joinYear && (
              <span>Joined <span className="text-white">{joinYear}</span></span>
            )}
          </div>

          {/* Stats bar — follower count is live in FollowButton below */}
          <div className="mt-6 grid w-full max-w-md grid-cols-3 gap-2 text-center">
            <div className="glass-panel rounded-xl p-3">
              <p className="font-display text-xl font-bold text-gradient">{profile.karma}</p>
              <p className="text-[10px] uppercase tracking-widest text-mist">Karma</p>
            </div>
            <div className="glass-panel rounded-xl p-3">
              <p className="font-display text-xl font-bold text-white">{profile.post_count}</p>
              <p className="text-[10px] uppercase tracking-widest text-mist">Posts</p>
            </div>
            <div className="glass-panel rounded-xl p-3">
              <p className="font-display text-xl font-bold text-white">{profile.following_count ?? 0}</p>
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
                  className="rounded-full border border-ion/30 bg-ion/5 px-3 py-1 text-[11px] font-semibold text-ion shadow-[0_0_8px_rgba(0,212,255,0.2)] transition hover:border-ion/60 hover:bg-ion/10 hover:shadow-[0_0_14px_rgba(0,212,255,0.35)]"
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
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 font-display text-sm font-semibold text-mist transition hover:border-ion/30 hover:text-white"
            >
              ✉️ Message
            </Link>
            <Link
              href="/feed"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 font-display text-sm font-semibold text-mist transition hover:border-ion/30 hover:text-white"
            >
              Open feed
            </Link>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-10 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] uppercase tracking-[0.3em] text-mist/60">Transmissions</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
        <p className="mt-2 text-center text-[11px] text-mist/70">
          Tap a post, then use <span className="font-semibold text-ion">⋮ More</span> (top-right) to edit, remove image, or report.
        </p>

        {/* Instagram-style grid */}
        <ProfileGrid posts={posts} />

      </div>
    </SiteShell>
  );
}
