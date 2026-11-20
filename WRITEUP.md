# villa.rosa: domain selector — Write-up

## Stack

Next.js 16 (App Router, React 19) + SQLite via `better-sqlite3` + ExcelJS +
Anthropic SDK, deployed on Vercel. One repo, one process, zero infra to
provision.

The driver was the "update without redeployment" requirement. Putting the
scoring config in a versioned SQLite table means a config change is one
`PUT /api/config` (or one `UPDATE`); rollback is a single `is_active` flip.
Bundling the API routes inside the same Next.js app keeps the contract
surface small and avoids a separate backend deploy. Vercel's deploy-history
rollback covers the application-code side of the same need — the two
together give us instant rollback at both layers.

Postgres / Supabase were rejected as overkill: more moving parts, network
latency on every config read, and the team explicitly said internal,
single-user. SQLite is the right size. The README documents a ~10-minute
Turso swap when persistent prod storage becomes necessary.

---

## How the user moves from blank to finished campaign

A seven-step wizard. Each step is a single screen; the tab bar shows
progress and only un-locks tabs the user has already visited (or all
tabs, once a shortlist exists). The flow:

1. **Client info** — company, website, contract value.
2. **Campaign setup** — target pages, link types, approval policy.
3. **Domain criteria** — hard floors (DR / traffic / follow / geo) and the
   scoring profile.
4. **Goals & expectations** — primary goal, KPIs, reporting cadence.
5. **Call notes** *(optional)* — paste sales / onboarding summaries; AI
   extracts structured fields.
6. **Domain matching** — drop the inventory CSV. Client-side validation
   rejects bad files before the round-trip. "Generate Brief →" stays
   disabled until the CSV passes column checks.
7. **Campaign brief** — three sub-tabs: the brief itself, the editable
   shortlist, and the target pages. One click exports the workbook.

Required fields paint a red border + inline error on Continue; the wizard
never advances on invalid input. The campaign row is **only** written to
SQLite after the stateless `/api/score` endpoint returns successfully, so
failed CSVs never leave orphan drafts in the sidebar.

---

## How reasoning is shown without overwhelming the table

The Shortlist table itself is intentionally narrow: domain, score, DR,
traffic, price, TAT, link type, geo, contact, flags. The seven-dimension
breakdown lives behind a tooltip on the **breakdown** chip on every row —
hover and you see niche / DR / traffic / price / ranking / geo /
no-red-flags as bare numbers. When LLM enrichment ran, the tooltip also
shows the boost amount and Claude's free-text reason (clipped to 200
chars).

The CM tab in the export captures the same reasoning in plain English in
the **Notes** column ("DR 84, traffic 145,000, strong niche overlap.
Ranking: good. $180 vs $562 budget."). That's the same string the team
already pastes into their tracker, so reasoning travels with the row
wherever it goes.

---

## How the user knows they can trust the picks

Four things, in order:

1. **The score is `X / Y`, not `X / 100`.** When an industry profile bumps
   a cap (ecommerce raises niche to 50), the total isn't 100 any more —
   showing `/ Y` makes the weighting visible instead of hidden.
2. **Excluded view, not silently filtered.** "View excluded (N)" is one
   click away and every excluded row carries its disqualification reason
   ("DR 41 below minimum 50", "Nofollow link type", "Ranking marked
   'poor'"). The user can always answer "why didn't this domain make it?"
3. **AI is opt-in and bounded.** Niche enrichment is off by default.
   When on, the deterministic keyword overlap is the floor: domains with
   zero overlap are never enriched, the LLM can only add a small bounded
   boost, and any API failure silently falls back to the deterministic
   score. The reason field is always shown alongside.
4. **Live totals on the shortlist.** Links selected / total budget /
   budget remaining / average DR update the moment a row is toggled, so
   the operator can shape the shortlist toward their actual constraints
   without leaving the table.

---

## First visit vs. tenth visit

**First visit.** The sidebar is empty with a single primary `+ New Campaign`
CTA. The wizard sits front-and-centre on Step 1; tabs ahead of the user
are visibly disabled. Empty-state copy on the sidebar explicitly says "No
campaigns yet — fill in the wizard to get started."

**Tenth visit.** The sidebar lists every past campaign newest-first with
name, status, and creation date. Click any row to load the brief +
shortlist instantly (the UI swaps immediately on click and back-fills the
data as soon as the fetch resolves). The brief tab is the landing surface
for loaded campaigns — re-export is one click. Hover any sidebar row and
a trash icon appears for inline-confirmed deletion. New campaign is still
one button click away at the top of the sidebar.

---

## What I cut

- **Real per-domain progress streaming.** The 1,582-row inventory scores
  in ~50 ms — the indeterminate progress bar is honest enough without
  the streaming machinery.
- **Multi-user auth.** The spec said single user, no auth.
- **Competitor backlink overlap.** Flagged "future" in the scoring
  framework; the inventory already carries `times_used` / `usage_saturation`
  for the eventual link-velocity rail.
- **Wizard form persistence to `localStorage`.** Explicit request from QA:
  restarts should start clean. Saved campaigns in SQLite are the durable
  artefact; the wizard itself resets.
- **In-app config admin UI.** PUT endpoint + direct SQLite path are
  documented in the README; the spec called the UI "welcome but not
  required".

## What I would change with more time

- **Swap SQLite for Turso** so production state survives cold starts (~10
  min of work, documented).
- **Config diff view.** Show previous vs. proposed weights side-by-side
  on save so the operator sees what they're changing.
- **Link velocity / overuse protection.** The `times_used` column is
  begging for a soft-cap rail when the same publisher would otherwise
  show up on every campaign.
- **Playwright E2E against the deployed URL.** Unit tests cover the
  scorer; manual QA covered the wizard; that's enough for a take-home,
  not enough for ongoing change.
