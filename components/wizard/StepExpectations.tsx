/** Step 4 — Goals & Expectations. Primary goal, KPIs, reporting cadence,
 *  team notes, and known sensitivities. */

"use client";

import { useWizard } from "./WizardContext";

const KPIS = [
  "Keyword Rankings",
  "Organic Traffic",
  "DA / DR",
  "Referring Domains",
  "Leads",
  "Revenue",
  "Brand Mentions",
];

const SERVICES = [
  "On-page SEO",
  "Content writing",
  "PR distribution",
  "Local SEO",
  "Technical audit",
  "Competitor research",
];

export default function StepExpectations() {
  const { state, set, errors, clearError } = useWizard();
  const toggle = (key: "kpis" | "additionalServices", v: string) => {
    const cur = state[key];
    set(
      key,
      cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    );
  };
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Goals &amp; Expectations</h2>
        <p className="muted text-xs">
          What success looks like and how the team should communicate.
        </p>
      </div>
      <div className="row row-2">
        <div>
          <label className="label">Primary campaign goal</label>
          <select
            value={state.primaryGoal}
            onChange={(e) => set("primaryGoal", e.target.value)}
          >
            <option>Keyword Rankings</option>
            <option>Organic Traffic</option>
            <option>Brand Authority</option>
            <option>Leads</option>
          </select>
        </div>
        <div>
          <label className="label">Expected results timeline</label>
          <select
            value={state.expectedTimeline}
            onChange={(e) => set("expectedTimeline", e.target.value)}
          >
            <option>1–3 months</option>
            <option>3–6 months</option>
            <option>6–12 months</option>
            <option>12+ months</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">KPIs to track</label>
        <div className="flex flex-wrap gap-2">
          {KPIS.map((k) => (
            <button
              key={k}
              type="button"
              className="pill"
              data-on={state.kpis.includes(k)}
              onClick={() => toggle("kpis", k)}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Target keywords to monitor</label>
        <textarea
          value={state.keywordsToMonitor}
          onChange={(e) => set("keywordsToMonitor", e.target.value)}
          placeholder="List the 5–10 keywords the client cares about ranking for"
        />
      </div>
      <div className="row row-3">
        <div>
          <label className="label">Reporting frequency</label>
          <select
            value={state.reportingFrequency}
            onChange={(e) => set("reportingFrequency", e.target.value)}
          >
            <option>Weekly</option>
            <option>Monthly</option>
            <option>Quarterly</option>
            <option>On demand</option>
          </select>
        </div>
        <div>
          <label className="label">Reporting contact</label>
          <input
            type="email"
            value={state.reportingContact}
            onChange={(e) => {
              set("reportingContact", e.target.value);
              clearError("reportingContact");
            }}
            placeholder="reports@client.com"
            data-error={!!errors.reportingContact}
          />
          {errors.reportingContact && (
            <div className="error-msg">{errors.reportingContact}</div>
          )}
        </div>
        <div>
          <label className="label">Communication channel</label>
          <select
            value={state.communicationChannel}
            onChange={(e) => set("communicationChannel", e.target.value)}
          >
            <option>Email</option>
            <option>Slack</option>
            <option>WhatsApp</option>
            <option>Phone</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Additional services interested in</label>
        <div className="flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <button
              key={s}
              type="button"
              className="pill"
              data-on={state.additionalServices.includes(s)}
              onClick={() => toggle("additionalServices", s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Notes for campaign team</label>
        <textarea
          value={state.notesForTeam}
          onChange={(e) => set("notesForTeam", e.target.value)}
          placeholder="Brand voice, past experiences, specific opportunities, client quirks…"
        />
      </div>
      <div>
        <label className="label">Red flags / sensitivities</label>
        <textarea
          value={state.redFlagsSensitivities}
          onChange={(e) => set("redFlagsSensitivities", e.target.value)}
          placeholder="Manual action history, sensitive regulatory topics, vendors to never use…"
        />
      </div>
    </div>
  );
}
