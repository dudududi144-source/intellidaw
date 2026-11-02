import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Insight {
  severity: "fix" | "improve" | "ok";
  area: string;
  title: string;
  detail: string;
  fix?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { summary, quickStats } = body as {
      summary: Record<string, unknown>;
      quickStats: Array<{ area: string; title: string; severity: string }>;
    };

    const zai = await ZAI.create();

    const system = [
      "You are the Intellidaw Studio Assistant, an expert music producer inside a browser DAW.",
      "You receive a JSON summary of the user's project (tracks, patterns, mix state) plus rule-based quick-scan findings.",
      "Respond with STRICT JSON only, no markdown fences, matching this TypeScript type:",
      '{"insights":[{"severity":"fix"|"improve"|"ok","area":string,"title":string,"detail":string,"fix":string?}]}',
      'Allowed fix values: "snap-key", "humanize", "balance", "duck", or omit for advice-only.',
      "Rules:",
      "- 3 to 5 insights, ordered most important first.",
      "- Be concrete and reference actual track names, notes, BPM or values from the summary.",
      "- detail is 1-2 short sentences in plain words for a beginner producer.",
      "- Never invent tracks that do not exist. If the song is basically fine, say what would elevate it.",
    ].join("\n");

    const user = `PROJECT SUMMARY:\n${JSON.stringify(summary)}\n\nRULE-BASED QUICK SCAN:\n${JSON.stringify(
      quickStats
    )}\n\nReturn the JSON insights now.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: system },
        { role: "user", content: user },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: { insights?: Insight[] } | null = null;
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim());
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          parsed = null;
        }
      }
    }

    if (parsed?.insights?.length) {
      const clean = parsed.insights
        .filter((i) => i && typeof i.title === "string" && typeof i.detail === "string")
        .slice(0, 6)
        .map((i) => ({
          severity: (["fix", "improve", "ok"].includes(i.severity) ? i.severity : "improve") as Insight["severity"],
          area: String(i.area ?? "Studio"),
          title: String(i.title).slice(0, 120),
          detail: String(i.detail).slice(0, 400),
          fix: ["snap-key", "humanize", "balance", "duck"].includes(String(i.fix))
            ? String(i.fix)
            : undefined,
        }));
      if (clean.length) {
        return NextResponse.json({ ok: true, insights: clean, source: "ai" });
      }
    }
    return NextResponse.json({ ok: false, source: "fallback" });
  } catch (e) {
    console.error("assistant error", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 200 }
    );
  }
}
