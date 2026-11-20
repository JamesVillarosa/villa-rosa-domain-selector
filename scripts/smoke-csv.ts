import fs from "fs";
import path from "path";
import { parseInventoryCsv } from "../lib/csvParser";

const csvPath = path.resolve(
  process.cwd(),
  "..",
  "provided_docs",
  "Complete BT Inventory List - Paid Sites.csv"
);

if (!fs.existsSync(csvPath)) {
  console.error("CSV not found at", csvPath);
  process.exit(1);
}

const text = fs.readFileSync(csvPath, "utf8");
const start = Date.now();
const res = parseInventoryCsv(text);
const ms = Date.now() - start;

const unique = new Set(res.domains.map((d) => d.domain.toLowerCase()));
console.log(`Parsed ${res.rowCount} rows / ${unique.size} unique domains in ${ms}ms`);
console.log("Errors:", res.errors.length);
console.log("Warnings:", res.warnings);

const counts = new Map<string, number>();
for (const d of res.domains) {
  const k = d.domain.toLowerCase();
  counts.set(k, (counts.get(k) || 0) + 1);
}
const dups = Array.from(counts.entries()).filter(([, n]) => n > 1).slice(0, 5);
if (dups.length) console.log("Sample duplicates:", dups);

const sample = res.domains.slice(0, 3);
for (const d of sample) {
  console.log({
    domain: d.domain,
    dr: d.dr,
    traffic: d.traffic,
    main: d.main,
    niche: (d.niche || "").replace(/\s+/g, " ").slice(0, 60),
    ranking: d.ranking,
    linkType: d.linkType,
    gpPrice: d.gpPrice,
    liPrice: d.liPrice,
  });
}
