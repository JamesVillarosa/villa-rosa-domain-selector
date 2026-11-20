/**
 * `POST /api/campaigns/[id]/score` — score against an already-persisted
 * campaign. Reads the brief from the DB, parses the supplied CSV, runs the
 * scorer (and optionally the LLM pass), and writes the resulting shortlist
 * back to the campaign row.
 *
 * Used for re-scoring saved campaigns. New campaigns flow through the
 * stateless `/api/score` endpoint and are only persisted on success.
 */

import { NextResponse } from "next/server";
import {
  getCampaign,
  getActiveConfig,
  saveCampaign,
  saveCampaignState,
} from "@/lib/db";
import { parseInventoryCsv } from "@/lib/csvParser";
import { scoreDomains } from "@/lib/scorer";
import { enrichShortlistWithLLM } from "@/lib/enrich";
import type { ClientBrief, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  try {
    const campaign = await getCampaign(id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const body = (await request.json()) as {
      csvData?: string;
      enableLLM?: boolean;
    };
    if (!body.csvData || typeof body.csvData !== "string") {
      return NextResponse.json(
        { error: "csvData is required" },
        { status: 400 }
      );
    }
    const brief = campaign.brief as ClientBrief | null;
    if (!brief) {
      return NextResponse.json(
        { error: "Campaign has no brief" },
        { status: 400 }
      );
    }

    await saveCampaignState(id, "parsing", { stage: "parsing" });
    const parsed = parseInventoryCsv(body.csvData);
    if (parsed.errors.length > 0) {
      await saveCampaignState(id, "error", { errors: parsed.errors });
      return NextResponse.json(
        { error: "CSV parse failed", details: parsed.errors },
        { status: 400 }
      );
    }
    if (parsed.domains.length === 0) {
      await saveCampaignState(id, "error", {
        errors: ["No domains found in CSV"],
      });
      return NextResponse.json(
        { error: "No domains found in CSV" },
        { status: 400 }
      );
    }

    const profile: Profile = (brief.profile as Profile) || "standard";
    const configRow = await getActiveConfig(profile);

    await saveCampaignState(id, "scoring", {
      stage: "scoring",
      total: parsed.domains.length,
    });
    const result = scoreDomains(parsed.domains, brief, configRow.config);

    if (body.enableLLM === true || brief.enableLLMEnrichment === true) {
      await saveCampaignState(id, "enriching", {
        stage: "enriching",
        total: result.shortlist.length,
      });
      try {
        await enrichShortlistWithLLM(
          result.shortlist,
          brief,
          configRow.config
        );
      } catch (err) {
        console.error("[score] LLM enrichment failed", { id, err });
      }
    }

    await saveCampaign({
      id,
      shortlist: result.shortlist,
      excluded: result.excluded,
    });
    await saveCampaignState(id, "complete", {
      stage: "complete",
      shortlistCount: result.shortlist.length,
      excludedCount: result.excluded.length,
    });

    return NextResponse.json({
      shortlist: result.shortlist,
      excluded: result.excluded,
      configVersion: configRow.version,
      totalEvaluated: result.totalEvaluated,
      warnings: parsed.warnings,
    });
  } catch (e) {
    console.error("[POST /api/campaigns/:id/score]", { id, error: e });
    try {
      await saveCampaignState(id, "error", {
        errors: [(e as Error).message || "Unknown error"],
      });
    } catch {
      /* secondary error while saving state — ignore */
    }
    return NextResponse.json(
      { error: "Scoring failed", details: (e as Error).message },
      { status: 500 }
    );
  }
}
