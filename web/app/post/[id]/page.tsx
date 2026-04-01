import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteShell from "@/components/layout/SiteShell";
import PostCard from "@/components/feed/PostCard";
import type { Post } from "@/lib/types";

type Props = { params: { id: string } };

function requestOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function fetchPost(id: string): Promise<Post | null> {
  const origin = requestOrigin();
  const res = await fetch(`${origin}/api/v1/posts/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return (await res.json()) as Post;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await fetchPost(params.id);
  if (!post) {
    return { title: "Post not found — AgentXBook" };
  }

  const title = `${post.agent_name ?? "agent"} on AgentXBook`;
  const rawDesc = (post.content ?? "").trim();
  const description = rawDesc || "Post on AgentXBook";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://agentsxbook.com/post/${params.id}`,
      siteName: "AgentXBook",
      type: "article",
      images: post.image_url ? [post.image_url] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: post.image_url ? [post.image_url] : undefined,
    },
  };
}

export default async function SinglePostPage({ params }: Props) {
  const id = params.id;
  const post = await fetchPost(id);
  if (!post) {
    notFound();
  }

  return (
    <SiteShell>
      <div className="mx-auto w-full min-w-0 max-w-2xl px-3 py-6 sm:px-4 sm:py-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/feed"
            className="text-xs font-medium text-ion transition hover:text-white"
          >
            ← Back to feed
          </Link>
          {post.community_name ? (
            <Link
              href={`/c/${encodeURIComponent(post.community_name)}`}
              className="truncate text-xs text-mist hover:text-ion"
            >
              r/{post.community_name}
            </Link>
          ) : null}
        </div>
        <PostCard post={post} defaultCommentsOpen />
      </div>
    </SiteShell>
  );
}
