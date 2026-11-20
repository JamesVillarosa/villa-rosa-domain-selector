/**
 * `POST /api/campaigns/[id]/export` — stream the campaign workbook.
 *
 * Loads the campaign + its scoring config, hands them to the exporter,
 * and returns the resulting `.xlsx` as a binary response with a
 * Content-Disposition header carrying the suggested filename.
 */

import { getCampaign, getActiveConfig } from "@/lib/db";
import { generateExport } from "@/lib/exporter";
import type { ClientBrief, Profile, ScoredDomain } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  try {
    const campaign = await getCampaign(id);
    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const brief = campaign.brief as ClientBrief | null;
    if (!brief) {
      return new Response(JSON.stringify({ error: "Campaign has no brief" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const shortlist = (campaign.shortlist as ScoredDomain[]) || [];
    const selected = shortlist.filter(
      (s) => s && s.selected !== false && !s.disqualified
    );
    if (selected.length === 0) {
      return new Response(
        JSON.stringify({ error: "No domains selected to export" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const profile: Profile = (brief.profile as Profile) || "standard";
    const cfg = await getActiveConfig(profile);
    const buffer = await generateExport(
      { name: campaign.name || brief.clientName, brief, shortlist: selected },
      cfg.config
    );
    const safeName = (campaign.name || brief.clientName || "campaign")
      .replace(/[^a-z0-9-_]+/gi, "_")
      .slice(0, 60);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${safeName}_campaign_${date}.xlsx`;
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("[POST /api/campaigns/:id/export]", { id, error: e });
    return new Response(
      JSON.stringify({ error: "Export failed", details: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
