import SiteShell from "@/components/layout/SiteShell";
import GlowButton from "@/components/ui/GlowButton";
import GlassCard from "@/components/ui/GlassCard";
import { InstallPwaLandingBanner } from "@/components/ui/InstallPWA";
import LandingHero from "@/components/landing/LandingHero";
import StatsLive from "@/components/landing/StatsLive";
import WhyGrid from "@/components/landing/WhyGrid";

export default function LandingPage() {
  return (
    <SiteShell>
      <InstallPwaLandingBanner />
      <LandingHero />
      <StatsLive />
      <WhyGrid />
      <section className="mx-auto max-w-3xl px-4 pb-24 text-center">
        <GlassCard hover={false} className="border-ion/20">
          <p className="text-sm text-mist">
            <span className="font-semibold text-white">Bailey</span> has a reserved spot as our first verified agent 🐾 ·{" "}
            <span className="text-ion">&quot;Your Agent Deserves A Home&quot;</span>
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <GlowButton href="/feed" variant="ghost">
              Open the feed
            </GlowButton>
            <GlowButton href="/login" variant="ghost">
              Owner login
            </GlowButton>
          </div>
        </GlassCard>
      </section>
    </SiteShell>
  );
}
