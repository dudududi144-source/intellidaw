"use client";

/* ------------------------------------------------------------------ */
/*  EditorPanel — the note editor that follows the selected track.     */
/*  Drum track → 16-step velocity grid.  Synth track → piano roll.     */
/*  Always visible below the timeline: no tab switching needed.        */
/* ------------------------------------------------------------------ */

import { memo } from "react";
import type { DrumSound, DrumTrack, Project, SynthTrack } from "@/lib/daw/types";
import { isBlackKey, KIT_PRESETS, NOTE_HIGH, NOTE_LOW, pitchName, STEP_COUNT } from "@/lib/daw/types";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
  selectedId: string | null;
  updateProject: (fn: (p: Project) => Project) => void;
  currentStep: number; // step within the bar (0..15) or -1
  drawLen: number;
  onDrawLen: (n: number) => void;
  onPreviewDrum: (sound: DrumSound, vel: number) => void;
  onPreviewNote: (t: SynthTrack, pitch: number) => void;
}

export const EditorPanel = memo(function EditorPanel({
  project,
  selectedId,
  updateProject,
  currentStep,
  drawLen,
  onDrawLen,
  onPreviewDrum,
  onPreviewNote,
}: Props) {
  const track = project.tracks.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="overflow-hidden rounded-xl border border-white/8 bg-[#14100d]">
      <div className="flex items-center justify-between border-b border-white/6 px-3 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#a89f91]">
          Editor
        </span>
        {track ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: track.color }} />
            <span className="text-[11px] font-semibold text-[#f0ece4]">{track.name}</span>
          </span>
        ) : (
          <span className="text-[10px] text-[#a89f91]/60">—</span>
        )}
      </div>

      {!track ? (
        <div className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-wider text-[#a89f91]/70">
          select a track in the list or timeline to edit it
        </div>
      ) : track.kind === "drum" ? (
        <DrumEditor
          track={track}
          project={project}
          updateProject={updateProject}
          currentStep={currentStep}
          onPreview={onPreviewDrum}
        />
      ) : (
        <PianoRoll
          track={track}
          updateProject={updateProject}
          currentStep={currentStep}
          drawLen={drawLen}
          onDrawLen={onDrawLen}
          onPreviewNote={onPreviewNote}
        />
      )}
    </div>
  );
});

/* ---------------- drum grid (single track, full width) ---------------- */

function DrumEditor({
  track,
  project,
  updateProject,
  currentStep,
  onPreview,
}: {
  track: DrumTrack;
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  currentStep: number;
  onPreview: (sound: DrumSound, vel: number) => void;
}) {
  const toggleStep = (i: number, shift: boolean) => {
    const cur = track.steps[i];
    if (shift && cur.on) {
      updateProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => {
          if (t.id !== track.id || t.kind !== "drum") return t;
          const steps = [...t.steps];
          const vels = [0.55, 0.75, 0.95];
          const idx = vels.findIndex((v) => Math.abs(v - steps[i].vel) < 0.09);
          steps[i] = { ...steps[i], vel: vels[(idx + 1) % 3] ?? 0.9 };
          return { ...t, steps };
        }),
      }));
      return;
    }
    if (!cur.on) onPreview(track.sound, cur.vel);
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== track.id || t.kind !== "drum") return t;
        const steps = [...t.steps];
        steps[i] = { ...steps[i], on: !steps[i].on };
        return { ...t, steps };
      }),
    }));
  };

  const setAll = (vals: boolean[]) => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === track.id && t.kind === "drum"
          ? { ...t, steps: t.steps.map((s, i) => ({ ...s, on: vals[i] ?? s.on })) }
          : t
      ),
    }));
  };

  return (
    <div className="p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">Kit</span>
        {KIT_PRESETS.map((k) => (
          <button
            key={k.name}
            onClick={() =>
              updateProject((p) => ({
                ...p,
                tracks: p.tracks.map((t) => {
                  if (t.kind !== "drum") return t;
                  const tw = k.tweak[t.sound];
                  if (!tw) return t;
                  return { ...t, tune: tw.tune, volume: tw.volume ?? t.volume };
                }),
              }))
            }
            className="rounded-full border border-white/8 bg-[#0f0c0a] px-2 py-0.5 text-[10px] text-[#a89f91] hover:border-[#f2a43a]/50 hover:text-[#f0ece4]"
            title={`${k.name} (${k.tag}) — retunes and balances all drum tracks`}
          >
            {k.name}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setAll(Array(STEP_COUNT).fill(true))}
            className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#a89f91] hover:bg-white/10"
          >
            fill
          </button>
          <button
            onClick={() => setAll(Array(STEP_COUNT).fill(false))}
            className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#a89f91] hover:bg-white/10"
          >
            clear
          </button>
        </span>
      </div>

      <div className="grid grid-cols-16 gap-[3px] sm:gap-1" role="grid" aria-label={`${track.name} steps`}>
        {track.steps.map((s, i) => (
          <button
            key={i}
            onClick={(e) => toggleStep(i, e.shiftKey)}
            aria-label={`${track.name} step ${i + 1}${s.on ? " on" : " off"}`}
            aria-pressed={s.on}
            className={cn(
              "h-9 w-full min-w-[18px] rounded-[5px] transition-all sm:h-10",
              s.on ? "step-on" : "",
              i % 4 === 0 && !s.on ? "bg-white/[0.07]" : "",
              i % 4 !== 0 && !s.on ? "bg-white/[0.035]" : "",
              !s.on && "hover:bg-white/[0.09]",
              currentStep === i && "ring-1 ring-[#f2a43a]/70"
            )}
            style={
              s.on
                ? {
                    background: `linear-gradient(to top, ${track.color} ${Math.round(
                      s.vel * 100
                    )}%, ${track.color}44 ${Math.round(s.vel * 100)}%)`,
                    opacity: track.muted ? 0.35 : 1,
                  }
                : { opacity: track.muted ? 0.4 : 1 }
            }
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-[#a89f91]/60">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
      </div>
      <div className="mt-1 text-center font-mono text-[9px] tracking-wide text-[#a89f91]/60">
        CLICK TOGGLES · SHIFT+CLICK CYCLES VELOCITY
      </div>
    </div>
  );
}

/* ---------------- piano roll (synth track) ---------------- */

function PianoRoll({
  track,
  updateProject,
  currentStep,
  drawLen,
  onDrawLen,
  onPreviewNote,
}: {
  track: SynthTrack;
  updateProject: (fn: (p: Project) => Project) => void;
  currentStep: number;
  drawLen: number;
  onDrawLen: (n: number) => void;
  onPreviewNote: (t: SynthTrack, pitch: number) => void;
}) {
  const pitches: number[] = [];
  for (let p = NOTE_HIGH; p >= NOTE_LOW; p--) pitches.push(p);

  const noteAt = (step: number, pitch: number) =>
    track.notes.find((n) => n.step === step && n.pitch === pitch);

  const toggleNote = (step: number, pitch: number) => {
    const existing = noteAt(step, pitch);
    if (existing) {
      updateProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === track.id && t.kind === "synth"
            ? { ...t, notes: t.notes.filter((n) => n.id !== existing.id) }
            : t
        ),
      }));
      return;
    }
    onPreviewNote(track, pitch); // outside the updater (strict-mode safe)
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== track.id || t.kind !== "synth") return t;
        const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        return { ...t, notes: [...t.notes, { id, step, len: drawLen, pitch, vel: 0.9 }] };
      }),
    }));
  };

  return (
    <div className="p-3">
      {/* tools row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">Note length</span>
        <div className="flex overflow-hidden rounded-lg border border-white/8">
          {[1, 2, 4, 8, 16].map((n) => (
            <button
              key={n}
              onClick={() => onDrawLen(n)}
              className={cn(
                "px-2 py-0.5 font-mono text-[10px] transition-colors",
                drawLen === n
                  ? "bg-[#f2a43a] font-bold text-[#17120a]"
                  : "text-[#a89f91] hover:bg-white/5"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={() =>
            updateProject((p) => ({
              ...p,
              tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, notes: [] } : t)),
            }))
          }
          className="rounded bg-white/5 px-2 py-0.5 font-mono text-[9px] uppercase text-[#a89f91] hover:bg-white/10"
        >
          clear
        </button>
        <span className="ml-auto font-mono text-[9px] text-[#a89f91]/60">
          {track.notes.length} notes · click a cell to place / remove
        </span>
      </div>

      {/* roll */}
      <div className="studio-scroll max-h-64 overflow-y-auto rounded-lg border border-white/6">
        {pitches.map((pitch) => {
          const black = isBlackKey(pitch);
          return (
            <div key={pitch} className="flex items-stretch border-b border-black/30 last:border-b-0">
              {/* key label */}
              <span
                className={cn(
                  "w-11 shrink-0 px-1.5 py-0.5 text-right font-mono text-[8px]",
                  black ? "bg-[#0c0a08] text-[#a89f91]/60" : "bg-[#1a1613] text-[#f0ece4]/80"
                )}
              >
                {pitchName(pitch)}
              </span>
              {/* cells */}
              <div className="grid min-w-0 flex-1 grid-cols-16">
                {Array.from({ length: STEP_COUNT }, (_, step) => {
                  const n = noteAt(step, pitch);
                  return (
                    <button
                      key={step}
                      onClick={() => toggleNote(step, pitch)}
                      aria-label={`${pitchName(pitch)} step ${step + 1}${n ? " on" : ""}`}
                      className={cn(
                        "h-4 border-r border-black/20 transition-colors last:border-r-0",
                        black ? "bg-black/40" : "bg-white/[0.02]",
                        step % 4 === 0 && !n && "bg-white/[0.05]",
                        currentStep === step && !n && "bg-[#f2a43a]/10",
                        !n && "hover:bg-white/[0.1]"
                      )}
                      style={
                        n
                          ? {
                              background: track.color,
                              opacity: track.muted ? 0.35 : 0.5 + n.vel * 0.5,
                              boxShadow: `inset 0 0 0 1px ${track.color}`,
                            }
                          : undefined
                      }
                      title={n ? `${pitchName(pitch)} · len ${n.len}` : undefined}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
