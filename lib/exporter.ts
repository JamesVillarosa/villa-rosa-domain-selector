/**
 * XLSX export for a scored campaign.
 *
 * Produces the four-tab workbook the villa.rosa campaign-management process
 * expects: Client Info, Target Pages, Campaign Management, and Referring
 * Domains. The shape of each tab (column names, order, formatting) mirrors
 * the team's existing Google Sheets templates so exports can be pasted
 * straight in without reformatting.
 */

import ExcelJS from "exceljs";
import crypto from "crypto";
import type {
  ClientBrief,
  Domain,
  ScoredDomain,
  ScoringConfig,
} from "./types";

export interface ExportCampaign {
  name: string | null;
  brief: ClientBrief;
  shortlist: ScoredDomain[];
}

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1A9C7C" },
};
const HEADER_FONT_COLOR = "FFFFFFFF";

/** Apply the green villa.rosa header bar + bold white text to a header row. */
function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR }, size: 11 };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  });
  row.height = 22;
}

/**
 * Size columns from the headers plus up to 25 sample rows. Cheaper than
 * iterating every cell after the fact and gives near-identical visual widths
 * on the workbooks the team actually opens.
 */
function sizeColumns(
  ws: ExcelJS.Worksheet,
  headers: string[],
  rows: unknown[][]
): void {
  const sample = rows.slice(0, 25);
  ws.columns = headers.map((h, i) => {
    let max = (h || "").split("\n").reduce(
      (m, line) => Math.max(m, line.length),
      0
    );
    for (const row of sample) {
      const v = row[i];
      if (v === null || v === undefined) continue;
      const s = typeof v === "object" ? "" : String(v);
      const len = s
        .split("\n")
        .reduce((m, line) => Math.max(m, line.length), 0);
      if (len > max) max = len;
    }
    return { width: Math.min(40, Math.max(12, max + 2)) };
  });
}

/**
 * Stable per-row identifier used by the team's downstream tracker.
 * Derived from domain + target URL + order date so a row can be re-emitted
 * idempotently across exports.
 */
function hashOrder(domain: string, targetUrl: string, dateIso: string): string {
  return crypto
    .createHash("md5")
    .update(`${domain}|${targetUrl}|${dateIso}`)
    .digest("hex")
    .slice(0, 18);
}

/**
 * Format any input the user might supply (free-text date, ISO date, Date
 * object) into the dd/mm/yyyy form the villa.rosa templates use. Returns an
 * empty string when no usable date is present.
 */
function toDDMMYYYY(value: string | Date | undefined | null): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    return formatDate(value);
  }
  const raw = String(value).trim();
  if (!raw) return "";

  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(raw);
  if (dmy) {
    const [, d, m, y] = dmy;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${yyyy}`;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) {
    const [, y, m, d] = iso;
    return `${d}/${m}/${y}`;
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return formatDate(parsed);
  return raw;
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Resolve the placement type (GP / LI / Niche Edit) for the Campaign
 * Management sheet.
 *
 * The "Link Type" column in vendor inventories is frequently populated with
 * the dofollow preference ("Dofollow" / "Nofollow") rather than the actual
 * placement type. When that happens we fall back to the price columns:
 * GP Price → GP, LI Price → LI. Real values like "Niche Edit" are passed
 * through unchanged.
 */
function resolveLinkType(d: Domain): string {
  const raw = (d.linkType || "").trim();
  const looksLikeFollowFlag = /^(do|no)\s*follow$/i.test(raw);
  if (raw && !looksLikeFollowFlag) return raw;

  const gp = parsePrice(d.gpPrice);
  const li = parsePrice(d.liPrice);
  if (gp > 0) return "GP";
  if (li > 0) return "LI";
  return raw;
}

function parsePrice(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

const CLIENT_INFO_HEADERS = [
  "Client Name",
  "Client Status",
  "Order / Period",
  "Order Start Date",
  "Order Deadline",
  "Link Volume",
  "Budget Per Target",
  "Min. DR",
  "Min. Traffic",
  "Order Payment Date",
  "Order Type",
  "Domains",
  "Target Pages",
  "Domain Approval",
  "Domain Approval Tracker",
  "Order / Period Notes",
  "Team in Charge",
  "Links Live",
  "Order / Period Shortfall",
  "Link Tracker",
  "Order Status",
  "Account Manager",
];

const TARGET_PAGE_HEADERS = ["#", "Target URL", "Primary Keyword"];

const CM_HEADERS = [
  "Period",
  "Period Start Date",
  "Order #",
  "Order Date",
  "Placement Domain",
  "Placement URL",
  "DR",
  "Traffic",
  "Order Price",
  "DB Price",
  "Can Use",
  "TAT",
  "Target URL",
  "Anchor Text",
  "Link Type",
  "Budget",
  "Profit",
  "Status",
  "Publishing Date",
  "Contact Email",
  "Thread ID",
  "Team",
  "Notes",
  "Review Status",
  "Review Notes",
  "Topics/Snippets",
  "GP Doc",
  "Content Status",
  "Payment Invoice",
  "Vendor Name\n(on the invoice)",
  "Request Type",
  "Invoice Link No.",
  "Payment Status",
  "Payment Notes",
  "",
  "",
  "",
  "",
  "Hash",
];

const REFERRING_HEADERS = [
  "#",
  "Domain",
  "Is spam",
  "DR",
  "Dofollow ref. domains",
  "Dofollow linked domains",
  "Traffic ",
  "Keywords ",
  "Links to target",
  "New links",
  "Lost links",
  "Dofollow links",
  "First seen",
  "Lost",
];

/** Coerce CSV-derived values (which arrive as strings) into a number for
 * Excel cells. Returns `null` for blanks so Excel renders an empty cell. */
function toNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v === undefined || v === null) return null;
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

/**
 * Build the four-sheet campaign workbook and return its raw bytes ready for
 * HTTP transmission.
 */
export async function generateExport(
  campaign: ExportCampaign,
  _config: ScoringConfig
): Promise<Buffer> {
  void _config;
  const wb = new ExcelJS.Workbook();
  wb.creator = "villa.rosa: domain selector";
  wb.created = new Date();

  const brief = campaign.brief;
  const selected = campaign.shortlist.filter(
    (s) => s && s.selected !== false && !s.disqualified
  );
  const today = new Date();
  const todayDDMM = formatDate(today);
  const periodStartDate = toDDMMYYYY(brief.campaignStartDate) || todayDDMM;
  const orderDate = todayDDMM;
  const budgetCell = brief.budgetPerLink
    ? Math.round(brief.budgetPerLink)
    : "";

  // Tab 1: Client Info
  const ws1 = wb.addWorksheet("Client Info", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const domainsListed = Array.from(
    new Set(selected.map((s) => s.domain.domain))
  ).join(", ");
  const targetPagesListed = brief.targetPages
    .map((p) => (p.url || "").trim())
    .filter(Boolean)
    .join("\n");
  const clientRow: unknown[] = [
    brief.clientName || "",
    "Active",
    1,
    toDDMMYYYY(brief.campaignStartDate),
    "",
    brief.linkCountGoal || selected.length,
    budgetCell,
    brief.minDR,
    brief.minTraffic,
    "",
    "Monthly",
    domainsListed,
    targetPagesListed,
    brief.domainApprovalProcess?.toLowerCase().includes("no") ? "No" : "Yes",
    "",
    brief.notesForTeam || "",
    brief.accountManager || "",
    0,
    brief.linkCountGoal || selected.length,
    "",
    "⏳ In Progress",
    brief.accountManager || "",
  ];
  sizeColumns(ws1, CLIENT_INFO_HEADERS, [clientRow]);
  ws1.addRow(CLIENT_INFO_HEADERS);
  styleHeader(ws1.getRow(1));
  ws1.addRow(clientRow);
  ws1.getRow(2).alignment = { vertical: "top", wrapText: true };

  // Tab 2: Target Pages
  const ws2 = wb.addWorksheet("Target Pages", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const pageRows: unknown[][] = brief.targetPages.map((p, i) => [
    i + 1,
    (p.url || "").trim(),
    (p.keyword || "").trim(),
  ]);
  sizeColumns(ws2, TARGET_PAGE_HEADERS, pageRows);
  ws2.addRow(TARGET_PAGE_HEADERS);
  styleHeader(ws2.getRow(1));
  for (const r of pageRows) ws2.addRow(r);

  // Tab 3: Campaign Management — one row per selected domain.
  const ws3 = wb.addWorksheet("Campaign Management", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const cmRows: unknown[][] = selected.map((s, idx) => {
    const orderNum = `${(brief.clientName || "ORD")
      .slice(0, 3)
      .toUpperCase()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getFullYear()).slice(-2)}${String(idx + 1).padStart(2, "0")}`;
    const target = (
      brief.targetPages[idx % Math.max(1, brief.targetPages.length)]?.url || ""
    ).trim();
    return [
      1,
      periodStartDate,
      orderNum,
      orderDate,
      s.domain.domain,
      "",
      toNum(s.domain.dr),
      toNum(s.domain.traffic),
      toNum(s.domain.gpPrice || s.domain.liPrice),
      "-",
      "Yes",
      (s.domain.tat || "").trim() || "-",
      target,
      "",
      resolveLinkType(s.domain),
      budgetCell,
      "",
      "Pending",
      "",
      s.domain.contactEmail || "",
      "",
      brief.accountManager || "",
      s.reasoning || "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      hashOrder(s.domain.domain, target, orderDate),
    ];
  });
  sizeColumns(ws3, CM_HEADERS, cmRows);
  ws3.addRow(CM_HEADERS);
  styleHeader(ws3.getRow(1));
  cmRows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const row = ws3.addRow(r);
    // Profit = Order Price - DB Price. DB Price is the "-" placeholder,
    // so the formula will surface a #VALUE! error until the team enters
    // a real DB price; this matches the existing template behaviour.
    row.getCell(17).value = { formula: `I${rowNum}-J${rowNum}` };
  });

  // Tab 4: Referring Domains — placeholder structure the team fills in later.
  const ws4 = wb.addWorksheet("Referring Domains", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const refRows: unknown[][] = selected.map((s, idx) => [
    idx + 1,
    s.domain.domain,
    "FALSE",
    toNum(s.domain.dr),
    "",
    "",
    toNum(s.domain.traffic),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  sizeColumns(ws4, REFERRING_HEADERS, refRows);
  ws4.addRow(REFERRING_HEADERS);
  styleHeader(ws4.getRow(1));
  for (const r of refRows) ws4.addRow(r);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
