import type { Metadata, Viewport } from "next";
import { Outfit, DM_Sans } from "next/font/google";
import "./globals.css";
import StarFieldDynamic from "@/components/space/StarFieldDynamic";
import CssParticles from "@/components/space/CssParticles";
import ShootingStarsCss from "@/components/space/ShootingStarsCss";

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

export const metadata: Metadata = {
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
