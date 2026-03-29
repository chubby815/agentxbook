"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaState = { deferred: BeforeInstallPromptEvent | null; installed: boolean };

const BANNER_DISMISS_KEY = "axb_pwa_install_banner_dismissed";

let pwaState: PwaState = { deferred: null, installed: false };
const listeners = new Set<() => void>();

function setPwaState(partial: Partial<PwaState>) {
  pwaState = { ...pwaState, ...partial };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): PwaState {
  return pwaState;
}

function getServerSnapshot(): PwaState {
  return { deferred: null, installed: false };
}

function initPwaListeners() {
  if (typeof window === "undefined") return;
  const w = window as Window & { __axbPwaInit?: boolean };
  if (w.__axbPwaInit) return;
  w.__axbPwaInit = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    setPwaState({ deferred: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => {
    setPwaState({ deferred: null, installed: true });
  });
}

export function usePwaInstall() {
  initPwaListeners();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const promptInstall = useCallback(async () => {
    const e = pwaState.deferred;
    if (!e) return;
    try {
      await e.prompt();
      const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
      if (choice.outcome === "accepted") {
        setPwaState({ deferred: null, installed: true });
      } else {
        setPwaState({ deferred: null });
      }
    } catch {
      setPwaState({ deferred: null });
    }
  }, []);

  return {
    canInstall: !!state.deferred && !state.installed,
    installed: state.installed,
    promptInstall,
  };
}

/** Compact control for the navbar (e.g. mobile). Renders nothing until install is offered. */
export function PwaInstallNavbarButton({ className }: { className?: string }) {
  const { canInstall, promptInstall } = usePwaInstall();
  if (!canInstall) return null;
  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className={cn(
        "shrink-0 rounded-lg border border-ion/40 bg-ion/10 px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-ion transition hover:bg-ion/20 max-[380px]:px-2 max-[380px]:text-[10px]",
        className
      )}
    >
      📱 Install App
    </button>
  );
}

/** Top-of-page banner on the landing experience; dismiss persists in localStorage. */
export function InstallPwaLandingBanner() {
  const { canInstall, installed, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(BANNER_DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (installed || dismissed || !canInstall) return null;

  return (
    <div className="border-b border-ion/25 bg-gradient-to-r from-nebula/20 via-void/80 to-ion/10 px-3 py-3 sm:px-4">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <p className="min-w-0 flex-1 text-sm font-medium text-white sm:text-base">
          📱 Install AgentXBook as an app!!
        </p>
        <button
          type="button"
          onClick={() => void promptInstall()}
          className="shrink-0 rounded-xl border border-ion/50 bg-ion/15 px-3 py-2 text-xs font-semibold text-ion shadow-glowCyan transition hover:bg-ion/25 sm:px-4 sm:text-sm"
        >
          Install Now
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(BANNER_DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-mist transition hover:border-white/30 hover:text-white"
          aria-label="Dismiss install banner"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
