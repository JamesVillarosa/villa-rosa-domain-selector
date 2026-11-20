import fs from "node:fs";
import path from "node:path";

const csvPath = path.resolve(
  process.cwd(),
  "..",
  "provided_docs",
  "Complete BT Inventory List - Paid Sites.csv"
);
const csv = fs.readFileSync(csvPath, "utf8");

const BASE = "http://localhost:3000";

async function main() {
  const brief = {
    clientName: "HTTP LLM Smoke",
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
    enableLLMEnrichment: true,
  };

  const create = await fetch(`${BASE}/api/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief }),
  });
  const { id } = await create.json();
  console.log("Created", id);

  const t0 = Date.now();
  const score = await fetch(`${BASE}/api/campaigns/${id}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csvData: csv, enableLLM: true }),
  });
  const ms = Date.now() - t0;
  const result = await score.json();
  const withReason = result.shortlist.filter((s) => s.llmReason).length;
  const withBoost = result.shortlist.filter(
    (s) => (s.llmNicheBoost ?? 0) > 0
  ).length;
  console.log(
    `Scored ${result.totalEvaluated} in ${ms}ms — shortlist ${result.shortlist.length}, excluded ${result.excluded.length}`
  );
  console.log(
    `LLM activity: ${withReason} domains have llmReason, ${withBoost} got niche boost`
  );

  const sample = result.shortlist[0];
  console.log(
    `Top: ${sample.score}/${sample.maxScore} ${sample.domain.domain}` +
      (sample.llmReason ? ` — "${sample.llmReason.slice(0, 100)}…"` : "")
  );

  if (withReason === 0) {
    console.error("FAIL: no LLM activity through API");
    process.exit(1);
  }
  console.log("HTTP LLM SMOKE OK");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
