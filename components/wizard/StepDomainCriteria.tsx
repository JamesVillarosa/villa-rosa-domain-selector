/** Step 3 — Domain Criteria. Hard floors (DR, traffic, follow type),
 *  niche keywords, geo target, and the scoring profile selection. */

"use client";

import { useWizard } from "./WizardContext";
import type { Profile } from "@/lib/types";

const GEO_OPTIONS = [
  "Global",
  "US",
  "GB",
  "CA",
  "AU",
  "DE",
  "FR",
  "ES",
  "IN",
  "BR",
];

const PROFILES: { id: Profile; label: string; hint: string }[] = [
  { id: "standard", label: "Standard (SaaS)", hint: "Default weights — niche 40, DR 15, traffic 15" },
  { id: "ecommerce", label: "Ecommerce", hint: "Niche 50, DR 10, traffic 10 — topical fit matters more" },
  { id: "fintech", label: "Fintech / regulated", hint: "Niche 35, red flags 10 — stricter cleanliness" },
  { id: "local", label: "Local services", hint: "Geo 15, traffic 5 — geo over reach" },
];

export default function StepDomainCriteria() {
  const { state, set, errors, clearError } = useWizard();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Domain Criteria</h2>
        <p className="muted text-xs">
          Hard minimums filter domains out before scoring. The profile choice
          changes which weights the scorer uses.
        </p>
      </div>
      <div className="row row-2">
        <div>
          <label className="label">Minimum DA (Moz)</label>
          <input
            type="number"
            value={state.minDA}
            onChange={(e) => {
              set("minDA", e.target.value);
              clearError("minDA");
            }}
            placeholder="40"
            data-error={!!errors.minDA}
          />
          <div className="muted text-[11px] mt-1">Informational — not used in scoring</div>
          {errors.minDA && <div className="error-msg">{errors.minDA}</div>}
        </div>
        <div>
          <label className="label">Minimum DR (Ahrefs) *</label>
          <input
            type="number"
            value={state.minDR}
            onChange={(e) => {
              set("minDR", e.target.value);
              clearError("minDR");
            }}
            placeholder="50"
            data-error={!!errors.minDR}
          />
          <div className="muted text-[11px] mt-1">
            Hard minimum — below this = filtered out
          </div>
          {errors.minDR && <div className="error-msg">{errors.minDR}</div>}
        </div>
      </div>
      <div className="row row-2">
        <div>
          <label className="label">Minimum monthly traffic *</label>
          <input
            type="number"
            value={state.minTraffic}
            onChange={(e) => {
              set("minTraffic", e.target.value);
              clearError("minTraffic");
            }}
            placeholder="5000"
            data-error={!!errors.minTraffic}
          />
          {errors.minTraffic && (
            <div className="error-msg">{errors.minTraffic}</div>
          )}
        </div>
        <div>
          <label className="label">Link type requirement</label>
          <select
            value={state.linkTypeRequirement}
            onChange={(e) =>
              set(
                "linkTypeRequirement",
                e.target.value as "Dofollow only" | "Either"
              )
            }
          >
            <option>Dofollow only</option>
            <option>Either</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Preferred niches / topics</label>
        <textarea
          value={state.preferredNiches}
          onChange={(e) => set("preferredNiches", e.target.value)}
          placeholder="e.g. SaaS, B2B tech, project management, HR software — these keywords drive the niche matching score"
        />
        <div className="muted text-[11px] mt-1">
          These keywords drive the niche matching score
        </div>
      </div>
      <div className="row row-2">
        <div>
          <label className="label">Geo focus</label>
          <select
            value={state.geo}
            onChange={(e) => set("geo", e.target.value)}
          >
            {GEO_OPTIONS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Industries / niches to exclude</label>
          <input
            value={state.industriesToExclude}
            onChange={(e) => set("industriesToExclude", e.target.value)}
            placeholder="e.g. gambling, CBD, crypto, adult, payday loans"
          />
        </div>
      </div>

      <div className="divider" />

      <div>
        <label className="label">Scoring profile</label>
        <div className="grid sm:grid-cols-2 gap-2">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              className="panel text-left p-3"
              data-on={state.profile === p.id}
              onClick={() => set("profile", p.id)}
              style={{
                borderColor:
                  state.profile === p.id ? "var(--accent)" : "var(--border)",
                background:
                  state.profile === p.id
                    ? "rgba(0,212,212,0.05)"
                    : "var(--panel)",
              }}
            >
              <div className="font-medium">{p.label}</div>
              <div className="muted text-[11px] mt-1">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
