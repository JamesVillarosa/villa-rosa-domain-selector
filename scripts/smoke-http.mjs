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

const brief = {
  clientName: "HTTP Smoke",
  niches: ["saas", "hr software", "employee management"],
  targetPages: [
    { url: "https://x.com", keyword: "skills management software" },
  ],
  budgetPerLink: 300,
  geo: "global",
  requireDofollow: true,
  minDR: 45,
  minTraffic: 2000,
  linkCountGoal: 8,
  profile: "standard",
};

async function main() {
  const create = await fetch(`${BASE}/api/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief }),
  });
  if (!create.ok) {
    console.error("create failed", create.status, await create.text());
    process.exit(1);
  }
  const { id } = await create.json();
  console.log("Created campaign", id);

  const score = await fetch(`${BASE}/api/campaigns/${id}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csvData: csv, enableLLM: false }),
  });
  if (!score.ok) {
    console.error("score failed", score.status, await score.text());
    process.exit(1);
  }
  const result = await score.json();
  console.log(
    `Scored ${result.totalEvaluated}: shortlist ${result.shortlist.length}, excluded ${result.excluded.length}, configVersion ${result.configVersion}`
  );
  console.log(
    `Top 3: ${result.shortlist
      .slice(0, 3)
      .map((s) => `${s.score}/${s.maxScore} ${s.domain.domain}`)
      .join(" | ")}`
  );

  const list = await (await fetch(`${BASE}/api/campaigns`)).json();
  console.log("List endpoint returns", list.campaigns.length, "campaign(s)");

  const cfg = await (
    await fetch(`${BASE}/api/config?profile=standard`)
  ).json();
  console.log("Standard config v", cfg.version, "nicheMatch cap", cfg.config.caps.nicheMatch);

  const ex = await fetch(`${BASE}/api/campaigns/${id}/export`, {
    method: "POST",
  });
  if (!ex.ok) {
    console.error("export failed", ex.status, await ex.text());
    process.exit(1);
  }
  const buf = Buffer.from(await ex.arrayBuffer());
  const cd = ex.headers.get("content-disposition") || "";
  console.log(`Export OK: ${buf.length} bytes, header: ${cd}`);

  const get = await fetch(`${BASE}/api/campaigns/${id}`);
  const { campaign } = await get.json();
  console.log(
    `Reload: shortlist length ${campaign.shortlist?.length}, status ${campaign.status}`
  );

  const parse = await fetch(`${BASE}/api/parse-notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Client expects 8 backlinks per month focused on health and wellness. They are concerned about brand safety and want to avoid CBD sites. Action: send sample placements next week.",
    }),
  });
  const parsed = await parse.json();
  console.log("Parsed notes:", JSON.stringify(parsed.parsed).slice(0, 200));

  console.log("HTTP SMOKE OK");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
