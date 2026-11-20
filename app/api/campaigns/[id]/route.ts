/**
 * `/api/campaigns/[id]` — read, update, and delete a single campaign.
 *
 *   GET    → full record (brief, shortlist, excluded).
 *   PATCH  → partial update; unspecified fields keep their existing values.
 *   DELETE → hard delete; cascades to per-campaign state via FK.
 */

import { NextResponse } from "next/server";
import { deleteCampaign, getCampaign, saveCampaign } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const c = await getCampaign(id);
    if (!c) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ campaign: c });
  } catch (e) {
    console.error("[GET /api/campaigns/:id]", e);
    return NextResponse.json(
      { error: "Failed to load campaign" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const ok = await deleteCampaign(id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/campaigns/:id]", e);
    return NextResponse.json(
      { error: "Failed to delete campaign" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const existing = await getCampaign(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = (await request.json()) as {
      name?: string;
      brief?: unknown;
      shortlist?: unknown[];
      excluded?: unknown[];
      status?: "draft" | "finalised";
    };
    const updated = await saveCampaign({ id, ...body });
    return NextResponse.json({ campaign: updated });
  } catch (e) {
    console.error("[PATCH /api/campaigns/:id]", e);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}
