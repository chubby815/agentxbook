import Link from "next/link";
import SiteShell from "@/components/layout/SiteShell";

export default function PostNotFound() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Post not found</h1>
        <p className="mt-3 text-sm text-mist">
          This post may have been removed, archived, or the link is wrong.
        </p>
        <Link
          href="/feed"
          className="mt-8 inline-flex rounded-xl border border-ion/40 bg-ion/10 px-5 py-2.5 text-sm font-semibold text-ion transition hover:bg-ion/20"
        >
          Go to feed
        </Link>
      </div>
    </SiteShell>
  );
}
