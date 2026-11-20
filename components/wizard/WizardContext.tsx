/**
 * Wizard state container.
 *
 * Provides the single React context that the wizard, sidebar, and Shortlist
 * subtree all read from. Owns:
 *   - the `WizardState` (step + form fields + scoring stage)
 *   - per-field validation errors
 *   - the in-flight export operation (so the spinner survives tab changes)
 *   - the "load a saved campaign" flow used by the sidebar
 */

"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_STATE,
  WizardState,
  WizardStep,
  WIZARD_STEPS,
  clearWizardState,
  loadWizardState,
  saveWizardState,
  stepIndex,
  validateStep,
} from "@/lib/wizardState";
import type { ClientBrief, ScoredDomain } from "@/lib/types";
import { wizardStateFromBrief } from "./buildBrief";

interface WizardContextValue {
  state: WizardState;
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
  patch: (partial: Partial<WizardState>) => void;
  reset: () => void;
  loadFromCampaign: (id: string) => Promise<void>;
  next: () => void;
  back: () => void;
  goTo: (step: WizardStep) => void;
  validateAndNext: () => boolean;
  errors: Record<string, string>;
  clearError: (field: string) => void;
  loadedFromStorage: boolean;
  exporting: boolean;
  exportError: string | null;
  exportCampaign: (campaignId: string) => Promise<void>;
  clearExportError: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const v = useContext(WizardContext);
  if (!v) throw new Error("useWizard must be used inside WizardProvider");
  return v;
}

function advanceFurthest(prev: WizardStep, next: WizardStep): WizardStep {
  return stepIndex(next) > stepIndex(prev) ? next : prev;
}

/** Fields we never want to round-trip through localStorage: the raw CSV
 *  text is too large to be useful, and the cached shortlist/excluded are
 *  re-fetched from the DB anyway. */
function stripVolatile(s: WizardState) {
  const { csvText, shortlistCache, excludedCache, ...rest } = s;
  void csvText;
  void shortlistCache;
  void excludedCache;
  return rest;
}

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const lastSavedRef = useRef<string>("");

  // Mid-job refresh recovery: hydrate the wizard from localStorage on mount.
  // We do this after first paint so the SSR HTML matches the initial client
  // render (avoids a hydration mismatch); the form briefly shows DEFAULT_STATE
  // then swaps in the saved values.
  useEffect(() => {
    const restored = loadWizardState();
    setState(restored);
    lastSavedRef.current = JSON.stringify(stripVolatile(restored));
    setHydrated(true);
  }, []);

  // Persist on every change. We diff against the last serialised payload so
  // setState calls that don't actually change the persisted slice are free.
  useEffect(() => {
    if (!hydrated) return;
    const slice = stripVolatile(state);
    const serialised = JSON.stringify(slice);
    if (serialised === lastSavedRef.current) return;
    lastSavedRef.current = serialised;
    saveWizardState(state);
  }, [state, hydrated]);

  const set = useCallback(
    <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    []
  );
  const patch = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);
  const reset = useCallback(() => {
    clearWizardState();
    lastSavedRef.current = JSON.stringify(stripVolatile(DEFAULT_STATE));
    setState(DEFAULT_STATE);
    setErrors({});
  }, []);
  const goTo = useCallback((step: WizardStep) => {
    setErrors({});
    setState((prev) => ({
      ...prev,
      step,
      furthestStep: advanceFurthest(prev.furthestStep, step),
    }));
  }, []);
  const next = useCallback(() => {
    setErrors({});
    setState((prev) => {
      const idx = stepIndex(prev.step);
      if (idx === -1 || idx >= WIZARD_STEPS.length - 1) return prev;
      const nextStep = WIZARD_STEPS[idx + 1].id;
      return {
        ...prev,
        step: nextStep,
        furthestStep: advanceFurthest(prev.furthestStep, nextStep),
      };
    });
  }, []);
  const back = useCallback(() => {
    setErrors({});
    setState((prev) => {
      const idx = stepIndex(prev.step);
      if (idx <= 0) return prev;
      return { ...prev, step: WIZARD_STEPS[idx - 1].id };
    });
  }, []);

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const { [field]: _, ...rest } = prev;
      void _;
      return rest;
    });
  }, []);

  const validateAndNext = useCallback((): boolean => {
    let advanced = false;
    setState((prev) => {
      const stepErrors = validateStep(prev.step, prev);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        return prev;
      }
      setErrors({});
      const idx = stepIndex(prev.step);
      if (idx === -1 || idx >= WIZARD_STEPS.length - 1) return prev;
      const nextStep = WIZARD_STEPS[idx + 1].id;
      advanced = true;
      return {
        ...prev,
        step: nextStep,
        furthestStep: advanceFurthest(prev.furthestStep, nextStep),
      };
    });
    return advanced;
  }, []);

  const loadFromCampaign = useCallback(async (id: string) => {
    // Switch the UI immediately so the click feels responsive; the fetch
    // backfills the brief and shortlist when it resolves.
    setErrors({});
    setState({
      ...DEFAULT_STATE,
      campaignId: id,
      step: "brief",
      furthestStep: "brief",
      scoringStage: "complete",
    });

    const r = await fetch(`/api/campaigns/${id}`);
    if (!r.ok) throw new Error("Failed to load campaign");
    const { campaign } = (await r.json()) as {
      campaign: {
        id: string;
        brief?: ClientBrief | null;
        shortlist?: ScoredDomain[] | null;
        excluded?: ScoredDomain[] | null;
      };
    };
    const hasShortlist = !!(campaign.shortlist && campaign.shortlist.length > 0);
    const fromBrief = campaign.brief
      ? wizardStateFromBrief(campaign.brief)
      : {};
    setState({
      ...DEFAULT_STATE,
      ...fromBrief,
      campaignId: campaign.id,
      step: hasShortlist ? "brief" : "domains",
      furthestStep: hasShortlist ? "brief" : "domains",
      scoringStage: hasShortlist ? "complete" : "idle",
      csvText: null,
      shortlistCache: campaign.shortlist ?? null,
      excludedCache: campaign.excluded ?? null,
    });
  }, []);

  const exportCampaign = useCallback(async (campaignId: string) => {
    if (!campaignId) return;
    setExporting(true);
    setExportError(null);
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/export`, {
        method: "POST",
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Export failed (HTTP ${r.status})`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = r.headers.get("Content-Disposition") || "";
      const m = /filename="([^"]+)"/.exec(cd);
      a.download = m?.[1] || "campaign.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError((e as Error).message || "Export failed");
    } finally {
      setExporting(false);
    }
  }, []);

  const clearExportError = useCallback(() => setExportError(null), []);

  const value = useMemo<WizardContextValue>(
    () => ({
      state,
      set,
      patch,
      reset,
      loadFromCampaign,
      next,
      back,
      goTo,
      validateAndNext,
      errors,
      clearError,
      loadedFromStorage: hydrated,
      exporting,
      exportError,
      exportCampaign,
      clearExportError,
    }),
    [
      state,
      hydrated,
      set,
      patch,
      reset,
      loadFromCampaign,
      next,
      back,
      goTo,
      validateAndNext,
      errors,
      clearError,
      exporting,
      exportError,
      exportCampaign,
      clearExportError,
    ]
  );

  return (
    <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
  );
}
