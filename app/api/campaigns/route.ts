/**
 * `/api/campaigns` — list and create campaigns.
 *
 *   GET  → all campaigns, newest first, as light summaries for the sidebar.
 *   POST → create a fully-formed campaign (brief + shortlist + excluded).
 *
 * The wizard only POSTs after a successful scoring pass, so campaigns are
 * never persisted in a half-built "draft with no domains" state.
 */

import { NextResponse } from "next/server";
import { listCampaigns, saveCampaign } from "@/lib/db";
import type { ClientBrief, ScoredDomain } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await listCampaigns();
    return NextResponse.json({ campaigns: list });
  } catch (e) {
    console.error("[GET /api/campaigns]", e);
    return NextResponse.json(
      { error: "Failed to list campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      brief?: ClientBrief;
      name?: string;
      shortlist?: ScoredDomain[];
      excluded?: ScoredDomain[];
      status?: "draft" | "finalised";
    };
    if (!body?.brief) {
      return NextResponse.json({ error: "brief is required" }, { status: 400 });
    }
    const name = body.name || body.brief.clientName || "Untitled campaign";
    const c = await saveCampaign({
      name,
      brief: body.brief,
      shortlist: body.shortlist,
      excluded: body.excluded,
      status: body.status ?? "draft",
    });
    return NextResponse.json({ id: c.id, campaign: c });
  } catch (e) {
    console.error("[POST /api/campaigns]", e);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}
