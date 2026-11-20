/**
 * `/api/config` — read and update the scoring config.
 *
 *   GET                  → all four profiles' active configs.
 *   GET ?profile=standard → the active config row for that profile.
 *   PUT  { profile, config } → save a new version and mark it active.
 *
 * Profiles are immutable identifiers (`standard | ecommerce | fintech |
 * local`); config rows are versioned per profile so changes are auditable.
 */

import { NextResponse } from "next/server";
import { getActiveConfig, saveConfig } from "@/lib/db";
import type { Profile, ScoringConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: Profile[] = ["standard", "ecommerce", "fintech", "local"];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const profileParam = url.searchParams.get("profile");

    if (!profileParam) {
      const profiles = await Promise.all(
        ALLOWED.map(async (p) => {
          const row = await getActiveConfig(p);
          return {
            id: row.id,
            version: row.version,
            profile: row.profile,
            config: row.config,
            created_at: row.created_at,
          };
        })
      );
      return NextResponse.json({ profiles });
    }

    const profile = profileParam as Profile;
    if (!ALLOWED.includes(profile)) {
      return NextResponse.json(
        { error: `Unknown profile: ${profile}` },
        { status: 400 }
      );
    }
    const row = await getActiveConfig(profile);
    return NextResponse.json({
      id: row.id,
      version: row.version,
      profile: row.profile,
      config: row.config,
      created_at: row.created_at,
    });
  } catch (e) {
    console.error("[GET /api/config]", e);
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      profile?: Profile;
      config?: ScoringConfig;
    };
    if (!body.profile || !ALLOWED.includes(body.profile)) {
      return NextResponse.json(
        { error: "profile required (standard|ecommerce|fintech|local)" },
        { status: 400 }
      );
    }
    if (!body.config) {
      return NextResponse.json(
        { error: "config object required" },
        { status: 400 }
      );
    }
    const c = body.config;
    if (!c.caps || !c.disqualifiers || !c.nichePrompt) {
      return NextResponse.json(
        { error: "config must include caps, disqualifiers, nichePrompt" },
        { status: 400 }
      );
    }
    const res = await saveConfig(body.profile, c);
    return NextResponse.json({ id: res.id, version: res.version });
  } catch (e) {
    console.error("[PUT /api/config]", e);
    return NextResponse.json(
      { error: "Failed to save config" },
      { status: 500 }
    );
  }
}
