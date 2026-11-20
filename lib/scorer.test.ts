import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreOne, scoreDomains } from "./scorer";
import type { ClientBrief, Domain, ScoringConfig } from "./types";

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
  nichePrompt: "",
};

const WORKED_EXAMPLE_BRIEF: ClientBrief = {
  clientName: "Example",
  niches: ["saas", "hr software", "employee management"],
  targetPages: [
    { url: "https://example.com/skills", keyword: "skills management software" },
  ],
  budgetPerLink: 300,
  geo: "global",
  requireDofollow: true,
  minDR: 45,
  minTraffic: 2000,
  linkCountGoal: 8,
  profile: "standard",
};

const WORKED_EXAMPLE_DOMAIN: Domain = {
  domain: "example.com",
  dr: 65,
  traffic: 28000,
  main: "HR technology",
  niche: "employee development",
  complementary: "saas",
  indirect: "workforce management",
  ranking: "Good",
  countryTraffic: "global",
  linkType: "dofollow",
  gpPrice: "180",
  redFlags: "",
};

test("worked example from scoring framework PDF produces 82/100", () => {
  const result = scoreOne(
    WORKED_EXAMPLE_DOMAIN,
    WORKED_EXAMPLE_BRIEF,
    STANDARD_CONFIG
  );
  assert.equal(result.disqualified, false);
  assert.equal(result.breakdown.nicheMatch, 40, "nicheMatch should be 40");
  assert.equal(result.breakdown.dr, 8, "DR should be 8");
  assert.equal(result.breakdown.traffic, 10, "traffic should be 10");
  assert.equal(result.breakdown.price, 4, "price should be 4");
  assert.equal(result.breakdown.ranking, 10, "ranking should be 10");
  assert.equal(result.breakdown.geo, 5, "geo should be 5");
  assert.equal(result.breakdown.noRedFlags, 5, "noRedFlags should be 5");
  assert.equal(result.score, 82, "total should be 82");
  assert.equal(result.maxScore, 100);
});

test("DR below minimum disqualifies", () => {
  const d: Domain = { ...WORKED_EXAMPLE_DOMAIN, dr: 30 };
  const r = scoreOne(d, WORKED_EXAMPLE_BRIEF, STANDARD_CONFIG);
  assert.equal(r.disqualified, true);
  assert.match(r.disqualReason || "", /DR/);
});

test("traffic below minimum disqualifies", () => {
  const d: Domain = { ...WORKED_EXAMPLE_DOMAIN, traffic: 100 };
  const r = scoreOne(d, WORKED_EXAMPLE_BRIEF, STANDARD_CONFIG);
  assert.equal(r.disqualified, true);
  assert.match(r.disqualReason || "", /Traffic/);
});

test("nofollow disqualifies when dofollow required", () => {
  const d: Domain = { ...WORKED_EXAMPLE_DOMAIN, linkType: "nofollow" };
  const r = scoreOne(d, WORKED_EXAMPLE_BRIEF, STANDARD_CONFIG);
  assert.equal(r.disqualified, true);
  assert.match(r.disqualReason || "", /[Nn]ofollow/);
});

test("ranking 'Poor' disqualifies", () => {
  const d: Domain = { ...WORKED_EXAMPLE_DOMAIN, ranking: "Poor" };
  const r = scoreOne(d, WORKED_EXAMPLE_BRIEF, STANDARD_CONFIG);
  assert.equal(r.disqualified, true);
});

test("ranking 'Okay' scores half the ranking cap", () => {
  const d: Domain = { ...WORKED_EXAMPLE_DOMAIN, ranking: "Okay" };
  const r = scoreOne(d, WORKED_EXAMPLE_BRIEF, STANDARD_CONFIG);
  assert.equal(r.breakdown.ranking, 5);
});

test("empty domain niche fields → niche score 0", () => {
  const d: Domain = {
    ...WORKED_EXAMPLE_DOMAIN,
    main: "",
    niche: "",
    complementary: "",
    indirect: "",
  };
  const r = scoreOne(d, WORKED_EXAMPLE_BRIEF, STANDARD_CONFIG);
  assert.equal(r.breakdown.nicheMatch, 0);
});

test("price over budget → price score 0", () => {
  const d: Domain = { ...WORKED_EXAMPLE_DOMAIN, gpPrice: "500" };
  const r = scoreOne(d, WORKED_EXAMPLE_BRIEF, STANDARD_CONFIG);
  assert.equal(r.breakdown.price, 0);
});

test("redFlags filled → noRedFlags score 0", () => {
  const d: Domain = { ...WORKED_EXAMPLE_DOMAIN, redFlags: "Spam history" };
  const r = scoreOne(d, WORKED_EXAMPLE_BRIEF, STANDARD_CONFIG);
  assert.equal(r.breakdown.noRedFlags, 0);
});

test("'-' in redFlags treated as clean", () => {
  const d: Domain = { ...WORKED_EXAMPLE_DOMAIN, redFlags: "-" };
  const r = scoreOne(d, WORKED_EXAMPLE_BRIEF, STANDARD_CONFIG);
  assert.equal(r.breakdown.noRedFlags, 5);
});

test("geo specific country matches country traffic", () => {
  const brief: ClientBrief = { ...WORKED_EXAMPLE_BRIEF, geo: "us" };
  const d: Domain = {
    ...WORKED_EXAMPLE_DOMAIN,
    countryTraffic: "(us, 28000)",
  };
  const r = scoreOne(d, brief, STANDARD_CONFIG);
  assert.equal(r.breakdown.geo, 5);
});

test("geo specific country misses → 0", () => {
  const brief: ClientBrief = { ...WORKED_EXAMPLE_BRIEF, geo: "gb" };
  const d: Domain = {
    ...WORKED_EXAMPLE_DOMAIN,
    countryTraffic: "(us, 28000)",
  };
  const r = scoreOne(d, brief, STANDARD_CONFIG);
  assert.equal(r.breakdown.geo, 0);
});

test("ecommerce profile uses 50 niche cap", () => {
  const ecommerceConfig: ScoringConfig = {
    ...STANDARD_CONFIG,
    caps: { ...STANDARD_CONFIG.caps, nicheMatch: 50, dr: 10, traffic: 10 },
  };
  const r = scoreOne(
    WORKED_EXAMPLE_DOMAIN,
    WORKED_EXAMPLE_BRIEF,
    ecommerceConfig
  );
  assert.equal(r.maxScore, 50 + 10 + 10 + 10 + 10 + 5 + 5);
  assert.equal(r.breakdown.nicheMatch, 50);
});

test("scoreDomains sorts descending and respects shortlist size", () => {
  const domains: Domain[] = Array.from({ length: 20 }).map((_, i) => ({
    ...WORKED_EXAMPLE_DOMAIN,
    domain: `d${i}.com`,
    dr: 50 + i,
  }));
  const cfg: ScoringConfig = { ...STANDARD_CONFIG, shortlistSize: 5 };
  const res = scoreDomains(domains, WORKED_EXAMPLE_BRIEF, cfg);
  assert.equal(res.shortlist.length, 5);
  for (let i = 1; i < res.shortlist.length; i++) {
    assert.ok(res.shortlist[i - 1].score >= res.shortlist[i].score);
  }
});

test("disqualified domains appear in excluded, not shortlist", () => {
  const good: Domain = { ...WORKED_EXAMPLE_DOMAIN, domain: "good.com" };
  const bad: Domain = {
    ...WORKED_EXAMPLE_DOMAIN,
    domain: "bad.com",
    dr: 20,
  };
  const res = scoreDomains([good, bad], WORKED_EXAMPLE_BRIEF, STANDARD_CONFIG);
  assert.equal(res.shortlist.length, 1);
  assert.equal(res.shortlist[0].domain.domain, "good.com");
  assert.equal(res.excluded.length, 1);
  assert.equal(res.excluded[0].domain.domain, "bad.com");
});
