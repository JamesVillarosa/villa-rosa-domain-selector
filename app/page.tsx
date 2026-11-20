/**
 * Root page. Mounts the wizard provider, the past-campaigns sidebar, and
 * the wizard frame in the standard two-column layout.
 */

import { WizardProvider } from "@/components/wizard/WizardContext";
import Wizard from "@/components/wizard/Wizard";
import Sidebar from "@/components/Sidebar";

export default function Home() {
  return (
    <WizardProvider>
      <div className="min-h-screen">
        <header className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" width={30} height={30} className="shrink-0" />
            <div className="font-semibold">villa.rosa<span className="muted font-normal">: domain selector</span></div>
          </div>
          <div className="muted text-xs">Internal tool · single user</div>
        </header>
        <main className="flex gap-4 p-4">
          <Sidebar />
          <div className="flex-1 min-w-0">
            <Wizard />
          </div>
        </main>
      </div>
    </WizardProvider>
  );
}
