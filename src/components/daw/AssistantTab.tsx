"use client";

import { useMemo, useState } from "react";
import { computeStats, quickScan, type QuickStat } from "@/lib/daw/analysis";
import type { Project } from "@/lib/daw/types";
import { PanelTitle } from "./ui";
import { Button } from "@/components/ui/button";

interface AiInsight extends Omit<QuickStat, "id"> {
  id: string;
  source: "ai";
}

const SEV_STYLE: Record<string, { badge: string; text: string; label: string }> = {
  fix: { badge: "bg-[#e5533d] text-white", text: "text-[#ff9a8a]", label: "FIX" },
  improve: { badge: "bg-[#f2a43a] text-[#17120a]", text: "text-[#f2c98a]", label: "IMPROVE" },
  ok: { badge: "bg-[#8fbf6b] text-[#10130a]", text: "text-[#b5e294]", label: "GOOD" },
};

export function AssistantTab({
  project,
  onApplyFix,
}: {
  project: Project;
  onApplyFix: (fix: NonNullable<QuickStat["fix"]>) => void;
}) {
  const local = useMemo(() => quickScan(project), [project]);
  const stats = useMemo(() => computeStats(project), [project]);
  const [ai, setAi] = useState<AiInsight[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const deepScan = async () => {
    setLoading(true);
    setErr(null);
    try {
      const summary = {
        name: project.name,
        bpm: project.bpm,
        swing: project.swing,
        key: stats.key,
        tracks: project.tracks.map((t) =>
          t.kind === "drum"
            ? {
                name: t.name,
                kind: "drum",
                sound: t.sound,
                steps: t.steps
                  .map((s, i) => (s.on ? i : -1))
                  .filter((i) => i >= 0),
                volume: Math.round(t.volume * 100),
                muted: t.muted,
              }
            : {
                name: t.name,
                kind: "synth",
                waveform: t.waveform,
                noteCount: t.notes.length,
                notes: t.notes.slice(0, 24).map((n) => n.pitch),
                cutoff: Math.round(t.cutoff * 100),
                volume: Math.round(t.volume * 100),
                muted: t.muted,
              }
        ),
      };
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          quickStats: local.map(({ area, title, severity }) => ({ area, title, severity })),
        }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.insights)) {
        setAi(
          data.insights.map((i: Omit<AiInsight, "id" | "source">, idx: number) => ({
            ...i,
            id: `ai${idx}`,
            source: "ai" as const,
          }))
        );
      } else {
        setErr("The AI ear is warming up — showing the local scan instead.");
      }
    } catch {
      setErr("Could not reach the assistant. Local scan is shown below.");
    } finally {
      setLoading(false);
    }
  };

  const insights: Array<(QuickStat | AiInsight) & { source?: "ai" | "rule" }> = [
    ...(ai ?? []),
    ...local.map((q) => ({ ...q, source: "rule" as const })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelTitle kicker="Studio assistant · deep scan">
          A second pair of ears that reads your whole song
        </PanelTitle>
        <Button
          onClick={deepScan}
          disabled={loading}
          className="bg-[#f2a43a] font-semibold text-[#17120a] hover:bg-[#ffb75c]"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#17120a]/30 border-t-[#17120a]" />
              Deep scan…
            </span>
          ) : (
            <>
              DEEP SCAN
              <span className="ml-1 font-mono text-[10px] opacity-70">{stats.noteCount + stats.drumCount}</span>
            </>
          )}
        </Button>
      </div>

      {loading && (
        <div className="rounded-xl border border-[#f2a43a]/20 bg-[#f2a43a]/5 p-4">
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#f2c98a]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f2a43a]" />
            Listening to {project.name} — harmony, groove, low end, mix balance…
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#a89f91]">
          {err}
        </div>
      )}

      <div className="space-y-2.5">
        {insights.map((ins, idx) => {
          const style = SEV_STYLE[ins.severity] ?? SEV_STYLE.improve;
          return (
            <div
              key={ins.id + idx}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-[#14100d] p-3.5"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide ${style.badge}`}>
                {style.label}
              </span>
              <div className="min-w-[180px] flex-1">
                <div className="text-[13.5px] font-semibold text-[#f0ece4]">
                  {ins.title}
                  <span className="ml-2 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
                    {ins.area}
                    {ins.source === "ai" ? " · ai" : ""}
                  </span>
                </div>
                <div className="text-xs leading-relaxed text-[#a89f91]">{ins.detail}</div>
              </div>
              {ins.fix && (
                <button
                  onClick={() => onApplyFix(ins.fix as NonNullable<QuickStat["fix"]>)}
                  className="rounded-lg bg-[#f2a43a] px-3.5 py-1.5 font-mono text-[10px] font-bold tracking-wider text-[#17120a] transition-colors hover:bg-[#ffb75c]"
                >
                  APPLY FIX
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/5 bg-[#14100d] p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Key", stats.key],
            ["BPM", String(stats.bpm)],
            ["Notes", String(stats.noteCount)],
            ["Drum hits", String(stats.drumCount)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-black/30 p-3 text-center">
              <div className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">{k}</div>
              <div className="text-base font-semibold text-[#f0ece4]">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
