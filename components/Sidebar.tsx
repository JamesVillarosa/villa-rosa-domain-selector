/**
 * Past Campaigns sidebar.
 *
 * Lists all campaigns persisted in SQLite, lets the user open one
 * (delegating to `WizardContext.loadFromCampaign`), and supports inline
 * deletion via a hover-revealed trash icon and a small confirmation row.
 * Refetches the list on mount and whenever a scoring run completes.
 */

"use client";

import { useEffect, useState } from "react";
import { useWizard } from "./wizard/WizardContext";

interface CampaignSummary {
  id: string;
  name: string | null;
  status: "draft" | "finalised";
  created_at: string;
}

export default function Sidebar() {
  const { reset, loadFromCampaign, state } = useWizard();
  const [collapsed, setCollapsed] = useState(false);
  const [items, setItems] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/campaigns", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { campaigns: CampaignSummary[] };
        setItems(j.campaigns);
      }
    } catch {
      /* offline / API error — fine */
    } finally {
      setLoading(false);
    }
  };

  // Refetch only on mount and when a new campaign appears (scoringStage
  // transitions to "complete"); transient states like "scoring" don't add
  // sidebar rows so don't need a refresh.
  useEffect(() => {
    if (state.scoringStage === "complete") {
      load();
    }
  }, [state.scoringStage]);

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const r = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 404) {
        throw new Error(`Delete failed (HTTP ${r.status})`);
      }
      setItems((cur) => cur.filter((c) => c.id !== id));
      setConfirmingId(null);
      if (state.campaignId === id) {
        reset();
      }
    } catch (e) {
      console.error("[delete campaign]", e);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <aside
      className="panel flex flex-col"
      style={{
        width: collapsed ? 48 : 260,
        transition: "width 200ms ease",
        overflow: "hidden",
        minHeight: "calc(100vh - 96px)",
      }}
    >
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
        {!collapsed && (
          <div className="text-xs muted uppercase tracking-wider">
            Past campaigns
          </div>
        )}
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {!collapsed && (
        <div className="p-3">
          <button
            className="btn btn-primary w-full"
            onClick={() => reset()}
          >
            + New Campaign
          </button>
        </div>
      )}

      {!collapsed && (
        <div
          className="scrollbar overflow-auto p-2 flex-1"
          style={{ maxHeight: "calc(100vh - 220px)" }}
        >
          {loading && <div className="muted text-xs p-2">Loading…</div>}
          {!loading && items.length === 0 && (
            <div className="muted text-xs p-2">
              No campaigns yet — fill in the wizard to get started.
            </div>
          )}
          <ul className="space-y-1">
            {items.map((c) => {
              const isActive = state.campaignId === c.id;
              const isConfirming = confirmingId === c.id;
              const isDeleting = deletingId === c.id;
              return (
                <li key={c.id} className="campaign-row group relative">
                  <button
                    className="w-full text-left p-2 pr-8 rounded-md hover:bg-[#15191c] transition disabled:opacity-50"
                    style={{
                      background: isActive ? "#15191c" : "transparent",
                      borderLeft: isActive
                        ? "2px solid var(--accent)"
                        : "2px solid transparent",
                    }}
                    onClick={() => loadFromCampaign(c.id)}
                    disabled={isDeleting || isConfirming}
                  >
                    <div className="text-sm truncate">
                      {c.name || "Untitled"}
                    </div>
                    <div className="muted text-[11px] flex items-center gap-2">
                      <span>{c.status}</span>
                      <span>·</span>
                      <span>
                        {new Date(c.created_at + "Z").toLocaleDateString()}
                      </span>
                    </div>
                  </button>

                  {!isConfirming && (
                    <button
                      type="button"
                      className="campaign-delete-btn"
                      aria-label="Delete campaign"
                      title="Delete campaign"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingId(c.id);
                      }}
                      disabled={isDeleting}
                    >
                      <TrashIcon />
                    </button>
                  )}

                  {isConfirming && (
                    <div className="mt-1 ml-2 flex items-center gap-2 text-[11px]">
                      <span className="text-[var(--danger)]">Delete?</span>
                      <button
                        type="button"
                        className="pill"
                        style={{
                          color: "var(--danger)",
                          borderColor: "var(--danger)",
                          padding: "2px 8px",
                        }}
                        onClick={() => handleDelete(c.id)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Deleting…" : "Yes"}
                      </button>
                      <button
                        type="button"
                        className="pill"
                        style={{ padding: "2px 8px" }}
                        onClick={() => setConfirmingId(null)}
                        disabled={isDeleting}
                      >
                        No
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
