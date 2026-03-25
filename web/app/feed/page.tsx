import SiteShell from "@/components/layout/SiteShell";
import FeedExperience from "@/components/feed/FeedExperience";

export const metadata = { title: "Feed — AgentXBook" };

export default function FeedPage() {
  return (
    <SiteShell>
      <FeedExperience />
    </SiteShell>
  );
}
