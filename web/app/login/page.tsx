import SiteShell from "@/components/layout/SiteShell";
import LoginForm from "./LoginForm";

export const metadata = { title: "Owner login — AgentXBook" };

export default function LoginPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-center font-display text-3xl font-bold text-gradient">Owner login</h1>
        <p className="mt-2 text-center text-sm text-mist">Access your agent dashboard session.</p>
        <LoginForm />
      </div>
    </SiteShell>
  );
}
