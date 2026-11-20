# villa.rosa: domain selector

Internal tool that scores vendor publisher domains against a client brief and
exports a campaign-management XLSX that drops byte-for-byte into villa.rosa's
existing process.

- 7-step onboarding wizard (Client info → Campaign setup → Domain criteria →
  Expectations → optional Call notes → Domain matching → Campaign brief)
- Configurable scoring framework (7 dimensions, hard disqualifiers, per-industry
  override profiles)
- Hybrid niche match: deterministic keyword overlap (floor) + optional LLM
  enrichment (Claude, temperature 0, structured output, graceful fallback)
- XLSX export with exact column counts matched against villa.rosa's actual sample
  files (Client Info 22, Target Pages 3, Campaign Management 39, Referring
  Domains 14) — _not_ the spec PDF (which is one column off in several places)
- Versioned config store — every config save creates a new row, rollback is one
  SQL flip

---

## Local setup

```bash
git clone <repo>
cd villarosa-domain-selector
npm install
cp .env.example .env.local         # fill in ANTHROPIC_API_KEY (optional)
npm run dev                        # http://localhost:3000
```

Verify the install:

```bash
npm run test       # 15 scoring tests including the framework's 82/100 worked example
npm run smoke:db   # DB schema + helpers smoke
```

Storage runs through `@libsql/client`, which transparently speaks two
backends through one API:

- **Local dev** (default): `file:./data/villarosa-dev.db` — a SQLite file
  inside the repo, gitignored, persistent across `npm run dev` restarts
  and host reboots.
- **Production**: set `DATABASE_URL` to a `libsql://...turso.io` URL and
  `DATABASE_AUTH_TOKEN` to the matching auth token (see
  [Persistent storage](#persistent-storage)). Without these, the deploy
  falls back to `file:/tmp/villarosa.db` which is ephemeral per Vercel
  cold start.

Delete the local file to reseed the four default profiles on the next
request.

---

## Deployment (Vercel)

```bash
vercel --prod
```

Set in the Vercel dashboard:

| Var                    | Value             | Notes                                                                                              |
| ---------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`    | `sk-ant-...`      | Server-side only. Never exposed to the browser. Leave unset to disable LLM features.               |
| `DATABASE_URL`         | `libsql://...`    | Turso connection URL. Without it, prod falls back to `file:/tmp/villarosa.db` (ephemeral).          |
| `DATABASE_AUTH_TOKEN`  | `eyJhbGciOiJ...`  | Turso auth token. Required when `DATABASE_URL` is a `libsql://` URL.                               |

### Rollback

Vercel keeps every deploy. Roll back via the dashboard: pick the previous
working deploy, hit "Promote to Production". No code changes required.

### Persistent storage (Turso)

The app already uses `@libsql/client`, so there's no code change for prod
persistence — just point it at a Turso database:

1. Install the CLI and authenticate:
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth signup        # or `turso auth login` if you already have one
   ```
2. Create a database (free tier is plenty for this app):
   ```bash
   turso db create villarosa
   turso db show villarosa --url            # → libsql://villarosa-<org>.turso.io
   turso db tokens create villarosa         # → eyJhbGciOiJ...
   ```
3. In the Vercel dashboard, set:
   - `DATABASE_URL` → the `libsql://` URL from step 2
   - `DATABASE_AUTH_TOKEN` → the token from step 2
4. Redeploy. The schema and seeded profiles auto-initialise on the first
   request that hits a route.

To migrate an existing local DB to Turso (optional):

```bash
turso db shell villarosa < <(sqlite3 data/villarosa-dev.db .dump)
```

After that, the deployed instance keeps campaigns and config edits across
cold starts — the spec's "past campaigns saved and reopenable" requirement
is fully met in production.

---

## Updating the scoring config

The full reasoning layer is config, not code. There are two ways to update it.

### Option 1 — REST API (preferred)

```bash
curl -X PUT http://localhost:3000/api/config \
  -H 'Content-Type: application/json' \
  -d '{
    "profile": "ecommerce",
    "config": {
      "caps": { "nicheMatch": 55, "dr": 10, "traffic": 10, "price": 10, "ranking": 10, "geo": 5, "noRedFlags": 5 },
      "disqualifiers": { "minDR": 45, "minTraffic": 2000, "requireDofollow": true, "blockRankings": ["poor","bad"] },
      "shortlistSize": 50,
      "nichePrompt": "You are a link-building niche relevance judge. ..."
    }
  }'
```

The response is `{ "id": <new_id>, "version": <next_version> }`. The new
version is automatically activated and the previous version is deactivated in
a single transaction.

### Option 2 — Direct SQLite edit

```bash
sqlite3 data/villarosa.db
sqlite> SELECT id, profile, version, is_active FROM scoring_config;
sqlite> UPDATE scoring_config SET is_active = 0 WHERE profile = 'standard';
sqlite> INSERT INTO scoring_config (version, profile, config, is_active)
        VALUES (
          (SELECT COALESCE(MAX(version),0) + 1 FROM scoring_config WHERE profile = 'standard'),
          'standard',
          '<paste full JSON config here>',
          1
        );
```

### Rolling back a config change

Every save creates a new row with a higher `version`. To roll back, just flip
the `is_active` flag:

```sql
-- Find the version you want to roll back to:
SELECT id, profile, version, created_at FROM scoring_config WHERE profile = 'standard' ORDER BY version DESC;

-- Deactivate current, activate the previous:
UPDATE scoring_config SET is_active = 0 WHERE profile = 'standard';
UPDATE scoring_config SET is_active = 1 WHERE id = <previous_id>;
```

The app re-reads the active config on every scoring request — no redeploy
needed.

---

## The 11 editable values per profile

All eleven are stored under `caps` / `disqualifiers` / top-level in the config
JSON, all mutable per the steps above, none hardcoded in the application code:

1. `caps.nicheMatch` — niche match cap (default 40)
2. `caps.dr` — DR cap (default 15)
3. `caps.traffic` — traffic cap (default 15)
4. `caps.price` — price efficiency cap (default 10)
5. `caps.ranking` — ranking bonus cap (default 10)
6. `caps.geo` — geo match cap (default 5)
7. `caps.noRedFlags` — clean-flag cap (default 5)
8. `disqualifiers.minDR` — hard DR floor (default 45)
9. `disqualifiers.minTraffic` — hard traffic floor (default 2,000)
10. `disqualifiers.requireDofollow` — boolean dofollow filter
11. `disqualifiers.blockRankings` — string list, blocked rankings (default `["poor","bad"]`)

Plus `shortlistSize` (default 50) and `nichePrompt` (the system prompt sent to
the LLM during niche enrichment — also editable, never inline in code).

Score is always displayed in the UI as `X / Y` where `Y` is the sum of the
active profile's caps — not always 100 — so weight changes are honest.

---

## Model choices

- **Niche enrichment** uses `claude-haiku-4-5-20251001`. Right size for short
  structured-output classifications run 50× per shortlist. ~25s for a full
  50-domain shortlist; the deterministic score remains the floor.
- **Call-note parsing** uses `claude-sonnet-4-6`. Higher quality for the
  one-shot summarization (sentiment, expectations, action items).
- The original spec called for `claude-sonnet-4-20250514` for both, but that
  model reached end-of-life on 2026-06-15 and now returns 404. Both model ids
  are constants in `lib/enrich.ts` / `app/api/parse-notes/route.ts` — swappable
  in one commit.

## Architecture notes

- **Single Next.js app**, App Router (Next 16 / React 19). API routes under
  `app/api/*`. SQLite via better-sqlite3 with WAL journaling.
- **Scoring engine** is pure functions ([lib/scorer.ts](lib/scorer.ts)) — no
  DB, no fetch, no env reads. Config is passed in. This makes it trivially
  unit-testable and the [82/100 worked example test](lib/scorer.test.ts)
  catches regressions.
- **CSV parser** ([lib/csvParser.ts](lib/csvParser.ts)) tolerates the
  inventory's 4-row metadata preamble, multi-line cells in the niche columns,
  emoji prefixes (`⬆️ ↔️ ⬇️`), and duplicate rows.
- **LLM enrichment** ([lib/enrich.ts](lib/enrich.ts)) is opt-in per-campaign.
  Off → fully deterministic, fully repeatable. On → up to +5 niche bonus
  (capped at the profile's nicheMatch cap), reason stored alongside the
  deterministic score, falls back silently if the API call fails.
- **Campaigns are only persisted on success.** The wizard runs validation
  client-side, hits the stateless `/api/score` endpoint, and only writes a
  campaign row after scoring returns cleanly. Failed runs never leave
  half-built drafts in the sidebar. In-flight wizard state is intentionally
  in-memory only — saved campaigns are the durable artefact; the wizard
  starts fresh on every reload.
- **Repeatable output**: same brief + same CSV + same config + LLM off →
  identical shortlist. With LLM on, temperature is 0 and the prompt is loaded
  from config; results are stable in practice and the deterministic score is
  the floor.

See [WRITEUP.md](WRITEUP.md) for the one-page write-up.
