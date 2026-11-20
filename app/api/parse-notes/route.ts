/**
 * `POST /api/parse-notes` — turn a raw call summary into structured fields.
 *
 * When an Anthropic API key is configured we ask Claude to extract a JSON
 * payload (summary, expectations, key topics, action items, sentiment,
 * flag). On any failure we fall back to a deterministic heuristic parse so
 * the wizard always returns something usable.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ParsedNotes {
  summary: string;
  expectations: string[];
  keyTopics: string[];
  actionItems: string[];
  sentiment: "positive" | "neutral" | "cautious" | "concerned";
  flag?: string;
}

function heuristicParse(text: string): ParsedNotes {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const summary = lines.slice(0, 2).join(" ").slice(0, 280) || text.slice(0, 280);
  const expectations: string[] = [];
  const actionItems: string[] = [];
  const keyTopics: string[] = [];
  for (const l of lines) {
    if (/^[-*•]/.test(l) || /^action[: ]/i.test(l)) {
      actionItems.push(l.replace(/^[-*•]\s*/, ""));
    } else if (/expect|want|need|require/i.test(l)) {
      expectations.push(l);
    }
  }
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const freq = new Map<string, number>();
  for (const w of words) {
    if (
      [
        "with",
        "that",
        "this",
        "they",
        "have",
        "from",
        "their",
        "would",
        "about",
        "client",
      ].includes(w)
    )
      continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
  keyTopics.push(...top);
  const positive = /great|excited|love|happy|good|excellent|onboard/i.test(text);
  const concerned = /concern|worried|risk|issue|problem|sensitive|legal/i.test(
    text
  );
  let sentiment: ParsedNotes["sentiment"] = "neutral";
  if (concerned) sentiment = "concerned";
  else if (positive) sentiment = "positive";
  const flag = concerned
    ? "Concerns mentioned — review before submission"
    : undefined;
  return {
    summary,
    expectations,
    keyTopics,
    actionItems,
    sentiment,
    flag,
  };
}

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

async function llmParse(text: string): Promise<ParsedNotes | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const mod = (await import("@anthropic-ai/sdk")) as {
      default: new (opts: { apiKey: string }) => AnthropicLike;
    };
    const client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      temperature: 0,
      system:
        "You extract structured info from a sales / onboarding call note. Return only JSON: { summary: string (2-4 sentences), expectations: string[], keyTopics: string[] (short tags), actionItems: string[], sentiment: 'positive'|'neutral'|'cautious'|'concerned', flag?: string }. No prose, no markdown.",
      messages: [{ role: "user", content: text }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block?.text) return null;
    const cleaned = block.text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    return JSON.parse(cleaned) as ParsedNotes;
  } catch (e) {
    console.error("[parse-notes] LLM call failed, falling back", e);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    if (!body.text || typeof body.text !== "string") {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    const out = (await llmParse(body.text)) || heuristicParse(body.text);
    return NextResponse.json({ parsed: out });
  } catch (e) {
    console.error("[POST /api/parse-notes]", e);
    return NextResponse.json(
      { error: "Parse failed" },
      { status: 500 }
    );
  }
}
