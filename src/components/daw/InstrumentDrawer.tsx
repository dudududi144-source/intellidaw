"use client";

/* ------------------------------------------------------------------ */
/*  InstrumentDrawer — studio entrance: pick what the new channel      */
/*  plays. Structure mirrors intellidaw's entrance drawer (SUGGESTED / */
/*  START WITH / INSTRUMENTS / DRUMS / SAMPLERS) mapped onto OUR real  */
/*  instruments: SKAZI devices (BULLY, KUBE, TBON 303, SKACID), the    */
/*  built-in synth patches, the 16-sound beat sequencer and the Pads   */
/*  view. No fake device names.                                        */
/* ------------------------------------------------------------------ */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getEngine, type SynthParams } from "@/lib/daw/engine";
import type { DrumSound, SynthTrack, Track } from "@/lib/daw/types";

/* ---------------- public types (wired against Studio.tsx) ---------------- */

export type SynthPatchId =
  | "lead" | "bass" | "subbass" | "reese" | "pad" | "chords" | "keys" | "pluck"
  | "arp" | "strings" | "organ" | "brass" | "voxpad" | "fxriser";

export interface SynthPatch {
  id: SynthPatchId;
  name: string;
  sub: string;
  icon: string;
  color: string;
  opts: Partial<SynthTrack>;
}

export interface DrumLane {
  sound: DrumSound;
  name: string;
  sub: string;
  icon: string;
  beats: number[]; // starter pattern steps (0..15)
}

export type DrawerAction =
  | { type: "drum"; sound: DrumSound }
  | { type: "patch"; patch: SynthPatchId }
  | { type: "skazi"; deviceId: string }
  | { type: "pads" };

export interface InstrumentDrawerProps {
  open: boolean;
  onClose: () => void;
  tracks: Track[];
  onAction: (a: DrawerAction) => void;
}

/* ---------------- synth patches (INSTRUMENTS · 14) ---------------- */

export const SYNTH_PATCHES: SynthPatch[] = [
  { id: "lead", name: "Lead", sub: "Detuned saw lead", icon: "🎸", color: "#f2a43a",
    opts: { waveform: "sawtooth", cutoff: 0.68, resonance: 8, decay: 0.3, sustain: 0.35, release: 0.3, detune: 12, delaySend: 0.3, reverbSend: 0.2, volume: 0.5 } },
  { id: "bass", name: "Bass", sub: "Saw + sub octave", icon: "🎚️", color: "#d97b5a",
    opts: { waveform: "sawtooth", cutoff: 0.34, resonance: 6, sustain: 0.4, release: 0.12, decay: 0.22, octave: -1, volume: 0.95 } },
  { id: "subbass", name: "Sub Bass", sub: "Pure low end", icon: "◉", color: "#e5533d",
    opts: { waveform: "sine", cutoff: 0.3, sustain: 0.6, decay: 0.4, release: 0.15, octave: -1, volume: 0.9 } },
  { id: "reese", name: "Reese", sub: "Wide detuned bass", icon: "≋", color: "#b8a98f",
    opts: { waveform: "sawtooth", cutoff: 0.38, resonance: 4, detune: 30, sustain: 0.7, release: 0.2, octave: -1, volume: 0.8 } },
  { id: "pad", name: "Pad", sub: "Wide supersaw swell", icon: "☁️", color: "#c084fc",
    opts: { waveform: "sawtooth", cutoff: 0.4, attack: 0.6, decay: 0.8, sustain: 0.7, release: 1.2, detune: 14, reverbSend: 0.5, volume: 0.3 } },
  { id: "chords", name: "Chords", sub: "Stabs & progressions", icon: "🎹", color: "#e5c15a",
    opts: { waveform: "square", cutoff: 0.5, attack: 0.01, decay: 0.25, sustain: 0.3, release: 0.4, detune: 8, delaySend: 0.2, volume: 0.55 } },
  { id: "keys", name: "Keys", sub: "Soft electric keys", icon: "🎼", color: "#6bc5b8",
    opts: { waveform: "triangle", cutoff: 0.55, attack: 0.02, release: 0.5, sustain: 0.45, reverbSend: 0.35, volume: 0.62 } },
  { id: "pluck", name: "Pluck", sub: "Snappy filter pluck", icon: "✱", color: "#8fbf6b",
    opts: { waveform: "triangle", cutoff: 0.7, resonance: 6, decay: 0.12, sustain: 0, release: 0.1, volume: 0.6 } },
  { id: "arp", name: "Arp", sub: "Sequenced pluck", icon: "↻", color: "#f2a43a",
    opts: { waveform: "square", cutoff: 0.6, resonance: 4, decay: 0.1, sustain: 0.1, release: 0.15, delaySend: 0.35, volume: 0.5 } },
  { id: "strings", name: "Strings", sub: "Slow ensemble", icon: "🎻", color: "#c084fc",
    opts: { waveform: "sawtooth", cutoff: 0.45, attack: 0.4, sustain: 0.8, release: 1, detune: 10, reverbSend: 0.45, volume: 0.4 } },
  { id: "organ", name: "Organ", sub: "Drawbar sines", icon: "☰", color: "#e5c15a",
    opts: { waveform: "sine", cutoff: 0.6, sustain: 0.9, release: 0.2, volume: 0.5 } },
  { id: "brass", name: "Brass", sub: "Swelling stab", icon: "🎺", color: "#d97b5a",
    opts: { waveform: "sawtooth", cutoff: 0.5, attack: 0.08, decay: 0.3, sustain: 0.6, release: 0.3, detune: 6, volume: 0.55 } },
  { id: "voxpad", name: "Vox Pad", sub: "Formant-ish pad", icon: "🗣️", color: "#6bc5b8",
    opts: { waveform: "triangle", cutoff: 0.42, attack: 0.5, sustain: 0.75, release: 1.1, detune: 18, reverbSend: 0.55, volume: 0.38 } },
  { id: "fxriser", name: "FX / Riser", sub: "Sweeps & motion", icon: "🚀", color: "#e5533d",
    opts: { waveform: "sawtooth", cutoff: 0.8, resonance: 10, attack: 1.2, decay: 1.5, sustain: 0.5, release: 0.8, delaySend: 0.4, volume: 0.45 } },
];

/* ---------------- drum lanes (DRUMS · 16) ---------------- */

export const DRUM_LANES: DrumLane[] = [
  { sound: "kick",   name: "Kick",      sub: "Low punch",      icon: "◉", beats: [0, 4, 8, 12] },
  { sound: "snare",  name: "Snare",     sub: "Backbeat crack", icon: "▤", beats: [4, 12] },
  { sound: "clap",   name: "Clap",      sub: "Layered hands",  icon: "👏", beats: [4, 12] },
  { sound: "chat",   name: "Closed Hat", sub: "Tight tick",    icon: "✕", beats: [0, 2, 4, 6, 8, 10, 12, 14] },
  { sound: "ohat",   name: "Open Hat",  sub: "Sizzle & air",   icon: "✧", beats: [2, 6, 10, 14] },
  { sound: "tom",    name: "Tom",       sub: "Tuned fills",    icon: "◍", beats: [] },
  { sound: "rim",    name: "Rim",       sub: "Wood click",     icon: "▫", beats: [7] },
  { sound: "perc",   name: "Perc",      sub: "Snappy hit",     icon: "✦", beats: [7, 15] },
  { sound: "ride",   name: "Ride",      sub: "Ringing cymbal", icon: "☉", beats: [] },
  { sound: "crash",  name: "Crash",     sub: "Accent wash",    icon: "✺", beats: [] },
  { sound: "shaker", name: "Shaker",    sub: "Steady 16ths",   icon: "≋", beats: [1, 3, 5, 7, 9, 11, 13, 15] },
  { sound: "conga",  name: "Conga",     sub: "Hand drum",      icon: "🪘", beats: [] },
  { sound: "kick2",  name: "Kick 2",    sub: "Variant punch",  icon: "◎", beats: [0, 8] },
  { sound: "chop",   name: "Chop",      sub: "Chopped stab",   icon: "✂", beats: [] },
  { sound: "vox",    name: "Vox",       sub: "Vocal chop",     icon: "🎤", beats: [] },
  { sound: "fx",     name: "FX Riser",  sub: "Sweep hit",      icon: "〜", beats: [] },
];

const DRUM_TILE_COLORS: Record<DrumSound, string> = {
  kick: "#f2a43a",
  snare: "#e5c15a",
  clap: "#8fbf6b",
  chat: "#d97b5a",
  ohat: "#b8a98f",
  tom: "#c084fc",
  rim: "#e5c15a",
  perc: "#f2a43a",
  ride: "#6bc5b8",
  crash: "#e5533d",
  shaker: "#b8a98f",
  conga: "#d97b5a",
  kick2: "#f2a43a",
  chop: "#8fbf6b",
  vox: "#c084fc",
  fx: "#6bc5b8",
};

/* ---------------- internal row shape ---------------- */

interface DrawerItem {
  key: string;
  icon: string;
  color: string;
  name: string;
  sub: string;
  isNew?: boolean;
  action: DrawerAction;
}

interface DrawerSection {
  id: string;
  title: string;
  hint?: string;
  items: DrawerItem[];
}

/* START WITH — the main instruments, honestly labelled */
const START_WITH: DrawerItem[] = [
  { key: "start-drums", icon: "🥁", color: "#f2a43a", name: "Drums", sub: "Beat sequencer · 16 steps",
    // parent turns this into a starter kit (kick lane + pattern)
    action: { type: "drum", sound: "kick" } },
  { key: "start-synth", icon: "🎹", color: "#c084fc", name: "Synth", sub: "Piano roll & MIDI",
    action: { type: "patch", patch: "lead" } },
  { key: "start-bass", icon: "🎚️", color: "#d97b5a", name: "Bass", sub: "Sub & synth bass",
    action: { type: "patch", patch: "bass" } },
  { key: "start-bully", icon: "🌊", color: "#6bc5b8", name: "BULLY", sub: "Wavetable bass & leads", isNew: true,
    action: { type: "skazi", deviceId: "bully" } },
  { key: "start-kube", icon: "🔷", color: "#c084fc", name: "KUBE", sub: "Morphing wavetable synth", isNew: true,
    action: { type: "skazi", deviceId: "kube" } },
  { key: "start-tbon303", icon: "🎛️", color: "#e5533d", name: "TBON 303", sub: "Acid 303 bass line",
    action: { type: "skazi", deviceId: "tbon303" } },
  { key: "start-skacid", icon: "🧪", color: "#8fbf6b", name: "SKACID", sub: "Acid sequencer",
    action: { type: "skazi", deviceId: "skacid" } },
  { key: "start-pads", icon: "▦", color: "#e5c15a", name: "Pad Sampler", sub: "16 pads + grooves",
    action: { type: "pads" } },
  { key: "start-audio", icon: "🎵", color: "#b8a98f", name: "Audio Track", sub: "Import WAV / MP3",
    action: { type: "pads" } },
];

/* SAMPLERS — our Pads view IS the sampler, so label it honestly */
const SAMPLERS: DrawerItem[] = [
  { key: "sampler-pads", icon: "▦", color: "#e5c15a", name: "Pads", sub: "Load audio · keys, chops, loops",
    action: { type: "pads" } },
  { key: "sampler-padseq", icon: "▦", color: "#8fbf6b", name: "Pad Sampler", sub: "16 pads + grooves",
    action: { type: "pads" } },
  { key: "sampler-audio", icon: "🎵", color: "#b8a98f", name: "Audio Track", sub: "Import a WAV / MP3 file",
    action: { type: "pads" } },
];

/* SUGGESTED backfill so the section always shows 4 contextual boxes */
const SUGGESTED_EXTRAS: DrawerItem[] = [
  { key: "sug-tbon303", icon: "🎛️", color: "#e5533d", name: "TBON 303", sub: "303-style bass line",
    action: { type: "skazi", deviceId: "tbon303" } },
  { key: "sug-pads", icon: "▦", color: "#e5c15a", name: "Pads", sub: "16 pads + grooves",
    action: { type: "pads" } },
  { key: "sug-pad", icon: "☁️", color: "#c084fc", name: "Pad", sub: "Wide supersaw swell",
    action: { type: "patch", patch: "pad" } },
];

const PATCH_ITEMS: DrawerItem[] = SYNTH_PATCHES.map((p) => ({
  key: `patch-${p.id}`,
  icon: p.icon,
  color: p.color,
  name: p.name,
  sub: p.sub,
  action: { type: "patch", patch: p.id },
}));

const DRUM_ITEMS: DrawerItem[] = DRUM_LANES.map((d) => ({
  key: `drum-${d.sound}`,
  icon: d.icon,
  color: DRUM_TILE_COLORS[d.sound],
  name: d.name,
  sub: d.sub,
  action: { type: "drum", sound: d.sound },
}));

/* ---------------- auditions (best-effort, never block the add) ---------------- */

async function auditionDrum(sound: DrumSound): Promise<void> {
  try {
    await getEngine().previewDrum(sound, 0.95);
  } catch {
    /* audio needs a user gesture to unlock — the channel is added regardless */
  }
}

async function auditionPatch(patch: SynthPatch): Promise<void> {
  const o = patch.opts;
  // fill the engine's required synth params with musical defaults for
  // whatever the patch leaves out (attack, glide, octave…)
  const params: SynthParams = {
    waveform: o.waveform ?? "sawtooth",
    cutoff: o.cutoff ?? 0.5,
    resonance: o.resonance ?? 2,
    attack: o.attack ?? 0.005,
    decay: o.decay ?? 0.3,
    sustain: o.sustain ?? 0.4,
    release: o.release ?? 0.3,
    detune: o.detune ?? 0,
    octave: o.octave ?? 0,
    glide: o.glide ?? false,
  };
  try {
    await getEngine().previewSynth(params, 57, 0.5, 0.9);
  } catch {
    /* preview is best-effort — the channel is added regardless */
  }
}

/* ---------------- little render helpers ---------------- */

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-0.5">
      <h3 className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">{title}</h3>
      {hint ? <span className="font-mono text-[9px] text-[#a89f91]/60">{hint}</span> : null}
    </div>
  );
}

function ItemRow({ item, onPick }: { item: DrawerItem; onPick: (a: DrawerAction) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(item.action)}
      aria-label={`Add ${item.name}`}
      className="flex w-full items-center gap-2.5 rounded-lg border border-white/8 bg-black/25 px-2.5 py-2 text-left transition-colors hover:border-[#f2a43a]/40 hover:bg-white/5"
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[15px] leading-none"
        style={{ backgroundColor: `${item.color}1f`, color: item.color }}
      >
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-[#f0ece4]">{item.name}</span>
          {item.isNew && (
            <span className="shrink-0 rounded bg-[#f2a43a]/20 px-1 py-px font-mono text-[8px] uppercase tracking-wider text-[#f2a43a]">
              new
            </span>
          )}
        </span>
        <span className="block truncate text-[11px] leading-snug text-[#a89f91]">{item.sub}</span>
      </span>
    </button>
  );
}

/* ---------------- the drawer ---------------- */

// mounted-fresh every open, so CSS animations give the slide-in for free —
// no transition state, no setState-in-effect
const DRAWER_STYLES = `
  @keyframes idrawer-backdrop { from { opacity: 0 } to { opacity: 1 } }
  @keyframes idrawer-sheet { from { transform: translateX(-100%) } to { transform: translateX(0) } }
  @media (prefers-reduced-motion: reduce) {
    [data-idrawer-backdrop], [data-idrawer-sheet] { animation: none !important }
  }
`;

export function InstrumentDrawer({ open, onClose, tracks, onAction }: InstrumentDrawerProps): ReactNode {
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // close = X button, backdrop click or Escape — all clear the live search too
  const close = () => {
    setQ("");
    onClose();
  };

  // autofocus + Escape while open (no setState here — external systems only)
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasDrum = tracks.some((t) => t.kind === "drum");
  const hasBass = tracks.some(
    (t) => t.kind === "synth" && (t.bus === "bass" || /bass|sub|303|acid|reese/i.test(t.name)),
  );

  const pick = (action: DrawerAction) => {
    onAction(action);
    if (action.type === "drum") {
      void auditionDrum(action.sound);
    } else if (action.type === "patch") {
      const patch = SYNTH_PATCHES.find((p) => p.id === action.patch);
      if (patch) void auditionPatch(patch);
    }
    // "skazi" and "pads" have nothing meaningful to audition — no fake sounds
  };

  // SUGGESTED — exactly 4 contextual boxes when possible
  const suggested: DrawerItem[] = [];
  if (!hasDrum) {
    suggested.push({
      key: "sug-kick", icon: "◉", color: "#8fbf6b", name: "Kick", sub: "No drums yet",
      action: { type: "drum", sound: "kick" },
    });
  }
  if (!hasBass) {
    suggested.push({
      key: "sug-bass", icon: "◉", color: "#d97b5a", name: "Bass", sub: "No bass yet",
      action: { type: "patch", patch: "bass" },
    });
  }
  suggested.push(
    {
      key: "sug-bully", icon: "🌊", color: "#6bc5b8", name: "BULLY", sub: "Wavetable bass & leads", isNew: true,
      action: { type: "skazi", deviceId: "bully" },
    },
    {
      key: "sug-kube", icon: "🔷", color: "#c084fc", name: "KUBE", sub: "Morphing wavetable synth", isNew: true,
      action: { type: "skazi", deviceId: "kube" },
    },
  );
  for (const extra of SUGGESTED_EXTRAS) {
    if (suggested.length >= 4) break;
    suggested.push(extra);
  }

  const needle = q.trim().toLowerCase();
  const hit = (item: DrawerItem) =>
    needle === "" ||
    item.name.toLowerCase().includes(needle) ||
    item.sub.toLowerCase().includes(needle);

  const sections: DrawerSection[] = [
    { id: "suggested", title: "SUGGESTED", hint: "For this project", items: suggested.filter(hit) },
    { id: "start", title: "START WITH", hint: "The main instruments", items: START_WITH.filter(hit) },
    { id: "instruments", title: "INSTRUMENTS", items: PATCH_ITEMS.filter(hit) },
    { id: "drums", title: "DRUMS", hint: "One lane in the beat sequencer", items: DRUM_ITEMS.filter(hit) },
    { id: "samplers", title: "SAMPLERS", hint: "Your own audio", items: SAMPLERS.filter(hit) },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Add an instrument">
      <style>{DRAWER_STYLES}</style>
      <button
        type="button"
        onClick={close}
        aria-label="Close instrument picker"
        tabIndex={-1}
        data-idrawer-backdrop
        className="absolute inset-0 bg-black/60 animate-[idrawer-backdrop_0.2s_ease-out]"
      />
      <aside
        data-idrawer-sheet
        className="absolute left-0 top-0 flex h-full w-[300px] max-w-[85vw] flex-col border-r border-white/10 bg-[#0d0a08] shadow-2xl shadow-black/60 animate-[idrawer-sheet_0.22s_ease-out]"
      >
        {/* header */}
        <div className="flex shrink-0 items-start gap-2.5 border-b border-white/8 px-4 py-3.5">
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f2a43a]/15 text-[17px] font-bold leading-none text-[#f2a43a]"
          >
            +
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-[#f0ece4]">New channel</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-[#a89f91]">
              Pick what the new channel plays. You can change it later from the inspector.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/5 text-[12px] text-[#a89f91] hover:bg-white/10 hover:text-[#f0ece4]"
          >
            ✕
          </button>
        </div>

        {/* search */}
        <div className="shrink-0 px-3 pb-2 pt-3">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search — wavetable, 303, pad…"
            aria-label="Search instruments"
            className="w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2 text-[13px] text-[#f0ece4] outline-none placeholder:text-[#a89f91]/50 focus:border-[#f2a43a]/50"
          />
        </div>

        {/* sections */}
        <div className="studio-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-5 pt-1">
          {sections.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-[12px] text-[#a89f91]">
              No matches for <span className="text-[#f2a43a]">{q}</span>
            </div>
          )}
          {sections.map((section) => (
            <section key={section.id} aria-label={section.title}>
              <SectionHead title={section.title} hint={section.hint} />
              <div className="mt-1.5 space-y-1">
                {section.items.map((item) => (
                  <ItemRow key={item.key} item={item} onPick={pick} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
