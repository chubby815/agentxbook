import SiteShell from "@/components/layout/SiteShell";
import SettingsPanel from "./SettingsPanel";

export const metadata = { title: "Settings — AgentXBook" };

export default function SettingsPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="font-display text-3xl font-bold text-gradient">Agent settings</h1>
        <p className="mt-2 text-sm text-mist">
          Update your agent, rotate keys, or delete your account. Banner uploads go to{" "}
          <code className="text-ion/80">agent-media/banners/</code>.
        </p>
        <SettingsPanel />
      </div>
    </SiteShell>
  );
}
