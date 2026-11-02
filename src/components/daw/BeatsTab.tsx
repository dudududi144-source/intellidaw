"use client";

import type { DrumSound, DrumStep, Project } from "@/lib/daw/types";
import { cn } from "@/lib/utils";

export function BeatsTab({
  project,
  updateProject,
  currentStep,
  onPreview,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  currentStep: number;
  onPreview: (sound: DrumSound, vel: number) => void;
}) {
  const drums = project.tracks.filter((t) => t.kind === "drum");

  const toggleStep = (trackId: string, stepIdx: number, shift: boolean) => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== trackId || t.kind !== "drum") return t;
        const steps = [...t.steps];
        const cur = steps[stepIdx];
        if (shift && cur.on) {
          const vels = [0.55, 0.75, 0.95];
          const idx = vels.findIndex((v) => Math.abs(v - cur.vel) < 0.09);
          steps[stepIdx] = { ...cur, vel: vels[(idx + 1) % 3] ?? 0.9 };
        } else {
          steps[stepIdx] = { ...cur, on: !cur.on };
          if (!cur.on) onPreview(t.sound, cur.vel);
        }
        return { ...t, steps };
      }),
    }));
  };

  const setTrack = (trackId: string, patch: Record<string, unknown>) => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === trackId ? ({ ...t, ...patch } as typeof t) : t)),
    }));
  };

  return (
    <div className="space-y-2">
      {drums.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 rounded-xl border border-white/5 bg-[#14100d] p-2 sm:gap-3 sm:p-2.5"
        >
          <div className="flex w-[104px] shrink-0 items-center gap-2 sm:w-[150px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: t.color, boxShadow: `0 0 8px ${t.color}66` }}
            />
            <span className="truncate text-[13px] font-medium text-[#f0ece4]">
              {t.name}
            </span>
            <button
              onClick={() => setTrack(t.id, { muted: !t.muted })}
              className={cn(
                "hidden h-5 w-5 shrink-0 rounded font-mono text-[9px] font-bold sm:block",
                t.muted ? "bg-[#e5533d] text-white" : "bg-white/5 text-[#a89f91] hover:bg-white/10"
              )}
              title="Mute"
            >
              M
            </button>
            <button
              onClick={() => setTrack(t.id, { solo: !t.solo })}
              className={cn(
                "hidden h-5 w-5 shrink-0 rounded font-mono text-[9px] font-bold sm:block",
                t.solo ? "bg-[#f2a43a] text-[#17120a]" : "bg-white/5 text-[#a89f91] hover:bg-white/10"
              )}
              title="Solo"
            >
              S
            </button>
          </div>
          <div className="studio-scroll overflow-x-auto pb-0.5">
            <div className="grid grid-cols-16 gap-[3px] sm:gap-1" style={{ minWidth: 340 }}>
              {t.steps.map((s: DrumStep, i: number) => (
                <button
                  key={i}
                  onClick={(e) => toggleStep(t.id, i, e.shiftKey)}
                  aria-label={`${t.name} step ${i + 1}${s.on ? " on" : " off"}`}
                  className={cn(
                    "h-8 w-full min-w-[17px] rounded-[5px] transition-all sm:h-9",
                    s.on ? "step-on" : "",
                    currentStep === i
                      ? "ring-1 ring-[#f2a43a]/70"
                      : "",
                    i % 4 === 0 && !s.on ? "bg-white/[0.07]" : "",
                    i % 4 !== 0 && !s.on ? "bg-white/[0.035]" : "",
                    s.on ? "" : "hover:bg-white/[0.09]",
                    !s.on && currentStep === i ? "ring-1 ring-[#f2a43a]/40" : ""
                  )}
                  style={
                    s.on
                      ? {
                          background: `linear-gradient(to top, ${t.color} ${Math.round(
                            s.vel * 100
                          )}%, ${t.color}44 ${Math.round(s.vel * 100)}%)`,
                          opacity: t.muted ? 0.35 : 1,
                        }
                      : { opacity: t.muted ? 0.4 : 1 }
                  }
                />
              ))}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={1.2}
            step={0.01}
            value={t.volume}
            onChange={(e) => setTrack(t.id, { volume: Number(e.target.value) })}
            className="h-1 w-16 shrink-0 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a] sm:w-20"
            title={`Volume ${Math.round(t.volume * 100)}%`}
          />
        </div>
      ))}
      <div className="pt-1 text-center font-mono text-[10px] tracking-wide text-[#a89f91]/70">
        CLICK A STEP TO TOGGLE · SHIFT+CLICK CYCLES VELOCITY
      </div>
    </div>
  );
}
