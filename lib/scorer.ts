/**
 * Deterministic domain scorer.
 *
 * Given a parsed vendor inventory and a client brief, the scorer:
 *   1. Disqualifies rows that fail hard floors (DR, traffic, follow type,
 *      blocked rankings).
 *   2. Scores the survivors on seven weighted axes (niche match, DR,
 *      traffic, price, ranking, geo, no red flags) capped per the active
 *      profile.
 *   3. Returns a sorted shortlist plus the disqualified set with reasons.
 *
 * The function is pure: no I/O, no shared mutable state. An optional LLM
 * niche-enrichment pass (see `lib/enrich.ts`) layers on top of the
 * deterministic output and is never the floor.
 */

import type {
  ClientBrief,
  Domain,
  ScoreBreakdown,
  ScoredDomain,
  ScoringCaps,
  ScoringConfig,
  ScoringResult,
} from "./types";

function toFloat(val: unknown): number {
  if (val === undefined || val === null || val === "") return NaN;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[^0-9.\-]/g, "");
  return parseFloat(cleaned);
}

function maxOf(caps: ScoringCaps): number {
  return (
    caps.nicheMatch +
    caps.dr +
    caps.traffic +
    caps.price +
    caps.ranking +
    caps.geo +
    caps.noRedFlags
  );
}

/** Return a human-readable disqualification reason, or `null` if the
 *  domain clears every hard floor. */
export function disqualify(
  domain: Domain,
  config: ScoringConfig,
  brief: ClientBrief
): string | null {
  const minDR = brief.minDR ?? config.disqualifiers.minDR;
  const minTraffic = brief.minTraffic ?? config.disqualifiers.minTraffic;
  const requireDofollow =
    brief.requireDofollow ?? config.disqualifiers.requireDofollow;

  const dr = toFloat(domain.dr);
  if (!isFinite(dr) || dr < minDR) {
    return `DR ${isFinite(dr) ? dr : "missing"} below minimum ${minDR}`;
  }

  const traffic = toFloat(domain.traffic);
  if (!isFinite(traffic) || traffic < minTraffic) {
    return `Traffic ${isFinite(traffic) ? traffic : "missing"} below minimum ${minTraffic}`;
  }

  const linkType = (domain.linkType || "").toLowerCase();
  if (requireDofollow && linkType.includes("nofollow")) {
    return "Nofollow link type; client requires dofollow";
  }

  const ranking = (domain.ranking || "").toLowerCase();
  for (const blocked of config.disqualifiers.blockRankings) {
    if (ranking.includes(blocked.toLowerCase())) {
      return `Ranking marked "${blocked}"`;
    }
  }

  return null;
}

/** Token-overlap score between the client's niche keywords / target
 *  keywords and the domain's niche/main/complementary/indirect columns. */
export function scoreNiche(
  domain: Domain,
  brief: ClientBrief,
  caps: ScoringCaps
): { score: number; matches: number; totalWords: number } {
  const clientWordsRaw = [
    ...brief.niches,
    ...brief.targetPages.map((p) => p.keyword),
  ]
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const clientWords = clientWordsRaw;

  const domainStr = [
    domain.main,
    domain.niche,
    domain.complementary,
    domain.indirect,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!domainStr) return { score: 0, matches: 0, totalWords: clientWords.length };
  if (clientWords.length === 0) return { score: 0, matches: 0, totalWords: 0 };

  const matches = clientWords.filter((w) => domainStr.includes(w)).length;
  const density = matches / clientWords.length;
  const score = Math.min(caps.nicheMatch, Math.round(density * 120));
  return { score, matches, totalWords: clientWords.length };
}

export function scoreDR(
  domain: Domain,
  brief: ClientBrief,
  config: ScoringConfig
): number {
  const val = toFloat(domain.dr);
  const minDR = brief.minDR ?? config.disqualifiers.minDR;
  if (!isFinite(val) || val < minDR) return 0;
  const range = 85 - minDR;
  if (range <= 0) return config.caps.dr;
  return Math.min(
    config.caps.dr,
    Math.round(((val - minDR) / range) * config.caps.dr)
  );
}

export function scoreTraffic(
  domain: Domain,
  brief: ClientBrief,
  config: ScoringConfig
): number {
  const val = toFloat(domain.traffic);
  const minTraffic = brief.minTraffic ?? config.disqualifiers.minTraffic;
  if (!isFinite(val) || val < minTraffic) return 0;
  if (val <= minTraffic) return 0;
  const ratio = val / minTraffic;
  const denom = Math.log10(50);
  if (denom === 0) return 0;
  return Math.min(
    config.caps.traffic,
    Math.round((Math.log10(ratio) / denom) * config.caps.traffic)
  );
}

export function scorePrice(
  domain: Domain,
  brief: ClientBrief,
  caps: ScoringCaps
): number {
  const raw = domain.gpPrice || domain.liPrice || "";
  const p = toFloat(raw);
  const b = brief.budgetPerLink;
  if (!b || !isFinite(p) || p <= 0 || p > b) return 0;
  return Math.min(caps.price, Math.round(((b - p) / b) * caps.price));
}

export function scoreRanking(domain: Domain, caps: ScoringCaps): number {
  const r = (domain.ranking || "").toLowerCase();
  if (r.includes("good")) return caps.ranking;
  if (r.includes("okay") || r.includes("ok")) {
    return Math.round(caps.ranking / 2);
  }
  return 0;
}

export function scoreGeo(
  domain: Domain,
  brief: ClientBrief,
  caps: ScoringCaps
): number {
  const geo = (brief.geo || "").toLowerCase().trim();
  if (!geo || geo === "global") return caps.geo;
  const domainGeo = (domain.countryTraffic || "").toLowerCase();
  if (domainGeo.includes(geo)) return caps.geo;
  return 0;
}

export function scoreNoRedFlags(domain: Domain, caps: ScoringCaps): number {
  const rf = (domain.redFlags || "").toLowerCase().trim();
  if (!rf || ["no", "none", "-"].includes(rf)) return caps.noRedFlags;
  return 0;
}

function buildReasoning(
  domain: Domain,
  brief: ClientBrief,
  breakdown: ScoreBreakdown,
  caps: ScoringCaps
): string {
  const dr = toFloat(domain.dr);
  const traffic = toFloat(domain.traffic);
  const price = toFloat(domain.gpPrice || domain.liPrice || "");

  let nicheBit: string;
  if (breakdown.nicheMatch >= caps.nicheMatch * 0.8) nicheBit = "strong niche overlap";
  else if (breakdown.nicheMatch >= caps.nicheMatch * 0.4) nicheBit = "partial niche overlap";
  else if (breakdown.nicheMatch > 0) nicheBit = "weak niche overlap";
  else nicheBit = "no niche overlap";

  const rankingBit = (domain.ranking || "unrated").toString();
  const priceBit =
    isFinite(price) && price > 0 && brief.budgetPerLink
      ? `$${price} vs $${brief.budgetPerLink} budget`
      : "price unset";
  const trafficBit = isFinite(traffic)
    ? traffic.toLocaleString("en-US")
    : "unknown";

  return `DR ${isFinite(dr) ? dr : "?"}, traffic ${trafficBit}, ${nicheBit}. Ranking: ${rankingBit}. ${priceBit}.`;
}

/** Score a single domain end-to-end (disqualify -> per-axis -> sum). */
export function scoreOne(
  domain: Domain,
  brief: ClientBrief,
  config: ScoringConfig
): ScoredDomain {
  const reason = disqualify(domain, config, brief);
  if (reason) {
    return {
      domain,
      score: 0,
      maxScore: maxOf(config.caps),
      breakdown: {
        nicheMatch: 0,
        dr: 0,
        traffic: 0,
        price: 0,
        ranking: 0,
        geo: 0,
        noRedFlags: 0,
      },
      reasoning: `Disqualified: ${reason}`,
      disqualified: true,
      disqualReason: reason,
    };
  }

  const niche = scoreNiche(domain, brief, config.caps);
  const breakdown: ScoreBreakdown = {
    nicheMatch: niche.score,
    dr: scoreDR(domain, brief, config),
    traffic: scoreTraffic(domain, brief, config),
    price: scorePrice(domain, brief, config.caps),
    ranking: scoreRanking(domain, config.caps),
    geo: scoreGeo(domain, brief, config.caps),
    noRedFlags: scoreNoRedFlags(domain, config.caps),
  };

  const total =
    breakdown.nicheMatch +
    breakdown.dr +
    breakdown.traffic +
    breakdown.price +
    breakdown.ranking +
    breakdown.geo +
    breakdown.noRedFlags;

  return {
    domain,
    score: total,
    maxScore: maxOf(config.caps),
    breakdown,
    reasoning: buildReasoning(domain, brief, breakdown, config.caps),
    disqualified: false,
    deterministicNicheScore: niche.score,
  };
}

/**
 * Score a batch of domains and partition them into a sorted shortlist and
 * the excluded set. The shortlist is capped at `config.shortlistSize`.
 */
export function scoreDomains(
  domains: Domain[],
  brief: ClientBrief,
  config: ScoringConfig
): ScoringResult {
  const shortlist: ScoredDomain[] = [];
  const excluded: ScoredDomain[] = [];

  for (const d of domains) {
    if (!d || !d.domain) continue;
    const result = scoreOne(d, brief, config);
    if (result.disqualified) excluded.push(result);
    else shortlist.push(result);
  }

  shortlist.sort((a, b) => b.score - a.score);
  return {
    shortlist: shortlist.slice(0, config.shortlistSize),
    excluded,
    totalEvaluated: domains.length,
  };
}
