"use client";

import { useMemo } from "react";
import {
  isBlackKey,
  pitchName,
  type Note,
  type Project,
  type SynthTrack,
  type Waveform,
} from "@/lib/daw/types";
import { cn } from "@/lib/utils";
import { ParamRow, PanelTitle } from "./ui";
import { Switch } from "@/components/ui/switch";

const ROLL_LOW = 36;
const ROLL_HIGH = 83;
const WAVEFORMS: Waveform[] = ["sawtooth", "square", "triangle", "sine"];
const KEY_MAP: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71,
  k: 72, o: 73, l: 74, p: 75, ";": 76,
};

export function KeysTab({
  project,
  updateProject,
  currentStep,
  onPreviewNote,
  selectedId,
  setSelectedId,
  drawLen,
  setDrawLen,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  currentStep: number;
  onPreviewNote: (track: SynthTrack, pitch: number) => void;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  drawLen: number;
  setDrawLen: (n: number) => void;
}) {
  const synths = project.tracks.filter((t): t is SynthTrack => t.kind === "synth");
  const sel = synths.find((t) => t.id === selectedId) ?? synths[0];

  const patch = (p: Partial<SynthTrack>) => {
    if (!sel) return;
    updateProject((pr) => ({
      ...pr,
      tracks: pr.tracks.map((t) => (t.id === sel.id ? ({ ...t, ...p } as typeof t) : t)),
    }));
  };

  const pitchRows = useMemo(() => {
    const rows: number[] = [];
    for (let p = ROLL_HIGH; p >= ROLL_LOW; p--) rows.push(p);
    return rows;
  }, []);

  const addNote = (pitch: number, step: number) => {
    if (!sel) return;
    const exists = sel.notes.find((n) => n.pitch === pitch && n.step === step);
    if (exists) {
      patch({ notes: sel.notes.filter((n) => n.id !== exists.id) });
      return;
    }
    const n: Note = { id: `n_${Math.random().toString(36).slice(2, 9)}`, step, len: drawLen, pitch, vel: 0.9 };
    patch({ notes: [...sel.notes, n] });
    onPreviewNote(sel, pitch);
  };

  if (!sel) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#14100d] p-8 text-center text-sm text-[#a89f91]">
        No synth tracks in this project.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* track selector */}
      <div className="flex flex-wrap items-center gap-2">
        {synths.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedId(t.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
              t.id === sel.id
                ? "border-[#f2a43a]/50 bg-[#f2a43a]/10 text-[#f0ece4]"
                : "border-white/5 bg-[#14100d] text-[#a89f91] hover:text-[#f0ece4]"
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
            {t.name}
            <span className="font-mono text-[10px] opacity-60">{t.notes.length}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/5 bg-[#14100d] px-2 py-1">
          <span className="font-mono text-[10px] uppercase text-[#a89f91]">LEN</span>
          {[1, 2, 4, 8].map((l) => (
            <button
              key={l}
              onClick={() => setDrawLen(l)}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[11px]",
                drawLen === l ? "bg-[#f2a43a] text-[#17120a]" : "text-[#a89f91] hover:text-[#f0ece4]"
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* synth engine */}
      <div className="rounded-xl border border-white/5 bg-[#14100d] p-4">
        <PanelTitle kicker={`${sel.name} engine`}>Synth & filter</PanelTitle>
        <div className="flex flex-wrap items-center gap-2 pb-3">
          {WAVEFORMS.map((w) => (
            <button
              key={w}
              onClick={() => patch({ waveform: w })}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-[11px] uppercase",
                sel.waveform === w
                  ? "bg-[#f2a43a] text-[#17120a]"
                  : "bg-white/5 text-[#a89f91] hover:text-[#f0ece4]"
              )}
            >
              {w.slice(0, 3)}
            </button>
          ))}
          <div className="mx-2 h-5 w-px bg-white/10" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => patch({ octave: Math.max(-2, sel.octave - 1) })}
              className="h-6 w-6 rounded bg-white/5 font-mono text-xs text-[#f0ece4] hover:bg-white/10"
            >
              −
            </button>
            <span className="w-14 text-center font-mono text-[11px] text-[#a89f91]">
              OCT {sel.octave >= 0 ? "+" : ""}{sel.octave}
            </span>
            <button
              onClick={() => patch({ octave: Math.min(2, sel.octave + 1) })}
              className="h-6 w-6 rounded bg-white/5 font-mono text-xs text-[#f0ece4] hover:bg-white/10"
            >
              +
            </button>
          </div>
          <div className="ml-2 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase text-[#a89f91]">GLIDE</span>
            <Switch
              checked={sel.glide}
              onCheckedChange={(v) => patch({ glide: v })}
              className="scale-75"
            />
          </div>
        </div>
        <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          <ParamRow label="Cutoff" value={sel.cutoff} onChange={(v) => patch({ cutoff: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <ParamRow label="Reso" value={sel.resonance} min={0} max={18} step={0.1} onChange={(v) => patch({ resonance: v })} format={(v) => v.toFixed(1)} />
          <ParamRow label="Attack" value={sel.attack} min={0.004} max={1.5} step={0.004} onChange={(v) => patch({ attack: v })} format={(v) => `${Math.round(v * 1000)}ms`} />
          <ParamRow label="Decay" value={sel.decay} min={0.02} max={1.5} step={0.01} onChange={(v) => patch({ decay: v })} format={(v) => `${Math.round(v * 1000)}ms`} />
          <ParamRow label="Sustain" value={sel.sustain} onChange={(v) => patch({ sustain: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <ParamRow label="Release" value={sel.release} min={0.02} max={2} step={0.01} onChange={(v) => patch({ release: v })} format={(v) => `${Math.round(v * 1000)}ms`} />
          <ParamRow label="Detune" value={sel.detune} min={0} max={30} step={1} onChange={(v) => patch({ detune: v })} format={(v) => `${Math.round(v)}c`} />
          <ParamRow label="Vol" value={sel.volume} min={0} max={1.3} onChange={(v) => patch({ volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </div>

      {/* piano roll */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-[#14100d]">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
          <PanelTitle kicker="Piano roll">Draw notes</PanelTitle>
          <button
            onClick={() => patch({ notes: [] })}
            className="rounded-md bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase text-[#a89f91] hover:bg-white/10 hover:text-[#f0ece4]"
          >
            Clear
          </button>
        </div>
        <div className="studio-scroll relative max-h-[300px] overflow-y-auto">
          {currentStep >= 0 && (
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-[6.25%] bg-[#f2a43a]/10"
              style={{ left: `${currentStep * 6.25}%` }}
            />
          )}
          {pitchRows.map((p) => (
            <div key={p} className="flex h-[18px] border-b border-black/20">
              <div
                className={cn(
                  "z-20 flex w-11 shrink-0 items-center justify-end pr-1.5 font-mono text-[9px]",
                  isBlackKey(p) ? "bg-[#0d0a09] text-[#a89f91]/50" : "bg-[#17130f] text-[#a89f91]"
                )}
              >
                {pitchName(p)}
              </div>
              <div className="relative flex-1">
                <div className="absolute inset-0 grid grid-cols-16">
                  {Array.from({ length: 16 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => addNote(p, i)}
                      aria-label={`note ${pitchName(p)} step ${i + 1}`}
                      className={cn(
                        "border-r border-black/20 last:border-r-0",
                        isBlackKey(p) ? "bg-[#0f0c0a]" : "bg-[#151110]",
                        i % 4 === 0 ? "bg-white/[0.02]" : ""
                      )}
                    />
                  ))}
                </div>
                {sel.notes
                  .filter((n) => n.pitch === p)
                  .map((n) => (
                    <button
                      key={n.id}
                      onClick={() => addNote(p, n.step)}
                      className="absolute top-[2px] z-10 h-[calc(100%-4px)] rounded-[3px] ring-1 ring-black/40"
                      style={{
                        left: `calc(${n.step * 6.25}% + 1px)`,
                        width: `calc(${n.len * 6.25}% - 3px)`,
                        background: `linear-gradient(to bottom, ${sel.color}, ${sel.color}bb)`,
                        opacity: 0.35 + n.vel * 0.65,
                      }}
                      title={`${pitchName(p)} vel ${Math.round(n.vel * 100)}`}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* playable keys */}
      <div className="rounded-xl border border-white/5 bg-[#14100d] p-4">
        <PanelTitle kicker="Play">On-screen keys · use your keyboard too</PanelTitle>
        <PianoKeyboard
          onPlay={(p) => onPreviewNote(sel, p)}
          keyMap={KEY_MAP}
        />
      </div>
    </div>
  );
}

export function PianoKeyboard({
  onPlay,
  keyMap,
  low = 60,
  high = 76,
}: {
  onPlay: (pitch: number) => void;
  keyMap?: Record<string, number>;
  low?: number;
  high?: number;
}) {
  const whites: number[] = [];
  const blacks: number[] = [];
  for (let p = low; p <= high; p++) {
    if (isBlackKey(p)) blacks.push(p);
    else whites.push(p);
  }
  const whiteW = 100 / whites.length;
  const keyLabel = (pitch: number) =>
    keyMap ? Object.entries(keyMap).find(([, v]) => v === pitch)?.[0]?.toUpperCase() : null;

  return (
    <div className="relative h-28 select-none sm:h-32" role="toolbar" aria-label="Piano keyboard">
      <div className="flex h-full gap-[2px]">
        {whites.map((p) => (
          <button
            key={p}
            onPointerDown={() => onPlay(p)}
            className="group relative flex-1 rounded-b-md bg-gradient-to-b from-[#f0ece4] to-[#cfc7b8] text-[#3a332b] transition-transform active:translate-y-[1px] active:bg-[#f2a43a]"
            aria-label={pitchName(p)}
          >
            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 font-mono text-[9px] font-bold text-[#3a332b]/60">
              {keyLabel(p) ?? pitchName(p)}
            </span>
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0">
        {blacks.map((p) => {
          const whiteIdx = whites.filter((w) => w < p).length;
          const left = `calc(${whiteIdx * whiteW}% - ${whiteW * 0.3}%)`;
          return (
            <button
              key={p}
              onPointerDown={() => onPlay(p)}
              className="pointer-events-auto absolute top-0 h-[62%] w-[6%] min-w-[22px] rounded-b-md bg-gradient-to-b from-[#24201c] to-[#0d0b09] text-[#a89f91] ring-1 ring-black/60 transition-transform active:translate-y-[1px] active:from-[#f2a43a] active:to-[#c97f1e]"
              style={{ left }}
              aria-label={pitchName(p)}
            >
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[9px] font-bold text-[#a89f91]/70">
                {keyLabel(p) ?? ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
