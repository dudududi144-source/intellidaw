/* ------------------------------------------------------------------ */
/*  FM-1 — 4-operator ALGORITHM FM synth. Native Web Audio build of    */
/*  the user's uploaded FM-1.vst3 (M-VAVE FM-1 hardware synth; the     */
/*  uploaded Windows file is a CLAP→VST3 wrapper shell — analyzed &    */
/*  imported via /api/plugins/import, DSP mapped to this engine).      */
/*  Original implementation — no third-party code.                     */
/* ------------------------------------------------------------------ */

import type { VoiceParams } from "./skaziAudio";

/* local helpers — deliberately value-free of skaziAudio (it imports
   fm1Voice below, so a value import here would close a runtime cycle).
   Formulas mirror skaziAudio's midiHz / clamp / skaziCutoffHz and the
   "tube" branch of shaperCurve exactly.                               */

const midiHz = (p: number) => 440 * Math.pow(2, (p - 69) / 12);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const cutoffHz = (c: number) => 40 * Math.pow(300, Math.min(1, Math.max(0, c))); // mirrors skaziCutoffHz — 40Hz..12kHz

/* tube curve — mirrors shaperCurve("tube", amount), cached per amount */
const tubeCache = new Map<string, Float32Array<ArrayBuffer>>();
function tubeCurve(amount: number): Float32Array<ArrayBuffer> {
  const key = `tube:${Math.round(amount * 20)}`;
  const hit = tubeCache.get(key);
  if (hit) return hit;
  const n = 1024;
  const c = new Float32Array(n);
  const k = 1 + amount * 20;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = (Math.tanh(x * k * 0.8) + 0.12 * Math.sin(x * Math.PI)) * 0.9;
  }
  tubeCache.set(key, c);
  return c;
}

/* glide memory — legato between notes until a >2s gap resets it */
let lastFreq: number | null = null;
let lastTime = -Infinity;

/* ------------------------------------------------------------------ */
/*  8 four-op algorithms (ops: 0=CARRIER, 1=M1 ratio·r, 2=M2 ratio 2,  */
/*  3=M3 ratio 3). The M-VAVE FM-1 hardware runs 32 six-op algorithms; */
/*  this browser build curates the classic 4-op set. Each entry:       */
/*  edges = [from, to] modulation routing, fb = head op with its own   */
/*  self-feedback loop (a delay node keeps the cycle legal).           */
/* ------------------------------------------------------------------ */
export const FM1_ALGORITHMS = [
  "SERIAL",
  "TRIPLE PAR",
  "TWO+CHAIN",
  "CHAIN+PAR",
  "BRASS",
  "FORK",
  "BELL",
  "SIMPLE",
] as const;

const ALGO_GRAPHS: Array<{ edges: Array<[number, number]>; fb: number | null }> = [
  { edges: [[3, 2], [2, 1], [1, 0]], fb: 3 },  // 0 SERIAL: full cascade, fb at the top
  { edges: [[1, 0], [2, 0], [3, 0]], fb: 3 },  // 1 TRIPLE PAR: three parallel mods
  { edges: [[3, 2], [2, 0], [1, 0]], fb: 3 },  // 2 TWO+CHAIN: 2-op stack + parallel mod
  { edges: [[2, 1], [1, 0], [3, 0]], fb: 2 },  // 3 CHAIN+PAR: stack head fb + parallel
  { edges: [[2, 1], [1, 0], [3, 0]], fb: 3 },  // 4 BRASS: parallel mod self-feedback
  { edges: [[3, 1], [2, 1], [1, 0]], fb: 3 },  // 5 FORK: two mods merge into one stack
  { edges: [[3, 0], [1, 0]], fb: 3 },          // 6 BELL: inharmonic pair, M2 silent
  { edges: [[1, 0]], fb: 1 },                  // 7 SIMPLE: pure 2-op (classic DX bass)
];

/** FM-1 — 4-op algorithm FM voice: modulator graph → carrier, per-op
 *  index envelopes (classic FM brightness decay), feedback loop on the
 *  chain head, shared lowpass + drive + amp env on top. */
export function fm1Voice(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, pitch: number, vel: number, time: number, dur: number) {
  const v = clamp(vel, 0, 1);
  const algo = Math.round(clamp(p.algo ?? 0, 0, 7));
  const graph = ALGO_GRAPHS[algo];
  const ratio = clamp(p.ratio ?? 1, 0.25, 16);
  const modLevel = clamp(p.modLevel ?? 0.4, 0, 1);
  const fbAmt = clamp(p.fb ?? 0.1, 0, 1);
  const attack = clamp(p.attack ?? 0.005, 0.002, 2);
  const decay = clamp(p.decay ?? 0.5, 0.02, 4);
  const sustain = clamp(p.sustain ?? 0.6, 0, 1);
  const release = clamp(p.release ?? 0.4, 0.02, 6);
  const cutoff = clamp(p.cutoff ?? 0.75, 0, 1);
  const res = clamp(p.res ?? 1, 0, 18);
  const fenv = clamp(p.fenv ?? 0.3, 0, 1);
  const lfoRate = clamp(p.lfoRate ?? 5, 0.1, 20);
  const lfoDepth = clamp(p.lfoDepth ?? 0, 0, 1);
  const lfoTarget = Math.round(clamp(p.lfoTarget ?? 0, 0, 2)); // 0=PITCH 1=FILTER 2=AMP
  const glide = clamp(p.glide ?? 0, 0, 1) * 0.5; // → seconds
  const unison = Math.round(clamp(p.unison ?? 1, 1, 4));
  const detune = clamp(p.detune ?? 0.3, 0, 1);
  const drive = clamp(p.drive ?? 0.15, 0, 1);
  const level = clamp(p.level ?? 0.8, 0, 1);

  const f = midiHz(clamp(pitch, 0, 127));

  /* glide: ramp from the previous note's pitch unless >2s elapsed */
  if (lastFreq !== null && time - lastTime > 2) lastFreq = null;
  const glideFrom = glide > 0 && lastFreq !== null && lastFreq > 0 ? lastFreq : null;
  lastFreq = f;
  lastTime = time;
  const glideSec = Math.max(0.01, glide);

  /* amp envelope (FM-1 peak; scale down when several parallel branches
     hit the carrier so dense algorithms don't clip the shared filter) */
  const branches = graph.edges.filter(([, to]) => to === 0).length || 1;
  const g = ctx.createGain();
  const peak = 0.34 * v * (0.55 + 0.45 * level) * (1 / Math.sqrt(branches)) * (1 / Math.sqrt(unison));
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(peak, time + attack);
  g.gain.setTargetAtTime(Math.max(0.0001, peak * sustain), time + attack, Math.max(0.02, decay / 3));
  const end = time + Math.max(attack + 0.04, dur);
  g.gain.setTargetAtTime(0.0001, end, Math.max(0.02, release / 3));
  const endAll = end + release + 0.4; // release tail + click margin

  /* filter with a closing envelope */
  const cut = cutoffHz(cutoff);
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = res;
  filt.frequency.setValueAtTime(Math.min(16000, cut * (1 + fenv * 6)), time);
  filt.frequency.exponentialRampToValueAtTime(Math.max(60, cut), time + Math.max(0.05, decay));

  /* optional tube drive */
  if (drive >= 0.02) {
    const ws = ctx.createWaveShaper();
    ws.curve = tubeCurve(drive * 0.6);
    ws.oversample = "2x";
    filt.connect(ws).connect(g).connect(dest);
  } else {
    filt.connect(g).connect(dest);
  }

  /* op frequency multipliers: carrier = 1, M1 = ratio knob, M2 = 2 (octave), M3 = 3 (fifth)
     unison spread applies to the carrier stack; modulators are single-osc. */
  const opMult = [1, ratio, 2, 3];
  const modOsc = new Map<number, OscillatorNode>(); // op → its single modulator osc
  const modIdx = new Map<number, GainNode>();       // op → its index gain (post-env signal)

  const usedMods = new Set<number>();
  for (const [from] of graph.edges) usedMods.add(from);
  if (graph.fb !== null) usedMods.add(graph.fb);

  /* --- modulators (ops 1..3) --- */
  for (const op of usedMods) {
    if (op === 0) continue;
    const targetHz = Math.max(20, f * opMult[op]);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const from = glideFrom !== null ? Math.max(20, glideFrom * opMult[op]) : targetHz;
    osc.frequency.setValueAtTime(from, time);
    if (glideFrom !== null) osc.frequency.exponentialRampToValueAtTime(targetHz, time + glideSec);

    /* index gain IS the FM depth (Hz deviation), shaped by the note env */
    const idx = targetHz * (0.25 + modLevel * 3.5) * (0.35 + 0.65 * v);
    const ig = ctx.createGain();
    ig.gain.setValueAtTime(0.0001, time);
    ig.gain.linearRampToValueAtTime(Math.max(0.0001, idx), time + attack);
    ig.gain.setTargetAtTime(Math.max(0.0001, idx * sustain), time + attack, Math.max(0.02, decay / 3));
    ig.gain.setTargetAtTime(0.0001, end, Math.max(0.02, release / 3));

    osc.connect(ig);
    osc.start(time);
    osc.stop(endAll);
    modOsc.set(op, osc);
    modIdx.set(op, ig);
  }

  /* --- carrier (op 0): unison stack of sines → audio bus --- */
  const carrierOscs: OscillatorNode[] = [];
  const bus = ctx.createGain();
  bus.gain.value = 1 / Math.sqrt(unison);
  for (let i = 0; i < unison; i++) {
    const c = ctx.createOscillator();
    c.type = "sine";
    const spread = unison === 1 ? 0 : ((i / (unison - 1)) * 2 - 1) * detune * 35;
    c.detune.setValueAtTime(spread, time);
    const from = glideFrom !== null ? Math.max(20, glideFrom) : f;
    c.frequency.setValueAtTime(from, time);
    if (glideFrom !== null) c.frequency.exponentialRampToValueAtTime(f, time + glideSec);
    c.connect(bus);
    c.start(time);
    c.stop(endAll);
    carrierOscs.push(c);
  }
  bus.connect(filt);

  /* --- route the graph: each edge feeds the target's frequency param --- */
  for (const [from, to] of graph.edges) {
    const src = modIdx.get(from);
    if (!src) continue;
    if (to === 0) {
      for (const c of carrierOscs) src.connect(c.frequency);
    } else {
      const t = modOsc.get(to);
      if (t) src.connect(t.frequency);
    }
  }

  /* --- feedback loop on the chain head: op → delay → fb → own frequency --- */
  if (graph.fb !== null && fbAmt >= 0.01) {
    const src = modIdx.get(graph.fb);
    const osc = modOsc.get(graph.fb);
    if (src && osc) {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = 128 / ctx.sampleRate;
      const fbGain = ctx.createGain();
      fbGain.gain.value = clamp(fbAmt * 2.2, 0, 2.2);
      src.connect(delay).connect(fbGain).connect(osc.frequency);
    }
  }

  /* --- one LFO, switchable target --- */
  if (lfoDepth > 0.01) {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = lfoRate;
    const la = ctx.createGain();
    lfo.connect(la);
    if (lfoTarget === 1) {
      la.gain.value = cut * 0.8 * lfoDepth;
      la.connect(filt.frequency);
    } else if (lfoTarget === 2) {
      la.gain.value = 0.5 * lfoDepth; // tremolo — gain param is additive, keep small
      la.connect(g.gain);
    } else {
      la.gain.value = 60 * lfoDepth; // ±60 cents at full depth — every op detune
      for (const c of carrierOscs) la.connect(c.detune);
      for (const o of modOsc.values()) la.connect(o.detune);
    }
    lfo.start(time);
    lfo.stop(endAll);
  }
}
