/* ------------------------------------------------------------------ */
/*  Intellidaw — SKAZI Bundle devices                                  */
/*  All 19 free tools by Asher Swissa (github.com/slazoasher/          */
/*  skazi-bundle), recreated as native Web Audio devices.  Original    */
/*  implementation — no third-party code or assets are used.           */
/* ------------------------------------------------------------------ */

import { uid, type Note } from "./types";

/* ---------------- folders & kinds ---------------- */

export type SkaziFolder = "Synths" | "Basslines" | "Drums & FX" | "FX Rack" | "Intellidaw Extras";
export type SkaziKind = "synth" | "sequencer" | "kick" | "riser" | "generator" | "fx";

export interface SkaziParam {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  def: number;
  /** select-type param: numeric value indexes into options */
  options?: string[];
  fmt?: (v: number) => string;
  /** group params into two columns on wide screens */
  col?: 1 | 2;
}

export interface SkaziDevice {
  id: string;
  name: string;
  folder: SkaziFolder;
  kind: SkaziKind;
  tagline: string;
  desc: string;
  accent: string; // hex accent color
  params: SkaziParam[];
  presets?: Record<string, Record<string, number>>;
  presetsCount?: number;
  /** upstream folder in github.com/slazoasher/skazi-bundle (official devices) */
  repoPath?: string;
  /** full feature inventory mirrored from the upstream bundle */
  features?: string[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
/** normalized 0..1 → Hz (matches skaziCutoffHz mapping in skaziAudio) */
const hzN = (v: number) => hz(40 * Math.pow(300, v));
const semis = (v: number) => `${v > 0 ? "+" : ""}${v}st`;

/* wavetable names used by BULLY / KUBE (procedural, original) */
export const WT_NAMES = ["BASIC", "SAWX", "GROWL", "VOX", "HOLLOW", "METAL", "GLASS", "ACID"];

/* MIDI GOD vocab */
export const MIDI_GENRES = ["FULL-ON", "PROG PSY", "PSY-TECH", "TECH HOUSE", "DEEP HOUSE", "BASS HOUSE", "MEL techno", "HARD TECHNO", "TRANCE", "EDM"];
export const MIDI_ROLES = ["BASS", "ACID", "LEAD", "PLUCK", "ARP", "CHORDS", "PAD", "COUNTER", "DRUMS"];
export const ROOT_NAMES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
export const SCALE_NAMES = ["MINOR", "MAJOR", "PHRYGIAN", "DORIAN", "MINOR PENT"];

export const SCALES: Record<string, number[]> = {
  MINOR: [0, 2, 3, 5, 7, 8, 10],
  MAJOR: [0, 2, 4, 5, 7, 9, 11],
  PHRYGIAN: [0, 1, 3, 5, 7, 8, 10],
  DORIAN: [0, 2, 3, 5, 7, 9, 10],
  "MINOR PENT": [0, 3, 5, 7, 10],
};

const f = (
  id: string,
  label: string,
  min: number,
  max: number,
  def: number,
  extra: Partial<SkaziParam> = {}
): SkaziParam => ({ id, label, min, max, def, ...extra });

/* ---------------- device registry ---------------- */

export const SKAZI_DEVICES: SkaziDevice[] = [
  /* ============ SYNTHS ============ */
  {
    id: "skazi",
    name: "SKAZI",
    folder: "Synths",
    kind: "synth",
    tagline: "Psy / acid VA synth",
    desc: "Virus-style supersaw with analog drift, waveshaping, arpeggiator and big filter. The flagship lead machine.",
    accent: "#f2a43a",
    presetsCount: 3650,
    params: [
      f("unison", "UNISON", 1, 7, 5, { step: 1, fmt: (v) => `${v} vce` }),
      f("detune", "SPREAD", 0, 60, 22, { step: 1, fmt: (v) => `${v} ct` }),
      f("drift", "DRIFT", 0, 1, 0.35, { fmt: pct }),
      f("octave", "OCTAVE", -2, 2, 0, { step: 1, fmt: semis }),
      f("cutoff", "CUTOFF", 0.05, 1, 0.62, { fmt: hzN }),
      f("res", "RESO", 0, 18, 5, { step: 0.1 }),
      f("env", "ENV AMT", 0, 1, 0.45, { fmt: pct }),
      f("shape", "SHAPER", 0, 1, 0.3, { fmt: pct }),
      f("attack", "ATTACK", 0.001, 1.2, 0.01, { fmt: (v) => `${Math.round(v * 1000)}ms` }),
      f("decay", "DECAY", 0.02, 2, 0.3, { fmt: (v) => `${(v * 1000) | 0}ms` }),
      f("sustain", "SUSTAIN", 0, 1, 0.55, { fmt: pct }),
      f("release", "RELEASE", 0.02, 3, 0.4, { fmt: (v) => `${(v * 1000) | 0}ms` }),
      f("sub", "SUB", 0, 1, 0.25, { fmt: pct }),
      f("arp", "ARP", 0, 1, 0, { options: ["OFF", "UP", "DOWN", "UPDOWN", "RANDOM"], fmt: (v) => ["OFF", "UP", "DOWN", "UPDOWN", "RANDOM"][v | 0] }),
      f("rate", "ARP RATE", 0, 1, 0.5, { options: ["1/4", "1/8", "1/8T", "1/16", "1/32"], fmt: (v) => ["1/4", "1/8", "1/8T", "1/16", "1/32"][v | 0] }),
    ],
    presets: {
      "Psy Lead": { unison: 7, detune: 28, drift: 0.4, cutoff: 0.66, res: 6, env: 0.5, shape: 0.35, sustain: 0.6, release: 0.45, sub: 0.2, arp: 0 },
      "Acid Supersaw": { unison: 5, detune: 40, cutoff: 0.4, res: 14, env: 0.7, shape: 0.5, decay: 0.18, sustain: 0.2, arp: 1, rate: 1 },
      "Pluck": { unison: 3, detune: 14, cutoff: 0.55, res: 4, env: 0.8, decay: 0.12, sustain: 0.05, release: 0.15, sub: 0.15, arp: 0 },
      "Warm Pad": { unison: 5, detune: 18, drift: 0.6, cutoff: 0.45, res: 2, env: 0.25, attack: 0.6, sustain: 0.85, release: 1.4, sub: 0.3, arp: 0 },
      "Hypno Arp": { unison: 5, detune: 24, cutoff: 0.5, res: 9, env: 0.65, decay: 0.1, sustain: 0.1, arp: 1, rate: 3 },
    },
  },
  {
    id: "bully",
    name: "BULLY",
    folder: "Synths",
    kind: "synth",
    tagline: "3-osc wavetable synth",
    desc: "Three wavetable oscillators with warp, a zero-delay ladder-style filter, chaos modulation and a full FX character section.",
    accent: "#e5533d",
    presetsCount: 462,
    params: [
      f("table1", "OSC 1", 0, 7, 1, { step: 1, options: WT_NAMES, fmt: (v) => WT_NAMES[v | 0] }),
      f("table2", "OSC 2", 0, 7, 4, { step: 1, options: WT_NAMES, fmt: (v) => WT_NAMES[v | 0] }),
      f("mix12", "OSC MIX", 0, 1, 0.5, { fmt: pct }),
      f("oct2", "OSC 2 OCT", -2, 2, 0, { step: 1, fmt: semis }),
      f("warp", "WARP FM", 0, 1, 0.3, { fmt: pct }),
      f("chaos", "CHAOS", 0, 1, 0.15, { fmt: pct }),
      f("cutoff", "CUTOFF", 0.05, 1, 0.55, { fmt: hzN }),
      f("res", "RESO", 0, 20, 6, { step: 0.1 }),
      f("env", "ENV AMT", 0, 1, 0.5, { fmt: pct }),
      f("drive", "DRIVE", 0, 1, 0.25, { fmt: pct }),
      f("lfoRate", "LFO RATE", 0.1, 12, 2.2, { fmt: (v) => `${v.toFixed(1)}Hz` }),
      f("lfoAmt", "LFO AMT", 0, 1, 0.2, { fmt: pct }),
      f("attack", "ATTACK", 0.001, 1.2, 0.01, { fmt: (v) => `${Math.round(v * 1000)}ms` }),
      f("decay", "DECAY", 0.02, 2, 0.25, { fmt: (v) => `${(v * 1000) | 0}ms` }),
      f("sustain", "SUSTAIN", 0, 1, 0.5, { fmt: pct }),
      f("release", "RELEASE", 0.02, 3, 0.35, { fmt: (v) => `${(v * 1000) | 0}ms` }),
    ],
    presets: {
      "Growl Bass": { table1: 3, table2: 5, warp: 0.55, chaos: 0.3, cutoff: 0.4, res: 10, env: 0.7, drive: 0.45, lfoAmt: 0.35 },
      "Glass Keys": { table1: 7, table2: 6, mix12: 0.4, cutoff: 0.7, res: 3, env: 0.4, drive: 0.1, decay: 0.4, sustain: 0.3 },
      "Chaos Lead": { table1: 2, table2: 3, chaos: 0.7, cutoff: 0.65, res: 8, env: 0.6, drive: 0.35 },
      "Deep Warp": { table1: 4, table2: 1, oct2: -1, warp: 0.6, cutoff: 0.32, res: 6, drive: 0.4, sustain: 0.6 },
    },
  },
  {
    id: "kube",
    name: "KUBE",
    folder: "Synths",
    kind: "synth",
    tagline: "Psytrance wavetable synth",
    desc: "Growl and yoy tables, dual warp slots per oscillator, fat unison blending — the psytrance cube. Lime-on-black attitude.",
    accent: "#a3e635",
    presetsCount: 106,
    params: [
      f("table", "TABLE", 0, 7, 2, { step: 1, options: WT_NAMES, fmt: (v) => WT_NAMES[v | 0] }),
      f("unison", "UNISON", 1, 7, 6, { step: 1, fmt: (v) => `${v} vce` }),
      f("detune", "SPREAD", 0, 80, 34, { step: 1, fmt: (v) => `${v} ct` }),
      f("warpA", "WARP A", 0, 1, 0.35, { fmt: pct }),
      f("warpB", "WARP B", 0, 1, 0.2, { fmt: pct }),
      f("cutoff", "CUTOFF", 0.05, 1, 0.5, { fmt: hzN }),
      f("res", "RESO", 0, 20, 8, { step: 0.1 }),
      f("env", "ENV AMT", 0, 1, 0.55, { fmt: pct }),
      f("drive", "DRIVE", 0, 1, 0.3, { fmt: pct }),
      f("attack", "ATTACK", 0.001, 1.2, 0.01, { fmt: (v) => `${Math.round(v * 1000)}ms` }),
      f("decay", "DECAY", 0.02, 2, 0.22, { fmt: (v) => `${(v * 1000) | 0}ms` }),
      f("sustain", "SUSTAIN", 0, 1, 0.45, { fmt: pct }),
      f("release", "RELEASE", 0.02, 3, 0.3, { fmt: (v) => `${(v * 1000) | 0}ms` }),
    ],
    presets: {
      "Full-On Growl": { table: 2, unison: 6, warpA: 0.5, warpB: 0.35, cutoff: 0.5, res: 10, env: 0.6, drive: 0.4 },
      "Yoy Cube": { table: 3, unison: 7, detune: 50, cutoff: 0.55, res: 6, drive: 0.25 },
      "Night Stab": { table: 5, unison: 4, cutoff: 0.45, res: 12, decay: 0.14, sustain: 0.15, drive: 0.5 },
      "Kube Bass": { table: 1, unison: 3, detune: 12, cutoff: 0.3, res: 8, env: 0.7, drive: 0.45 },
    },
  },
  {
    id: "subich",
    name: "SUBICH",
    folder: "Synths",
    kind: "synth",
    tagline: "Bass + sub bass synth",
    desc: "Two oscillators over a dedicated sub layer, dual filters and drive — 1000 presets of low-end glue.",
    accent: "#d97b5a",
    presetsCount: 1000,
    params: [
      f("sub", "SUB LVL", 0, 1, 0.65, { fmt: pct }),
      f("saw", "SAW LVL", 0, 1, 0.5, { fmt: pct }),
      f("square", "SQR LVL", 0, 1, 0.2, { fmt: pct }),
      f("octave", "OCTAVE", -2, 1, -1, { step: 1, fmt: semis }),
      f("cutoff", "LP CUT", 0.05, 1, 0.32, { fmt: hzN }),
      f("res", "RESO", 0, 16, 5, { step: 0.1 }),
      f("hipass", "HP CUT", 0, 0.5, 0.02, { fmt: hzN }),
      f("drive", "DRIVE", 0, 1, 0.3, { fmt: pct }),
      f("glide", "GLIDE", 0, 1, 0.2, { fmt: (v) => `${Math.round(v * 180)}ms` }),
      f("attack", "ATTACK", 0.001, 0.5, 0.005, { fmt: (v) => `${Math.round(v * 1000)}ms` }),
      f("decay", "DECAY", 0.02, 1.5, 0.2, { fmt: (v) => `${(v * 1000) | 0}ms` }),
      f("sustain", "SUSTAIN", 0, 1, 0.5, { fmt: pct }),
      f("release", "RELEASE", 0.02, 2, 0.15, { fmt: (v) => `${(v * 1000) | 0}ms` }),
    ],
    presets: {
      "Pure Sub": { sub: 1, saw: 0, square: 0, cutoff: 0.4, drive: 0.15, glide: 0.1 },
      "Reese Sub": { sub: 0.4, saw: 0.8, square: 0.4, cutoff: 0.35, res: 8, drive: 0.4 },
      "Tech Bass": { sub: 0.5, saw: 0.6, cutoff: 0.28, res: 10, decay: 0.14, sustain: 0.3, drive: 0.5, glide: 0.35 },
      "Soft Long": { sub: 0.7, saw: 0.35, attack: 0.08, sustain: 0.8, release: 0.6, drive: 0.1 },
    },
  },

  /* ============ BASSLINES ============ */
  {
    id: "tbon303",
    name: "TBON 303",
    folder: "Basslines",
    kind: "sequencer",
    tagline: "Acid bass line synth",
    desc: "303-style diode-ladder filter with accent and slide, sub oscillator, 14 drive flavors and a 16-step sequencer with a pattern generator.",
    accent: "#8fbf6b",
    presetsCount: 544,
    params: [
      f("cutoff", "CUTOFF", 0.05, 1, 0.3, { fmt: hzN }),
      f("res", "RESO", 0, 22, 16, { step: 0.1 }),
      f("envAmt", "ENV MOD", 0, 1, 0.6, { fmt: pct }),
      f("decay", "DECAY", 0.02, 1.2, 0.22, { fmt: (v) => `${(v * 1000) | 0}ms` }),
      f("accent", "ACCENT", 0, 1, 0.7, { fmt: pct }),
      f("slide", "SLIDE", 0, 1, 0.35, { fmt: (v) => `${Math.round(v * 160)}ms` }),
      f("drive", "DRIVE", 0, 1, 0.35, { fmt: pct }),
      f("sub", "SUB", 0, 1, 0.3, { fmt: pct }),
      f("click", "CLICK", 0, 1, 0.2, { fmt: pct }),
      f("octave", "OCTAVE", -1, 1, 0, { step: 1, fmt: semis }),
    ],
    presets: {
      "Screaming 303": { cutoff: 0.28, res: 20, envAmt: 0.75, decay: 0.18, accent: 0.85, drive: 0.4 },
      "Deep Acid": { cutoff: 0.22, res: 12, envAmt: 0.5, decay: 0.3, accent: 0.5, sub: 0.45 },
      "Hard Floor": { cutoff: 0.35, res: 22, envAmt: 0.65, decay: 0.12, accent: 0.9, drive: 0.55, click: 0.4 },
    },
  },
  {
    id: "skacid",
    name: "SKACID",
    folder: "Basslines",
    kind: "sequencer",
    tagline: "Acid bassline · Special Edition",
    desc: "303 voice with selectable filter slopes, per-step chance and ratchets, MUTATE pattern evolution, drift and crunch distortion.",
    accent: "#c084fc",
    presetsCount: 129,
    params: [
      f("cutoff", "CUTOFF", 0.05, 1, 0.32, { fmt: hzN }),
      f("res", "RESO", 0, 22, 14, { step: 0.1 }),
      f("envAmt", "ENV MOD", 0, 1, 0.55, { fmt: pct }),
      f("decay", "DECAY", 0.02, 1.2, 0.2, { fmt: (v) => `${(v * 1000) | 0}ms` }),
      f("accent", "ACCENT", 0, 1, 0.7, { fmt: pct }),
      f("slide", "SLIDE", 0, 1, 0.4, { fmt: (v) => `${Math.round(v * 160)}ms` }),
      f("slope", "SLOPE", 0, 3, 0, { step: 1, options: ["24 dB", "18 dB", "12 dB", "BAND"], fmt: (v) => ["24 dB", "18 dB", "12 dB", "BAND"][v | 0] }),
      f("crunch", "CRUNCH", 0, 1, 0.4, { fmt: pct }),
      f("chance", "CHANCE", 0, 1, 0.85, { fmt: pct }),
      f("ratchet", "RATCHET", 0, 1, 0.2, { fmt: pct }),
      f("swing", "SWING", 0, 0.6, 0, { fmt: pct }),
      f("drift", "DRIFT", 0, 1, 0.15, { fmt: pct }),
    ],
    presets: {
      "Shigaon": { cutoff: 0.3, res: 18, envAmt: 0.6, chance: 0.9, ratchet: 0.3, crunch: 0.5, drift: 0.2 },
      "Clean Punch": { cutoff: 0.4, res: 10, crunch: 0.15, slope: 1, chance: 1, drift: 0.05 },
      "Band Pass Madness": { slope: 3, cutoff: 0.35, res: 20, envAmt: 0.7, chance: 0.7, ratchet: 0.45 },
    },
  },

  /* ============ DRUMS & FX ============ */
  {
    id: "kickass",
    name: "KICKASS",
    folder: "Drums & FX",
    kind: "kick",
    tagline: "Kick drum synth",
    desc: "Two-stage pitch engine — snap plus sweep — with hold, three-band EQ and a sample layer for your own kicks.",
    accent: "#f2a43a",
    presetsCount: 50,
    params: [
      f("snap", "SNAP", 0.2, 1, 0.62, { fmt: (v) => `${Math.round(40 + v * 200)}Hz` }),
      f("sweep", "SWEEP", 0.2, 1, 0.3, { fmt: (v) => `${Math.round(30 + v * 80)}Hz` }),
      f("hold", "HOLD", 0, 1, 0.25, { fmt: (v) => `${Math.round(v * 120)}ms` }),
      f("decay", "DECAY", 0.05, 1, 0.4, { fmt: (v) => `${(v * 700) | 0}ms` }),
      f("click", "CLICK", 0, 1, 0.4, { fmt: pct }),
      f("eqLo", "EQ LOW", 0, 1, 0.6, { fmt: (v) => `${((v - 0.5) * 24).toFixed(1)}dB` }),
      f("eqMid", "EQ MID", 0, 1, 0.5, { fmt: (v) => `${((v - 0.5) * 24).toFixed(1)}dB` }),
      f("eqHi", "EQ HI", 0, 1, 0.4, { fmt: (v) => `${((v - 0.5) * 24).toFixed(1)}dB` }),
      f("tune", "TUNE", -12, 12, 0, { step: 1, fmt: semis }),
    ],
    presets: {
      "Psy Punch": { snap: 0.72, sweep: 0.26, hold: 0.18, decay: 0.3, click: 0.5, eqLo: 0.7, eqMid: 0.45 },
      "Techno Hammer": { snap: 0.85, sweep: 0.24, hold: 0.3, decay: 0.45, click: 0.35, eqLo: 0.75 },
      "Lo-Fi Thump": { snap: 0.5, sweep: 0.4, decay: 0.6, click: 0.1, eqMid: 0.6, eqHi: 0.2 },
    },
  },
  {
    id: "bamba",
    name: "BAMBA",
    folder: "Drums & FX",
    kind: "riser",
    tagline: "Riser & uplift maker",
    desc: "Synth risers, noise sweeps, snare rolls and gated uplifts, 1–24 bars, pitch up to +6 octaves with its own curve.",
    accent: "#e5c15a",
    presetsCount: 260,
    params: [
      f("bars", "BARS", 1, 8, 2, { step: 1, fmt: (v) => `${v} bar${v > 1 ? "s" : ""}` }),
      f("oct", "PITCH RISE", 0, 6, 2, { step: 1, fmt: (v) => `+${v} oct` }),
      f("curve", "CURVE", 0, 1, 0.6, { fmt: (v) => (v < 0.33 ? "linear" : v < 0.66 ? "exp" : "super") }),
      f("type", "SOURCE", 0, 1, 0, { options: ["SYNTH", "NOISE", "COMBO"], fmt: (v) => ["SYNTH", "NOISE", "COMBO"][v | 0] }),
      f("roll", "SNARE ROLL", 0, 1, 1, { options: ["OFF", "ON"], fmt: (v) => (v > 0.5 ? "ON" : "OFF") }),
      f("rollRate", "ROLL RATE", 0, 1, 0.5, { options: ["1/4", "1/8", "1/16", "1/32", "ACCEL"], fmt: (v) => ["1/4", "1/8", "1/16", "1/32", "ACCEL"][v | 0] }),
      f("gate", "GATE FX", 0, 1, 0, { options: ["OFF", "1/8", "1/16"], fmt: (v) => ["OFF", "1/8", "1/16"][v | 0] }),
      f("bright", "BRIGHTNESS", 0, 1, 0.6, { fmt: pct }),
      f("impact", "IMPACT", 0, 1, 0.5, { fmt: pct }),
    ],
    presets: {
      "Uplift 2 Bar": { bars: 2, oct: 2, type: 2, roll: 1, rollRate: 2 },
      "Noise Sweep": { bars: 4, oct: 1, type: 1, roll: 0, bright: 0.8 },
      "Snare Roll Drop": { bars: 1, oct: 0, type: 1, roll: 1, rollRate: 4, impact: 0.9 },
    },
  },
  {
    id: "midigod",
    name: "MIDI GOD",
    folder: "Drums & FX",
    kind: "generator",
    tagline: "MIDI pattern generator",
    desc: "10 genres × 9 roles, key/scale/groove controls and a rolling-bass engine. Writes playable patterns straight into your tracks.",
    accent: "#8fbf6b",
    presetsCount: 126,
    params: [
      f("genre", "GENRE", 0, 9, 0, { step: 1, options: MIDI_GENRES, fmt: (v) => MIDI_GENRES[v | 0] }),
      f("role", "ROLE", 0, 8, 0, { step: 1, options: MIDI_ROLES, fmt: (v) => MIDI_ROLES[v | 0] }),
      f("root", "ROOT", 0, 11, 0, { step: 1, options: ROOT_NAMES, fmt: (v) => ROOT_NAMES[v | 0] }),
      f("scale", "SCALE", 0, 4, 0, { step: 1, options: SCALE_NAMES, fmt: (v) => SCALE_NAMES[v | 0] }),
      f("octave", "OCTAVE", -2, 2, 0, { step: 1, fmt: semis }),
      f("density", "DENSITY", 0.1, 1, 0.55, { fmt: pct }),
      f("groove", "GROOVE", 0, 1, 0.5, { fmt: (v) => (v < 0.33 ? "straight" : v < 0.66 ? "swing" : "push") }),
      f("rollBass", "ROLL BASS", 0, 1, 0, { options: ["OFF", "ON"], fmt: (v) => (v > 0.5 ? "ON" : "OFF") }),
      f("bars", "BARS", 1, 4, 1, { step: 1, fmt: (v) => `${v}` }),
    ],
  },

  /* ============ FX RACK ============ */
  {
    id: "pitapump",
    name: "PITA PUMP",
    folder: "FX Rack",
    kind: "fx",
    tagline: "Sidechain LFO tool",
    desc: "Classic sidechain pump without the compressor — tempo-synced ducking with depth and curve control.",
    accent: "#d97b5a",
    params: [
      f("rate", "RATE", 0, 3, 1, { step: 1, options: ["1/4", "1/8", "1/8T", "1/16"], fmt: (v) => ["1/4", "1/8", "1/8T", "1/16"][v | 0] }),
      f("depth", "DEPTH", 0, 1, 0.6, { fmt: pct }),
      f("curve", "CURVE", 0, 1, 0.5, { fmt: (v) => (v < 0.5 ? "sine" : "triangle") }),
    ],
  },
  {
    id: "shaksuka",
    name: "SHAKSUKA",
    folder: "FX Rack",
    kind: "fx",
    tagline: "Random chop & glitch FX",
    desc: "Throws dice on your audio — random chops, stutters, crush bursts and pitch flips in tempo.",
    accent: "#e5533d",
    params: [
      f("rate", "RATE", 0, 2, 1, { step: 1, options: ["1/8", "1/16", "1/32"], fmt: (v) => ["1/8", "1/16", "1/32"][v | 0] }),
      f("amount", "AMOUNT", 0, 1, 0.5, { fmt: pct }),
      f("chop", "CHOP", 0, 1, 0.7, { fmt: pct }),
      f("stutter", "STUTTER", 0, 1, 0.5, { fmt: pct }),
      f("crush", "CRUSH", 0, 1, 0.4, { fmt: pct }),
      f("pitch", "PITCH FLIP", 0, 1, 0.3, { fmt: pct }),
    ],
  },
  {
    id: "filterfish",
    name: "THE FILTERFISH",
    folder: "FX Rack",
    kind: "fx",
    tagline: "Morphing filter FX",
    desc: "Morphing filter with LFO and envelope, distortion and chorus — the fish that swims through frequencies.",
    accent: "#8fbf6b",
    presetsCount: 800,
    params: [
      f("morph", "MORPH", 0, 1, 0.25, { fmt: (v) => (v < 0.33 ? "LP" : v < 0.66 ? "BP" : "HP") }),
      f("freq", "FREQ", 0.05, 1, 0.45, { fmt: hzN }),
      f("res", "RESO", 0, 20, 6, { step: 0.1 }),
      f("lfoRate", "LFO SYNC", 0, 4, 2, { step: 1, options: ["1/1", "1/2", "1/4", "1/8", "1/16"], fmt: (v) => ["1/1", "1/2", "1/4", "1/8", "1/16"][v | 0] }),
      f("lfoAmt", "LFO AMT", 0, 1, 0.3, { fmt: pct }),
      f("drive", "DRIVE", 0, 1, 0.2, { fmt: pct }),
      f("chorus", "CHORUS", 0, 1, 0.3, { fmt: pct }),
      f("mix", "MIX", 0, 1, 1, { fmt: pct }),
    ],
  },
  {
    id: "tahini",
    name: "TAHINI",
    folder: "FX Rack",
    kind: "fx",
    tagline: "Space delay + reverb",
    desc: "Seven delay flavors with resonant filters and drive inside the echo loop, pitch on the repeats and a ducking reverb.",
    accent: "#e5c15a",
    presetsCount: 250,
    params: [
      f("mode", "MODE", 0, 6, 0, { step: 1, options: ["PING-PONG", "STEREO", "TAPE", "DIGITAL", "BBD", "MULTI-TAP", "DUAL"], fmt: (v) => ["PING-PONG", "STEREO", "TAPE", "DIGITAL", "BBD", "MULTI-TAP", "DUAL"][v | 0] }),
      f("time", "TIME", 0, 4, 1, { step: 1, options: ["1/4", "1/8", "1/8.", "1/16", "1/16."], fmt: (v) => ["1/4", "1/8", "1/8.", "1/16", "1/16."][v | 0] }),
      f("feedback", "FEEDBACK", 0, 0.95, 0.4, { fmt: pct }),
      f("tone", "TONE", 0.2, 1, 0.7, { fmt: hzN }),
      f("drive", "LOOP DRIVE", 0, 1, 0.25, { fmt: pct }),
      f("wobble", "TAPE WOBBLE", 0, 1, 0.15, { fmt: pct }),
      f("pitch", "PITCH ECHO", 0, 1, 0, { fmt: (v) => `${Math.round((v - 0.5) * 24)} st` }),
      f("mix", "MIX", 0, 1, 0.35, { fmt: pct }),
    ],
  },
  {
    id: "salat",
    name: "SALAT",
    folder: "FX Rack",
    kind: "fx",
    tagline: "Glitch multi-FX",
    desc: "Tempo-synced chopper with stutter, reverse, gate and tape-stop, plus drive, crush, ring mod and MAKE A SALAT randomizer.",
    accent: "#a3e635",
    presetsCount: 104,
    params: [
      f("rate", "CHOP RATE", 0, 1, 1, { options: ["1/8", "1/16", "1/32"], fmt: (v) => ["1/8", "1/16", "1/32"][v | 0] }),
      f("amount", "AMOUNT", 0, 1, 0.6, { fmt: pct }),
      f("reverse", "REVERSE", 0, 1, 0.4, { fmt: pct }),
      f("tapeStop", "TAPE STOP", 0, 1, 0.3, { fmt: pct }),
      f("drive", "DRIVE", 0, 1, 0.2, { fmt: pct }),
      f("crush", "CRUSH", 0, 1, 0.2, { fmt: pct }),
      f("ring", "RING MOD", 0, 1, 0, { fmt: pct }),
      f("filter", "FILTER LFO", 0, 1, 0.3, { fmt: pct }),
    ],
  },
  {
    id: "quazi",
    name: "QUAZI",
    folder: "FX Rack",
    kind: "fx",
    tagline: "4-band distortion",
    desc: "Linkwitz-Riley crossover with draggable splits — SOFT / HARD / FUZZ / TUBE drive per band, mono bass and post EQ.",
    accent: "#c084fc",
    presetsCount: 104,
    params: [
      f("split1", "SPLIT LO", 0.05, 0.5, 0.15, { fmt: hzN }),
      f("split2", "SPLIT MID", 0.3, 0.8, 0.55, { fmt: hzN }),
      f("d1", "SUB DRIVE", 0, 1, 0.2, { fmt: pct }),
      f("d2", "LOW DRIVE", 0, 1, 0.35, { fmt: pct }),
      f("d3", "MID DRIVE", 0, 1, 0.35, { fmt: pct }),
      f("d4", "HI DRIVE", 0, 1, 0.25, { fmt: pct }),
      f("type", "CHARACTER", 0, 3, 1, { step: 1, options: ["SOFT", "HARD", "FUZZ", "TUBE"], fmt: (v) => ["SOFT", "HARD", "FUZZ", "TUBE"][v | 0] }),
      f("monoBass", "MONO BASS", 0, 1, 1, { options: ["OFF", "ON"], fmt: (v) => (v > 0.5 ? "ON" : "OFF") }),
      f("eq", "POST EQ", 0, 1, 0.5, { fmt: (v) => `${((v - 0.5) * 12).toFixed(1)}dB` }),
    ],
  },
  {
    id: "skilter",
    name: "SKILTER",
    folder: "FX Rack",
    kind: "fx",
    tagline: "Morphing multimode filter",
    desc: "LP→BP→HP→NOTCH morph, self-oscillating resonance, 16-step BPM-synced sequencer and tube/tape drive.",
    accent: "#f2a43a",
    presetsCount: 150,
    params: [
      f("mode", "MODE", 0, 3, 0, { step: 1, options: ["LP", "BP", "HP", "NOTCH"], fmt: (v) => ["LP", "BP", "HP", "NOTCH"][v | 0] }),
      f("freq", "FREQ", 0.05, 1, 0.4, { fmt: hzN }),
      f("res", "RESO", 0, 24, 10, { step: 0.1 }),
      f("slope", "SLOPE", 0, 2, 1, { step: 1, options: ["12 dB", "24 dB", "48 dB"], fmt: (v) => ["12 dB", "24 dB", "48 dB"][v | 0] }),
      f("seq", "SEQ", 0, 1, 1, { options: ["OFF", "ON"], fmt: (v) => (v > 0.5 ? "ON" : "OFF") }),
      f("rate", "SEQ RATE", 0, 1, 1, { options: ["1/8", "1/16", "1/32"], fmt: (v) => ["1/8", "1/16", "1/32"][v | 0] }),
      f("seqAmt", "SEQ AMT", 0, 1, 0.5, { fmt: pct }),
      f("drive", "DRIVE", 0, 1, 0.2, { fmt: pct }),
      f("mix", "MIX", 0, 1, 1, { fmt: pct }),
    ],
  },
  {
    id: "skwide",
    name: "SKWIDE",
    folder: "FX Rack",
    kind: "fx",
    tagline: "Phase-safe stereo imager",
    desc: "Width 0–200% that never cancels in mono, allpass mono spread, psychoacoustic depth and a Haas super-wide mode.",
    accent: "#67e8f9",
    presetsCount: 70,
    params: [
      f("width", "WIDTH", 0, 2, 1.4, { fmt: (v) => `${Math.round(v * 100)}%` }),
      f("monoSpread", "MONO SPREAD", 0, 1, 0.3, { fmt: (v) => `${Math.round(v * 10)} stg` }),
      f("phase", "PHASE", 0, 1, 0.5, { fmt: (v) => `${Math.round((v - 0.5) * 40)}°` }),
      f("depth", "DEPTH", 0, 1, 0.4, { fmt: (v) => (v < 0.33 ? "far" : v < 0.66 ? "mid" : "near") }),
      f("lowBypass", "LOW BYPASS", 0, 1, 0.35, { fmt: hzN }),
      f("superWide", "SUPER WIDE", 0, 1, 0, { fmt: (v) => `${(v * 30).toFixed(0)}ms` }),
      f("mono", "MONO", 0, 1, 0, { options: ["OFF", "ON"], fmt: (v) => (v > 0.5 ? "ON" : "OFF") }),
    ],
  },
  {
    id: "zhug",
    name: "ZHUG",
    folder: "FX Rack",
    kind: "fx",
    tagline: "Saturator + widener",
    desc: "4x-style oversampled multiband saturation with stereo widening — hot sauce for the master bus.",
    accent: "#e5c15a",
    params: [
      f("drive", "DRIVE", 0, 1, 0.35, { fmt: pct }),
      f("tone", "TONE", 0, 1, 0.5, { fmt: pct }),
      f("width", "WIDTH", 0, 2, 1.2, { fmt: (v) => `${Math.round(v * 100)}%` }),
      f("mix", "MIX", 0, 1, 0.6, { fmt: pct }),
    ],
  },
  {
    id: "skverb",
    name: "SKAZI REVERB",
    folder: "FX Rack",
    kind: "fx",
    tagline: "Mega reverb machine",
    desc: "Ten algorithms — hall, plate, room, chamber, cathedral, spring, shimmer, reverse, gated, blackhole — with freeze, duck and tail filter.",
    accent: "#fbbf24",
    presetsCount: 75,
    params: [
      f("algo", "ALGO", 0, 9, 0, { step: 1, options: ["HALL", "PLATE", "ROOM", "CHAMBER", "CATHEDRAL", "SPRING", "SHIMMER", "REVERSE", "GATED", "BLACKHOLE"], fmt: (v) => ["HALL", "PLATE", "ROOM", "CHAMBER", "CATHEDRAL", "SPRING", "SHIMMER", "REVERSE", "GATED", "BLACKHOLE"][v | 0] }),
      f("size", "SIZE", 0.2, 1, 0.6, { fmt: pct }),
      f("decay", "DECAY", 0.1, 1, 0.5, { fmt: (v) => `${(0.3 + v * 5.7).toFixed(1)}s` }),
      f("preDelay", "PRE-DELAY", 0, 1, 0.25, { fmt: (v) => `${Math.round(v * 120)}ms` }),
      f("duck", "DUCK", 0, 1, 0.2, { fmt: pct }),
      f("tailLp", "TAIL LP", 0.3, 1, 0.8, { fmt: hzN }),
      f("width", "WIDTH", 0, 1, 0.8, { fmt: pct }),
      f("mix", "MIX", 0, 1, 0.3, { fmt: pct }),
    ],
  },
];

/* ---------------- Intellidaw extras (original devices) ---------------- */

const extras: SkaziDevice[] = [
  {
    id: "limonana",
    name: "LIMONANA",
    folder: "Intellidaw Extras",
    kind: "synth",
    tagline: "Iced-mint dream pad",
    desc: "Intellidaw original — a frosty detuned pad with a slow breeze filter and airy shimmer. Made for long psy breakdowns.",
    accent: "#7fd4c1",
    params: [
      f("voices", "VOICES", 1, 5, 3, { step: 1, fmt: (v) => `${v} vce` }),
      f("spread", "SPREAD", 0, 40, 14, { step: 1, fmt: (v) => `${v} ct` }),
      f("octave", "OCTAVE", -2, 2, 0, { step: 1, fmt: semis }),
      f("cutoff", "CUTOFF", 0.05, 1, 0.5, { fmt: hzN }),
      f("res", "RESO", 0, 14, 2, { step: 0.1 }),
      f("breeze", "BREEZE LFO", 0, 1, 0.4, { fmt: pct }),
      f("breezeRate", "LFO RATE", 0.05, 2, 0.22, { fmt: (v) => `${v.toFixed(2)}Hz` }),
      f("shimmer", "SHIMMER", 0, 1, 0.3, { fmt: pct }),
      f("attack", "ATTACK", 0.01, 3, 0.7, { fmt: (v) => `${(v * 1000) | 0}ms` }),
      f("sustain", "SUSTAIN", 0, 1, 0.8, { fmt: pct }),
      f("release", "RELEASE", 0.05, 4, 1.8, { fmt: (v) => `${(v * 1000) | 0}ms` }),
    ],
    presets: {
      "Mint Breakdown": { voices: 4, spread: 18, cutoff: 0.52, breeze: 0.5, shimmer: 0.35, attack: 0.9, release: 2.2 },
      "Ice Pluck": { voices: 2, spread: 8, cutoff: 0.6, breeze: 0.2, shimmer: 0.5, attack: 0.005, sustain: 0.05, release: 0.3 },
      "Frosty Cloud": { voices: 5, spread: 26, cutoff: 0.4, breeze: 0.7, breezeRate: 0.12, shimmer: 0.25, attack: 1.6, release: 3.2 },
    },
  },
  {
    id: "sabich",
    name: "SABICH",
    folder: "Intellidaw Extras",
    kind: "synth",
    tagline: "Lo-fi crunch keys",
    desc: "Intellidaw original — crushed lo-fi keys with a wobbly filter and a warm drive. Street-food grit for your loops.",
    accent: "#d99a5b",
    params: [
      f("table", "TABLE", 0, 7, 6, { step: 1, options: WT_NAMES, fmt: (v) => WT_NAMES[v | 0] }),
      f("crush", "CRUSH", 0, 1, 0.55, { fmt: pct }),
      f("drive", "DRIVE", 0, 1, 0.35, { fmt: pct }),
      f("octave", "OCTAVE", -2, 2, 0, { step: 1, fmt: semis }),
      f("cutoff", "CUTOFF", 0.05, 1, 0.42, { fmt: hzN }),
      f("res", "RESO", 0, 18, 7, { step: 0.1 }),
      f("wobbleRate", "WOBBLE", 0.1, 12, 3.2, { fmt: (v) => `${v.toFixed(1)}Hz` }),
      f("wobbleAmt", "WOBBLE AMT", 0, 1, 0.35, { fmt: pct }),
      f("decay", "DECAY", 0.02, 2, 0.24, { fmt: (v) => `${(v * 1000) | 0}ms` }),
      f("sustain", "SUSTAIN", 0, 1, 0.25, { fmt: pct }),
      f("release", "RELEASE", 0.02, 2, 0.25, { fmt: (v) => `${(v * 1000) | 0}ms` }),
    ],
    presets: {
      "Pita Crunch": { table: 6, crush: 0.6, drive: 0.4, cutoff: 0.4, wobbleAmt: 0.3, decay: 0.2 },
      "Deep Fry": { table: 2, crush: 0.85, drive: 0.7, cutoff: 0.3, res: 12, wobbleRate: 6, wobbleAmt: 0.5 },
      "Eggplant keys": { table: 3, crush: 0.35, drive: 0.2, cutoff: 0.55, decay: 0.5, sustain: 0.5 },
    },
  },
  {
    id: "malabi",
    name: "MALABI",
    folder: "Intellidaw Extras",
    kind: "kick",
    tagline: "Creamy boom drum",
    desc: "Intellidaw original — a silky long-tail boom with a soft cream drive. The dessert your low end deserves.",
    accent: "#e8b7c8",
    params: [
      f("boom", "BOOM", 0.15, 0.8, 0.34, { fmt: (v) => `${Math.round(28 + v * 90)}Hz` }),
      f("drop", "DROP", 0, 1, 0.55, { fmt: (v) => `×${(1 + v * 2.4).toFixed(1)}` }),
      f("decay", "DECAY", 0.1, 1.2, 0.55, { fmt: (v) => `${(v * 1100) | 0}ms` }),
      f("click", "CLICK", 0, 1, 0.15, { fmt: pct }),
      f("cream", "CREAM", 0, 1, 0.4, { fmt: pct }),
      f("tune", "TUNE", -12, 12, 0, { step: 1, fmt: semis }),
    ],
    presets: {
      "Silky Boom": { boom: 0.3, drop: 0.5, decay: 0.65, cream: 0.45, click: 0.1 },
      "Dessert Punch": { boom: 0.42, drop: 0.75, decay: 0.35, cream: 0.6, click: 0.35 },
      "Night Sub": { boom: 0.2, drop: 0.4, decay: 0.95, cream: 0.25, click: 0.05 },
    },
  },
];

SKAZI_DEVICES.push(...extras);

/* ------------------------------------------------------------------ */
/*  Upstream repo inventory — every official device mapped to its      */
/*  folder in github.com/slazoasher/skazi-bundle, with the full        */
/*  feature list from the bundle manifest. Our Web Audio ports aim     */
/*  to cover this whole list, device by device.                        */
/* ------------------------------------------------------------------ */

export const SKAZI_REPO_URL = "https://github.com/slazoasher/skazi-bundle";

const REPO_INFO: Record<string, { path: string; features: string[] }> = {
  skazi: {
    path: "SKAZI-Synth",
    features: [
      "Virus-style supersaw unison + analog drift",
      "Wavetables — load your own WAV",
      "FOLD / PWM / ASYM shaping",
      "Arpeggiator + step sequencer with per-step locks",
      "10 distortion types",
      "Full FX rack with FX filter + bass-mono width",
      "PERFORM page: 4 macros, A/B morph, kick duck, voice cards",
      "RANDOM rolls every section",
      "3,650 presets",
    ],
  },
  bully: {
    path: "Bully",
    features: [
      "3 oscillators with dual warp",
      "2 filters",
      "10 LFOs + chaos modulation",
      "Mod matrix",
      "FX rack + arpeggiator",
      "Analog character: drift, saturation, boost, spread",
      "SHARP-24 zero-delay-feedback ladder filter",
      "462 presets",
    ],
  },
  kube: {
    path: "Kube",
    features: [
      "24 KUBE-only wavetables (growl, yoy…)",
      "Serum .wav wavetable import (drag & drop)",
      "2 warp slots per osc: sync, bend, PWM, asym, mirror, flip, quantize, FM/AM/RM",
      "16-voice unison with blend",
      "Lime-on-black skin",
      "106 presets",
    ],
  },
  subich: {
    path: "Subich",
    features: [
      "2 oscillators + dedicated sub",
      "2 filters + 2 LFOs",
      "Mod wheels",
      "1,000 presets",
    ],
  },
  tbon303: {
    path: "TBON303",
    features: [
      "303-style diode-ladder filter, self-oscillating at the top",
      "Accent + slide",
      "Sub oscillator",
      "14 drive types",
      "Circuit mods",
      "Chorus / delay / reverb / widener",
      "16-step sequencer with pattern generator",
      "544 presets incl. 32 HARD ACID",
    ],
  },
  skacid: {
    path: "Skacid",
    features: [
      "303 voice with 24/18/12 dB + band filters",
      "Accent + slide",
      "16-step sequencer with chance, MUTATE, ratchet, swing, drift",
      "SEQ / ARP / MIDI play modes",
      "CRUNCH / FUZZ / FOLD / RECTIFY / CRUSH distortion",
      "OTT + ping-pong delay + reverb",
      "129 presets",
    ],
  },
  kickass: {
    path: "Kickass",
    features: [
      "Two-stage pitch: snap + sweep",
      "Hold / decay envelope",
      "3-band EQ",
      "Sample layer with a browser for your own kicks",
      "Key track",
      "50 presets",
    ],
  },
  bamba: {
    path: "Bamba",
    features: [
      "Synth risers + uplift maker",
      "Sample layer: riser/uplift sounds, short/long, stretch to bars",
      "Snare rolls + gated uplifts, quantized 1/2…1/128 with automatable RATE",
      "Mixer with FX sends",
      "Pitch up to +6 octaves with its own curve",
      "1…24 bars",
      "260 presets with impacts & FX section",
    ],
  },
  midigod: {
    path: "MidiGod",
    features: [
      "10 genres × 9 roles pattern generator",
      "Key / scale / groove controls",
      "ROLL BASS engine: styles, syncopation, kick avoid, octave jump, pitch dip, glide, groove, variation, evolve, mutate",
      "Drag the loop into the DAW as MIDI",
      "Audio-to-MIDI: melody, bass, drums, chords — follows glides",
      "126 presets",
    ],
  },
  pitapump: {
    path: "PitaPump",
    features: [
      "Sidechain LFO tool",
      "Pumping curves synced to the beat",
    ],
  },
  shaksuka: {
    path: "Shaksuka",
    features: ["Random chop & glitch FX", "Tempo-synced chopping"],
  },
  filterfish: {
    path: "FilterFish",
    features: [
      "Morphing filter with LFO + envelope",
      "Distortion + glitch",
      "Chorus + flanger",
      "Tempo-synced delay",
      "Reverb: 11 types incl. SKAZI REVERB halls — hall, plate, room, chamber, cathedral, spring, shimmer, reverse, gated, blackhole",
      "Decay + pre-delay, inflator, ON/OFF",
      "800 presets",
    ],
  },
  tahini: {
    path: "Tahini",
    features: [
      "7 delay types: ping-pong, stereo, tape, digital, BBD, multi-tap, dual",
      "Resonant low/high cut",
      "Tape / tube / fuzz / crush drive inside the echo loop",
      "Pitch on the repeats ±24 st + shimmer blend",
      "Reverse + tape stops",
      "Reverb with duck and freeze",
      "250 presets",
    ],
  },
  salat: {
    path: "Salat",
    features: [
      "Tempo-synced chopper: stutter, reverse, gate, tape stop, hold",
      "Drive + crush",
      "Resonant filter with synced LFO",
      "Ring mod",
      "Flanger / chorus",
      "Ping-pong delay + reverb",
      "MAKE A SALAT randomizer",
      "104 presets",
    ],
  },
  quazi: {
    path: "Quazi",
    features: [
      "4-band distortion on a Linkwitz-Riley crossover with draggable splits",
      "SOFT / HARD / FUZZ / TUBE per band at 4x oversampling",
      "Phase-matched dry/wet mix",
      "Stereo width with MONO BASS",
      "3-band post EQ (low shelf, bell, high shelf)",
      "104 presets",
    ],
  },
  skilter: {
    path: "Skilter",
    features: [
      "LP → BP → HP → notch morph",
      "12-48 dB slopes, self-oscillating resonance",
      "LFO + envelope follower",
      "16-step BPM-synced sequencer",
      "Tube / tape / hard drive, pre or post",
      "Macro knob, 1x/2x/4x oversampling",
      "Stereo / Mid-Side / Dual L-R",
      "Live spectrum + scope, RANDOM",
      "150 presets",
    ],
  },
  skwide: {
    path: "Skwide",
    features: [
      "Width 0-200% that never cancels in mono",
      "10-stage allpass MONO SPREAD",
      "PHASE wheel with drift",
      "Psychoacoustic DEPTH (near/far)",
      "LR4 LOW BYPASS + MONO BASS",
      "Haas SUPER WIDE 0-30 ms with MONO SAFE",
      "Wet/dry MIX + frequency imager",
      "Lissajous/polar scope with correlation readout",
      "70 presets",
    ],
  },
  zhug: {
    path: "Zhug",
    features: [
      "Saturator + widener",
      "4x oversampled",
      "Multiband",
    ],
  },
  skverb: {
    path: "Skverb",
    features: [
      "10 algorithms: hall, plate, room, chamber, cathedral, spring, shimmer, reverse, gated, blackhole",
      "8-line FDN engine",
      "Pre-delay with echo FEEDBACK + tempo SYNC",
      "FREEZE + DUCK + DRIVE",
      "Shimmer pitch loop in any mode",
      "REVERSE layer",
      "Resonant TAIL FILTER: LP/BP/HP with envelope sweep",
      "Width",
      "75 presets",
    ],
  },
};

SKAZI_DEVICES.forEach((d) => {
  const info = REPO_INFO[d.id];
  if (info) {
    d.repoPath = info.path;
    d.features = info.features;
  }
});

/* ---------------- helpers ---------------- */

export const deviceById = (id: string) => SKAZI_DEVICES.find((d) => d.id === id);
export const devicesInFolder = (folder: SkaziFolder) => SKAZI_DEVICES.filter((d) => d.folder === folder);
export const SKAZI_FOLDERS: SkaziFolder[] = ["Synths", "Basslines", "Drums & FX", "FX Rack", "Intellidaw Extras"];

/** original Intellidaw devices, not part of the SKAZI bundle */
export const isExtraDevice = (d: SkaziDevice) => d.folder === "Intellidaw Extras";

/* -------- deep-link support (landing → studio device) -------- */
let pendingDeviceSelect: string | null = null;
export const requestDeviceSelect = (id: string) => {
  pendingDeviceSelect = id;
};
export const peekDeviceSelect = () => pendingDeviceSelect;
export const consumeDeviceSelect = () => {
  const v = pendingDeviceSelect;
  pendingDeviceSelect = null;
  return v;
};

export function defaultParams(d: SkaziDevice): Record<string, number> {
  const o: Record<string, number> = {};
  d.params.forEach((p) => (o[p.id] = p.def));
  return o;
}

/* ---------------- MIDI GOD pattern generator ---------------- */

export interface GeneratedPattern {
  notes: Note[]; // for synth roles
  steps?: boolean[]; // for drums role (16 * bars)
  rootPitch: number;
}

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
const chance = (p: number) => Math.random() < p;

function scalePitch(root: number, scale: number[], degree: number, octave: number): number {
  // degree may be negative or beyond scale length
  const oct = Math.floor(degree / scale.length);
  const idx = ((degree % scale.length) + scale.length) % scale.length;
  return root + scale[idx] + (oct + octave) * 12;
}

/** rhythm densities per role in steps (0..15). Original patterns. */
export function generatePattern(
  genre: number,
  role: number,
  rootPc: number,
  scaleIdx: number,
  octave: number,
  density: number,
  groove: number,
  rollBass: boolean,
  bars: number
): GeneratedPattern {
  const scale = SCALES[SCALE_NAMES[scaleIdx]] ?? SCALES.MINOR;
  const root = 36 + rootPc + octave * 12; // C2-based root
  const role_ = MIDI_ROLES[role];
  const notes: Note[] = [];
  let steps: boolean[] | undefined;

  const mk = (step: number, len: number, pitch: number, vel = 0.9) =>
    notes.push({ id: `mg_${uid()}`, step, len, pitch, vel });

  const totalSteps = 16 * bars;

  if (role_ === "DRUMS") {
    steps = new Array(totalSteps).fill(false);
    const kickPat = [0, 4, 8, 12];
    const kick4 = genre >= 3 && genre <= 8; // house/techno/trance/edm four-on-floor
    for (let b = 0; b < bars; b++) {
      const off = b * 16;
      if (kick4) kickPat.forEach((s) => (steps![off + s] = true));
      else [0, 7, 10].forEach((s) => (steps![off + s] = true));
      if (chance(0.8 * density)) steps[off + 14] = true; // ghost
    }
    return { notes, steps, rootPitch: root };
  }

  if (role_ === "BASS" || role_ === "ACID") {
    // offbeat / rolling patterns
    const patterns: number[][] =
      genre <= 2
        ? [[0, 2, 3, 6, 8, 10, 11, 14], [0, 3, 6, 8, 11, 14], [2, 6, 10, 14, 0, 8, 4, 12]]
        : [[0, 2, 4, 6, 8, 10, 12, 14], [0, 3, 4, 7, 8, 11, 12, 15], [2, 4, 6, 8, 10, 12, 14, 15]];
    const pat = pick(patterns);
    const degs = [0, 0, 0, 2, 4, -2, 5, 7];
    let lastDeg = 0;
    for (let s = 0; s < totalSteps; s++) {
      const step = s % 16;
      const on = pat.includes(step) && chance(0.55 + density * 0.45);
      if (!on) continue;
      let deg = lastDeg;
      if (chance(0.55)) deg = pick(degs);
      if (rollBass && chance(0.3)) {
        // rolling bass: quick octave-jump 16ths
        for (let r = 0; r < 2; r++) {
          mk(s + r, 1, scalePitch(root, scale, deg, r % 2), 0.8);
        }
        s += 1;
      } else {
        mk(s, chance(0.2) ? 2 : 1, scalePitch(root, scale, deg, 0), role_ === "ACID" ? 0.85 : 0.95);
      }
      lastDeg = deg;
    }
  } else if (role_ === "LEAD" || role_ === "COUNTER") {
    const rhythm = [1, 2, 1, 1, 2, 1, 3, 1];
    let s = 0;
    const octShift = role_ === "LEAD" ? 3 : 2;
    while (s < totalSteps) {
      const len = pick(rhythm);
      if (chance(density)) {
        const deg = pick([0, 2, 4, 5, 7, 4, 2, 7, 9]);
        mk(s, len, scalePitch(root, scale, deg, octShift), 0.75);
        if (role_ === "LEAD" && chance(0.3)) mk(s, len, scalePitch(root, scale, deg + 2, octShift), 0.5);
      }
      s += len;
    }
  } else if (role_ === "PLUCK" || role_ === "ARP") {
    const degs = [0, 2, 4, 7, 4, 2];
    for (let s = 0; s < totalSteps; s++) {
      const rate = density > 0.66 ? 1 : density > 0.33 ? 2 : 4;
      if (s % rate !== 0) continue;
      const deg = degs[(s / rate) % degs.length];
      mk(s, 1, scalePitch(root, scale, deg, role_ === "ARP" ? 3 : 2), 0.7);
    }
  } else if (role_ === "CHORDS") {
    const progs = [[0, 5, 3, 4], [0, 3, 4, 3], [0, 4, 5, 2]];
    const prog = pick(progs);
    for (let b = 0; b < bars; b++) {
      const deg = prog[b % prog.length];
      const off = b * 16;
      [0, 2, 4].forEach((iv) => mk(off + (groove > 0.66 ? 6 : 0), 6, scalePitch(root, scale, deg + iv, 2), 0.55));
      if (chance(0.6)) [0, 2, 4].forEach((iv) => mk(off + 10, 4, scalePitch(root, scale, deg + iv, 2), 0.45));
    }
  } else {
    // PAD
    const progs = [[0, 5], [0, 3], [0, 4]];
    const prog = pick(progs);
    for (let b = 0; b < bars; b++) {
      const deg = prog[b % prog.length];
      [0, 2, 4, 6].forEach((iv) => mk(b * 16, 16, scalePitch(root, scale, deg + iv, 1), 0.45));
    }
  }

  return { notes, steps, rootPitch: root };
}

/* ---------------- persistent store ---------------- */

export interface SkaziState {
  instruments: Record<string, Record<string, number>>;
  fx: Record<string, { enabled: boolean; params: Record<string, number> }>;
  seq: Record<string, SeqPattern>;
  godSeed: number;
  favorites: string[];
}

export interface SeqStep {
  on: boolean;
  oct: number; // -1 | 0 | 1
  accent: boolean;
  slide: boolean;
}
export type SeqPattern = SeqStep[];

export function emptySeq(): SeqPattern {
  return Array.from({ length: 16 }, () => ({ on: false, oct: 0, accent: false, slide: false }));
}

export function defaultSeq(id: string): SeqPattern {
  const seq = emptySeq();
  const set = (i: number, oct = 0, accent = false, slide = false) => {
    seq[i] = { on: true, oct, accent, slide };
  };
  if (id === "tbon303") {
    [0, 3, 6, 8, 11, 14].forEach((i) => set(i, 0, i % 4 === 0, i === 5 || i === 13));
    set(2, 1, false, true);
    set(9, 1);
  } else if (id === "skacid") {
    [0, 2, 4, 7, 9, 12, 15].forEach((i) => set(i, 0, i % 4 === 0));
    set(5, 1, false, true);
    set(11, -1);
  }
  return seq;
}

const LS_KEY = "intellidaw.skazi.v1";

function initialState(): SkaziState {
  const instruments: Record<string, Record<string, number>> = {};
  const fx: SkaziState["fx"] = {};
  for (const d of SKAZI_DEVICES) {
    if (d.kind === "fx") fx[d.id] = { enabled: false, params: defaultParams(d) };
    else instruments[d.id] = defaultParams(d);
  }
  return {
    instruments,
    fx,
    seq: { tbon303: defaultSeq("tbon303"), skacid: defaultSeq("skacid") },
    godSeed: 1,
    favorites: ["skazi", "subich"],
  };
}

function loadState(): SkaziState {
  const base = initialState();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<SkaziState>;
    // merge shallowly but keep new devices working
    for (const [id, params] of Object.entries(saved.instruments ?? {})) {
      if (base.instruments[id]) base.instruments[id] = { ...base.instruments[id], ...params };
    }
    for (const [id, fxState] of Object.entries(saved.fx ?? {})) {
      if (base.fx[id]) base.fx[id] = { ...base.fx[id], ...fxState, params: { ...base.fx[id].params, ...fxState.params } };
    }
    for (const id of ["tbon303", "skacid"]) {
      const s = saved.seq?.[id];
      if (Array.isArray(s) && s.length === 16) base.seq[id] = s;
    }
    if (typeof saved.godSeed === "number") base.godSeed = saved.godSeed;
    if (Array.isArray(saved.favorites)) {
      base.favorites = saved.favorites.filter((id) => SKAZI_DEVICES.some((d) => d.id === id));
    }
  } catch {
    /* corrupted state → fresh */
  }
  return base;
}

type Listener = () => void;

class SkaziStore {
  private state: SkaziState;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = typeof window !== "undefined" ? loadState() : initialState();
  }

  get = () => this.state;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private emit(persist = true) {
    this.state = { ...this.state };
    if (persist && typeof window !== "undefined") {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.state));
      } catch {
        /* storage full — ignore */
      }
    }
    this.listeners.forEach((l) => l());
  }

  setParam(deviceId: string, param: string, value: number) {
    const d = deviceById(deviceId);
    if (!d) return;
    if (d.kind === "fx") {
      const cur = this.state.fx[deviceId] ?? { enabled: false, params: defaultParams(d) };
      this.state.fx[deviceId] = { ...cur, params: { ...cur.params, [param]: value } };
    } else {
      this.state.instruments[deviceId] = {
        ...(this.state.instruments[deviceId] ?? defaultParams(d)),
        [param]: value,
      };
    }
    this.emit();
  }

  applyPreset(deviceId: string, preset: string) {
    const d = deviceById(deviceId);
    if (!d?.presets?.[preset]) return;
    const vals = d.presets[preset];
    if (d.kind === "fx") {
      this.state.fx[deviceId] = { enabled: true, params: { ...defaultParams(d), ...vals } };
    } else {
      this.state.instruments[deviceId] = { ...defaultParams(d), ...vals };
    }
    this.emit();
  }

  toggleFx(deviceId: string, enabled?: boolean) {
    const cur = this.state.fx[deviceId];
    if (!cur) return;
    this.state.fx[deviceId] = { ...cur, enabled: enabled ?? !cur.enabled };
    this.emit();
  }

  randomizeFx(deviceId: string) {
    const d = deviceById(deviceId);
    if (!d) return;
    const params = { ...(this.state.fx[deviceId]?.params ?? defaultParams(d)) };
    for (const p of d.params) {
      if (p.options) continue; // keep selects stable on random
      const r = p.min + Math.random() * (p.max - p.min);
      params[p.id] = p.step ? Math.round(r / p.step) * p.step : r;
    }
    this.state.fx[deviceId] = { enabled: true, params };
    this.emit();
  }

  setSeq(id: string, seq: SeqPattern) {
    this.state.seq[id] = seq;
    this.emit();
  }

  toggleSeqStep(id: string, index: number) {
    const seq = (this.state.seq[id] ?? emptySeq()).map((s) => ({ ...s }));
    const s = seq[index];
    if (!s.on) seq[index] = { on: true, oct: 0, accent: false, slide: false };
    else seq[index] = { on: false, oct: 0, accent: false, slide: false };
    this.state.seq[id] = seq;
    this.emit();
  }

  cycleSeqStep(id: string, index: number, field: "oct" | "accent" | "slide") {
    const seq = (this.state.seq[id] ?? emptySeq()).map((s) => ({ ...s }));
    const s = seq[index];
    if (!s.on) return;
    if (field === "oct") s.oct = s.oct === 1 ? -1 : s.oct + 1;
    else s[field] = !s[field];
    this.state.seq[id] = seq;
    this.emit();
  }

  mutateSeq(id: string) {
    const seq = (this.state.seq[id] ?? emptySeq()).map((s) => ({ ...s }));
    // MUTATE: flip a few cells, occasionally accent/slide/octave jump
    for (let i = 0; i < seq.length; i++) {
      if (chance(0.18)) seq[i] = { on: !seq[i].on, oct: 0, accent: false, slide: false };
      if (seq[i].on && chance(0.22)) seq[i].accent = !seq[i].accent;
      if (seq[i].on && chance(0.15)) seq[i].slide = !seq[i].slide;
      if (seq[i].on && chance(0.12)) seq[i].oct = chance(0.5) ? 1 : -1;
    }
    this.state.seq[id] = seq;
    this.emit();
  }

  clearSeq(id: string) {
    this.state.seq[id] = emptySeq();
    this.emit();
  }

  setGodSeed(seed: number) {
    this.state.godSeed = seed;
    this.emit();
  }

  toggleFavorite(deviceId: string) {
    const cur = this.state.favorites ?? [];
    const next = cur.includes(deviceId) ? cur.filter((id) => id !== deviceId) : [...cur, deviceId];
    this.state.favorites = next;
    this.emit();
  }

  /** randomize all continuous params of an instrument patch (🎲 our way) */
  randomizeInstrument(deviceId: string) {
    const d = deviceById(deviceId);
    if (!d || d.kind === "fx") return;
    const params = { ...(this.state.instruments[deviceId] ?? defaultParams(d)) };
    for (const p of d.params) {
      if (p.options) continue; // keep selects stable
      // bias musical params toward the middle for pleasant results
      const u = Math.random();
      const r = p.min + (u * 0.7 + 0.15) * (p.max - p.min);
      params[p.id] = p.step ? Math.round(r / p.step) * p.step : r;
    }
    this.state.instruments[deviceId] = params;
    this.emit();
  }

  resetAll() {
    this.state = initialState();
    this.emit();
  }
}

export const skaziStore = new SkaziStore();
