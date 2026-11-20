import {
  getDb,
  getActiveConfig,
  saveConfig,
  saveCampaign,
  getCampaign,
  listCampaigns,
  saveCampaignState,
  getCampaignState,
} from "../lib/db";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("OK  :", msg);
}

async function main() {
  await getDb();

  const standard = await getActiveConfig("standard");
  assert(standard.profile === "standard", "standard profile seeded");
  assert(standard.config.caps.nicheMatch === 40, "standard nicheMatch cap = 40");
  assert(standard.config.disqualifiers.minDR === 45, "standard minDR = 45");
  assert(standard.version === 1, "standard initial version = 1");

  const ecommerce = await getActiveConfig("ecommerce");
  assert(ecommerce.config.caps.nicheMatch === 50, "ecommerce nicheMatch = 50");
  assert(ecommerce.config.caps.dr === 10, "ecommerce dr = 10");

  const fintech = await getActiveConfig("fintech");
  assert(fintech.config.caps.nicheMatch === 35, "fintech nicheMatch = 35");
  assert(fintech.config.caps.noRedFlags === 10, "fintech noRedFlags = 10");

  const local = await getActiveConfig("local");
  assert(local.config.caps.geo === 15, "local geo = 15");
  assert(local.config.caps.traffic === 5, "local traffic = 5");

  const v2 = await saveConfig("standard", {
    ...standard.config,
    caps: { ...standard.config.caps, nicheMatch: 42 },
  });
  assert(v2.version === 2, "saveConfig increments version to 2");
  const reloaded = await getActiveConfig("standard");
  assert(reloaded.version === 2, "active version now 2");
  assert(reloaded.config.caps.nicheMatch === 42, "active nicheMatch now 42");

  const campaign = await saveCampaign({
    name: "Test Campaign",
    brief: { clientName: "Acme", niches: ["saas"] },
    status: "draft",
  });
  assert(
    typeof campaign.id === "string" && campaign.id.length > 0,
    "campaign created with id"
  );

  const fetched = await getCampaign(campaign.id);
  assert(fetched?.name === "Test Campaign", "campaign reload by id");
  assert(
    (fetched?.brief as { clientName: string } | null)?.clientName === "Acme",
    "brief JSON roundtrip"
  );

  const updated = await saveCampaign({
    id: campaign.id,
    shortlist: [{ d: "a.com", score: 50 }],
  });
  assert(
    (updated.shortlist?.[0] as { d: string } | undefined)?.d === "a.com",
    "campaign update preserved shortlist"
  );

  const list = await listCampaigns();
  assert(
    list.some((c) => c.id === campaign.id),
    "campaign appears in listCampaigns"
  );

  await saveCampaignState(campaign.id, "scoring", {
    processed: 100,
    total: 1582,
  });
  const state = await getCampaignState(campaign.id);
  assert(state?.stage === "scoring", "campaign state stage saved");
  assert(
    (state?.progress as { processed: number } | null)?.processed === 100,
    "campaign state progress saved"
  );

  console.log("\nAll smoke tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
