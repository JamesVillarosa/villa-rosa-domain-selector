/** Step 2 — Campaign Setup. Captures target pages, link types, approval
 *  policies, and competitor exclusions. */

"use client";

import { useWizard } from "./WizardContext";
import type { TargetPage } from "@/lib/types";

const PAGE_TYPES = ["Homepage", "Product", "Blog", "Resource", "Other"];
const LINK_TYPES = [
  "Guest Post",
  "Niche Edit",
  "Digital PR",
  "Resource Link",
  "Listicle",
  "Roundup",
];

export default function StepCampaignSetup() {
  const { state, set, errors, clearError } = useWizard();

  const updatePage = (i: number, patch: Partial<TargetPage>) => {
    const next = state.targetPages.map((p, idx) =>
      idx === i ? { ...p, ...patch } : p
    );
    set("targetPages", next);
    clearError("targetPages");
  };
  const addPage = () => {
    set("targetPages", [
      ...state.targetPages,
      { url: "", keyword: "", pageType: "Other" },
    ]);
  };
  const removePage = (i: number) => {
    if (state.targetPages.length === 1) return;
    set(
      "targetPages",
      state.targetPages.filter((_, idx) => idx !== i)
    );
  };
  const toggleLink = (lt: string) => {
    set(
      "linkTypes",
      state.linkTypes.includes(lt)
        ? state.linkTypes.filter((x) => x !== lt)
        : [...state.linkTypes, lt]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Campaign Setup</h2>
        <p className="muted text-xs">
          Define what we&apos;re pointing links at and what kinds of placements
          we&apos;ll pursue.
        </p>
      </div>

      <div>
        <label className="label">Target pages *</label>
        <div className="space-y-2">
          {state.targetPages.map((p, i) => {
            const urlError = errors[`targetPageUrl_${i}`];
            return (
              <div
                key={i}
                className={`panel p-3 grid grid-cols-12 gap-2 items-center ${errors.targetPages ? "field-error-box" : ""}`}
              >
                <div className="col-span-12 sm:col-span-1 muted text-xs">
                  Page {i + 1}
                </div>
                <div className="col-span-12 sm:col-span-5">
                  <input
                    value={p.url}
                    onChange={(e) => {
                      updatePage(i, { url: e.target.value });
                      clearError(`targetPageUrl_${i}`);
                    }}
                    placeholder="https://acmecorp.com/pricing"
                    data-error={!!urlError}
                  />
                  {urlError && <div className="error-msg">{urlError}</div>}
                </div>
                <input
                  className="col-span-12 sm:col-span-4"
                  value={p.keyword}
                  onChange={(e) => updatePage(i, { keyword: e.target.value })}
                  placeholder="target keyword"
                />
                <select
                  className="col-span-10 sm:col-span-2"
                  value={p.pageType || "Other"}
                  onChange={(e) => updatePage(i, { pageType: e.target.value })}
                >
                  {PAGE_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost btn-icon col-span-2 sm:col-span-1"
                  onClick={() => removePage(i)}
                  disabled={state.targetPages.length === 1}
                  aria-label="Remove page"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button className="btn btn-ghost mt-2" onClick={addPage}>
          + Add Page
        </button>
        {errors.targetPages && (
          <div className="error-msg">{errors.targetPages}</div>
        )}
      </div>

      <div className="row row-2">
        <div>
          <label className="label">Anchor text strategy</label>
          <select
            value={state.anchorTextStrategy}
            onChange={(e) => set("anchorTextStrategy", e.target.value)}
          >
            <option>Natural / Mixed</option>
            <option>Branded</option>
            <option>Exact match</option>
            <option>Partial match</option>
            <option>Generic</option>
          </select>
        </div>
        <div>
          <label className="label">Monthly link volume</label>
          <input
            type="number"
            value={state.monthlyLinkVolume}
            onChange={(e) => {
              set("monthlyLinkVolume", e.target.value);
              clearError("monthlyLinkVolume");
            }}
            placeholder="8"
            data-error={!!errors.monthlyLinkVolume}
          />
          {errors.monthlyLinkVolume && (
            <div className="error-msg">{errors.monthlyLinkVolume}</div>
          )}
        </div>
      </div>

      <div>
        <label className="label">Link types</label>
        <div className="flex flex-wrap gap-2">
          {LINK_TYPES.map((lt) => (
            <button
              key={lt}
              type="button"
              className="pill"
              data-on={state.linkTypes.includes(lt)}
              onClick={() => toggleLink(lt)}
            >
              {lt}
            </button>
          ))}
        </div>
      </div>

      <div className="row row-2">
        <div>
          <label className="label">Domain approval process</label>
          <select
            value={state.domainApprovalProcess}
            onChange={(e) => set("domainApprovalProcess", e.target.value)}
          >
            <option>villa.rosa selects — no approval needed</option>
            <option>Client approves each domain</option>
            <option>villa.rosa selects, client veto only</option>
          </select>
        </div>
        <div>
          <label className="label">Content approval required</label>
          <select
            value={state.contentApprovalRequired}
            onChange={(e) => set("contentApprovalRequired", e.target.value)}
          >
            <option>No — villa.rosa handles content</option>
            <option>Yes — client approves drafts</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Competitors / sites to avoid</label>
        <textarea
          value={state.competitorsToAvoid}
          onChange={(e) => set("competitorsToAvoid", e.target.value)}
          placeholder="List competitor domains we should never link from"
        />
      </div>
    </div>
  );
}
