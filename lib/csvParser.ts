/**
 * Vendor inventory CSV parser.
 *
 * Inventory files arrive in mildly inconsistent formats: header rows are
 * sometimes preceded by title rows, column casing varies, and the same
 * domain can appear on multiple rows (one per price tier). This module
 * locates the header, normalises column names against a known alias map,
 * and emits a clean `Domain[]` with duplicates collapsed.
 */

import Papa from "papaparse";
import type { Domain } from "./types";

export interface CsvParseResult {
  domains: Domain[];
  errors: string[];
  rowCount: number;
  warnings: string[];
}

const EMOJI_RE = /[←-⇿⌀-➿⬀-⯿︀-️]/g;

function clean(s: unknown): string {
  if (s === undefined || s === null) return "";
  return String(s).replace(EMOJI_RE, "").trim();
}

const COLUMN_MAP: Record<string, keyof Domain> = {
  domain: "domain",
  dr: "dr",
  ur: "ur",
  traffic: "traffic",
  "traffic value": "trafficValue",
  "country. traffic": "countryTraffic",
  "country traffic": "countryTraffic",
  country: "countryTraffic",
  niche: "niche",
  main: "main",
  complementary: "complementary",
  indirect: "indirect",
  "gp price": "gpPrice",
  "li price": "liPrice",
  "link type": "linkType",
  tat: "tat",
  "red flags": "redFlags",
  ranking: "ranking",
  contact: "contactEmail",
  "contact email": "contactEmail",
  "contact type": "contactType",
  status: "status",
  notes: "notes",
  "times used": "timesUsed",
  "usage saturation": "usageSaturation",
};

/** Scan the first dozen rows for the inventory header — the one that
 *  contains at least a `Domain` column plus either `DR` or `Traffic`. */
function detectHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const row = rows[i];
    if (!row) continue;
    const lower = row.map((c) => clean(c).toLowerCase());
    if (
      lower.includes("domain") &&
      (lower.includes("dr") || lower.includes("traffic"))
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse a raw CSV string into normalised `Domain` rows.
 *
 * The parser tolerates leading title/summary rows, mixed column casing,
 * and duplicate domain entries. Hard failures (missing required columns,
 * no header) surface as `errors`; recoverable issues (skipped blank rows,
 * collapsed duplicates) surface as `warnings`.
 */
export function parseInventoryCsv(text: string): CsvParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (result.errors.length > 0) {
    for (const e of result.errors) {
      if (e.type !== "FieldMismatch") {
        errors.push(`${e.type}: ${e.message} (row ${e.row ?? "?"})`);
      }
    }
  }

  const rows = result.data as string[][];
  const headerIdx = detectHeaderRow(rows);
  if (headerIdx === -1) {
    errors.push("Could not detect header row (looking for 'Domain' + 'DR'/'Traffic')");
    return { domains: [], errors, rowCount: 0, warnings };
  }

  const header = rows[headerIdx].map((h) => clean(h).toLowerCase());
  const indexMap: Partial<Record<keyof Domain, number>> = {};
  for (let i = 0; i < header.length; i++) {
    const key = header[i];
    const mapped = COLUMN_MAP[key];
    if (mapped) indexMap[mapped] = i;
  }

  const required: (keyof Domain)[] = ["domain", "dr", "traffic"];
  for (const r of required) {
    if (indexMap[r] === undefined) {
      errors.push(`Missing required column: ${r}`);
    }
  }
  if (errors.length > 0) {
    return { domains: [], errors, rowCount: 0, warnings };
  }

  const domains: Domain[] = [];
  // Dedupe by lowercased domain name; keep the first occurrence so vendor
  // priority is preserved.
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const get = (k: keyof Domain): string => {
      const idx = indexMap[k];
      if (idx === undefined) return "";
      return clean(row[idx]);
    };
    const domain = get("domain");
    if (!domain) {
      skipped++;
      continue;
    }
    if (
      /^total unique domains/i.test(domain) ||
      /^good domains/i.test(domain) ||
      /^okay domains/i.test(domain) ||
      /^poor domains/i.test(domain)
    ) {
      continue;
    }
    const key = domain.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    domains.push({
      domain,
      dr: get("dr"),
      ur: get("ur"),
      traffic: get("traffic"),
      trafficValue: get("trafficValue"),
      countryTraffic: get("countryTraffic"),
      niche: get("niche"),
      main: get("main"),
      complementary: get("complementary"),
      indirect: get("indirect"),
      gpPrice: get("gpPrice"),
      liPrice: get("liPrice"),
      linkType: get("linkType"),
      tat: get("tat"),
      redFlags: get("redFlags"),
      ranking: get("ranking"),
      contactEmail: get("contactEmail"),
      contactType: get("contactType"),
      status: get("status"),
      notes: get("notes"),
      timesUsed: get("timesUsed"),
      usageSaturation: get("usageSaturation"),
    });
  }

  if (skipped > 0) warnings.push(`Skipped ${skipped} rows with empty domain`);
  if (duplicates > 0) {
    warnings.push(
      `Collapsed ${duplicates} duplicate domain row${duplicates > 1 ? "s" : ""} — kept first occurrence`
    );
  }
  return { domains, errors, rowCount: domains.length, warnings };
}
