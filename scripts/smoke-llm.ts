// Verifies that the LLM enrichment path actually executes when ANTHROPIC_API_KEY is set.
// Runs against the deterministic scoring output then attempts enrichment.
import fs from "fs";
import path from "path";
import { parseInventoryCsv } from "../lib/csvParser";
import { scoreDomains } from "../lib/scorer";
import { getActiveConfig } from "../lib/db";
import { enrichShortlistWithLLM } from "../lib/enrich";
import type { ClientBrief } from "../lib/types";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ANTHROPIC_API_KEY not set — skipping LLM smoke");
    return;
  }

  const csvPath = path.resolve(
    process.cwd(),
    "..",
    "provided_docs",
    "Complete BT Inventory List - Paid Sites.csv"
  );
  const csv = fs.readFileSync(csvPath, "utf8");
  const parsed = parseInventoryCsv(csv);
  const cfg = await getActiveConfig("standard");

  const brief: ClientBrief = {
    clientName: "LLM Smoke",
    // Broader terms that actually appear in the inventory's taxonomy buckets
    // (the real inventory tags publishers by industry, e.g. "technology", "business",
    // "advertising", not by specific tech terms like "saas").
    niches: ["technology", "business", "advertising", "marketing"],
    targetPages: [
      { url: "https://x.com/p", keyword: "business software" },
    ],
    budgetPerLink: 300,
    geo: "global",
    requireDofollow: true,
    minDR: 45,
    minTraffic: 2000,
    linkCountGoal: 8,
    profile: "standard",
  };

  const result = scoreDomains(parsed.domains, brief, cfg.config);
  console.log(`Deterministic: ${result.shortlist.length} shortlisted`);

  // Pick 5 domains that actually had niche overlap (the LLM is skipped when
  // deterministic niche score = 0, by design — keyword overlap is the floor).
  const subset = result.shortlist
    .filter((s) => (s.deterministicNicheScore ?? 0) > 0)
    .slice(0, 5);
  if (subset.length === 0) {
    console.error("FAIL: no domains had niche overlap > 0 to enrich");
    process.exit(1);
  }
  console.log(`Enriching ${subset.length} domains with niche > 0`);
  const before = subset.map((s) => ({
    domain: s.domain.domain,
    score: s.score,
    niche: s.breakdown.nicheMatch,
  }));
  console.log("Before enrichment:", before);

  await enrichShortlistWithLLM(subset, brief, cfg.config);

  const after = subset.map((s) => ({
    domain: s.domain.domain,
    score: s.score,
    niche: s.breakdown.nicheMatch,
    boost: s.llmNicheBoost,
    reason: (s.llmReason || "").slice(0, 80),
  }));
  console.log("After enrichment:", after);

  const boosted = after.filter((a) => (a.boost || 0) > 0).length;
  const reasoned = after.filter((a) => a.reason).length;
  console.log(`Boosted: ${boosted}, with reason: ${reasoned}`);
  if (reasoned === 0) {
    console.error("FAIL: LLM never returned a reason — call probably failed");
    process.exit(1);
  }
  console.log("LLM SMOKE OK");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
