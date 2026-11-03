"use client";

/* ------------------------------------------------------------------ */
/*  EditorPanel — the note editor that follows the selected track.     */
/*  Drum track → 16-step velocity grid + STEP FX bar (chance / ratchet */
/*  / decay / throw).  Synth track → piano roll + NOTE FX bar (vel /   */
/*  chance / ratchet / nudge / bend).  Always visible below the        */
/*  timeline: no tab switching needed.                                 */
/* ------------------------------------------------------------------ */

import { memo, useEffect, useState } from "react";
import type { DrumSound, DrumStep, DrumTrack, Note, Project, SynthTrack } from "@/lib/daw/types";
import { isBlackKey, KIT_PRESETS, NOTE_HIGH, NOTE_LOW, pitchName, STEP_COUNT } from "@/lib/daw/types";
import { Slider } from "@/components/ui/slider";
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

/* ---------------- shared FX-bar building blocks ---------------- */

/** compact labeled slider used inside the STEP FX / NOTE FX bars */
function MiniSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex min-w-[92px] flex-1 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-1 font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">
        {label}
        <span className="text-[#f0ece4]">{format(value)}</span>
      </span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        aria-label={label}
        className="h-6 cursor-pointer [&_[data-slot=slider-thumb]]:size-3"
      />
    </div>
  );
}

/** integer 1..4 segmented control for the ratchet FX */
function Ratchet({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex min-w-[104px] flex-1 flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">Ratchet</span>
      <div className="flex overflow-hidden rounded-lg border border-white/8">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            aria-label={`Ratchet ${n}`}
            className={cn(
              "h-6 flex-1 font-mono text-[10px] transition-colors",
              n > 1 && "border-l border-white/8",
              value === n
                ? "bg-[#f2a43a] font-bold text-[#17120a]"
                : "bg-[#0f0c0a] text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4]"
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** small round × that closes / deselects the FX bar */
function BarClose({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 font-mono text-[11px] text-[#a89f91] transition-colors hover:bg-white/10 hover:text-[#f0ece4]"
    >
      ×
    </button>
  );
}

const hasDrumFx = (s: DrumStep) =>
  (s.chance !== undefined && s.chance !== 1) ||
  (s.rat !== undefined && s.rat !== 1) ||
  (s.dec !== undefined && s.dec !== 1) ||
  (s.thr !== undefined && s.thr !== 0);

const hasNoteFx = (n: Note) =>
  (n.chance !== undefined && n.chance !== 1) ||
  (n.rat !== undefined && n.rat !== 1) ||
  (n.nudge !== undefined && n.nudge !== 0) ||
  (n.bend !== undefined && n.bend !== 0);

const fmtNudge = (v: number) => `${v > 0 ? "+" : ""}${parseFloat(v.toFixed(3))}`;
const fmtBend = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}st`;

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
  const [focusedStep, setFocusedStep] = useState<number | null>(null);
  const [prevTrackId, setPrevTrackId] = useState(track.id);

  // switching drum tracks clears the step focus (state adjusted during render)
  if (prevTrackId !== track.id) {
    setPrevTrackId(track.id);
    setFocusedStep(null);
  }

  const setStepOn = (i: number, on: boolean) => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== track.id || t.kind !== "drum") return t;
        const steps = [...t.steps];
        steps[i] = { ...steps[i], on };
        return { ...t, steps };
      }),
    }));
  };

  /** patch one FX field on a step (chance / rat / dec / thr) */
  const patchStep = (idx: number, patch: Partial<DrumStep>) => {
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== track.id || t.kind !== "drum") return t;
        const steps = [...t.steps];
        steps[idx] = { ...steps[idx], ...patch };
        return { ...t, steps };
      }),
    }));
  };

  const toggleStep = (i: number, shift: boolean) => {
    const cur = track.steps[i];
    if (shift && cur.on) {
      // shift+click: cycle velocity (and focus the step)
      setFocusedStep(i);
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
    if (cur.on) {
      // click on an ON step: first click focuses it, clicking the focused
      // step again unfocuses AND turns it off
      if (focusedStep === i) {
        setFocusedStep(null);
        setStepOn(i, false);
      } else {
        setFocusedStep(i);
      }
      return;
    }
    // off → on: preview + focus (outside the updater, strict-mode safe)
    onPreview(track.sound, cur.vel);
    setFocusedStep(i);
    setStepOn(i, true);
  };

  const setAll = (vals: boolean[]) => {
    if (focusedStep !== null && !vals[focusedStep]) setFocusedStep(null);
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === track.id && t.kind === "drum"
          ? { ...t, steps: t.steps.map((s, i) => ({ ...s, on: vals[i] ?? s.on })) }
          : t
      ),
    }));
  };

  const fs =
    focusedStep !== null ? { idx: focusedStep, step: track.steps[focusedStep] } : null;

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
            aria-label={`${track.name} step ${i + 1}${s.on ? " on" : " off"}${hasDrumFx(s) ? " · fx" : ""}`}
            aria-pressed={s.on}
            className={cn(
              "relative h-9 w-full min-w-[18px] rounded-[5px] transition-all sm:h-10",
              s.on ? "step-on" : "",
              i % 4 === 0 && !s.on ? "bg-white/[0.07]" : "",
              i % 4 !== 0 && !s.on ? "bg-white/[0.035]" : "",
              !s.on && "hover:bg-white/[0.09]",
              focusedStep === i
                ? "ring-2 ring-[#f2a43a]"
                : currentStep === i
                  ? "ring-1 ring-[#f2a43a]/70"
                  : ""
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
          >
            {hasDrumFx(s) && (
              <span
                aria-hidden
                className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#c084fc]"
              />
            )}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] text-[#a89f91]/60">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
      </div>

      {/* STEP FX bar — per-step probability / ratchet / decay / throw */}
      {fs && fs.step.on && (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-black/30 p-2.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-[#f2a43a]">
            Step FX · {String(fs.idx + 1).padStart(2, "0")}
          </span>
          <MiniSlider
            label="Chance %"
            value={(fs.step.chance ?? 1) * 100}
            min={0}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}%`}
            onChange={(v) => patchStep(fs.idx, { chance: v / 100 })}
          />
          <Ratchet value={fs.step.rat ?? 1} onChange={(n) => patchStep(fs.idx, { rat: n })} />
          <MiniSlider
            label="Decay"
            value={fs.step.dec ?? 1}
            min={0.3}
            max={1.6}
            step={0.05}
            format={(v) => `${v.toFixed(2)}×`}
            onChange={(v) => patchStep(fs.idx, { dec: v })}
          />
          <MiniSlider
            label="Throw"
            value={(fs.step.thr ?? 0) * 100}
            min={0}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}%`}
            onChange={(v) => patchStep(fs.idx, { thr: v / 100 })}
          />
          <BarClose label="Close step FX" onClick={() => setFocusedStep(null)} />
        </div>
      )}

      <div className="mt-1 text-center font-mono text-[9px] tracking-wide text-[#a89f91]/60">
        CLICK ON STEP = FOCUS FX · CLICK FOCUSED STEP = OFF · SHIFT+CLICK CYCLES VELOCITY
      </div>
    </div>
  );
}

/* ---------------- piano roll (synth track) ---------------- */

const LEN_ORDER = [1, 2, 4, 8, 16];

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
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // switching synth tracks clears the note selection
  useEffect(() => {
    setSelectedNoteId(null);
  }, [track.id]);

  const pitches: number[] = [];
  for (let p = NOTE_HIGH; p >= NOTE_LOW; p--) pitches.push(p);

  const noteAt = (step: number, pitch: number) =>
    track.notes.find((n) => n.step === step && n.pitch === pitch);
  const coveredAt = (step: number, pitch: number) =>
    track.notes.some((n) => n.pitch === pitch && step > n.step && step < n.step + n.len);

  const selNote = selectedNoteId
    ? track.notes.find((n) => n.id === selectedNoteId) ?? null
    : null;

  /** patch any fields (vel / chance / rat / nudge / bend) on the selected note */
  const patchNote = (patch: Partial<Note>) => {
    const id = selectedNoteId;
    if (!id) return;
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === track.id && t.kind === "synth"
          ? { ...t, notes: t.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }
          : t
      ),
    }));
  };

  const placeNote = (step: number, pitch: number) => {
    const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    onPreviewNote(track, pitch); // outside the updater (strict-mode safe)
    setSelectedNoteId(id);
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== track.id || t.kind !== "synth") return t;
        return { ...t, notes: [...t.notes, { id, step, len: drawLen, pitch, vel: 0.9 }] };
      }),
    }));
  };

  const onCellClick = (step: number, pitch: number) => {
    const existing = noteAt(step, pitch);
    if (existing) {
      setSelectedNoteId(existing.id);
      return;
    }
    placeNote(step, pitch);
  };

  /** click a note: first click selects it, clicking the selected note grows
      it (1→2→4→8→16 steps, then it removes itself).  shift+click removes. */
  const onNoteClick = (n: Note, shift: boolean) => {
    if (shift) {
      if (selectedNoteId === n.id) setSelectedNoteId(null);
      updateProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) =>
          t.id === track.id && t.kind === "synth"
            ? { ...t, notes: t.notes.filter((x) => x.id !== n.id) }
            : t
        ),
      }));
      return;
    }
    if (selectedNoteId !== n.id) {
      setSelectedNoteId(n.id);
      return;
    }
    const idx = LEN_ORDER.indexOf(n.len);
    const willRemove = idx === -1 || idx === LEN_ORDER.length - 1;
    if (willRemove) setSelectedNoteId(null);
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => {
        if (t.id !== track.id || t.kind !== "synth") return t;
        if (willRemove) return { ...t, notes: t.notes.filter((x) => x.id !== n.id) };
        return {
          ...t,
          notes: t.notes.map((x) => (x.id === n.id ? { ...x, len: LEN_ORDER[idx + 1] } : x)),
        };
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
          onClick={() => {
            setSelectedNoteId(null);
            updateProject((p) => ({
              ...p,
              tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, notes: [] } : t)),
            }));
          }}
          className="rounded bg-white/5 px-2 py-0.5 font-mono text-[9px] uppercase text-[#a89f91] hover:bg-white/10"
        >
          clear
        </button>
        <span className="ml-auto font-mono text-[9px] text-[#a89f91]/60">
          {track.notes.length} notes · click a cell to place · click a note to select it
        </span>
      </div>

      {/* roll — notes render at their true length on an overlay; the cells
          underneath stay clickable everywhere a note body doesn't cover */}
      <div className="studio-scroll max-h-64 overflow-y-auto rounded-lg border border-white/6">
        {pitches.map((pitch) => {
          const black = isBlackKey(pitch);
          const rowNotes = track.notes.filter((n) => n.pitch === pitch);
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
              {/* cells + note overlay */}
              <div className="relative min-w-0 flex-1">
                <div className="grid min-w-0 grid-cols-16">
                  {Array.from({ length: STEP_COUNT }, (_, step) => {
                    const n = noteAt(step, pitch);
                    const covered = !n && coveredAt(step, pitch);
                    return (
                      <button
                        key={step}
                        onClick={() => onCellClick(step, pitch)}
                        disabled={covered}
                        aria-label={`${pitchName(pitch)} step ${step + 1}${n ? " on" : ""}`}
                        className={cn(
                          "h-4 border-r border-black/20 transition-colors last:border-r-0",
                          black ? "bg-black/40" : "bg-white/[0.02]",
                          step % 4 === 0 && !n && "bg-white/[0.05]",
                          currentStep === step && !n && !covered && "bg-[#f2a43a]/10",
                          !n && !covered && "hover:bg-white/[0.1]",
                          covered && "cursor-default"
                        )}
                      />
                    );
                  })}
                </div>
                {rowNotes.map((n) => {
                  const span = Math.min(n.len, STEP_COUNT - n.step);
                  const selected = selNote?.id === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={(e) => onNoteClick(n, e.shiftKey)}
                      className={cn(
                        "absolute inset-y-0 z-10 flex items-center overflow-hidden rounded-[3px] px-1 transition-shadow hover:shadow-[0_0_0_1px_#f2a43a]",
                        selected && "ring-2 ring-[#f2a43a]"
                      )}
                      style={{
                        left: `${(n.step * 100) / STEP_COUNT}%`,
                        width: `calc(${(span * 100) / STEP_COUNT}% - 2px)`,
                        background: track.color,
                        opacity: track.muted ? 0.35 : 0.55 + n.vel * 0.45,
                        boxShadow: `inset 0 0 0 1px ${track.color}`,
                      }}
                      title={`${pitchName(pitch)} · ${n.len} step${n.len > 1 ? "s" : ""} — click to select, click again to grow, shift+click to remove`}
                      aria-label={`${pitchName(pitch)} note at step ${n.step + 1}, length ${n.len}${selected ? ", selected" : ""}`}
                      aria-pressed={selected}
                    >
                      {n.len >= 4 && (
                        <span className="w-full text-left font-mono text-[7px] font-bold text-black/55">{n.len}</span>
                      )}
                      {hasNoteFx(n) && (
                        <span
                          aria-hidden
                          className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-[#c084fc]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* NOTE FX bar — velocity / probability / ratchet / nudge / bend */}
      {selNote && (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-black/30 p-2.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-[#f2a43a]">
            Note FX · {pitchName(selNote.pitch)}
          </span>
          <MiniSlider
            label="Vel"
            value={selNote.vel}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => patchNote({ vel: v })}
          />
          <MiniSlider
            label="Chance %"
            value={(selNote.chance ?? 1) * 100}
            min={0}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}%`}
            onChange={(v) => patchNote({ chance: v / 100 })}
          />
          <Ratchet value={selNote.rat ?? 1} onChange={(r) => patchNote({ rat: r })} />
          <MiniSlider
            label="Nudge"
            value={selNote.nudge ?? 0}
            min={-0.5}
            max={0.5}
            step={0.125}
            format={fmtNudge}
            onChange={(v) => patchNote({ nudge: v })}
          />
          <MiniSlider
            label="Bend"
            value={selNote.bend ?? 0}
            min={-12}
            max={12}
            step={1}
            format={fmtBend}
            onChange={(v) => patchNote({ bend: Math.round(v) })}
          />
          <BarClose label="Deselect note" onClick={() => setSelectedNoteId(null)} />
        </div>
      )}

      <div className="mt-1 text-center font-mono text-[9px] tracking-wide text-[#a89f91]/60">
        CLICK EMPTY CELL = PLACE · CLICK NOTE = SELECT, AGAIN = GROW (1→2→4→8→16) · SHIFT+CLICK = REMOVE
      </div>
    </div>
  );
}
