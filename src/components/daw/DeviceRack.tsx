"use client";

/* ------------------------------------------------------------------ */
/*  DeviceRack — sound + mixer parameters of the selected track.       */
/*  This is the "connection" the interface was missing: pick a track   */
/*  and its whole signal chain (instrument → EQ → sends → level) is    */
/*  right here, always in sync with the timeline and editor.           */
/* ------------------------------------------------------------------ */

import { memo } from "react";
import type { DrumSound, Project, SynthTrack, Track, Waveform } from "@/lib/daw/types";
import { trackIcon } from "@/lib/daw/types";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
  selectedId: string | null;
  updateProject: (fn: (p: Project) => Project) => void;
  onDelete: (id: string) => void;
  onPreviewDrum: (sound: DrumSound, vel: number) => void;
  onPreviewNote: (t: SynthTrack, pitch: number) => void;
}

export const DeviceRack = memo(function DeviceRack({
  project,
  selectedId,
  updateProject,
  onDelete,
  onPreviewDrum,
  onPreviewNote,
}: Props) {
  const track = project.tracks.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="overflow-hidden rounded-xl border border-white/8 bg-[#14100d]">
      <div className="flex items-center justify-between border-b border-white/6 px-3 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#a89f91]">
          Device
        </span>
        {track && (
          <button
            onClick={() => onDelete(track.id)}
            className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#e5533d] hover:bg-[#e5533d]/15"
            title={`Delete ${track.name}`}
            aria-label={`Delete ${track.name}`}
          >
            delete
          </button>
        )}
      </div>

      {!track ? (
        <div className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-wider text-[#a89f91]/70">
          select a track to shape its sound
        </div>
      ) : (
        <DeviceBody
          key={track.id}
          track={track}
          updateProject={updateProject}
          onPreviewDrum={onPreviewDrum}
          onPreviewNote={onPreviewNote}
        />
      )}
    </div>
  );
});

function DeviceBody({
  track,
  updateProject,
  onPreviewDrum,
  onPreviewNote,
}: {
  track: Track;
  updateProject: (fn: (p: Project) => Project) => void;
  onPreviewDrum: (sound: DrumSound, vel: number) => void;
  onPreviewNote: (t: SynthTrack, pitch: number) => void;
}) {
  const patch = (u: Partial<Track>) =>
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === track.id ? ({ ...t, ...u } as Track) : t)),
    }));

  const num = (label: string, key: string, min: number, max: number, step: number, fmt?: (v: number) => string) => (
    <Param
      label={label}
      value={Number((track as unknown as Record<string, unknown>)[key])}
      min={min}
      max={max}
      step={step}
      onChange={(v) => patch({ [key]: v } as Partial<Track>)}
      format={fmt}
    />
  );

  return (
    <div className="space-y-3 p-3">
      {/* identity */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
          style={{ background: `${track.color}22`, color: track.color }}
        >
          {trackIcon(track)}
        </span>
        <input
          value={track.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="min-w-0 flex-1 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[13px] font-semibold text-[#f0ece4] outline-none focus:border-[#f2a43a]/50"
          aria-label="Track name"
        />
        <button
          onClick={() =>
            track.kind === "drum" ? onPreviewDrum(track.sound, 0.95) : onPreviewNote(track, 60)
          }
          className="rounded-lg bg-[#f2a43a] px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase text-[#17120a] hover:bg-[#ffb75c]"
          title="Audition this track"
        >
          ▶
        </button>
      </div>

      {/* ------- instrument section ------- */}
      <Section title={track.kind === "drum" ? "Instrument · Drum" : "Instrument · Synth"}>
        {track.kind === "drum" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <span className="w-14 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">Sound</span>
              <select
                value={track.sound}
                onChange={(e) => patch({ sound: e.target.value as DrumSound })}
                className="flex-1 rounded-lg border border-white/8 bg-black/30 px-2 py-1 text-[11px] text-[#f0ece4] outline-none focus:border-[#f2a43a]/50"
              >
                {(
                  ["kick", "kick2", "snare", "clap", "chat", "ohat", "perc", "rim", "tom", "conga", "shaker", "ride", "crash", "chop", "vox", "fx"] as DrumSound[]
                ).map((s) => (
                  <option key={s} value={s} className="bg-[#171310]">
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {num("Tune", "tune", -12, 12, 1, (v) => `${v > 0 ? "+" : ""}${v} st`)}
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* waveform + octave + glide */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-white/8">
                {(["sine", "triangle", "square", "sawtooth"] as Waveform[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => track.kind === "synth" && patch({ waveform: w })}
                    className={cn(
                      "px-2 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors",
                      track.kind === "synth" && track.waveform === w
                        ? "bg-[#f2a43a] font-bold text-[#17120a]"
                        : "text-[#a89f91] hover:bg-white/5"
                    )}
                  >
                    {w.slice(0, 3)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1" title="Octave transpose">
                <button
                  onClick={() => track.kind === "synth" && patch({ octave: Math.max(-2, track.octave - 1) })}
                  className="flex h-6 w-6 items-center justify-center rounded bg-white/5 font-mono text-[11px] text-[#a89f91] hover:bg-white/12"
                  aria-label="Octave down"
                >
                  −
                </button>
                <span className="w-10 text-center font-mono text-[10px] text-[#f0ece4]">
                  oct {track.kind === "synth" ? (track.octave > 0 ? `+${track.octave}` : track.octave) : 0}
                </span>
                <button
                  onClick={() => track.kind === "synth" && patch({ octave: Math.min(2, track.octave + 1) })}
                  className="flex h-6 w-6 items-center justify-center rounded bg-white/5 font-mono text-[11px] text-[#a89f91] hover:bg-white/12"
                  aria-label="Octave up"
                >
                  +
                </button>
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
                <input
                  type="checkbox"
                  checked={track.kind === "synth" ? track.glide : false}
                  onChange={(e) => track.kind === "synth" && patch({ glide: e.target.checked })}
                  className="accent-[#f2a43a]"
                />
                glide
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {num("Cutoff", "cutoff", 0, 1, 0.01, (v) => `${Math.round(v * 100)}`)}
              {num("Reso", "resonance", 0, 18, 0.5, (v) => v.toFixed(1))}
              {num("Detune", "detune", 0, 30, 1, (v) => `${Math.round(v)}c`)}
              {num("Attack", "attack", 0.004, 2, 0.004, (v) => `${Math.round(v * 1000)}ms`)}
              {num("Decay", "decay", 0.02, 2, 0.01, (v) => `${Math.round(v * 1000)}ms`)}
              {num("Sustain", "sustain", 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
              {num("Release", "release", 0.02, 2, 0.01, (v) => `${Math.round(v * 1000)}ms`)}
            </div>
          </div>
        )}
      </Section>

      {/* ------- mixer section ------- */}
      <Section title="Mixer · EQ · Sends">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {num("Level", "volume", 0, 1.3, 0.01, (v) => `${Math.round(v * 100)}`)}
          {num("Pan", "pan", -1, 1, 0.02, (v) => (v === 0 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`))}
          {num("EQ low", "eqLow", -12, 12, 0.5, (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`)}
          {num("EQ mid", "eqMid", -12, 12, 0.5, (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`)}
          {num("EQ high", "eqHigh", -12, 12, 0.5, (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}dB`)}
          {num("Reverb", "reverbSend", 0, 1, 0.01, (v) => `${Math.round(v * 100)}`)}
          {num("Delay", "delaySend", 0, 1, 0.01, (v) => `${Math.round(v * 100)}`)}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">Mode</span>
          <button
            onClick={() => patch({ muted: !track.muted })}
            className={cn(
              "rounded px-2.5 py-1 font-mono text-[10px] font-bold",
              track.muted ? "bg-[#e5533d] text-white" : "bg-white/5 text-[#a89f91] hover:bg-white/12"
            )}
            aria-pressed={track.muted}
          >
            MUTE
          </button>
          <button
            onClick={() => patch({ solo: !track.solo })}
            className={cn(
              "rounded px-2.5 py-1 font-mono text-[10px] font-bold",
              track.solo ? "bg-[#f2a43a] text-[#17120a]" : "bg-white/5 text-[#a89f91] hover:bg-white/12"
            )}
            aria-pressed={track.solo}
          >
            SOLO
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/6 bg-black/20 p-2.5">
      <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#f2a43a]/80">
        {title}
      </div>
      {children}
    </div>
  );
}

function Param({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 shrink-0 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a]"
        aria-label={label}
      />
      <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-[#f0ece4]">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </label>
  );
}
