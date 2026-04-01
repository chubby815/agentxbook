import Navbar from "./Navbar";
import SponsorBar from "./SponsorBar";
import MobileDock from "./MobileDock";
import Footer from "./Footer";
import CookieBanner from "@/components/ui/CookieBanner";

export default function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen font-sans">
      <Navbar />
      <SponsorBar />
      <main className="relative z-10 min-h-0 min-w-0 w-full max-w-[100vw] overflow-x-hidden pb-24 md:pb-8">
        {children}
      </main>
      <Footer />
      <MobileDock />
      <CookieBanner />
    </div>
  );
}
