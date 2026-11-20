/**
 * Wizard state model + per-step validation.
 *
 * The wizard collects a campaign brief over seven sequential steps; this
 * module owns the in-memory shape (`WizardState`), the canonical step order,
 * and the rules each step must satisfy before the user can advance.
 *
 * Form data is intentionally not persisted across page reloads: past
 * campaigns live in SQLite and surface in the sidebar, while the wizard
 * itself always starts fresh.
 */

"use client";

import type { Profile, ScoredDomain, TargetPage } from "./types";

export type WizardStep =
  | "client"
  | "campaign"
  | "criteria"
  | "goals"
  | "calls"
  | "domains"
  | "brief";

export const WIZARD_STEPS: { id: WizardStep; label: string; optional?: boolean }[] = [
  { id: "client", label: "Client info" },
  { id: "campaign", label: "Campaign setup" },
  { id: "criteria", label: "Domain criteria" },
  { id: "goals", label: "Expectations" },
  { id: "calls", label: "Call notes", optional: true },
  { id: "domains", label: "Domain matching" },
  { id: "brief", label: "Campaign brief" },
];

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.findIndex((s) => s.id === step);
}

export interface ParsedCallNotes {
  summary: string;
  expectations: string[];
  keyTopics: string[];
  actionItems: string[];
  sentiment: "positive" | "neutral" | "cautious" | "concerned";
  flag?: string;
}

export interface WizardState {
  step: WizardStep;
  furthestStep: WizardStep;
  campaignId: string | null;
  scoringStage: "idle" | "saving" | "parsing" | "scoring" | "complete" | "error";

  // Step 1: Client Info
  companyName: string;
  website: string;
  primaryContact: string;
  contactEmail: string;
  industry: string;
  accountManager: string;
  campaignStartDate: string;
  contractValue: string;
  billingCycle: "Monthly" | "Quarterly" | "Annual";

  // Step 2: Campaign Setup
  targetPages: TargetPage[];
  anchorTextStrategy: string;
  monthlyLinkVolume: string;
  linkTypes: string[];
  domainApprovalProcess: string;
  contentApprovalRequired: string;
  competitorsToAvoid: string;

  // Step 3: Domain Criteria
  minDA: string;
  minDR: string;
  minTraffic: string;
  linkTypeRequirement: "Dofollow only" | "Either";
  preferredNiches: string;
  geo: string;
  industriesToExclude: string;
  profile: Profile;

  // Step 4: Goals & Expectations
  primaryGoal: string;
  kpis: string[];
  keywordsToMonitor: string;
  expectedTimeline: string;
  reportingFrequency: string;
  reportingContact: string;
  communicationChannel: string;
  additionalServices: string[];
  notesForTeam: string;
  redFlagsSensitivities: string;

  // Step 5: Call Notes
  salesCallNotes: string;
  salesCallParsed: ParsedCallNotes | null;
  onboardingCallNotes: string;
  onboardingCallParsed: ParsedCallNotes | null;

  // Step 6: Domain Matching
  csvText: string | null;
  csvFilename: string | null;
  csvRowCount: number;
  enableLLM: boolean;

  // Step 7: cached shortlist for instant re-render
  shortlistCache: ScoredDomain[] | null;
  excludedCache: ScoredDomain[] | null;
}

export const DEFAULT_STATE: WizardState = {
  step: "client",
  furthestStep: "client",
  campaignId: null,
  scoringStage: "idle",
  companyName: "",
  website: "",
  primaryContact: "",
  contactEmail: "",
  industry: "",
  accountManager: "",
  campaignStartDate: "",
  contractValue: "",
  billingCycle: "Monthly",
  targetPages: [{ url: "", keyword: "", pageType: "Homepage" }],
  anchorTextStrategy: "Natural / Mixed",
  monthlyLinkVolume: "",
  linkTypes: ["Guest Post"],
  domainApprovalProcess: "villa.rosa selects — no approval needed",
  contentApprovalRequired: "No — villa.rosa handles content",
  competitorsToAvoid: "",
  minDA: "",
  minDR: "50",
  minTraffic: "5000",
  linkTypeRequirement: "Dofollow only",
  preferredNiches: "",
  geo: "Global",
  industriesToExclude: "",
  profile: "standard",
  primaryGoal: "Keyword Rankings",
  kpis: ["Keyword Rankings", "Organic Traffic"],
  keywordsToMonitor: "",
  expectedTimeline: "3–6 months",
  reportingFrequency: "Monthly",
  reportingContact: "",
  communicationChannel: "Email",
  additionalServices: [],
  notesForTeam: "",
  redFlagsSensitivities: "",
  salesCallNotes: "",
  salesCallParsed: null,
  onboardingCallNotes: "",
  onboardingCallParsed: null,
  csvText: null,
  csvFilename: null,
  csvRowCount: 0,
  enableLLM: false,
  shortlistCache: null,
  excludedCache: null,
};

/**
 * Mid-job refresh recovery — the spec requires that if the user closes
 * the tab partway through the wizard, their in-progress inputs come back
 * on next visit. We persist the form state to localStorage on every
 * change, hydrate it on mount, and clear it when the user starts a fresh
 * campaign (`reset()`) or loads a saved one from the sidebar.
 *
 * We strip the bulkiest transient fields before saving: raw `csvText`
 * is megabytes for large inventories, and the scored caches will be
 * re-fetched from the API when needed.
 */
const STORAGE_KEY = "villarosa.wizard.v1";

export function loadWizardState(): WizardState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveWizardState(state: WizardState): void {
  if (typeof window === "undefined") return;
  try {
    const { csvText, shortlistCache, excludedCache, ...rest } = state;
    void csvText;
    void shortlistCache;
    void excludedCache;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    /* quota or serialization errors are non-fatal */
  }
}

export function clearWizardState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Returns true if the value looks like a real website, with or without
 *  a protocol. "acme.com" passes; "hehe" does not. */
export function isValidUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (!/[.]/.test(s)) return false;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    return /^[^.]+(\.[^.]+)+$/.test(u.hostname);
  } catch {
    return false;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Lightweight email shape check — guards against typos, not RFC edge cases. */
export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

/** True when the string is a non-negative whole number. */
export function isPositiveInt(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (!/^\d+$/.test(s)) return false;
  const n = parseInt(s, 10);
  return isFinite(n) && n >= 0;
}

/** True when the string is a non-negative number (integer or decimal). */
export function isPositiveNumber(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (!/^\d+(\.\d+)?$/.test(s)) return false;
  const n = parseFloat(s);
  return isFinite(n) && n >= 0;
}

/**
 * Validate the inputs for a single wizard step. Returns a map of
 * `fieldName -> message`; an empty map means the step is good to advance.
 *
 * Field names match the React keys the step components use, so callers can
 * paint inline errors next to the offending input.
 */
export function validateStep(
  step: WizardStep,
  state: WizardState
): Record<string, string> {
  const errors: Record<string, string> = {};
  switch (step) {
    case "client": {
      if (!state.companyName.trim()) {
        errors.companyName = "Company name is required";
      }
      if (!state.website.trim()) {
        errors.website = "Website is required";
      } else if (!isValidUrl(state.website)) {
        errors.website =
          "Enter a valid URL (e.g. acme.com or https://acme.com)";
      }
      if (state.contactEmail.trim() && !isValidEmail(state.contactEmail)) {
        errors.contactEmail =
          "Enter a valid email (e.g. john@acmecorp.com)";
      }
      if (
        state.contractValue.trim() &&
        !isPositiveNumber(state.contractValue)
      ) {
        errors.contractValue = "Enter a valid amount";
      }
      break;
    }
    case "campaign": {
      const valid = state.targetPages.filter(
        (p) => p.url.trim() && p.keyword.trim()
      );
      if (valid.length === 0) {
        errors.targetPages =
          "Add at least one target page with both URL and keyword";
      } else {
        const badIdx = state.targetPages.findIndex(
          (p) => p.url.trim() && !isValidUrl(p.url)
        );
        if (badIdx !== -1) {
          errors[`targetPageUrl_${badIdx}`] =
            "Enter a valid URL (e.g. acme.com/pricing)";
        }
      }
      if (
        state.monthlyLinkVolume.trim() &&
        !isPositiveInt(state.monthlyLinkVolume)
      ) {
        errors.monthlyLinkVolume = "Enter a whole number";
      }
      break;
    }
    case "criteria": {
      if (!state.minDR.trim()) {
        errors.minDR = "Min DR is required";
      } else if (!isPositiveInt(state.minDR)) {
        errors.minDR = "Min DR must be a whole number";
      } else {
        const n = parseInt(state.minDR, 10);
        if (n < 0 || n > 100) errors.minDR = "Min DR must be between 0 and 100";
      }
      if (!state.minTraffic.trim()) {
        errors.minTraffic = "Min traffic is required";
      } else if (!isPositiveInt(state.minTraffic)) {
        errors.minTraffic = "Min traffic must be a whole number";
      }
      if (state.minDA.trim() && !isPositiveInt(state.minDA)) {
        errors.minDA = "Min DA must be a whole number";
      }
      break;
    }
    case "goals": {
      if (
        state.reportingContact.trim() &&
        !isValidEmail(state.reportingContact)
      ) {
        errors.reportingContact =
          "Enter a valid email (e.g. reports@client.com)";
      }
      break;
    }
    case "domains": {
      if (!state.csvText) {
        errors.csv = "Upload a vendor inventory CSV";
      }
      break;
    }
    default:
      break;
  }
  return errors;
}
