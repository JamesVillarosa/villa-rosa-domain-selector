import fs from "fs";
import path from "path";
import { parseInventoryCsv } from "../lib/csvParser";
import { scoreDomains } from "../lib/scorer";
import { getActiveConfig, saveCampaign, getCampaign } from "../lib/db";
import type { ClientBrief } from "../lib/types";

async function main() {
  const csvPath = path.resolve(
    process.cwd(),
    "..",
    "provided_docs",
    "Complete BT Inventory List - Paid Sites.csv"
  );
  const text = fs.readFileSync(csvPath, "utf8");

  const t0 = Date.now();
  const parsed = parseInventoryCsv(text);
  console.log(`Parsed ${parsed.rowCount} rows in ${Date.now() - t0}ms`);

  const brief: ClientBrief = {
    clientName: "Biograph (smoke test)",
    website: "https://www.biograph.com",
    niches: [
      "health",
      "longevity",
      "wellness",
      "preventive healthcare",
      "executive health",
    ],
    targetPages: [
      { url: "https://www.biograph.com/", keyword: "preventive healthcare clinic" },
      {
        url: "https://www.biograph.com/executive-physical",
        keyword: "executive health screening",
      },
    ],
    budgetPerLink: 562.5,
    geo: "global",
    requireDofollow: true,
    minDR: 50,
    minTraffic: 5000,
    linkCountGoal: 8,
    profile: "standard",
  };

  const cfg = await getActiveConfig("standard");
  const t1 = Date.now();
  const result = scoreDomains(parsed.domains, brief, cfg.config);
  console.log(
    `Scored ${parsed.domains.length} → ${result.shortlist.length} shortlisted, ${result.excluded.length} excluded in ${Date.now() - t1}ms`
  );

  console.log("\nTop 5:");
  for (const sd of result.shortlist.slice(0, 5)) {
    console.log(
      `${sd.score}/${sd.maxScore}  ${sd.domain.domain}  (niche ${sd.breakdown.nicheMatch}, DR ${sd.breakdown.dr}, traffic ${sd.breakdown.traffic}, price ${sd.breakdown.price}, rank ${sd.breakdown.ranking}, geo ${sd.breakdown.geo}, flags ${sd.breakdown.noRedFlags})`
    );
  }

  console.log("\nReason samples from excluded:");
  const reasonCounts = new Map<string, number>();
  for (const e of result.excluded) {
    const k = (e.disqualReason || "").split(" ")[0];
    reasonCounts.set(k, (reasonCounts.get(k) || 0) + 1);
  }
  for (const [k, n] of reasonCounts) console.log(`  ${k}: ${n}`);

  const c = await saveCampaign({
    name: brief.clientName,
    brief,
    shortlist: result.shortlist,
    excluded: result.excluded,
    status: "draft",
  });
  const reloaded = await getCampaign(c.id);
  if (
    !reloaded ||
    (reloaded.shortlist as unknown[]).length !== result.shortlist.length
  ) {
    console.error("FAIL: campaign roundtrip");
    process.exit(1);
  }
  console.log(`\nCampaign saved + reloaded: ${c.id}`);
  console.log("PIPELINE OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
