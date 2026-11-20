/**
 * Translate the wizard's form state into the canonical `ClientBrief`
 * consumed by the scorer, exporter, and persistence layer.
 *
 * The mapping is intentionally lossy in one direction: the brief carries
 * only the fields the downstream pipeline cares about (niches, target
 * pages, scoring floors, budget per link, etc.). UI-only state (current
 * step, cached shortlist, parse warnings) is dropped.
 */

import type { ClientBrief, Profile } from "@/lib/types";
import type { WizardState } from "@/lib/wizardState";
import { DEFAULT_STATE } from "@/lib/wizardState";

export function buildBriefFromState(state: WizardState): ClientBrief {
  const niches: string[] = [];
  if (state.preferredNiches) {
    niches.push(
      ...state.preferredNiches
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  if (state.industry) niches.push(state.industry);
  if (niches.length === 0) niches.push("general");

  const geo =
    state.geo.toLowerCase() === "global"
      ? "global"
      : state.geo.toLowerCase();

  return {
    clientName: state.companyName || "Unnamed client",
    website: state.website,
    primaryContact: state.primaryContact,
    contactEmail: state.contactEmail,
    industry: state.industry,
    accountManager: state.accountManager,
    campaignStartDate: state.campaignStartDate,
    contractValue: state.contractValue ? parseFloat(state.contractValue) : undefined,
    billingCycle: state.billingCycle,
    niches,
    targetPages: state.targetPages.filter((p) => p.url && p.keyword),
    budgetPerLink: computeBudgetPerLink(state),
    geo,
    requireDofollow: state.linkTypeRequirement === "Dofollow only",
    minDR: parseInt(state.minDR || "50", 10),
    minTraffic: parseInt(state.minTraffic || "5000", 10),
    linkCountGoal: parseInt(state.monthlyLinkVolume || "0", 10) || 0,
    profile: state.profile,
    anchorTextStrategy: state.anchorTextStrategy,
    linkTypes: state.linkTypes,
    domainApprovalProcess: state.domainApprovalProcess,
    contentApprovalRequired: state.contentApprovalRequired,
    competitorsToAvoid: state.competitorsToAvoid,
    primaryGoal: state.primaryGoal,
    kpis: state.kpis,
    keywordsToMonitor: state.keywordsToMonitor,
    expectedTimeline: state.expectedTimeline,
    reportingFrequency: state.reportingFrequency,
    reportingContact: state.reportingContact,
    communicationChannel: state.communicationChannel,
    additionalServices: state.additionalServices,
    notesForTeam: state.notesForTeam,
    redFlagsSensitivities: state.redFlagsSensitivities,
    industriesToExclude: state.industriesToExclude,
    preferredNiches: state.preferredNiches,
    enableLLMEnrichment: state.enableLLM,
  };
}

function computeBudgetPerLink(state: WizardState): number {
  const contract = parseFloat(state.contractValue || "0");
  const links = parseInt(state.monthlyLinkVolume || "0", 10);
  if (contract > 0 && links > 0) return contract / links;
  return 0;
}

const VALID_PROFILES: readonly Profile[] = [
  "standard",
  "ecommerce",
  "fintech",
  "local",
];

const VALID_BILLING: readonly WizardState["billingCycle"][] = [
  "Monthly",
  "Quarterly",
  "Annual",
];

const GEO_OPTIONS = [
  "Global",
  "US",
  "GB",
  "CA",
  "AU",
  "DE",
  "FR",
  "ES",
  "IN",
  "BR",
];

/**
 * Inverse of `buildBriefFromState` — populate a fresh `WizardState` from a
 * stored `ClientBrief` so a saved campaign can be reopened with every form
 * field carrying its original value.
 *
 * Several brief fields are numeric where the wizard expects strings (`minDR`,
 * `minTraffic`, `contractValue`); we coerce here so the inputs stay
 * controlled and don't flip between controlled/uncontrolled modes.
 */
export function wizardStateFromBrief(brief: ClientBrief): Partial<WizardState> {
  const profile = VALID_PROFILES.includes(brief.profile)
    ? brief.profile
    : "standard";
  const billing = VALID_BILLING.includes(
    brief.billingCycle as WizardState["billingCycle"]
  )
    ? (brief.billingCycle as WizardState["billingCycle"])
    : "Monthly";
  const geoLower = (brief.geo || "global").toLowerCase();
  const geo =
    geoLower === "global"
      ? "Global"
      : GEO_OPTIONS.find((g) => g.toLowerCase() === geoLower) ||
        brief.geo ||
        "Global";

  const pages =
    brief.targetPages && brief.targetPages.length > 0
      ? brief.targetPages.map((p) => ({
          url: p.url || "",
          keyword: p.keyword || "",
          pageType: p.pageType || "Other",
        }))
      : DEFAULT_STATE.targetPages;

  return {
    companyName: brief.clientName || "",
    website: brief.website || "",
    primaryContact: brief.primaryContact || "",
    contactEmail: brief.contactEmail || "",
    industry: brief.industry || "",
    accountManager: brief.accountManager || "",
    campaignStartDate: brief.campaignStartDate || "",
    contractValue:
      brief.contractValue != null && isFinite(brief.contractValue)
        ? String(brief.contractValue)
        : "",
    billingCycle: billing,
    targetPages: pages,
    anchorTextStrategy: brief.anchorTextStrategy || "Natural / Mixed",
    monthlyLinkVolume: brief.linkCountGoal ? String(brief.linkCountGoal) : "",
    linkTypes: brief.linkTypes || ["Guest Post"],
    domainApprovalProcess:
      brief.domainApprovalProcess || "villa.rosa selects — no approval needed",
    contentApprovalRequired:
      brief.contentApprovalRequired || "No — villa.rosa handles content",
    competitorsToAvoid: brief.competitorsToAvoid || "",
    minDR:
      brief.minDR != null && isFinite(brief.minDR) ? String(brief.minDR) : "50",
    minTraffic:
      brief.minTraffic != null && isFinite(brief.minTraffic)
        ? String(brief.minTraffic)
        : "5000",
    linkTypeRequirement: brief.requireDofollow ? "Dofollow only" : "Either",
    preferredNiches: brief.preferredNiches || "",
    geo,
    industriesToExclude: brief.industriesToExclude || "",
    profile,
    primaryGoal: brief.primaryGoal || "Keyword Rankings",
    kpis:
      brief.kpis && brief.kpis.length > 0
        ? brief.kpis
        : ["Keyword Rankings", "Organic Traffic"],
    keywordsToMonitor: brief.keywordsToMonitor || "",
    expectedTimeline: brief.expectedTimeline || "3–6 months",
    reportingFrequency: brief.reportingFrequency || "Monthly",
    reportingContact: brief.reportingContact || "",
    communicationChannel: brief.communicationChannel || "Email",
    additionalServices: brief.additionalServices || [],
    notesForTeam: brief.notesForTeam || "",
    redFlagsSensitivities: brief.redFlagsSensitivities || "",
    enableLLM: brief.enableLLMEnrichment === true,
  };
}
