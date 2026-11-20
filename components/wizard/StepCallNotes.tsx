/** Step 5 — Call Notes (optional). Paste sales / onboarding summaries;
 *  AI parses them into structured fields the team can scan quickly. */

"use client";

import { useState } from "react";
import { useWizard } from "./WizardContext";
import type { ParsedCallNotes } from "@/lib/wizardState";

function ParsedCard({ p }: { p: ParsedCallNotes }) {
  return (
    <div className="panel p-3 mt-2 text-xs space-y-2">
      <div>
        <div className="muted">Summary</div>
        <div>{p.summary}</div>
      </div>
      {p.expectations.length > 0 && (
        <div>
          <div className="muted">Client expectations</div>
          <ul className="list-disc pl-5">
            {p.expectations.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {p.keyTopics.length > 0 && (
        <div>
          <div className="muted">Key topics</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {p.keyTopics.map((t, i) => (
              <span key={i} className="pill" data-on="true">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {p.actionItems.length > 0 && (
        <div>
          <div className="muted">Action items</div>
          <ul className="list-disc pl-5">
            {p.actionItems.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2 items-center">
        <span className="muted">Sentiment</span>
        <span
          className="pill"
          data-on="true"
          style={{
            background:
              p.sentiment === "concerned"
                ? "rgba(239,107,107,0.12)"
                : p.sentiment === "positive"
                  ? "rgba(122,209,134,0.12)"
                  : "rgba(0,212,212,0.12)",
            color:
              p.sentiment === "concerned"
                ? "var(--danger)"
                : p.sentiment === "positive"
                  ? "var(--ok)"
                  : "var(--accent)",
            borderColor: "transparent",
          }}
        >
          {p.sentiment}
        </span>
        {p.flag && <span className="muted">⚠ {p.flag}</span>}
      </div>
    </div>
  );
}

function NotesBlock({
  title,
  value,
  parsed,
  busy,
  onChange,
  onParse,
  onClear,
}: {
  title: string;
  value: string;
  parsed: ParsedCallNotes | null;
  busy: boolean;
  onChange: (s: string) => void;
  onParse: () => void;
  onClear: () => void;
}) {
  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">{title}</div>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost"
            onClick={onClear}
            disabled={busy || (!value && !parsed)}
          >
            Clear
          </button>
          <button
            className="btn btn-primary"
            onClick={onParse}
            disabled={busy || !value.trim()}
          >
            {busy ? "Parsing…" : "✦ Parse with AI"}
          </button>
        </div>
      </div>
      <textarea
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the Fireflies summary for the sales call here — summary, keywords, action items, etc."
      />
      {parsed && <ParsedCard p={parsed} />}
    </div>
  );
}

export default function StepCallNotes() {
  const { state, set } = useWizard();
  const [busySales, setBusySales] = useState(false);
  const [busyOnb, setBusyOnb] = useState(false);

  async function parse(
    text: string,
    setBusy: (b: boolean) => void
  ): Promise<ParsedCallNotes | null> {
    setBusy(true);
    try {
      const r = await fetch("/api/parse-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) return null;
      const json = (await r.json()) as { parsed?: ParsedCallNotes };
      return json.parsed ?? null;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Call Notes (optional)</h2>
        <p className="muted text-xs">
          Paste the sales / onboarding call summary if you have one. AI will
          extract the structured pieces — both blocks are optional.
        </p>
      </div>

      <NotesBlock
        title="Sales call"
        value={state.salesCallNotes}
        parsed={state.salesCallParsed}
        busy={busySales}
        onChange={(s) => set("salesCallNotes", s)}
        onParse={async () => {
          const p = await parse(state.salesCallNotes, setBusySales);
          set("salesCallParsed", p);
        }}
        onClear={() => {
          set("salesCallNotes", "");
          set("salesCallParsed", null);
        }}
      />

      <NotesBlock
        title="Onboarding call"
        value={state.onboardingCallNotes}
        parsed={state.onboardingCallParsed}
        busy={busyOnb}
        onChange={(s) => set("onboardingCallNotes", s)}
        onParse={async () => {
          const p = await parse(state.onboardingCallNotes, setBusyOnb);
          set("onboardingCallParsed", p);
        }}
        onClear={() => {
          set("onboardingCallNotes", "");
          set("onboardingCallParsed", null);
        }}
      />

      <div className="banner">
        Both calls are optional — skip if you don&apos;t have summaries yet.
      </div>
    </div>
  );
}
