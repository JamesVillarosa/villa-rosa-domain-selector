/**
 * SQLite / libSQL persistence layer.
 *
 * Owns the single shared `@libsql/client` connection, ensures the schema
 * exists on first use, seeds the default scoring profiles, and exposes
 * typed async accessors for the campaigns, scoring configs, and
 * per-campaign progress state used by the API routes.
 *
 * Backend selection (via `DATABASE_URL`):
 *   - Unset, dev   → `file:./data/villarosa-dev.db` (persistent across
 *                    `npm run dev` restarts and host reboots; gitignored)
 *   - Unset, prod  → `file:/tmp/villarosa.db` (Vercel writable temp,
 *                    ephemeral per cold start — for real prod persistence
 *                    set `DATABASE_URL` to a `libsql://` Turso URL plus
 *                    `DATABASE_AUTH_TOKEN`)
 *   - `file:...`   → local SQLite file via libsql's local driver
 *   - `libsql://`  → remote Turso instance; requires `DATABASE_AUTH_TOKEN`
 *
 * The libsql client is async, so every function in this module returns a
 * Promise. Callers must `await` accordingly.
 */

import { createClient, type Client, type InValue } from "@libsql/client";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { Profile, ScoringConfig } from "./types";

function resolveDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV === "production") return "file:/tmp/villarosa.db";
  return `file:${path.join(process.cwd(), "data", "villarosa-dev.db")}`;
}

const DB_URL = resolveDbUrl();
const AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;

if (DB_URL.startsWith("file:")) {
  const filePath = DB_URL.replace(/^file:\/{0,2}/, "/");
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

interface GlobalCache {
  __villarosaDb?: Client;
  __villarosaInit?: Promise<Client>;
}
const cache = globalThis as unknown as GlobalCache;

/**
 * Return the process-wide libsql client, creating it on first call.
 * Schema + seeds run inside the init promise so concurrent first-callers
 * all wait on the same setup.
 */
export async function getDb(): Promise<Client> {
  if (cache.__villarosaDb) return cache.__villarosaDb;
  if (!cache.__villarosaInit) {
    cache.__villarosaInit = (async () => {
      console.log(
        `[db] opening connection url=${DB_URL} pid=${process.pid} cwd=${process.cwd()}`
      );
      const client = createClient({
        url: DB_URL,
        authToken: AUTH_TOKEN,
      });
      await initSchema(client);
      await seedConfigs(client);
      cache.__villarosaDb = client;
      return client;
    })();
  }
  return cache.__villarosaInit;
}

async function initSchema(client: Client): Promise<void> {
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS scoring_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL,
        profile TEXT NOT NULL,
        config TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX IF NOT EXISTS idx_config_profile_active
        ON scoring_config(profile, is_active)`,
      `CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT,
        brief TEXT,
        shortlist TEXT,
        excluded TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status)`,
      `CREATE TABLE IF NOT EXISTS campaign_state (
        campaign_id TEXT PRIMARY KEY,
        stage TEXT,
        progress TEXT,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      )`,
    ],
    "write"
  );
}

const NICHE_PROMPT_DEFAULT =
  "You are a link-building niche relevance judge. Given a client niche description and a domain niche description, return a JSON object { relevant: boolean, confidence: number (0-1), reason: string }. Be strict. Return relevant:false if there is no clear topical connection.";

const STANDARD_CONFIG: ScoringConfig = {
  caps: {
    nicheMatch: 40,
    dr: 15,
    traffic: 15,
    price: 10,
    ranking: 10,
    geo: 5,
    noRedFlags: 5,
  },
  disqualifiers: {
    minDR: 45,
    minTraffic: 2000,
    requireDofollow: true,
    blockRankings: ["poor", "bad"],
  },
  shortlistSize: 50,
  nichePrompt: NICHE_PROMPT_DEFAULT,
};

const PROFILE_SEEDS: Record<Profile, ScoringConfig> = {
  standard: STANDARD_CONFIG,
  ecommerce: {
    ...STANDARD_CONFIG,
    caps: { ...STANDARD_CONFIG.caps, nicheMatch: 50, dr: 10, traffic: 10 },
  },
  fintech: {
    ...STANDARD_CONFIG,
    caps: { ...STANDARD_CONFIG.caps, nicheMatch: 35, noRedFlags: 10 },
  },
  local: {
    ...STANDARD_CONFIG,
    caps: { ...STANDARD_CONFIG.caps, geo: 15, traffic: 5 },
  },
};

async function seedConfigs(client: Client): Promise<void> {
  const profiles: Profile[] = ["standard", "ecommerce", "fintech", "local"];
  for (const profile of profiles) {
    const r = await client.execute({
      sql: "SELECT COUNT(*) as n FROM scoring_config WHERE profile = ?",
      args: [profile],
    });
    const raw = r.rows[0]?.n;
    const n = typeof raw === "bigint" ? Number(raw) : (raw as number);
    if (!n || n === 0) {
      await client.execute({
        sql: `INSERT INTO scoring_config (version, profile, config, is_active)
              VALUES (?, ?, ?, 1)`,
        args: [1, profile, JSON.stringify(PROFILE_SEEDS[profile])],
      });
    }
  }
}

export interface ScoringConfigRow {
  id: number;
  version: number;
  profile: string;
  config: ScoringConfig;
  created_at: string;
  is_active: number;
}

function toNum(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return Number(v);
}

/** Return the currently active scoring config for a profile. Throws if no
 *  row is present — callers should treat that as an unrecoverable bug. */
export async function getActiveConfig(
  profile: Profile = "standard"
): Promise<ScoringConfigRow> {
  const client = await getDb();
  const r = await client.execute({
    sql: `SELECT id, version, profile, config, created_at, is_active
          FROM scoring_config
          WHERE profile = ? AND is_active = 1
          ORDER BY version DESC
          LIMIT 1`,
    args: [profile],
  });
  if (r.rows.length === 0) {
    throw new Error(`No active config for profile: ${profile}`);
  }
  const row = r.rows[0];
  return {
    id: toNum(row.id),
    version: toNum(row.version),
    profile: String(row.profile),
    config: JSON.parse(String(row.config)) as ScoringConfig,
    created_at: String(row.created_at),
    is_active: toNum(row.is_active),
  };
}

/** Persist a new version of the scoring config for a profile and mark it
 *  active, deactivating the previous version atomically. */
export async function saveConfig(
  profile: Profile,
  config: ScoringConfig
): Promise<{ id: number; version: number }> {
  const client = await getDb();
  const tx = await client.transaction("write");
  try {
    const last = await tx.execute({
      sql: `SELECT version FROM scoring_config WHERE profile = ?
            ORDER BY version DESC LIMIT 1`,
      args: [profile],
    });
    const prevVersion =
      last.rows[0]?.version != null ? toNum(last.rows[0].version) : 0;
    const nextVersion = prevVersion + 1;

    await tx.execute({
      sql: "UPDATE scoring_config SET is_active = 0 WHERE profile = ?",
      args: [profile],
    });
    const ins = await tx.execute({
      sql: `INSERT INTO scoring_config (version, profile, config, is_active)
            VALUES (?, ?, ?, 1)`,
      args: [nextVersion, profile, JSON.stringify(config)],
    });
    await tx.commit();
    return {
      id: Number(ins.lastInsertRowid),
      version: nextVersion,
    };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export interface Campaign {
  id: string;
  name: string | null;
  brief: unknown;
  shortlist: unknown[] | null;
  excluded: unknown[] | null;
  status: "draft" | "finalised";
  created_at: string;
  updated_at: string;
}

export interface CampaignSummary {
  id: string;
  name: string | null;
  status: "draft" | "finalised";
  created_at: string;
}

function parseJsonOrNull<T>(v: unknown): T | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v : String(v);
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** Fetch a full campaign by id, parsing the JSON-blob columns. Returns
 *  `null` if no row exists. */
export async function getCampaign(id: string): Promise<Campaign | null> {
  const client = await getDb();
  const r = await client.execute({
    sql: `SELECT id, name, brief, shortlist, excluded, status, created_at, updated_at
          FROM campaigns WHERE id = ?`,
    args: [id],
  });
  console.log(`[db] getCampaign id=${id} found=${r.rows.length > 0} url=${DB_URL}`);
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    id: String(row.id),
    name: row.name == null ? null : String(row.name),
    brief: parseJsonOrNull(row.brief),
    shortlist: parseJsonOrNull<unknown[]>(row.shortlist),
    excluded: parseJsonOrNull<unknown[]>(row.excluded),
    status: String(row.status) as "draft" | "finalised",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export interface SaveCampaignInput {
  id?: string;
  name?: string | null;
  brief?: unknown;
  shortlist?: unknown[] | null;
  excluded?: unknown[] | null;
  status?: "draft" | "finalised";
}

/** Upsert a campaign. When `id` is provided, only the supplied fields are
 *  overwritten; unspecified fields retain their existing values. */
export async function saveCampaign(input: SaveCampaignInput): Promise<Campaign> {
  const client = await getDb();
  const id = input.id ?? randomUUID();
  const existing = input.id ? await getCampaign(input.id) : null;

  const nameArg: InValue = input.name ?? null;
  const briefArg: InValue =
    input.brief !== undefined ? JSON.stringify(input.brief) : null;
  const shortlistArg: InValue =
    input.shortlist !== undefined ? JSON.stringify(input.shortlist) : null;
  const excludedArg: InValue =
    input.excluded !== undefined ? JSON.stringify(input.excluded) : null;
  const statusArg: InValue = input.status ?? null;

  if (existing) {
    await client.execute({
      sql: `UPDATE campaigns SET
              name = COALESCE(?, name),
              brief = COALESCE(?, brief),
              shortlist = COALESCE(?, shortlist),
              excluded = COALESCE(?, excluded),
              status = COALESCE(?, status),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [nameArg, briefArg, shortlistArg, excludedArg, statusArg, id],
    });
  } else {
    await client.execute({
      sql: `INSERT INTO campaigns (id, name, brief, shortlist, excluded, status)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        nameArg,
        briefArg,
        shortlistArg,
        excludedArg,
        input.status ?? "draft",
      ],
    });
  }

  const saved = await getCampaign(id);
  if (!saved) throw new Error("Failed to save campaign");
  return saved;
}

/** Remove a campaign permanently. The FK on `campaign_state` cascades. */
export async function deleteCampaign(id: string): Promise<boolean> {
  const client = await getDb();
  const r = await client.execute({
    sql: "DELETE FROM campaigns WHERE id = ?",
    args: [id],
  });
  return r.rowsAffected > 0;
}

/** Return all campaigns ordered by creation time (newest first). */
export async function listCampaigns(): Promise<CampaignSummary[]> {
  const client = await getDb();
  const r = await client.execute(
    `SELECT id, name, status, created_at
     FROM campaigns ORDER BY datetime(created_at) DESC`
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    name: row.name == null ? null : String(row.name),
    status: String(row.status) as "draft" | "finalised",
    created_at: String(row.created_at),
  }));
}

export interface CampaignState {
  campaign_id: string;
  stage: string | null;
  progress: unknown;
  updated_at: string;
}

export async function getCampaignState(
  campaignId: string
): Promise<CampaignState | null> {
  const client = await getDb();
  const r = await client.execute({
    sql: `SELECT campaign_id, stage, progress, updated_at
          FROM campaign_state WHERE campaign_id = ?`,
    args: [campaignId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    campaign_id: String(row.campaign_id),
    stage: row.stage == null ? null : String(row.stage),
    progress: parseJsonOrNull(row.progress),
    updated_at: String(row.updated_at),
  };
}

export async function saveCampaignState(
  campaignId: string,
  stage: string,
  progress: unknown
): Promise<void> {
  const client = await getDb();
  await client.execute({
    sql: `INSERT INTO campaign_state (campaign_id, stage, progress, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(campaign_id) DO UPDATE SET
            stage = excluded.stage,
            progress = excluded.progress,
            updated_at = CURRENT_TIMESTAMP`,
    args: [campaignId, stage, JSON.stringify(progress)],
  });
}
