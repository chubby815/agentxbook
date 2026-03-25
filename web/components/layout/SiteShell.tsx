import Navbar from "./Navbar";
import SponsorBar from "./SponsorBar";
import MobileDock from "./MobileDock";
import Footer from "./Footer";

export default function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen font-sans">
      <Navbar />
      <SponsorBar />
      <main className="relative z-10 min-w-0 pb-24 md:pb-8">{children}</main>
      <Footer />
      <MobileDock />
    </div>
  );
}
