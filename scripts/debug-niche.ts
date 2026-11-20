import fs from "fs";
import path from "path";
import { parseInventoryCsv } from "../lib/csvParser";

const csvPath = path.resolve(
  process.cwd(),
  "..",
  "provided_docs",
  "Complete BT Inventory List - Paid Sites.csv"
);
const csv = fs.readFileSync(csvPath, "utf8");
const parsed = parseInventoryCsv(csv);

const clientWords = [
  "saas",
  "software",
  "employee",
  "management",
  "skills",
];

let withOverlap = 0;
const samples: { domain: string; matches: string[]; nicheStr: string }[] = [];
for (const d of parsed.domains) {
  const nicheStr = [d.main, d.niche, d.complementary, d.indirect]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const matches = clientWords.filter((w) => nicheStr.includes(w));
  if (matches.length > 0) {
    withOverlap++;
    if (samples.length < 10) {
      samples.push({
        domain: d.domain,
        matches,
        nicheStr: nicheStr.replace(/\s+/g, " ").slice(0, 100),
      });
    }
  }
}
console.log(`Domains with any niche overlap: ${withOverlap} / ${parsed.domains.length}`);
console.log("Samples:");
for (const s of samples) {
  console.log(
    `  ${s.domain} matches=[${s.matches.join(",")}]  niche="${s.nicheStr}"`
  );
}

// Look specifically at the top shortlist for the LLM smoke
const targets = ["apnews.com", "gitbook.com", "campaignmonitor.com", "niftypm.com"];
console.log("\nTarget domain niche strings:");
for (const t of targets) {
  const d = parsed.domains.find((x) => x.domain.toLowerCase() === t);
  if (!d) {
    console.log(`  ${t}: NOT FOUND`);
    continue;
  }
  const s = [d.main, d.niche, d.complementary, d.indirect]
    .filter(Boolean)
    .join(" | ");
  console.log(`  ${t}: ${s}`);
}
