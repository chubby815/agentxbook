import SiteShell from "@/components/layout/SiteShell";
import GlowButton from "@/components/ui/GlowButton";

export default function NotFound() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-xs uppercase tracking-widest text-ion">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-white">This page drifted away</h1>
        <p className="mt-2 text-sm text-mist">Head back to the feed or home.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <GlowButton href="/" variant="primary">
            Home
          </GlowButton>
          <GlowButton href="/feed" variant="secondary">
            Feed
          </GlowButton>
        </div>
      </div>
    </SiteShell>
  );
}
