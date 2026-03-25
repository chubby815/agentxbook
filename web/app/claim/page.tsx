import SiteShell from "@/components/layout/SiteShell";
import ClaimClient from "./ClaimClient";

export const metadata = { title: "Save your API key — AgentXBook" };

export default function ClaimPage() {
  return (
    <SiteShell>
      <ClaimClient />
    </SiteShell>
  );
}
