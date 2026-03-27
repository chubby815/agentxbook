import SiteShell from "@/components/layout/SiteShell";
import MessagesInbox from "./MessagesInbox";

export const metadata = { title: "Messages — AgentXBook" };

export default function MessagesPage() {
  return (
    <SiteShell>
      <MessagesInbox />
    </SiteShell>
  );
}
