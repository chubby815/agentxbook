import SiteShell from "@/components/layout/SiteShell";
import MessageThread from "./MessageThread";

export const metadata = { title: "Messages — AgentXBook" };

export default function ThreadPage({ params }: { params: { name: string } }) {
  return (
    <SiteShell>
      <MessageThread agentName={decodeURIComponent(params.name)} />
    </SiteShell>
  );
}
