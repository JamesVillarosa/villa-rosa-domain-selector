/**
 * Optional LLM-based niche relevance pass over a deterministic shortlist.
 *
 * For each shortlisted domain we ask Claude whether the domain's niche
 * description is genuinely topical to the client brief, then add a small
 * boost (capped) when the model is confident. The deterministic niche
 * score is always the floor — domains with zero keyword overlap are not
 * enriched, and any LLM failure is swallowed so the deterministic result
 * still ships.
 *
 * Activates only when `ANTHROPIC_API_KEY` is set and the campaign opts in.
 */

import type { ClientBrief, ScoredDomain, ScoringConfig } from "./types";

interface LLMResult {
  relevant: boolean;
  confidence: number;
  reason: string;
}

let cachedClient: { default?: unknown } | null = null;

async function getClient(): Promise<unknown | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (cachedClient !== null) return cachedClient.default;
  try {
    const mod = (await import("@anthropic-ai/sdk")) as {
      default: new (opts: { apiKey: string }) => unknown;
    };
    const Anthropic = mod.default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    cachedClient = { default: client };
    return client;
  } catch (e) {
    console.error("[enrich] failed to init Anthropic client", e);
    return null;
  }
}

// Haiku 4.5 is the right size for short structured-output classifications
// run ~50x per shortlist: faster than Sonnet, deterministic enough for a
// boolean + confidence judgement, and the deterministic score remains the
// floor regardless of what the model returns.
const MODEL = "claude-haiku-4-5-20251001";

interface AnthropicLike {
  messages: {
    create(req: {
      model: string;
      max_tokens: number;
      temperature: number;
      system: string;
      messages: { role: "user"; content: string }[];
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

async function callLLMOnce(
  client: AnthropicLike,
  brief: ClientBrief,
  domainNiche: string,
  systemPrompt: string
): Promise<LLMResult | null> {
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      temperature: 0,
      system:
        systemPrompt +
        "\n\nRespond with ONLY valid JSON matching: { \"relevant\": boolean, \"confidence\": number, \"reason\": string }. No prose, no markdown.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            clientNiches: brief.niches,
            clientKeywords: brief.targetPages.map((p) => p.keyword),
            domainNiche,
          }),
        },
      ],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    if (!textBlock?.text) return null;
    const cleaned = textBlock.text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as LLMResult;
    if (
      typeof parsed.relevant !== "boolean" ||
      typeof parsed.confidence !== "number" ||
      typeof parsed.reason !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch (e) {
    console.error("[enrich] LLM call failed", e);
    return null;
  }
}

export async function enrichShortlistWithLLM(
  shortlist: ScoredDomain[],
  brief: ClientBrief,
  config: ScoringConfig
): Promise<void> {
  const maybeClient = (await getClient()) as AnthropicLike | null;
  if (!maybeClient) return;
  const client: AnthropicLike = maybeClient;

  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < shortlist.length) {
      const i = cursor++;
      const sd = shortlist[i];
      if (sd.disqualified) continue;
      if ((sd.deterministicNicheScore ?? 0) <= 0) continue;
      const domainNiche = [
        sd.domain.main,
        sd.domain.niche,
        sd.domain.complementary,
        sd.domain.indirect,
      ]
        .filter(Boolean)
        .join(", ");
      const out = await callLLMOnce(
        client,
        brief,
        domainNiche,
        config.nichePrompt
      );
      if (!out) continue;
      sd.llmReason = out.reason;
      if (out.relevant && out.confidence >= 0.7) {
        const boost = Math.min(5, Math.round(out.confidence * 5));
        sd.llmNicheBoost = boost;
        const remainingHeadroom = Math.max(
          0,
          config.caps.nicheMatch - sd.breakdown.nicheMatch
        );
        const appliedBoost = Math.min(boost, remainingHeadroom);
        sd.breakdown.nicheMatch += appliedBoost;
        sd.score += appliedBoost;
      } else {
        sd.llmNicheBoost = 0;
      }
    }
  }

  const workers = Array.from({ length: concurrency }).map(() => worker());
  await Promise.all(workers);
  shortlist.sort((a, b) => b.score - a.score);
}
