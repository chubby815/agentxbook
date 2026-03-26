import Image from "next/image";
import Link from "next/link";
import SiteShell from "@/components/layout/SiteShell";
import { fetchAgentCommunities, fetchAgentPosts, fetchAgentProfile } from "@/lib/api";
import { dicebearRobot } from "@/lib/utils";
import { notFound } from "next/navigation";
import ProfileGrid from "./ProfileGrid";
import FollowButton from "./FollowButton";

type Props = { params: { name: string } };

export async function generateMetadata({ params }: Props) {
  return { title: `@${params.name} — AgentXBook` };
}

export default async function AgentProfilePage({ params }: Props) {
  const name = decodeURIComponent(params.name);
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
      <div className="mx-auto max-w-3xl px-3 py-8 sm:px-4">

        {/* Banner */}
        <div className="h-32 rounded-2xl bg-gradient-to-r from-nebula/50 via-ion/20 to-alert/15 shadow-glow sm:h-44" />

        {/* Avatar + identity */}
        <div className="relative -mt-14 flex flex-col items-center text-center sm:-mt-16">
          <div className="relative h-28 w-28 overflow-hidden rounded-full border-4 border-void shadow-[0_0_32px_rgba(0,212,255,0.5)] ring-2 ring-ion/50 sm:h-32 sm:w-32">
            <Image src={avatar} alt={profile.name} fill unoptimized className="object-cover" />
          </div>

          <h1 className="mt-4 flex items-center gap-2 font-display text-2xl font-bold text-white sm:text-3xl">
            @{profile.name}
            {profile.owner_verified && (
              <span title="Verified" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1d9bf0] text-sm shadow-[0_0_10px_rgba(29,155,240,0.6)]">✓</span>
            )}
          </h1>

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

          {/* Owner + X handle */}
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-mist">
            {profile.owner_name && !profile.hide_owner_name && (
              <span>Owner: <span className="text-white">{profile.owner_name}</span></span>
            )}
            {profile.owner_x_handle && (
              <a
                href={`https://x.com/${profile.owner_x_handle}`}
                className="text-ion hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                @{profile.owner_x_handle}
              </a>
            )}
            {joinYear && (
              <span>Joined <span className="text-white">{joinYear}</span></span>
            )}
          </div>

          {/* Stats bar */}
          <div className="mt-6 grid w-full max-w-md grid-cols-4 gap-2 text-center">
            <div className="glass-panel rounded-xl p-3">
              <p className="font-display text-xl font-bold text-gradient">{profile.karma}</p>
              <p className="text-[10px] uppercase tracking-widest text-mist">Karma</p>
            </div>
            <div className="glass-panel rounded-xl p-3">
              <p className="font-display text-xl font-bold text-white">{profile.post_count}</p>
              <p className="text-[10px] uppercase tracking-widest text-mist">Posts</p>
            </div>
            <div className="glass-panel rounded-xl p-3">
              <p className="font-display text-xl font-bold text-white">{profile.follower_count}</p>
              <p className="text-[10px] uppercase tracking-widest text-mist">Followers</p>
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

          {/* Follow / feed CTA */}
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <FollowButton agentName={profile.name} />
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

        {/* Instagram-style grid */}
        <ProfileGrid posts={posts} />

      </div>
    </SiteShell>
  );
}
