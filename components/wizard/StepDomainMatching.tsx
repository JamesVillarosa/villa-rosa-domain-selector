/**
 * Step 6 — Domain Matching.
 *
 * Accepts a vendor inventory CSV (drop or click-to-upload), validates it
 * client-side (required columns, at least one data row), and on "Generate
 * Brief" runs the stateless score endpoint. Only after scoring succeeds is
 * the campaign persisted, so failed runs never produce orphan rows in the
 * sidebar.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { useWizard } from "./WizardContext";
import { buildBriefFromState } from "./buildBrief";
import { validateStep } from "@/lib/wizardState";
import type { ScoredDomain } from "@/lib/types";

const EXPECTED_COLS = [
  "Domain",
  "DR",
  "Traffic",
  "Niche / Main",
  "GP Price / LI Price",
  "Link Type",
  "Ranking",
  "Contact",
  "Red Flags",
];

const REQUIRED_COLS = ["domain", "dr", "traffic"];

interface CsvCheck {
  ok: boolean;
  rowEstimate: number;
  warnings: string[];
  fatal?: string;
}

/**
 * Validate a CSV client-side so the upload can be rejected immediately
 * instead of after a server round-trip. Mirrors the requirements of the
 * server-side `parseInventoryCsv`: a header row containing Domain plus DR
 * or Traffic, all three required columns present, and at least one data
 * row beneath the header.
 */
function checkCsv(text: string): CsvCheck {
  const warnings: string[] = [];
  try {
    const r = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const rows = r.data;
    if (rows.length === 0) {
      return { ok: false, rowEstimate: 0, warnings, fatal: "CSV is empty" };
    }
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const lower = rows[i].map((c) => String(c).trim().toLowerCase());
      if (
        lower.includes("domain") &&
        (lower.includes("dr") || lower.includes("traffic"))
      ) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      return {
        ok: false,
        rowEstimate: 0,
        warnings,
        fatal:
          "Could not detect a header row containing Domain, DR, Traffic columns.",
      };
    }
    const header = rows[headerIdx].map((c) => String(c).trim().toLowerCase());
    const missing = REQUIRED_COLS.filter((c) => !header.includes(c));
    if (missing.length > 0) {
      return {
        ok: false,
        rowEstimate: 0,
        warnings,
        fatal: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      };
    }
    const rowEstimate = Math.max(0, rows.length - headerIdx - 1);
    if (rowEstimate === 0) {
      return {
        ok: false,
        rowEstimate: 0,
        warnings,
        fatal: "CSV has no data rows below the header.",
      };
    }
    return { ok: true, rowEstimate, warnings };
  } catch (err) {
    return {
      ok: false,
      rowEstimate: 0,
      warnings,
      fatal: `Failed to parse CSV: ${(err as Error).message}`,
    };
  }
}

export default function StepDomainMatching() {
  const { state, set, patch, next, errors, clearError } = useWizard();
  const [dragging, setDragging] = useState(false);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseRowCount, setParseRowCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  const csvUsable = !!state.csvText && !parseError;

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      setParseError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        const check = checkCsv(text);
        if (!check.ok) {
          // Keep filename/text visible to the user, but block scoring
          // until they replace the file.
          patch({
            csvText: text,
            csvFilename: file.name,
            csvRowCount: 0,
          });
          setParseError(check.fatal || "CSV is invalid");
          setParseWarnings([]);
          setParseRowCount(0);
        } else {
          patch({
            csvText: text,
            csvFilename: file.name,
            csvRowCount: check.rowEstimate,
          });
          clearError("csv");
          setParseError(null);
          setParseWarnings(check.warnings);
          setParseRowCount(check.rowEstimate);
        }
        if (inputRef.current) inputRef.current.value = "";
      };
      reader.onerror = () =>
        setError("Failed to read file. Try saving it as CSV and uploading again.");
      reader.readAsText(file);
    },
    [patch, clearError]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const startScoring = useCallback(async () => {
    setError(null);
    setProgress(0);

    const fieldErrors = validateStep("domains", state);
    if (Object.keys(fieldErrors).length > 0) {
      setError(Object.values(fieldErrors).join("; "));
      return;
    }
    if (!state.csvText || parseError) {
      setError(parseError || "Upload a valid CSV first");
      return;
    }

    const brief = buildBriefFromState(state);

    set("scoringStage", "scoring");
    const ticks = 30;
    let i = 0;
    intervalRef.current = window.setInterval(() => {
      i++;
      setProgress(Math.min(95, Math.round((i / ticks) * 100)));
    }, 120);

    try {
      // Stateless score: returns a shortlist without touching the DB.
      const scoreRes = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          csvData: state.csvText,
          enableLLM: state.enableLLM,
        }),
      });
      if (!scoreRes.ok) {
        const json = (await scoreRes.json().catch(() => ({}))) as {
          error?: string;
          details?: string[] | string;
        };
        const baseMsg = json.error || `Scoring failed (HTTP ${scoreRes.status})`;
        const detail = Array.isArray(json.details)
          ? `: ${json.details.join("; ")}`
          : json.details
            ? `: ${json.details}`
            : "";
        throw new Error(baseMsg + detail);
      }
      const scoreJson = (await scoreRes.json()) as {
        shortlist: ScoredDomain[];
        excluded: ScoredDomain[];
      };

      // Persist the campaign together with the shortlist now that scoring
      // has succeeded. Failed runs never reach this point.
      const name = state.companyName || brief.clientName;
      let id = state.campaignId;
      if (id) {
        const patchRes = await fetch(`/api/campaigns/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief,
            name,
            shortlist: scoreJson.shortlist,
            excluded: scoreJson.excluded,
          }),
        });
        if (patchRes.status === 404) {
          id = null;
        } else if (!patchRes.ok) {
          throw new Error(
            `Failed to update campaign (HTTP ${patchRes.status})`
          );
        }
      }
      if (!id) {
        const r = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief,
            name,
            shortlist: scoreJson.shortlist,
            excluded: scoreJson.excluded,
          }),
        });
        if (!r.ok) throw new Error("Failed to create campaign");
        const j = (await r.json()) as { id: string };
        id = j.id;
      }

      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setProgress(100);
      patch({
        campaignId: id,
        scoringStage: "complete",
        shortlistCache: scoreJson.shortlist,
        excludedCache: scoreJson.excluded,
      });
      next();
    } catch (e) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setError((e as Error).message || "Scoring failed");
      set("scoringStage", "error");
    }
  }, [state, set, patch, next, parseError]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Domain Matching</h2>
        <p className="muted text-xs">
          Drop your vendor inventory CSV here. We&apos;ll skip header rows
          automatically and score against the brief above.
        </p>
      </div>

      <div
        className={`dropzone ${parseError || errors.csv ? "field-error-box" : ""}`}
        data-active={dragging}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="text-sm">
          {state.csvFilename ? (
            <div className="space-y-1">
              <div className="font-medium flex items-center justify-between gap-2">
                <span>{state.csvFilename}</span>
                <button
                  type="button"
                  className="btn btn-ghost text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    patch({ csvText: "", csvFilename: "", csvRowCount: 0 });
                    setParseRowCount(0);
                    setParseWarnings([]);
                    setParseError(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  Remove
                </button>
              </div>
              <div className="muted text-xs">
                ~{parseRowCount || state.csvRowCount} rows detected — click to
                replace
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="font-medium">Drop your inventory CSV or click to upload</div>
              <div className="muted text-xs">
                Plaintext CSV with at minimum: Domain, DR, Traffic columns
              </div>
            </div>
          )}
        </div>
      </div>

      {errors.csv && <div className="error-msg">{errors.csv}</div>}
      {parseError && <div className="banner banner-danger">{parseError}</div>}

      <div className="muted text-xs">
        Expected columns: {EXPECTED_COLS.join(", ")}
      </div>

      {parseWarnings.length > 0 && (
        <div className="banner banner-warn">
          {parseWarnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      <div className="panel p-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-auto"
            style={{ width: 16, height: 16 }}
            checked={state.enableLLM}
            onChange={(e) => set("enableLLM", e.target.checked)}
          />
          <span className="font-medium">✦ AI Niche Enrichment</span>
        </label>
        <div className="muted text-[11px] mt-2 leading-relaxed">
          Adds a Claude pass over the deterministic shortlist to catch
          semantic matches keyword overlap misses (e.g. &ldquo;HR
          tech&rdquo; vs &ldquo;people ops&rdquo;). Deterministic overlap is
          still the floor — domains with zero overlap are never enriched. If
          the API call fails for any reason, the deterministic score is
          preserved. Adds ~20–30s to a 50-domain shortlist.
        </div>
      </div>

      {state.scoringStage === "scoring" && (
        <div className="space-y-2">
          <div className="progress">
            <div style={{ width: `${progress}%` }} />
          </div>
          <div className="muted text-xs">
            Scoring {parseRowCount || state.csvRowCount} domains…
          </div>
        </div>
      )}

      {error && <div className="banner banner-danger">{error}</div>}

      <div className="flex justify-end">
        <button
          className="btn btn-primary"
          disabled={
            !csvUsable ||
            state.scoringStage === "saving" ||
            state.scoringStage === "scoring"
          }
          onClick={startScoring}
        >
          Generate Brief →
        </button>
      </div>
    </div>
  );
}
