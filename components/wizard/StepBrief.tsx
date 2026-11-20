/**
 * Step 7 — Campaign Brief.
 *
 * The post-scoring view: shows the high-level brief panel, a sub-tab bar
 * (Brief / Domains / Pages), and the editable Shortlist table. The
 * shortlist is hydrated from the cached value on `WizardState` when
 * available so the tab renders instantly; if absent (e.g. after a hard
 * reload), the component falls back to fetching the campaign from the API.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useWizard } from "./WizardContext";
import { buildBriefFromState } from "./buildBrief";
import Shortlist from "../Shortlist";
import type { ScoredDomain } from "@/lib/types";

type SubTab = "brief" | "domains" | "pages";

/** Strip out any rows that don't carry a usable `domain` object — legacy
 *  test data and pre-refactor exports occasionally land here with the
 *  wrong shape and would otherwise crash the table. */
function sanitize(rows: ScoredDomain[] | null | undefined): ScoredDomain[] {
  if (!rows) return [];
  return rows.filter(
    (r) =>
      r &&
      typeof r === "object" &&
      r.domain &&
      typeof r.domain === "object" &&
      typeof r.domain.domain === "string"
  );
}

export default function StepBrief() {
  const { state, patch } = useWizard();
  const [subTab, setSubTab] = useState<SubTab>("domains");
  const [shortlist, setShortlist] = useState<ScoredDomain[]>(() =>
    sanitize(state.shortlistCache)
  );
  const [excluded, setExcluded] = useState<ScoredDomain[]>(() =>
    sanitize(state.excludedCache)
  );
  const hadCache =
    !!state.shortlistCache && state.shortlistCache.length > 0;
  const [loading, setLoading] = useState(!hadCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.campaignId) {
      setLoading(false);
      if (!hadCache) setError("No campaign loaded yet");
      return;
    }
    // Cached shortlist → skip the network round-trip.
    if (hadCache) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/campaigns/${state.campaignId}`);
        if (!r.ok) throw new Error("Failed to load campaign");
        const { campaign } = (await r.json()) as {
          campaign: {
            shortlist?: ScoredDomain[];
            excluded?: ScoredDomain[];
          };
        };
        if (cancelled) return;
        const sl = sanitize(campaign.shortlist);
        const ex = sanitize(campaign.excluded);
        setShortlist(sl);
        setExcluded(ex);
        patch({ shortlistCache: sl, excludedCache: ex });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.campaignId, hadCache, patch]);

  const saveShortlist = useCallback(
    async (next: ScoredDomain[]) => {
      const clean = sanitize(next);
      setShortlist(clean);
      patch({ shortlistCache: clean });
      if (!state.campaignId) return;
      await fetch(`/api/campaigns/${state.campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortlist: clean }),
      });
    },
    [state.campaignId, patch]
  );

  const brief = buildBriefFromState(state);
  const budgetPerLink = brief.budgetPerLink || 0;

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(brief, null, 2));
    } catch {
      /* clipboard might be blocked in some browsers */
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <div className="muted text-xs">Client</div>
            <h2 className="text-xl font-semibold">
              {brief.clientName || "Unnamed client"}
            </h2>
            {brief.website && (
              <a
                href={brief.website}
                target="_blank"
                rel="noreferrer"
                className="muted text-xs underline"
              >
                {brief.website}
              </a>
            )}
          </div>
          <div className="text-right">
            <div className="muted text-xs">Contract</div>
            <div className="font-mono text-lg">
              ${brief.contractValue?.toLocaleString() || "—"}
            </div>
            <div className="muted text-xs">{brief.billingCycle || "—"}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <Stat label="Links / mo" value={String(brief.linkCountGoal || "—")} />
          <Stat label="Min DR" value={String(brief.minDR)} />
          <Stat label="Min traffic" value={brief.minTraffic.toLocaleString()} />
          <Stat label="Geo" value={brief.geo} />
          <Stat label="Profile" value={brief.profile} />
        </div>
      </div>

      <div className="tabbar" style={{ maxWidth: 480 }}>
        <button
          data-active={subTab === "brief"}
          onClick={() => setSubTab("brief")}
        >
          Campaign brief
        </button>
        <button
          data-active={subTab === "domains"}
          onClick={() => setSubTab("domains")}
        >
          Domains ({shortlist.length})
        </button>
        <button
          data-active={subTab === "pages"}
          onClick={() => setSubTab("pages")}
        >
          Target pages ({brief.targetPages.length})
        </button>
      </div>

      {error && <div className="banner banner-danger">{error}</div>}

      {subTab === "brief" && (
        <div className="panel p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Campaign brief</h3>
            <button className="btn btn-ghost" onClick={copyBrief}>
              Copy brief
            </button>
          </div>
          <BriefBlock label="Niches" value={brief.niches.join(", ")} />
          <BriefBlock label="Goal" value={brief.primaryGoal || "—"} />
          <BriefBlock label="KPIs" value={(brief.kpis || []).join(", ")} />
          <BriefBlock
            label="Link types"
            value={(brief.linkTypes || []).join(", ")}
          />
          <BriefBlock
            label="Anchor strategy"
            value={brief.anchorTextStrategy || "—"}
          />
          <BriefBlock
            label="Reporting"
            value={`${brief.reportingFrequency || "—"} → ${brief.reportingContact || "—"} via ${brief.communicationChannel || "—"}`}
          />
          <BriefBlock
            label="Domain approval"
            value={brief.domainApprovalProcess || "—"}
          />
          <BriefBlock
            label="Notes for team"
            value={brief.notesForTeam || "—"}
            multi
          />
          <BriefBlock
            label="Red flags / sensitivities"
            value={brief.redFlagsSensitivities || "—"}
            multi
          />
        </div>
      )}

      {subTab === "domains" && (
        loading ? (
          <div className="panel p-6 muted text-sm text-center">
            Loading shortlist…
          </div>
        ) : (
          <Shortlist
            campaignId={state.campaignId || ""}
            shortlist={shortlist}
            excluded={excluded}
            budgetPerLink={budgetPerLink}
            onChange={saveShortlist}
          />
        )
      )}

      {subTab === "pages" && (
        <div className="panel p-4">
          <table className="shortlist">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Target URL</th>
                <th>Primary keyword</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {brief.targetPages.map((p, i) => (
                <tr key={i}>
                  <td className="muted">{i + 1}</td>
                  <td className="font-mono">{p.url}</td>
                  <td>{p.keyword}</td>
                  <td className="muted">{p.pageType || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted text-[11px] uppercase tracking-wider">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}

function BriefBlock({
  label,
  value,
  multi,
}: {
  label: string;
  value: string;
  multi?: boolean;
}) {
  return (
    <div>
      <div className="muted text-[11px] uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={multi ? "whitespace-pre-wrap" : ""}>{value || "—"}</div>
    </div>
  );
}
