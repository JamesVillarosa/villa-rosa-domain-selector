import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { parseInventoryCsv } from "../lib/csvParser";
import { scoreDomains } from "../lib/scorer";
import { getActiveConfig } from "../lib/db";
import { generateExport } from "../lib/exporter";
import type { ClientBrief } from "../lib/types";

async function main() {
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
    clientName: "Biograph",
    website: "https://www.biograph.com",
    primaryContact: "John Smith",
    contactEmail: "john@biograph.com",
    industry: "Health / Longevity",
    accountManager: "james@villarosa.ai",
    campaignStartDate: "01/01/2026",
    contractValue: 4500,
    billingCycle: "Monthly",
    niches: ["health", "longevity", "wellness", "preventive healthcare"],
    targetPages: [
      { url: "https://www.biograph.com/", keyword: "preventive healthcare" },
      {
        url: "https://www.biograph.com/executive-physical",
        keyword: "executive physical",
      },
    ],
    budgetPerLink: 562.5,
    geo: "global",
    requireDofollow: true,
    minDR: 50,
    minTraffic: 5000,
    linkCountGoal: 8,
    profile: "standard",
    domainApprovalProcess: "villa.rosa selects — no approval needed",
    linkTypes: ["Guest Post"],
    primaryGoal: "Brand Authority",
  };
  const result = scoreDomains(parsed.domains, brief, cfg.config);
  const selected = result.shortlist.slice(0, 8).map((s) => ({ ...s, selected: true }));

  const buf = await generateExport(
    {
      name: brief.clientName,
      brief,
      shortlist: [...selected, ...result.shortlist.slice(8)],
    },
    cfg.config
  );

  const outDir = path.join(process.cwd(), ".smoke");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outPath = path.join(outDir, "test-export.xlsx");
  fs.writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length} bytes)`);

  // Reload and verify column counts + names
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(outPath);
  const expectations: Array<[string, number]> = [
    ["Client Info", 22],
    ["Target Pages", 3],
    ["Campaign Management", 39],
    ["Referring Domains", 14],
  ];
  let ok = true;
  for (const [name, want] of expectations) {
    const ws = wb.getWorksheet(name);
    if (!ws) {
      console.error("FAIL: missing sheet", name);
      ok = false;
      continue;
    }
    const header = ws.getRow(1);
    const got = header.cellCount;
    if (got !== want) {
      console.error(`FAIL: ${name} headers got ${got} want ${want}`);
      ok = false;
    } else {
      console.log(`OK  : ${name} has ${got} columns`);
    }
  }
  if (!ok) process.exit(1);

  // Sanity-check a few CM cells
  const cm = wb.getWorksheet("Campaign Management")!;
  const row2 = cm.getRow(2);
  console.log("CM row 2 sample:", {
    period: row2.getCell(1).value,
    placementDomain: row2.getCell(5).value,
    dr: row2.getCell(7).value,
    budget: row2.getCell(16).value,
    profitFormula: row2.getCell(17).value,
    hash: row2.getCell(39).value,
  });
  console.log("EXPORT OK");
}
main();
