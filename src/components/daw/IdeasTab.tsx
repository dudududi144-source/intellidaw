"use client";

/* ------------------------------------------------------------------ */
/*  IdeasTab — MIDI GOD-style generator: writes key-aware parts        */
/*  (basslines, chords, arps, leads, fills, risers) into the project.  */
/* ------------------------------------------------------------------ */

import { memo, useCallback, useMemo, useState } from "react";
import {
  keyToPitchClasses,
  makeDrumTrack,
  makeSynthTrack,
  note,
  SONG_BARS,
  type DrumSound,
  type DrumStep,
  type Note,
  type Project,
  type SynthTrack,
} from "@/lib/daw/types";
import { getEngine } from "@/lib/daw/engine";
import { cn } from "@/lib/utils";

type Role = "bass" | "chords" | "arp" | "lead" | "fill" | "riser";
type Style = "house" | "techno" | "psy" | "trap" | "lofi" | "wave" | "dnb";

const ROLES: Array<{ id: Role; label: string; desc: string }> = [
  { id: "bass", label: "Bassline", desc: "a low part locked to the groove" },
  { id: "chords", label: "Chords", desc: "stacked triads in your key" },
  { id: "arp", label: "Arp", desc: "16th-note chord arpeggio" },
  { id: "lead", label: "Lead", desc: "a melody line in the 5th octave" },
  { id: "fill", label: "Drum fill", desc: "a 1-bar rolling fill" },
  { id: "riser", label: "Riser", desc: "a long pitch-rise sweep" },
];

const STYLES: Style[] = ["house", "techno", "psy", "trap", "lofi", "wave", "dnb"];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/* scale degrees → midi pitches inside a range */
function scalePitches(key: string, low: number, high: number): number[] {
  const pcs = keyToPitchClasses(key);
  const out: number[] = [];
  for (let p = low; p <= high; p++) {
    if (pcs.includes(((p % 12) + 12) % 12)) out.push(p);
  }
  return out;
}

function generateNotes(role: Role, style: Style, key: string, intensity: number): Note[] {
  const notes: Note[] = [];
  const dens = 0.4 + intensity * 0.55;

  if (role === "bass") {
    const scale = scalePitches(key, 33, 52);
    const root = scale[0];
    if (style === "psy") {
      for (const s of [2, 3, 6, 7, 10, 11, 14, 15]) notes.push(note(s, 1, Math.random() < 0.2 ? root + 7 : root, rnd(0.75, 0.95)));
    } else if (style === "house") {
      for (const s of [0, 2, 4, 6, 8, 10, 12, 14]) if (Math.random() < dens) notes.push(note(s, 1, s % 8 === 0 ? root : pick([root, root, root + 3, root + 5]), rnd(0.7, 0.9)));
    } else if (style === "techno" || style === "wave") {
      for (let s = 0; s < 16; s += 2) if (Math.random() < dens) notes.push(note(s, 1, s % 8 === 4 ? root + 3 : root, rnd(0.7, 0.95)));
    } else if (style === "trap") {
      notes.push(note(0, 5, root, 0.95), note(6, 4, root + pick([3, 5]), 0.85), note(11, 5, root - 2, 0.9));
    } else if (style === "dnb") {
      notes.push(note(0, 6, root, 0.95), note(8, 4, root + 5, 0.8), note(12, 4, root, 0.85));
    } else {
      // lofi — swung 8ths
      for (const s of [0, 3, 6, 8, 11, 14]) if (Math.random() < dens) notes.push(note(s, 2, pick([root, root, root + 3, root - 2]), rnd(0.6, 0.85)));
    }
    return notes;
  }

  if (role === "chords") {
    const scale = scalePitches(key, 48, 72);
    const degrees = [0, 3, 4].map((d) => scale[d % scale.length]);
    const bars = SONG_BARS;
    for (let b = 0; b < bars; b++) {
      const shift = b % 2 === 1 ? 2 : 0;
      const triad = degrees.map((d) => d + shift);
      const st = style === "trap" || style === "lofi" ? b * 8 : b * 4;
      const len = style === "trap" ? 8 : style === "lofi" ? 6 : 4;
      triad.forEach((p) => notes.push(note(st % 16, len, p, rnd(0.5, 0.7))));
      if (style === "house" || style === "techno") triad.forEach((p) => notes.push(note((st + 2) % 16, 2, p, rnd(0.4, 0.6))));
    }
    return notes;
  }

  if (role === "arp") {
    const scale = scalePitches(key, 48, 76);
    const tones = [scale[0], scale[2], scale[4], scale[7 % scale.length]];
    for (let s = 0; s < 16; s++) {
      if (Math.random() > dens * 1.1) continue;
      notes.push(note(s, 1, tones[s % tones.length] + (s >= 8 ? 12 : 0) * (style === "psy" ? 1 : 0), rnd(0.5, 0.8)));
    }
    return notes;
  }

  if (role === "lead") {
    const scale = scalePitches(key, 69, 88);
    let idx = Math.floor(scale.length / 2);
    const steps = style === "trap" ? [0, 6, 10, 13] : style === "lofi" ? [0, 3, 8, 11, 14] : [0, 2, 4, 7, 10, 12, 14];
    for (const s of steps) {
      if (Math.random() > dens) continue;
      idx = Math.max(0, Math.min(scale.length - 1, idx + pick([-2, -1, -1, 0, 1, 1, 2])));
      notes.push(note(s, pick([2, 2, 3, 4]), scale[idx], rnd(0.55, 0.8)));
    }
    return notes;
  }

  if (role === "fill") return notes; // handled separately (drum track)
  return notes; // riser handled separately
}

function generateFill(intensity: number): Array<{ step: number; vel: number; sound: DrumSound }> {
  const hits: Array<{ step: number; vel: number; sound: DrumSound }> = [];
  const start = 8;
  for (let s = start; s < 16; s++) {
    const r = (s - start) / (16 - start);
    if (Math.random() < 0.55 + intensity * 0.45) {
      hits.push({ step: s, vel: 0.5 + r * 0.5, sound: r > 0.66 ? "tom" : "snare" });
    }
  }
  hits.push({ step: 15, vel: 1, sound: "crash" });
  return hits;
}

export const IdeasTab = memo(function IdeasTab({
  project,
  updateProject,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  onApplyFix?: (fix: string) => void;
}) {
  const [role, setRole] = useState<Role>("bass");
  const [style, setStyle] = useState<Style>("techno");
  const [intensity, setIntensity] = useState(0.6);
  const [flash, setFlash] = useState(0);

  const roleDesc = ROLES.find((r) => r.id === role)!.desc;
  const trackCount = useMemo(() => project.tracks.length, [project.tracks.length]);

  const preview = useCallback(async () => {
    const e = getEngine();
    try {
      if (role === "fill") {
        const hits = generateFill(intensity).slice(0, 4);
        for (const h of hits) await e.previewDrum(h.sound, h.vel);
        return;
      }
      if (role === "riser") {
        await e.previewSynth(
          { waveform: "sawtooth", cutoff: 0.6, resonance: 8, attack: 0.3, decay: 1, sustain: 0.8, release: 0.5, detune: 20, octave: 0, glide: false } as SynthTrack,
          69, 1.2, 0.4
        );
        return;
      }
      const notes = generateNotes(role, style, project.songKey, intensity).slice(0, 4);
      const tmp = makeSynthTrack("preview", "#f2a43a", role === "bass" ? { octave: -1, cutoff: 0.35 } : {}, []);
      for (const n of notes) {
        await e.previewSynth(tmp, n.pitch, 0.25, n.vel);
        await new Promise((r) => setTimeout(r, 130));
      }
    } catch {
      /* audio locked — next tap resumes */
    }
  }, [role, style, intensity, project.songKey]);

  const generate = useCallback(() => {
    updateProject((p) => {
      const n = trackCount + 1;
      if (role === "fill") {
        const t = makeDrumTrack("snare", `Fill ${n}`, "#d97b5a", [], { volume: 0.7 });
        const steps: DrumStep[] = Array.from({ length: 16 }, () => ({ on: false, vel: 0.9 }));
        for (const h of generateFill(intensity)) {
          steps[h.step] = { on: true, vel: h.vel, chance: 1, rat: 1, dec: 1, thr: 0 };
        }
        t.steps = steps;
        return { ...p, tracks: [...p.tracks, t], updatedAt: Date.now() };
      }
      if (role === "riser") {
        const scale = scalePitches(p.songKey, 69, 81);
        const t = makeSynthTrack(
          `Riser ${n}`,
          "#c084fc",
          { waveform: "sawtooth", cutoff: 0.55, resonance: 10, attack: 0.4, decay: 1.2, sustain: 0.85, release: 0.8, detune: 24, reverbSend: 0.4, volume: 0.4 },
          [note(0, 16, scale[0], 0.5)]
        );
        t.notes[0].bend = -12;
        return { ...p, tracks: [...p.tracks, t], updatedAt: Date.now() };
      }
      const isBass = role === "bass";
      const notes = generateNotes(role, style, p.songKey, intensity);
      const t = makeSynthTrack(
        `${ROLES.find((r) => r.id === role)!.label} ${n}`,
        isBass ? "#f2a43a" : role === "chords" ? "#e5c15a" : "#8fbf6b",
        {
          waveform: role === "lead" || role === "arp" ? "sawtooth" : isBass ? (style === "trap" ? "sine" : "sawtooth") : "triangle",
          cutoff: isBass ? 0.32 : 0.62,
          resonance: role === "arp" ? 10 : 5,
          attack: role === "chords" ? 0.03 : 0.008,
          decay: 0.25,
          sustain: isBass ? 0.35 : 0.5,
          release: 0.2,
          detune: role === "lead" ? 14 : 8,
          octave: isBass ? -1 : 0,
          glide: style === "trap" && isBass,
          delaySend: role === "arp" || role === "lead" ? 0.3 : 0,
          reverbSend: role === "chords" ? 0.35 : 0.15,
          volume: isBass ? 0.9 : 0.55,
        },
        notes
      );
      return { ...p, tracks: [...p.tracks, t], updatedAt: Date.now() };
    });
    setFlash((f) => f + 1);
  }, [role, style, intensity, trackCount, updateProject]);

  const mutate = useCallback(() => {
    // MUTATE: regenerate but keep ~70% of an existing idea track's notes
    updateProject((p) => {
      const idea = [...p.tracks].reverse().find((t) => t.kind === "synth" && /bass|chord|arp|lead|riser/i.test(t.name)) as SynthTrack | undefined;
      if (!idea) return p;
      const kept = idea.notes.filter(() => Math.random() < 0.7);
      const fresh = generateNotes(role, style, p.songKey, intensity);
      const merged = [...kept, ...fresh.filter((f) => !kept.some((k) => k.step === f.step))].slice(0, 24);
      return {
        ...p,
        tracks: p.tracks.map((t) => (t.id === idea.id ? { ...t, notes: merged } : t)),
        updatedAt: Date.now(),
      };
    });
    setFlash((f) => f + 1);
  }, [role, style, intensity, updateProject]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/8 bg-[#14100d] p-3.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
          Ideas · writes tracks in your key
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#a89f91]">
          Pick a role and a style — the generator reads <span className="text-[#f0ece4]">{project.songKey}</span> and writes a brand-new track you can edit like any other.
        </p>

        <div className="mt-3 studio-scroll flex gap-1.5 overflow-x-auto pb-1">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium",
                role === r.id
                  ? "border-[#f2a43a] bg-[#f2a43a] text-[#17120a]"
                  : "border-white/10 bg-black/30 text-[#a89f91] hover:text-[#f0ece4]"
              )}
              aria-pressed={role === r.id}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={cn(
                "rounded-lg border px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider",
                style === s
                  ? "border-[#f2a43a]/60 bg-[#f2a43a]/15 text-[#f2a43a]"
                  : "border-white/8 bg-black/30 text-[#a89f91] hover:text-[#f0ece4]"
              )}
              aria-pressed={style === s}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">Density</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a]"
            aria-label="Pattern density"
          />
          <span className="w-10 text-right font-mono text-[10px] text-[#f0ece4]">{Math.round(intensity * 100)}%</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={generate}
            className="rounded-lg bg-[#f2a43a] px-4 py-2 text-[12px] font-bold text-[#17120a] hover:bg-[#ffb75c]"
          >
            ✦ Generate {ROLES.find((r) => r.id === role)!.label}
          </button>
          <button
            onClick={mutate}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-[#a89f91] hover:text-[#f0ece4]"
            title="Keep most of the last idea, swap some notes"
          >
            ⇄ Mutate
          </button>
          <button
            onClick={() => void preview()}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-[#a89f91] hover:text-[#f0ece4]"
          >
            ▶ Preview
          </button>
        </div>
        <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]/60">
          {roleDesc} · {style} · writes into track #{trackCount + 1} {flash > 0 && <span className="text-[#8fbf6b]">✓ {flash} generated</span>}
        </p>
      </div>
    </div>
  );
});
