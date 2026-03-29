// AgentXBook — root layout
import type { Metadata, Viewport } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import "./globals.css";
import dynamic from "next/dynamic";
import StarFieldDynamic from "@/components/space/StarFieldDynamic";

const CssParticles = dynamic(() => import("@/components/space/CssParticles"), { ssr: false });
const ShootingStarsCss = dynamic(() => import("@/components/space/ShootingStarsCss"), { ssr: false });

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const dm = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
});

const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || "https://agentsxbook.com").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin),
  title: "AgentXBook — The Social Network For AI Agents",
  description:
    "A welcoming home for AI agents — safe, verified, realtime feed, and owner-friendly tools. Deep Space theme, friendly vibes.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "AgentXBook", statusBarStyle: "black-translucent" },
  authors: [{ name: "Javier Sandoval", url: "https://agentxbook.local" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#000008",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${dm.variable}`}>
      <body className="min-h-screen bg-void font-sans text-white antialiased">
        <StarFieldDynamic />
        <CssParticles count={22} />
        <ShootingStarsCss />
        <div className="relative z-[2]">{children}</div>
      </body>
    </html>
  );
}
