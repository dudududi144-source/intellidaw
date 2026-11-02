"use client";

/* ------------------------------------------------------------------ */
/*  Timeline — the arrangement overview that ties the workspace        */
/*  together: sections ruler, one lane per track, playhead, seek.      */
/*  Clicking a lane selects the track (editor + device follow),        */
/*  clicking the ruler jumps playback to that bar.                     */
/* ------------------------------------------------------------------ */

import { memo, useRef } from "react";
import type { Project, Section, Track } from "@/lib/daw/types";
import { SONG_BARS, STEP_COUNT, trackIcon } from "@/lib/daw/types";
import { cn } from "@/lib/utils";

function laneBlocks(t: Track) {
  const one: Array<{ on: boolean; vel: number; step: number; len: number }> =
    t.kind === "drum"
      ? t.steps
          .map((s, i) => ({ on: s.on, vel: s.vel, step: i, len: 1 }))
          .filter((b) => b.on)
      : t.notes.map((n) => ({ on: true, vel: n.vel, step: n.step, len: n.len }));
  // the engine repeats the 16-step pattern across every bar — the timeline
  // must mirror exactly what you hear, or bars 2-4 look (wrongly) empty
  const all: typeof one = [];
  for (let bar = 0; bar < SONG_BARS; bar++) {
    for (const b of one) all.push({ ...b, step: b.step + bar * STEP_COUNT });
  }
  return all;
}

function sectionAt(sections: Section[] | undefined, bar: number): Section | null {
  if (!sections?.length) return null;
  return sections.find((s) => bar >= s.startBar && bar < s.endBar) ?? null;
}

function TimelineInner({
  project,
  currentStep,
  playing,
  selectedId,
  onSelect,
  onSeek,
  updateProject,
}: {
  project: Project;
  currentStep: number; // absolute 0..63, -1 stopped
  playing: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeek: (absStep: number) => void;
  updateProject: (fn: (p: Project) => Project) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  const seekFromEvent = (e: React.MouseEvent) => {
    const el = gridRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onSeek(Math.floor(frac * SONG_BARS * STEP_COUNT));
  };

  const barNow = currentStep >= 0 ? Math.floor(currentStep / STEP_COUNT) : -1;
  const totalSteps = SONG_BARS * STEP_COUNT;

  return (
    <div className="overflow-hidden rounded-xl border border-white/8 bg-[#14100d]">
      {/* header */}
      <div className="flex items-center justify-between border-b border-white/6 px-3 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#a89f91]">
          Timeline · {SONG_BARS} bars
        </span>
        <span className="font-mono text-[9px] text-[#a89f91]/60">
          click ruler to jump · click a lane to edit it
        </span>
      </div>

      {/* sections ruler */}
      <div className="flex border-b border-white/6">
        {Array.from({ length: SONG_BARS }, (_, bar) => {
          const sec = sectionAt(project.sections, bar);
          const active = playing && barNow === bar;
          return (
            <button
              key={bar}
              onClick={() => onSeek(bar * STEP_COUNT)}
              className={cn(
                "group relative flex-1 border-r border-black/40 px-2 py-1 text-left transition-colors last:border-r-0",
                active ? "brightness-125" : "hover:brightness-110"
              )}
              style={{ background: sec ? `${sec.color}26` : "rgba(255,255,255,0.03)" }}
              title="Jump to this bar"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: sec?.color ?? "#666" }}
                />
                <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-wider text-[#f0ece4]">
                  {sec?.name ?? `Bar ${bar + 1}`}
                </span>
                <span className="font-mono text-[9px] text-[#a89f91]">{bar + 1}</span>
              </span>
              {active && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#f2a43a]" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* lanes */}
      <div className="relative">
        {/* playhead (absolute over the grid only) */}
        {currentStep >= 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 h-full"
            style={{ left: `calc(64px + (100% - 64px) * ${currentStep / totalSteps})` }}
            aria-hidden
          >
            <div className="h-full w-[2px] bg-[#f2a43a] shadow-[0_0_6px_#f2a43a]" />
          </div>
        )}

        {project.tracks.map((t) => {
          const blocks = laneBlocks(t);
          const sel = selectedId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn(
                "flex w-full items-stretch border-b border-white/[0.04] text-left transition-colors last:border-b-0",
                sel ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
              )}
              title={`Edit ${t.name}`}
            >
              {/* lane label */}
              <span className="flex w-16 shrink-0 items-center gap-1.5 px-2 py-2">
                <span
                  aria-hidden
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px]"
                  style={{ background: `${t.color}22`, color: t.color }}
                >
                  {trackIcon(t)}
                </span>
                <span className="truncate text-[11px] font-medium text-[#f0ece4]">
                  {t.name}
                </span>
                {t.muted && (
                  <span className="font-mono text-[8px] font-bold text-[#e5533d]">M</span>
                )}
              </span>

              {/* lane grid */}
              <span className="relative min-w-0 flex-1 py-1.5 pr-2">
                <span className="relative block h-7">
                  {/* beat guides */}
                  {[1, 2, 3].map((b) => (
                    <span
                      key={b}
                      aria-hidden
                      className="absolute top-0 h-full w-px bg-white/[0.05]"
                      style={{ left: `${(b * STEP_COUNT * 100) / totalSteps}%` }}
                    />
                  ))}
                  {/* note / hit blocks */}
                  {blocks.map((b, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className="absolute top-1/2 h-4 -translate-y-1/2 rounded-[3px]"
                      style={{
                        left: `${(b.step * 100) / totalSteps}%`,
                        width: `max(4px, ${(Math.min(b.len, totalSteps - b.step) * 100) / totalSteps}% - 2px)`,
                        background: t.color,
                        opacity: t.muted ? 0.3 : 0.45 + b.vel * 0.55,
                        boxShadow: sel ? `0 0 6px ${t.color}55` : "none",
                      }}
                    />
                  ))}
                </span>
              </span>
            </button>
          );
        })}

        {/* seek strip */}
        <div
          ref={gridRef}
          onClick={seekFromEvent}
          className="relative flex h-4 cursor-pointer items-stretch border-t border-white/6 bg-black/20"
          role="slider"
          aria-label="Seek position"
          aria-valuemin={0}
          aria-valuemax={SONG_BARS * STEP_COUNT - 1}
          aria-valuenow={Math.max(0, currentStep)}
          title="Click to move the playhead"
        >
          {Array.from({ length: SONG_BARS * 4 }, (_, i) => (
            <span
              key={i}
              className={cn(
                "flex-1 border-r border-white/[0.04] last:border-r-0",
                i % 4 === 0 ? "bg-white/[0.05]" : ""
              )}
            />
          ))}
          {currentStep >= 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 h-4 w-[2px] bg-[#f2a43a]"
              style={{ left: `calc(64px + (100% - 64px) * ${currentStep / totalSteps})` }}
            />
          )}
        </div>
      </div>

      {/* section editor — opt-in mutes per section */}
      <div className="border-t border-white/6 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">
            Section mutes
          </span>
          {project.sections.map((sec) => (
            <SectionChip key={sec.id} sec={sec} project={project} updateProject={updateProject} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionChip({
  sec,
  project,
  updateProject,
}: {
  sec: Section;
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
}) {
  const toggleMute = (trackId: string) => {
    updateProject((p) => ({
      ...p,
      sections: p.sections.map((s) =>
        s.id === sec.id
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
  const hasMutes = sec.mutes.length > 0;
  return (
    <details className="group relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors"
        style={{
          borderColor: hasMutes ? sec.color : "rgba(255,255,255,0.08)",
          background: hasMutes ? `${sec.color}22` : "rgba(255,255,255,0.02)",
          color: hasMutes ? sec.color : "#a89f91",
        }}
        title={`${sec.mutes.length} track(s) silenced in ${sec.name}`}
      >
        {sec.name}
        {hasMutes && <span className="font-mono text-[8px]">{sec.mutes.length}</span>}
      </summary>
      <div className="studio-scroll absolute bottom-full left-0 z-30 mb-1 max-h-44 w-44 overflow-y-auto rounded-lg border border-white/10 bg-[#171310] p-1.5 shadow-xl">
        {project.tracks.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-[#f0ece4] hover:bg-white/5"
          >
            <input
              type="checkbox"
              checked={sec.mutes.includes(t.id)}
              onChange={() => toggleMute(t.id)}
              className="accent-[#f2a43a]"
            />
            <span aria-hidden style={{ color: t.color }}>
              {trackIcon(t)}
            </span>
            <span className="truncate">{t.name}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export const Timeline = memo(TimelineInner);
