"use client";

import { memo, useMemo } from "react";
import type { Project, Section, Track } from "@/lib/daw/types";
import { SONG_BARS, sectionAtBar, trackIcon } from "@/lib/daw/types";
import { getEngine } from "@/lib/daw/engine";
import { cn } from "@/lib/utils";
import { PanelTitle } from "./ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/* One bar cell for a drum lane — 16 mini columns lit by the pattern */
function DrumBar({ track, dim }: { track: Project["tracks"][number] & { kind: "drum" }; dim: boolean }) {
  return (
    <div className={cn("flex h-full w-full items-stretch gap-[2px] px-1.5 py-1.5", dim && "opacity-25")}>
      {track.steps.map((s, i) => (
        <div
          key={i}
          className="flex-1 rounded-[2px]"
          style={{
            background: s.on ? track.color : "rgba(255,255,255,0.06)",
            opacity: s.on ? 0.35 + s.vel * 0.65 : 1,
          }}
        />
      ))}
    </div>
  );
}

/* One bar cell for a synth lane — note blocks */
function SynthBar({ track, dim }: { track: Project["tracks"][number] & { kind: "synth" }; dim: boolean }) {
  const pitches = track.notes.map((n) => n.pitch);
  const lo = pitches.length ? Math.min(...pitches) : 48;
  const hi = pitches.length ? Math.max(...pitches) : 72;
  const span = Math.max(12, hi - lo);
  return (
    <div className={cn("relative h-full w-full", dim && "opacity-25")}>
      {track.notes.map((n) => (
        <div
          key={n.id}
          className="absolute rounded-[2px]"
          style={{
            left: `${(n.step / 16) * 100}%`,
            width: `${(Math.min(16, n.len) / 16) * 100}%`,
            top: `${8 + (1 - (n.pitch - lo) / span) * 84}%`,
            height: "10%",
            background: track.color,
            opacity: 0.4 + n.vel * 0.6,
          }}
        />
      ))}
    </div>
  );
}

function ArrangeTabInner({
  project,
  updateProject,
  currentStep,
  playing,
  onSelectTrack,
  onOpenEditor,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  currentStep: number; // absolute step across the song, -1 when stopped
  playing: boolean;
  onSelectTrack: (id: string) => void;
  onOpenEditor: (t: Track) => void;
}) {
  const sections = useMemo(
    () => (project.sections?.length ? project.sections : []),
    [project.sections]
  );
  const curBar = currentStep >= 0 ? Math.floor(currentStep / 16) : -1;
  const curInBar = currentStep >= 0 ? currentStep % 16 : -1;

  const toggleMute = (sectionId: string, trackId: string) => {
    updateProject((p) => ({
      ...p,
      sections: p.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              mutes: s.mutes.includes(trackId)
                ? s.mutes.filter((m) => m !== trackId)
                : [...s.mutes, trackId],
            }
          : s
      ),
    }));
  };

  const jumpBar = (bar: number) => {
    const e = getEngine();
    if (e.playing) e.jumpTo(bar * 16);
  };

  return (
    <div className="space-y-4">
      <PanelTitle kicker="Arrangement · 4 bars">Build the song, one section at a time</PanelTitle>

      {/* section chips + per-section track mutes */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {sections.map((s, i) => {
          const active = playing && curBar === i;
          const silentCount = s.mutes.length;
          return (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border p-2.5 transition-colors",
                active ? "border-[#f2a43a]/60 bg-[#1c150c]" : "border-white/8 bg-[#14100d]"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <input
                  value={s.name}
                  onChange={(e) =>
                    updateProject((p) => ({
                      ...p,
                      sections: p.sections.map((x) =>
                        x.id === s.id ? { ...x, name: e.target.value.slice(0, 14) } : x
                      ),
                    }))
                  }
                  className="w-full min-w-0 bg-transparent text-[13px] font-semibold text-[#f0ece4] outline-none"
                  aria-label={`Section ${i + 1} name`}
                />
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider",
                    active ? "bg-[#8fbf6b] text-[#10130a]" : "bg-white/8 text-[#a89f91]"
                  )}
                >
                  {active ? "playing" : `bar ${i + 1}`}
                </span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="mt-1.5 flex w-full items-center justify-between rounded-lg bg-black/30 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#a89f91] hover:bg-black/50"
                    title="Choose which tracks play in this section"
                  >
                    {silentCount === 0 ? "all tracks in" : `${project.tracks.length - silentCount}/${project.tracks.length} in`}
                    <span aria-hidden>▾</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 border-white/10 bg-[#171310] p-2 text-[#f0ece4]" align="start">
                  <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
                    Tracks in “{s.name}”
                  </div>
                  <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {project.tracks.map((t) => {
                      const on = !s.mutes.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggleMute(s.id, t.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
                            on ? "bg-white/5 text-[#f0ece4]" : "text-[#a89f91]/60"
                          )}
                        >
                          <span
                            aria-hidden
                            className="flex h-4 w-4 items-center justify-center rounded text-[9px]"
                            style={{ background: on ? `${t.color}33` : "rgba(255,255,255,0.05)" }}
                          >
                            {trackIcon(t)}
                          </span>
                          <span className="flex-1 truncate">{t.name}</span>
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              on ? "bg-[#8fbf6b]" : "bg-white/15"
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          );
        })}
      </div>

      {/* ruler */}
      <div className="flex gap-2">
        <div className="w-[110px] shrink-0 font-mono text-[9px] uppercase tracking-widest text-[#a89f91] sm:w-[150px]">
          Arrangement
        </div>
        <div className="flex flex-1 gap-1">
          {Array.from({ length: SONG_BARS }, (_, b) => (
            <button
              key={b}
              onClick={() => jumpBar(b)}
              className={cn(
                "flex-1 rounded-md py-1 font-mono text-[9px] uppercase tracking-widest",
                curBar === b && playing
                  ? "bg-[#f2a43a]/15 text-[#f2a43a]"
                  : "bg-white/[0.03] text-[#a89f91] hover:bg-white/[0.07]"
              )}
              title={`Play from bar ${b + 1}`}
            >
              {b + 1}
            </button>
          ))}
        </div>
      </div>

      {/* lanes */}
      <div className="space-y-1.5">
        {project.tracks.map((t) => {
          return (
            <div key={t.id} className="flex items-stretch gap-2">
              <button
                onClick={() => onSelectTrack(t.id)}
                onDoubleClick={() => onOpenEditor(t)}
                className={cn(
                  "flex w-[110px] shrink-0 items-center gap-2 rounded-lg border border-white/5 bg-[#14100d] px-2 text-left sm:w-[150px]",
                  "hover:border-white/15"
                )}
                title={`${t.name} — double-click to edit`}
              >
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px]"
                  style={{ background: `${t.color}22`, color: t.color }}
                >
                  {trackIcon(t)}
                </span>
                <span className="truncate text-[12px] font-medium text-[#f0ece4]">{t.name}</span>
              </button>
              <div className="grid flex-1 grid-cols-4 gap-1">
                {Array.from({ length: SONG_BARS }, (_, b) => {
                  const sec = sectionAtBar(project.sections, b);
                  const dimmed = !!sec?.mutes.includes(t.id);
                  const playingHere = playing && curBar === b;
                  return (
                    <button
                      key={b}
                      onClick={() => {
                        onSelectTrack(t.id);
                        jumpBar(b);
                      }}
                      className={cn(
                        "relative h-11 overflow-hidden rounded-lg border bg-[#14100d] text-left sm:h-14",
                        playingHere ? "border-[#f2a43a]/50" : "border-white/5 hover:border-white/12"
                      )}
                      aria-label={`${t.name} bar ${b + 1}${dimmed ? " (silent)" : ""}`}
                    >
                      {t.kind === "drum" ? (
                        <DrumBar track={t} dim={dimmed} />
                      ) : (
                        <SynthBar track={t} dim={dimmed} />
                      )}
                      {/* playhead inside the bar */}
                      {playingHere && curInBar >= 0 && (
                        <div
                          className="pointer-events-none absolute inset-y-0 w-[2px] bg-[#f2a43a]"
                          style={{ left: `${(curInBar / 16) * 100}%` }}
                        />
                      )}
                      {dimmed && (
                        <span className="absolute right-1 top-1 rounded bg-black/60 px-1 font-mono text-[7px] uppercase tracking-wider text-[#a89f91]">
                          off
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center font-mono text-[10px] tracking-wide text-[#a89f91]/70">
        CLICK A BAR TO PLAY FROM THERE · DOUBLE-CLICK A LANE NAME TO EDIT · “▾” SHAPES EACH SECTION
      </div>
    </div>
  );
}

export const ArrangeTab = memo(ArrangeTabInner);
