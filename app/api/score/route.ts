/**
 * `POST /api/score` — stateless scoring service.
 *
 * Accepts a brief plus raw CSV text, runs the parser, the scorer, and the
 * optional LLM enrichment, and returns the shortlist / excluded set.
 * Touches no database. Callers (e.g. the wizard) only persist a campaign
 * after this endpoint succeeds, so failed runs never leave orphaned
 * drafts in the sidebar.
 */

import { NextResponse } from "next/server";
import { getActiveConfig } from "@/lib/db";
import { parseInventoryCsv } from "@/lib/csvParser";
import { scoreDomains } from "@/lib/scorer";
import { enrichShortlistWithLLM } from "@/lib/enrich";
import type { ClientBrief, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      brief?: ClientBrief;
      csvData?: string;
      enableLLM?: boolean;
    };
    if (!body?.brief) {
      return NextResponse.json(
        { error: "brief is required" },
        { status: 400 }
      );
    }
    if (!body.csvData || typeof body.csvData !== "string") {
      return NextResponse.json(
        { error: "csvData is required" },
        { status: 400 }
      );
    }

    const parsed = parseInventoryCsv(body.csvData);
    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { error: "CSV parse failed", details: parsed.errors },
        { status: 400 }
      );
    }
    if (parsed.domains.length === 0) {
      return NextResponse.json(
        { error: "No domains found in CSV" },
        { status: 400 }
      );
    }

    const profile: Profile = (body.brief.profile as Profile) || "standard";
    const configRow = await getActiveConfig(profile);
    const result = scoreDomains(parsed.domains, body.brief, configRow.config);

    if (body.enableLLM === true || body.brief.enableLLMEnrichment === true) {
      try {
        await enrichShortlistWithLLM(
          result.shortlist,
          body.brief,
          configRow.config
        );
      } catch (err) {
        console.error("[score] LLM enrichment failed", err);
      }
    }

    return NextResponse.json({
      shortlist: result.shortlist,
      excluded: result.excluded,
      configVersion: configRow.version,
      totalEvaluated: result.totalEvaluated,
      warnings: parsed.warnings,
    });
  } catch (e) {
    console.error("[POST /api/score]", e);
    return NextResponse.json(
      { error: "Scoring failed", details: (e as Error).message },
      { status: 500 }
    );
  }
}
