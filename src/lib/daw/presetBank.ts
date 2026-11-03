/* ------------------------------------------------------------------ */
/*  Intellidaw — deterministic procedural preset bank                  */
/*                                                                     */
/*  Every `presetsCount` claimed by a SKAZI device becomes a real,     */
/*  selectable preset. Generation is fully deterministic:              */
/*                                                                     */
/*      hashStr(deviceId) ⊕ mix(index)  →  32-bit seed                 */
/*      seed → mulberry32 → every name/category/param decision         */
/*                                                                     */
/*  The same device + index yields byte-identical presets across       */
/*  sessions, reloads and machines. Math.random is used ONLY inside    */
/*  randomBankIndex (a user-facing dice roll), never in generation.    */
/*                                                                     */
/*  Banks are lazy: names materialize once per device (cheap, needed   */
/*  for guaranteed-unique naming), full params are generated on first  */
/*  access per index and LRU-capped so 3650 presets never sit in RAM.  */
/* ------------------------------------------------------------------ */

import { SKAZI_DEVICES, type SkaziDevice, type SkaziParam } from "./skazi";

export interface BankPreset {
  index: number;
  name: string;
  category: string;
  params: Record<string, number>;
}

/* ---------------- deterministic rng core ---------------- */

/** FNV-1a 32-bit string hash */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny, fast, deterministic 32-bit PRNG */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** per (device, index) seed — golden-ratio index mixing */
const seedFor = (deviceId: string, index: number): number =>
  (hashStr(deviceId) ^ Math.imul(index + 0x9e3779b9, 0x85ebca6b)) >>> 0;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/* ---------------- per-device category groupings ---------------- */
/* Mirrors the official bundle's own genre groupings (uppercase).     */

const CATEGORIES: Record<string, string[]> = {
  skazi: ["PSYTRANCE", "PROG", "TECHNO", "FULL-ON", "LEADS", "PLUCKS", "PADS", "KEYS", "ARPS", "BASS", "DRIVE", "FX"],
  bully: ["PSY", "AFRO", "GROWL", "ACID", "LEADS", "BASS", "PADS", "PLUCKS"],
  kube: ["GROWL", "YOY", "ROBOT", "PSYTRANCE", "TECHNO", "BASS", "LEADS", "PADS"],
  subich: ["PSYTRANCE", "TECHNO", "HOUSE", "INDIE DANCE", "ROLLING", "SUB", "GLUE"],
  tbon303: ["HARD ACID", "CLASSIC 303", "ACID HOUSE", "TECHNO", "ROLLING", "SCREAMER"],
  skacid: ["SHIGAON", "ACID", "SQUELCH", "DEEP", "SCREAMER"],
  kickass: ["CLEAN", "PUNCH", "LONG", "SHORT", "DISTORTED", "KEY TRACK"],
  bamba: ["UPLIFTER", "DOWNLIFTER", "SNARE ROLL", "IMPACT", "SUB DROP"],
  midigod: ["FULL-ON", "PROG PSY", "PSY-TECH", "TECH HOUSE", "DEEP HOUSE", "BASS HOUSE", "MEL TECHNO", "HARD TECHNO", "TRANCE", "EDM"],
  pitapump: ["QUARTER", "EIGHTH", "TRIANGLE", "SAW", "GENTLE", "HARD", "DRAWN"],
  filterfish: ["SWEEPS", "GLITCH", "AUTO WAH", "DUB", "SPECIAL"],
  tahini: ["PING PONG", "TAPE", "MULTI-TAP", "DUB", "SHIMMER", "SPACE"],
  zhug: ["TUBE", "TAPE", "CRUSH", "MULTIBAND", "WIDE"],
  salat: ["CHOP", "RISE", "GLITCH", "MAYHEM"],
  quazi: ["SOFT", "HARD", "FUZZ", "TUBE", "BANDS"],
  skilter: ["LP", "MORPH", "SEQUENCE", "ENVELOPE", "SCREAM"],
  skwide: ["SUBTLE", "MEDIUM", "SUPER WIDE", "PHASE", "DEPTH"],
  skverb: ["HALL", "PLATE", "ROOM", "CATHEDRAL", "SPRING", "SHIMMER", "REVERSE", "GATED", "BLACKHOLE"],
  fm1: ["BASS", "LEADS", "KEYS", "PADS", "BELLS", "PLUCKS", "FX", "PERC"],
  /* Intellidaw extras — counts are undefined, so the browser stays hidden
     (bankCount 0), but the groupings exist so the extras can opt in later. */
  limonana: ["PADS", "TEXTURES", "DRONES", "SHIMMER", "PLUCKS"],
  sabich: ["KEYS", "LO-FI", "CRUNCH", "CHOPS", "BASS"],
  malabi: ["BOOMS", "SOFT", "PUNCH", "SUB", "LO-FI"],
};

/* ---------------- per-device musical bias maps ---------------- */
/* category → paramId → target. For SELECT params the value is the    */
/* option INDEX to lock; for continuous params it is the normalized   */
/* 0..1 distribution center (±0.35 jitter). Keys match by exact       */
/* category string first, then by substring (cat.includes(key)).      */

const CAT_BIAS: Record<string, Record<string, Record<string, number>>> = {
  skazi: {
    PSYTRANCE: { cutoff: 0.55, res: 0.5 },
    PROG: { cutoff: 0.5, drift: 0.5 },
    TECHNO: { cutoff: 0.45, shape: 0.5 },
    "FULL-ON": { cutoff: 0.6, unison: 0.85 },
    LEADS: { cutoff: 0.7, sustain: 0.6, env: 0.5 },
    PLUCKS: { decay: 0.15, sustain: 0.05, env: 0.75 },
    PADS: { attack: 0.7, release: 0.75, cutoff: 0.45 },
    KEYS: { sustain: 0.4, decay: 0.4 },
    ARPS: { rate: 3, decay: 0.2, sustain: 0.1 },
    BASS: { cutoff: 0.3, sub: 0.7, sustain: 0.45 },
    DRIVE: { shape: 0.75, cutoff: 0.55 },
    FX: { release: 0.7, attack: 0.3 },
  },
  bully: {
    PSY: { cutoff: 0.55, res: 0.45 },
    AFRO: { lfoRate: 0.35, lfoAmt: 0.5 },
    GROWL: { warp: 0.7, chaos: 0.45, cutoff: 0.4 },
    ACID: { res: 0.7, env: 0.7, cutoff: 0.35 },
    LEADS: { cutoff: 0.65, sustain: 0.55 },
    BASS: { cutoff: 0.3, drive: 0.5, oct2: 0.25 },
    PADS: { attack: 0.7, release: 0.7 },
    PLUCKS: { decay: 0.15, sustain: 0.1 },
  },
  kube: {
    GROWL: { warpA: 0.7, warpB: 0.5, cutoff: 0.45 },
    YOY: { warpA: 0.55, warpB: 0.65, table: 3 },
    ROBOT: { table: 5, cutoff: 0.5, drive: 0.45 },
    PSYTRANCE: { cutoff: 0.55, unison: 0.85 },
    TECHNO: { cutoff: 0.45, decay: 0.25 },
    BASS: { cutoff: 0.28, drive: 0.5, detune: 0.2 },
    LEADS: { cutoff: 0.65, sustain: 0.55 },
    PADS: { attack: 0.7, release: 0.7 },
  },
  subich: {
    SUB: { cutoff: 0.22, decay: 0.8, drive: 0.3 },
    ROLLING: { cutoff: 0.45, glide: 0.65 },
    GLUE: { cutoff: 0.38, drive: 0.45 },
    TECHNO: { cutoff: 0.5, decay: 0.35 },
    HOUSE: { cutoff: 0.55, decay: 0.4 },
    "INDIE DANCE": { cutoff: 0.5, drive: 0.35 },
    PSYTRANCE: { cutoff: 0.4, drive: 0.5 },
  },
  tbon303: {
    "HARD ACID": { res: 0.85, drive: 0.6, cutoff: 0.32 },
    "CLASSIC 303": { cutoff: 0.28, res: 0.55, accent: 0.7, envAmt: 0.6 },
    "ACID HOUSE": { cutoff: 0.4, res: 0.45, decay: 0.4 },
    TECHNO: { cutoff: 0.35, res: 0.6, accent: 0.85 },
    ROLLING: { slide: 0.65, accent: 0.8, decay: 0.3 },
    SCREAMER: { res: 0.95, cutoff: 0.3, envAmt: 0.8 },
  },
  skacid: {
    SHIGAON: { res: 0.85, envAmt: 0.65, crunch: 0.55, ratchet: 0.4 },
    ACID: { res: 0.7, cutoff: 0.35 },
    SQUELCH: { res: 0.8, decay: 0.35, envAmt: 0.7 },
    DEEP: { cutoff: 0.22, res: 0.4, crunch: 0.25 },
    SCREAMER: { res: 0.95, cutoff: 0.4, envAmt: 0.8 },
  },
  kickass: {
    LONG: { decay: 0.85, hold: 0.6 },
    SHORT: { decay: 0.15, hold: 0.2 },
    PUNCH: { snap: 0.8, click: 0.6, decay: 0.35 },
    DISTORTED: { eqLo: 0.75, eqMid: 0.62, click: 0.7 },
    CLEAN: { snap: 0.5, eqHi: 0.45, click: 0.3 },
  },
  bamba: {
    UPLIFTER: { oct: 0.5, bars: 0.3, bright: 0.75, type: 2 },
    DOWNLIFTER: { oct: 0.05, bars: 0.3, type: 2 },
    "SNARE ROLL": { roll: 1, rollRate: 3, impact: 0.6 },
    IMPACT: { impact: 0.9, bars: 0.15, type: 1 },
    "SUB DROP": { oct: 0, bright: 0.2, bars: 0.25, type: 1 },
  },
  midigod: {
    "FULL-ON": { genre: 0, density: 0.7 },
    "PROG PSY": { genre: 1, density: 0.55 },
    "PSY-TECH": { genre: 2, density: 0.6 },
    "TECH HOUSE": { genre: 3, density: 0.6 },
    "DEEP HOUSE": { genre: 4, density: 0.5 },
    "BASS HOUSE": { genre: 5, density: 0.65 },
    "MEL TECHNO": { genre: 6, density: 0.55 },
    "HARD TECHNO": { genre: 7, density: 0.75 },
    TRANCE: { genre: 8, density: 0.65 },
    EDM: { genre: 9, density: 0.7 },
  },
  pitapump: {
    QUARTER: { rate: 0 },
    EIGHTH: { rate: 1 },
    TRIANGLE: { curve: 0.8 },
    SAW: { curve: 1 },
    GENTLE: { depth: 0.3, curve: 0.45 },
    HARD: { depth: 0.95, curve: 0.6 },
    DRAWN: { rate: 3, depth: 0.55 },
  },
  filterfish: {
    SWEEPS: { lfoAmt: 0.75, lfoRate: 1, freq: 0.45 },
    GLITCH: { drive: 0.65, res: 0.7, lfoRate: 3 },
    "AUTO WAH": { lfoAmt: 0.6, lfoRate: 3, res: 0.5 },
    DUB: { freq: 0.28, res: 0.55, drive: 0.35, lfoRate: 0 },
    SPECIAL: { morph: 0.85, chorus: 0.6 },
  },
  tahini: {
    "PING PONG": { mode: 0, feedback: 0.5, mix: 0.35 },
    TAPE: { mode: 2, wobble: 0.7, drive: 0.55, tone: 0.45 },
    "MULTI-TAP": { mode: 5, feedback: 0.45, mix: 0.4 },
    DUB: { feedback: 0.8, tone: 0.35, drive: 0.4 },
    SHIMMER: { pitch: 0.95, feedback: 0.5 },
    SPACE: { mix: 0.55, feedback: 0.6 },
  },
  zhug: {
    TUBE: { drive: 0.5, tone: 0.6 },
    TAPE: { drive: 0.45, tone: 0.45 },
    CRUSH: { drive: 0.85, tone: 0.3 },
    MULTIBAND: { drive: 0.6, tone: 0.5 },
    WIDE: { width: 0.85, drive: 0.35 },
  },
  salat: {
    CHOP: { amount: 0.7, rate: 0 },
    RISE: { tapeStop: 0.7, amount: 0.5, reverse: 0.6 },
    GLITCH: { crush: 0.6, ring: 0.35, amount: 0.8 },
    MAYHEM: { amount: 1, reverse: 0.7, tapeStop: 0.6, crush: 0.7 },
  },
  quazi: {
    SOFT: { type: 0, d1: 0.3, d2: 0.3, d3: 0.25, d4: 0.2 },
    HARD: { type: 1, d2: 0.6, d3: 0.55 },
    FUZZ: { type: 2, d3: 0.75, d4: 0.6 },
    TUBE: { type: 3, d1: 0.45, d2: 0.4 },
    BANDS: { split1: 0.35, split2: 0.6 },
  },
  skilter: {
    LP: { mode: 0, freq: 0.35 },
    MORPH: { freq: 0.5, res: 0.45 },
    SEQUENCE: { seq: 1, seqAmt: 0.7, rate: 1 },
    ENVELOPE: { seqAmt: 0.45, freq: 0.4 },
    SCREAM: { res: 0.95, drive: 0.7, freq: 0.55 },
  },
  skwide: {
    SUBTLE: { width: 0.6, monoSpread: 0.2, superWide: 0 },
    MEDIUM: { width: 0.75, monoSpread: 0.4 },
    "SUPER WIDE": { width: 1, superWide: 0.8, monoSpread: 0.3 },
    PHASE: { phase: 0.8, width: 0.7 },
    DEPTH: { depth: 0.85, monoSpread: 0.6 },
  },
  skverb: {
    HALL: { algo: 0, size: 0.7, decay: 0.6 },
    PLATE: { algo: 1, size: 0.5, decay: 0.5 },
    ROOM: { algo: 2, size: 0.3, decay: 0.25 },
    CATHEDRAL: { algo: 4, size: 0.95, decay: 0.95 },
    SPRING: { algo: 5, size: 0.25, decay: 0.3, preDelay: 0.15 },
    SHIMMER: { algo: 6, size: 0.8, decay: 0.85, preDelay: 0.4 },
    REVERSE: { algo: 7, preDelay: 0.7, size: 0.6 },
    GATED: { algo: 8, decay: 0.18, size: 0.55, duck: 0.6 },
    BLACKHOLE: { algo: 9, size: 1, decay: 1, duck: 0.3 },
  },
  fm1: {
    BASS: { algo: 0, ratio: 0.5, cutoff: 0.28, modLevel: 0.55, sustain: 0.5 },
    LEADS: { algo: 3, cutoff: 0.65, modLevel: 0.6, sustain: 0.55 },
    KEYS: { algo: 7, decay: 0.4, sustain: 0.35, modLevel: 0.45 },
    PADS: { algo: 1, attack: 0.7, release: 0.75, modLevel: 0.4 },
    BELLS: { algo: 6, ratio: 1.41, decay: 0.5, sustain: 0.05, modLevel: 0.5 },
    PLUCKS: { algo: 2, decay: 0.2, sustain: 0.05, cutoff: 0.5 },
    FX: { algo: 5, fb: 0.7, lfoDepth: 0.6, release: 0.7 },
    PERC: { algo: 7, decay: 0.12, sustain: 0, release: 0.1 },
  },
};

function biasFor(deviceId: string, cat: string): Record<string, number> | undefined {
  const m = CAT_BIAS[deviceId];
  if (!m) return undefined;
  if (m[cat]) return m[cat];
  const key = Object.keys(m).find((k) => cat.includes(k));
  return key ? m[key] : undefined;
}

/* ---------------- param classification helpers ---------------- */

const isLevelParam = (p: SkaziParam): boolean =>
  /(^|_)(lvl|level|vol|volume|gain|out)($|_)/i.test(p.id) || /\b(LVL|LEVEL|VOL|VOLUME|GAIN|OUT)\b/i.test(p.label);

const isResParam = (p: SkaziParam): boolean =>
  /(^|_)res(o)?($|_)/i.test(p.id) || /\bRES(O)?\b/i.test(p.label);

const isAttackRelease = (p: SkaziParam): boolean => /attack|release/.test(p.id.toLowerCase());
const isDecayHold = (p: SkaziParam): boolean => /decay|hold/.test(p.id.toLowerCase());
const isCutoffLike = (p: SkaziParam): boolean => /cutoff|tone|color|freq|bright/.test(p.id.toLowerCase());
const isOctTune = (p: SkaziParam): boolean => /oct|tune/.test(p.id.toLowerCase());

/** categories whose envelopes/decays should run long */
const LONG_ENV = /PAD|AMBIENT|TAIL|BLACKHOLE|CATHEDRAL|SHIMMER|SPACE|HALL/;
/** categories allowed to push resonance into self-oscillation */
const FREE_RES = /SCREAMER|ACID/;

/** FM-1 ratio snaps to classic musical ratios */
const MUSICAL_RATIOS = [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7];

const normCat = (s: string): string => s.replace(/[\s\-_.]+/g, "").toUpperCase();

function quantize(v: number, p: SkaziParam): number {
  if (p.step) v = Number((Math.round(v / p.step) * p.step).toFixed(6));
  return clamp(v, p.min, p.max);
}

/* ---------------- param generation ---------------- */

function generateParams(d: SkaziDevice, index: number, cat: string): Record<string, number> {
  // scrambled twin of the name seed so name draws and param draws are independent
  const rng = mulberry32((seedFor(d.id, index) ^ 0x5f356495) >>> 0);
  const bias = biasFor(d.id, cat);
  const catUp = cat.toUpperCase();
  const longEnv = LONG_ENV.test(catUp);
  const freeRes = FREE_RES.test(catUp);
  const params: Record<string, number> = {};

  for (const p of d.params) {
    /* select-type params: bias lock → category-name match → default keep → uniform roll */
    if (p.options) {
      const n = p.options.length;
      const b = bias?.[p.id];
      if (b !== undefined) {
        params[p.id] = clamp(Math.round(b), 0, n - 1);
        continue;
      }
      const catN = normCat(cat);
      const mi = p.options.findIndex((o) => normCat(o) === catN);
      if (mi >= 0 && rng() < 0.7) {
        params[p.id] = mi;
        continue;
      }
      if (rng() < 0.3) {
        params[p.id] = clamp(Math.round(p.def), 0, n - 1);
        continue;
      }
      params[p.id] = Math.min(n - 1, Math.floor(rng() * n));
      continue;
    }

    /* continuous params: musical shaping of a normalized 0..1 draw */
    const id = p.id.toLowerCase();
    const u0 = rng();
    let u = u0;
    const bc = bias?.[p.id];
    if (bc !== undefined) {
      // category identity: tight distribution around the biased center
      u = clamp(bc + (rng() - 0.5) * 0.35, 0, 1);
    } else if (isLevelParam(p)) {
      u = 0.25 + u0 * 0.5; // safe 0.25..0.75 band
    } else if (isResParam(p)) {
      u = freeRes ? u0 : Math.pow(u0, 1.9) * 0.55; // res low (<0.6) unless SCREAMER/ACID
    } else if (isAttackRelease(p)) {
      u = longEnv ? 0.35 + Math.pow(u0, 0.6) * 0.65 : Math.pow(u0, 2.2) * 0.8; // short unless PAD/AMBIENT/TAIL…
    } else if (isDecayHold(p)) {
      u = longEnv ? 0.3 + Math.pow(u0, 0.7) * 0.7 : Math.pow(u0, 1.5) * 0.85;
    } else if (isCutoffLike(p)) {
      u = Math.pow(u0, 0.95); // log-ish spread (ranges are already log-mapped)
    } else if (isOctTune(p)) {
      u = 0.2 + u0 * 0.6; // keep transpositions tasteful
    }

    let v = p.min + u * (p.max - p.min);
    if (id === "ratio") {
      v = MUSICAL_RATIOS.reduce((best, r) => (Math.abs(r - v) < Math.abs(best - v) ? r : best), MUSICAL_RATIOS[0]);
    }
    params[p.id] = quantize(v, p);
  }

  /* sanity: never degenerate — at least two params must leave their defaults */
  let moved = 0;
  for (const p of d.params) {
    const range = p.max - p.min || 1;
    if (Math.abs(params[p.id] - p.def) > range * 0.02) moved++;
  }
  if (moved < 2) {
    const t = d.params.find((q) => !q.options);
    if (t) {
      const range = t.max - t.min || 1;
      let v = t.min + (0.2 + rng() * 0.6) * range;
      if (Math.abs(v - t.def) < 0.25 * range) {
        v = t.def + (t.def - t.min > range / 2 ? -0.35 : 0.35) * range;
      }
      params[t.id] = quantize(v, t);
    }
  }

  return params;
}

/* ---------------- naming ---------------- */

const ADJ = [
  "DEEP", "ROLLING", "HYPER", "GLITCHED", "DARK", "CLEAN", "HARD", "SOFT",
  "ACID", "GROWLY", "PSYCHO", "TURBO", "FROZEN", "MOLTEN", "WILD", "SHARP",
  "SLICK", "HEAVY",
];
const NOUN = [
  "BASS", "LEAD", "STAB", "PLUCK", "PAD", "ROLL", "PUMP", "SLAP",
  "DRIVE", "TAIL", "KEYS", "RUSH", "LINE", "DROP",
];
const SUFF = ["MK2", "V2", "909", "303", "808", "XL"];

function roman(n: number): string {
  const table: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let v = n;
  for (const [val, sym] of table) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}

/** base name for a seed — words derive from successive rng bit-fields */
function nameFor(deviceId: string, index: number, cat: string): string {
  const rng = mulberry32(seedFor(deviceId, index));
  const words = cat
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3 || /\d/.test(w)); // keep "YOY"/"303", drop "ON"/"LP"
  const adjPool = [...ADJ, cat, ...words];
  const nounPool = [...NOUN, ...words];
  const a = adjPool[Math.floor(rng() * adjPool.length)];
  const b = nounPool[Math.floor(rng() * nounPool.length)];
  const r3 = rng();
  const suf = r3 < 0.55 ? "" : SUFF[Math.floor(rng() * SUFF.length)];
  return [a, b, suf].filter(Boolean).join(" ");
}

/* ---------------- cache ---------------- */

interface DeviceCache {
  names: string[] | null;
  byIndex: Map<number, BankPreset>;
}

const CACHE_CAP = 4000; // max cached full presets across all devices
const cache = new Map<string, DeviceCache>();
let cacheSize = 0;

function devCache(id: string): DeviceCache {
  let c = cache.get(id);
  if (!c) {
    c = { names: null, byIndex: new Map() };
    cache.set(id, c);
  }
  return c;
}

function evictIfNeeded(): void {
  let guard = 0;
  while (cacheSize >= CACHE_CAP && guard++ < 1000) {
    let cleared = false;
    for (const c of cache.values()) {
      if (c.byIndex.size > 0) {
        cacheSize -= c.byIndex.size;
        c.byIndex.clear();
        cleared = true;
        break;
      }
    }
    if (!cleared) break;
  }
}

function categoryFor(d: SkaziDevice, index: number): string {
  const cats = CATEGORIES[d.id];
  if (!cats || cats.length === 0) return "PRESET";
  return cats[index % cats.length];
}

/**
 * Materialize the whole name table for a device once, in index order,
 * so `seen`-driven roman-numeral dedup is deterministic regardless of
 * which indexes are requested first. Names are cheap strings; the
 * (heavy) params stay lazy in `byIndex`.
 */
function ensureNames(d: SkaziDevice, c: DeviceCache): string[] {
  if (c.names) return c.names;
  const n = bankCount(d);
  const names: string[] = new Array(n);
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const cat = categoryFor(d, i);
    const base = nameFor(d.id, i, cat);
    let name = base;
    let k = 2;
    while (seen.has(name) && k <= 64) {
      name = `${base} ${roman(k)}`;
      k++;
    }
    if (seen.has(name)) name = `${base} ${i + 1}`;
    while (seen.has(name)) name += "·";
    seen.add(name);
    names[i] = name;
  }
  c.names = names;
  return names;
}

/* ---------------- public API ---------------- */

export function bankCount(d: SkaziDevice): number {
  return d.presetsCount ?? 0;
}

let totalCache: number | null = null;

export function bankTotal(): number {
  if (totalCache === null) {
    totalCache = 0;
    for (const d of SKAZI_DEVICES) totalCache += bankCount(d);
  }
  return totalCache;
}

export function bankCategories(d: SkaziDevice): string[] {
  const cats = CATEGORIES[d.id];
  return cats ? [...cats] : [];
}

export function getBankPreset(d: SkaziDevice, index: number): BankPreset {
  const n = bankCount(d);
  if (n <= 0) return { index: 0, name: "INIT", category: "—", params: {} };
  const i = clamp(Math.floor(index), 0, n - 1);
  const c = devCache(d.id);
  const hit = c.byIndex.get(i);
  if (hit) return hit;
  const names = ensureNames(d, c);
  const cat = categoryFor(d, i);
  const bp: BankPreset = { index: i, name: names[i], category: cat, params: generateParams(d, i, cat) };
  evictIfNeeded();
  c.byIndex.set(i, bp);
  cacheSize++;
  return bp;
}

export function searchBank(
  d: SkaziDevice,
  query: string,
  category: string | null,
  favorites: number[] | null,
  limit = 250
): { items: BankPreset[]; total: number } {
  const n = bankCount(d);
  if (n <= 0) return { items: [], total: 0 };
  const names = ensureNames(d, devCache(d.id));
  const q = query.trim().toLowerCase();
  const favSet = favorites ? new Set(favorites) : null;
  const items: BankPreset[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const cat = categoryFor(d, i);
    if (category && cat !== category) continue;
    if (favSet && !favSet.has(i)) continue;
    const name = names[i];
    if (q && !name.toLowerCase().includes(q) && !cat.toLowerCase().includes(q)) continue;
    total++;
    if (items.length < limit) items.push(getBankPreset(d, i));
  }
  return { items, total };
}

/** user-facing dice roll — the ONLY Math.random in this file */
export function randomBankIndex(d: SkaziDevice, exclude?: number): number {
  const n = bankCount(d);
  if (n <= 1) return 0;
  let idx = Math.floor(Math.random() * n);
  let guard = 0;
  while (exclude !== undefined && idx === exclude && guard++ < 8) {
    idx = Math.floor(Math.random() * n);
  }
  if (idx === exclude) idx = (exclude + 1) % n;
  return idx;
}

export function fmtIndex(i: number): string {
  return String(Math.max(0, Math.floor(i)) + 1).padStart(4, "0");
}
