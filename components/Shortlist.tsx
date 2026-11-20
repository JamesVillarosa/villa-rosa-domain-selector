/**
 * Editable shortlist table.
 *
 * Rendered inside the Campaign Brief step. Supports sorting, top-N
 * windowing, an "exclude" toggle per row, a min-score filter, and a
 * "View excluded" panel for the domains that failed disqualifiers.
 * Selection state and min-score input are local; export, persistence, and
 * navigation are delegated to `WizardContext`.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import type { ScoredDomain } from "@/lib/types";
import { useWizard } from "./wizard/WizardContext";

type SortKey =
  | "score"
  | "dr"
  | "traffic"
  | "price"
  | "domain";

interface Props {
  campaignId: string;
  shortlist: ScoredDomain[];
  excluded: ScoredDomain[];
  budgetPerLink: number;
  onChange: (next: ScoredDomain[]) => Promise<void>;
}

const toNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : NaN;
};

export default function Shortlist({
  campaignId,
  shortlist,
  excluded,
  budgetPerLink,
  onChange,
}: Props) {
  const [size, setSize] = useState<25 | 50 | 100>(50);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // String-backed so backspace clears cleanly; a numeric state forces a
  // leading "0" and breaks typing like "012".
  const [minScoreInput, setMinScoreInput] = useState("");
  const minScore = (() => {
    const n = parseInt(minScoreInput, 10);
    return isFinite(n) && n > 0 ? n : 0;
  })();
  const [showExcluded, setShowExcluded] = useState(false);
  const { exporting, exportError, exportCampaign, clearExportError } =
    useWizard();

  const sorted = useMemo(() => {
    // Drop malformed rows (legacy / test data missing the `domain` object)
    // and zero-scoring rows up-front: a domain that passes disqualifiers but
    // contributes nothing on any axis is "under" any sensible bar.
    const usable = shortlist.filter(
      (s) =>
        s &&
        s.domain &&
        typeof s.domain.domain === "string" &&
        s.score > 0 &&
        s.score >= minScore
    );
    const arr = usable.slice(0, size);
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      let av: number, bv: number;
      switch (sortKey) {
        case "dr":
          av = toNum(a.domain.dr);
          bv = toNum(b.domain.dr);
          break;
        case "traffic":
          av = toNum(a.domain.traffic);
          bv = toNum(b.domain.traffic);
          break;
        case "price":
          av = toNum(a.domain.gpPrice || a.domain.liPrice);
          bv = toNum(b.domain.gpPrice || b.domain.liPrice);
          break;
        case "domain":
          return a.domain.domain.localeCompare(b.domain.domain) * dir;
        case "score":
        default:
          av = a.score;
          bv = b.score;
      }
      if (isNaN(av)) return 1;
      if (isNaN(bv)) return -1;
      return (av - bv) * dir;
    });
    return arr;
  }, [shortlist, size, sortKey, sortDir, minScore]);

  const selectedCount = sorted.filter((s) => s.selected !== false).length;
  const totalsBudget = sorted
    .filter((s) => s.selected !== false)
    .reduce((acc) => acc + (budgetPerLink || 0), 0);
  const remainingBudget =
    budgetPerLink * shortlist.length - totalsBudget;
  const avgDR =
    sorted.filter((s) => s.selected !== false).length === 0
      ? 0
      : sorted
          .filter((s) => s.selected !== false)
          .reduce((acc, s) => acc + (toNum(s.domain.dr) || 0), 0) /
        Math.max(
          1,
          sorted.filter((s) => s.selected !== false).length
        );

  const toggleInclude = useCallback(
    async (d: ScoredDomain) => {
      const next = shortlist.map((s) =>
        s.domain.domain === d.domain.domain
          ? { ...s, selected: s.selected === false }
          : s
      );
      await onChange(next);
    },
    [shortlist, onChange]
  );

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const exportXlsx = () => exportCampaign(campaignId);

  return (
    <div className="space-y-4">
      <div className="panel p-3 flex flex-wrap items-center gap-4 sticky top-0 z-10">
        <Totals
          label="Links selected"
          value={`${selectedCount} / ${sorted.length}`}
        />
        <Totals
          label="Total budget"
          value={`$${totalsBudget.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
        />
        <Totals
          label="Budget remaining"
          value={`$${remainingBudget.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
        />
        <Totals label="Avg DR" value={avgDR.toFixed(1)} />
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <span className="muted text-xs">Min score</span>
          <input
            type="number"
            className="w-20"
            value={minScoreInput}
            onChange={(e) => {
              const v = e.target.value.replace(/^0+(?=\d)/, "");
              setMinScoreInput(v);
            }}
            placeholder="0"
            min={0}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="muted text-xs">Top</span>
          {[25, 50, 100].map((n) => (
            <button
              key={n}
              className="pill"
              data-on={size === n}
              onClick={() => setSize(n as 25 | 50 | 100)}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => setShowExcluded((v) => !v)}
        >
          {showExcluded
            ? "← Back to shortlist"
            : `View excluded (${excluded.length})`}
        </button>
        <button
          className="btn btn-primary"
          onClick={exportXlsx}
          disabled={exporting}
        >
          {exporting ? "Exporting…" : "Export Campaign"}
        </button>
      </div>

      {exportError && (
        <div className="banner banner-danger flex items-center justify-between gap-3">
          <span>{exportError}</span>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={clearExportError}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="panel scrollbar" style={{ overflow: "auto", maxHeight: "72vh" }}>
        {!showExcluded ? (
          <table className="shortlist">
            <thead>
              <tr>
                <th style={{ width: 36 }}>✓</th>
                <th onClick={() => setSort("domain")} style={{ cursor: "pointer" }}>
                  Domain
                </th>
                <th onClick={() => setSort("score")} style={{ cursor: "pointer" }}>
                  Score{" "}
                  <span className="muted">
                    {sortKey === "score" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                  </span>
                </th>
                <th>Breakdown</th>
                <th onClick={() => setSort("dr")} style={{ cursor: "pointer" }}>
                  DR
                </th>
                <th onClick={() => setSort("traffic")} style={{ cursor: "pointer" }}>
                  Traffic
                </th>
                <th onClick={() => setSort("price")} style={{ cursor: "pointer" }}>
                  Price
                </th>
                <th>TAT</th>
                <th>Type</th>
                <th>Geo</th>
                <th>Contact</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, idx) => (
                <tr
                  key={`${idx}-${s.domain.domain}`}
                  data-excluded={s.selected === false}
                >
                  <td>
                    <input
                      type="checkbox"
                      style={{ width: 16, height: 16 }}
                      checked={s.selected !== false}
                      onChange={() => toggleInclude(s)}
                    />
                  </td>
                  <td className="font-mono">{s.domain.domain}</td>
                  <td>
                    <span style={{ color: "var(--accent)" }}>{s.score}</span>
                    <span className="muted">/{s.maxScore}</span>
                  </td>
                  <td>
                    <div className="tooltip">
                      <button className="pill">breakdown</button>
                      <div className="tooltip-body">
                        <div>niche {s.breakdown.nicheMatch}</div>
                        <div>DR {s.breakdown.dr}</div>
                        <div>traffic {s.breakdown.traffic}</div>
                        <div>price {s.breakdown.price}</div>
                        <div>ranking {s.breakdown.ranking}</div>
                        <div>geo {s.breakdown.geo}</div>
                        <div>red flags {s.breakdown.noRedFlags}</div>
                        {s.llmReason && (
                          <>
                            <div style={{ marginTop: 6, color: "var(--accent)" }}>
                              ✦ +{s.llmNicheBoost ?? 0} LLM boost
                            </div>
                            <div
                              className="muted"
                              style={{ whiteSpace: "normal", maxWidth: 260 }}
                            >
                              {s.llmReason.slice(0, 200)}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{String(s.domain.dr || "—")}</td>
                  <td>{String(s.domain.traffic || "—")}</td>
                  <td>{s.domain.gpPrice || s.domain.liPrice || "—"}</td>
                  <td>{s.domain.tat || "—"}</td>
                  <td>{s.domain.linkType || "—"}</td>
                  <td className="muted">
                    {(s.domain.countryTraffic || "")
                      .replace(/[()]/g, "")
                      .split(",")[0]
                      .trim() || "—"}
                  </td>
                  <td className="muted">{s.domain.contactEmail || "—"}</td>
                  <td className="muted">{s.domain.redFlags || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="shortlist">
            <thead>
              <tr>
                <th>Domain</th>
                <th>DR</th>
                <th>Traffic</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {excluded.map((s, idx) => (
                <tr key={`${idx}-${s.domain.domain}`}>
                  <td className="font-mono">{s.domain.domain}</td>
                  <td>{String(s.domain.dr || "—")}</td>
                  <td>{String(s.domain.traffic || "—")}</td>
                  <td className="muted">{s.disqualReason || "Disqualified"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Totals({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted text-[11px] uppercase tracking-wider">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
