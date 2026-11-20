/**
 * Shared domain model.
 *
 * Types in this file flow through the wizard, the API layer, the scorer,
 * and the XLSX exporter, so they're written to be stable and explicit.
 * Anything that changes here is a contract change for the entire app.
 */

export type Profile = "standard" | "ecommerce" | "fintech" | "local";

export interface ScoringCaps {
  nicheMatch: number;
  dr: number;
  traffic: number;
  price: number;
  ranking: number;
  geo: number;
  noRedFlags: number;
}

export interface ScoringDisqualifiers {
  minDR: number;
  minTraffic: number;
  requireDofollow: boolean;
  blockRankings: string[];
}

export interface ScoringConfig {
  caps: ScoringCaps;
  disqualifiers: ScoringDisqualifiers;
  shortlistSize: number;
  nichePrompt: string;
}

export interface Domain {
  domain: string;
  dr: string | number;
  traffic: string | number;
  main?: string;
  niche?: string;
  complementary?: string;
  indirect?: string;
  gpPrice?: string;
  liPrice?: string;
  linkType?: string;
  tat?: string;
  redFlags?: string;
  ranking?: string;
  contactEmail?: string;
  countryTraffic?: string;
  status?: string;
  notes?: string;
  ur?: string;
  trafficValue?: string;
  timesUsed?: string;
  usageSaturation?: string;
  contactType?: string;
}

export interface TargetPage {
  url: string;
  keyword: string;
  pageType?: string;
}

export interface ClientBrief {
  clientName: string;
  website?: string;
  primaryContact?: string;
  contactEmail?: string;
  industry?: string;
  accountManager?: string;
  campaignStartDate?: string;
  contractValue?: number;
  billingCycle?: string;
  niches: string[];
  targetPages: TargetPage[];
  budgetPerLink: number;
  geo: string;
  requireDofollow: boolean;
  minDR: number;
  minTraffic: number;
  linkCountGoal: number;
  profile: Profile;
  industryOverride?: string;
  anchorTextStrategy?: string;
  linkTypes?: string[];
  domainApprovalProcess?: string;
  contentApprovalRequired?: string;
  competitorsToAvoid?: string;
  primaryGoal?: string;
  kpis?: string[];
  keywordsToMonitor?: string;
  expectedTimeline?: string;
  reportingFrequency?: string;
  reportingContact?: string;
  communicationChannel?: string;
  additionalServices?: string[];
  notesForTeam?: string;
  redFlagsSensitivities?: string;
  industriesToExclude?: string;
  preferredNiches?: string;
  enableLLMEnrichment?: boolean;
}

export interface ScoreBreakdown {
  nicheMatch: number;
  dr: number;
  traffic: number;
  price: number;
  ranking: number;
  geo: number;
  noRedFlags: number;
}

export interface ScoredDomain {
  domain: Domain;
  score: number;
  maxScore: number;
  breakdown: ScoreBreakdown;
  reasoning: string;
  disqualified: boolean;
  disqualReason?: string;
  deterministicNicheScore?: number;
  llmNicheBoost?: number;
  llmReason?: string;
  selected?: boolean;
}

export interface ScoringResult {
  shortlist: ScoredDomain[];
  excluded: ScoredDomain[];
  configVersion?: number;
  totalEvaluated: number;
}
