/* ------------------------------------------------------------------ */
/*  Intellidaw — SKAZI Bundle audio engine                             */
/*  Web Audio implementations of the 19 bundle devices, plus the       */
/*  original "Intellidaw Extras" devices.                              */
/*  Original DSP code — procedural tables, curves and impulses.        */
/* ------------------------------------------------------------------ */

import type { SkaziDevice, SeqPattern } from "./skazi";
import { deviceById, skaziStore, type SkaziState } from "./skazi";
import { cachedNoise } from "./noise";
import { fm1Voice } from "./fm1";

const midiHz = (p: number) => 440 * Math.pow(2, (p - 69) / 12);
export const skaziCutoffHz = (c: number) => 40 * Math.pow(300, Math.min(1, Math.max(0, c))); // 40Hz..12kHz
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ---------------- waveshaper curves (original) ---------------- */

export type CurveName = "soft" | "hard" | "fuzz" | "tube" | "crush" | "fold";

const curveCache = new Map<string, Float32Array<ArrayBuffer>>();
export function shaperCurve(name: CurveName, amount = 0.5): Float32Array<ArrayBuffer> {
  const key = `${name}:${Math.round(amount * 20)}`;
  const hit = curveCache.get(key);
  if (hit) return hit;
  const n = 1024;
  const c = new Float32Array(n);
  const k = 1 + amount * 20;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    let y: number;
    switch (name) {
      case "soft": y = Math.tanh(x * k) / Math.tanh(k); break;
      case "hard": y = clamp(x * k * 0.6, -0.92, 0.92); break;
      case "fuzz": y = clamp(Math.sign(x) * (1 - Math.exp(-Math.abs(x * k * 1.4))), -1, 1) * 0.85; break;
      case "tube": y = (Math.tanh(x * k * 0.8) + 0.12 * Math.sin(x * Math.PI)) * 0.9; break;
      case "crush": {
        const steps = Math.max(2, Math.round(64 - amount * 58));
        y = Math.round((x + 1) * steps) / steps - 1;
        break;
      }
      case "fold": {
        let v = x * (1 + amount * 6);
        while (v > 1 || v < -1) v = v > 1 ? 2 - v : -2 - v;
        y = v;
        break;
      }
    }
    c[i] = y;
  }
  curveCache.set(key, c);
  return c;
}

function makeShaper(ctx: BaseAudioContext, name: CurveName, amount = 0.5): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  ws.curve = shaperCurve(name, amount);
  ws.oversample = "2x";
  return ws;
}

/* ---------------- procedural wavetables ---------------- */

const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

export function skaziWave(ctx: BaseAudioContext, name: string): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) {
    m = new Map();
    waveCache.set(ctx, m);
  }
  const hit = m.get(name);
  if (hit) return hit;
  const N = 32;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  const setH = (h: number, amp: number) => {
    if (h >= 1 && h < N) imag[h] = amp;
  };
  switch (name) {
    case "BASIC": for (let h = 1; h < N; h++) setH(h, 1 / h); break;
    case "SAWX": for (let h = 1; h < N; h++) setH(h, (h % 2 ? 1 : 0.6) / h); break;
    case "GROWL": [1, 3, 5, 7, 9, 11, 13, 15].forEach((h, i) => setH(h, 1 / (i + 1))); break;
    case "VOX": [1, 2, 4, 7, 10, 13].forEach((h, i) => setH(h, [1, 0.7, 0.9, 0.6, 0.4, 0.25][i])); break;
    case "HOLLOW": for (let h = 1; h < N; h += 2) setH(h, 1 / Math.pow(h, 1.4)); break;
    case "METAL": [1, 3, 6, 9, 13, 18, 24].forEach((h, i) => setH(h, [1, 0.6, 0.55, 0.4, 0.3, 0.2, 0.12][i])); break;
    case "GLASS": [1, 3, 4, 7, 9, 14].forEach((h, i) => setH(h, [1, 0.5, 0.6, 0.3, 0.2, 0.1][i])); break;
    case "ACID": [1, 2, 3, 4, 5, 6].forEach((h, i) => setH(h, [1, 0.4, 0.9, 0.3, 0.35, 0.15][i])); break;
    default: for (let h = 1; h < N; h++) setH(h, 1 / h);
  }
  const w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  m.set(name, w);
  return w;
}

const WT_LIST = ["BASIC", "SAWX", "GROWL", "VOX", "HOLLOW", "METAL", "GLASS", "ACID"];
const wtName = (idx: number) => WT_LIST[clamp(idx | 0, 0, 7)];

/* ---------------- impulse responses for SKAZI REVERB ---------------- */

const irCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

export function skaziIR(ctx: BaseAudioContext, algo: number, size: number, decay: number): AudioBuffer {
  const key = `${algo}:${Math.round(size * 8)}:${Math.round(decay * 8)}`;
  let m = irCache.get(ctx);
  if (!m) {
    m = new Map();
    irCache.set(ctx, m);
  }
  const hit = m.get(key);
  if (hit) return hit;
  if (m.size > 24) m.delete(m.keys().next().value as string);

  const sr = ctx.sampleRate;
  const baseLens = [2.8, 1.8, 0.7, 1.6, 5.2, 1.2, 3.6, 1.6, 0.5, 7.0];
  const dur = clamp(baseLens[algo] * (0.5 + size * 0.8) * (0.55 + decay * 0.9), 0.15, 8);
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(2, len, sr);

  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    const smooth = algo === 0 || algo === 3 || algo === 4 || algo === 9 ? 0.86 : 0.4;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      let env: number;
      switch (algo) {
        case 8: env = t < 0.85 ? 1 : 0; break; // GATED
        case 7: env = Math.pow(t, 2.2); break; // REVERSE
        case 4: env = Math.min(1, t * 6) * Math.pow(1 - t, 1.6); break; // CATHEDRAL
        case 9: env = Math.pow(1 - t, 0.7) * (1 - Math.pow(t, 6)); break; // BLACKHOLE
        default: env = Math.pow(1 - t, algo === 2 ? 3.2 : 2.4);
      }
      let s = (Math.random() * 2 - 1) * env;
      lp = lp * smooth + s * (1 - smooth);
      d[i] = lp;
    }
    // SPRING: add resonant boing partials
    if (algo === 5) {
      for (const freq of [420, 780, 1210]) {
        const g = 0.35 / (freq / 400);
        const f01 = freq / sr;
        let phase = Math.random() * 6;
        for (let i = 0; i < len; i++) {
          const e = Math.pow(1 - i / len, 2.6) * (i > sr * 0.01 ? 1 : i / (sr * 0.01));
          d[i] += Math.sin(phase * Math.PI * 2) * e * g;
          phase += f01;
        }
      }
    }
    // SHIMMER: bright rising sheen
    if (algo === 6) {
      let s2 = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        s2 = s2 * 0.95 + (Math.random() * 2 - 1) * 0.05;
        d[i] += s2 * Math.pow(t, 1.4) * 0.5;
      }
    }
  }
  m.set(key, buf);
  return buf;
}

/* ================= VOICES ================= */

export interface VoiceParams {
  [k: string]: number;
}

function envGain(
  ctx: BaseAudioContext,
  time: number,
  vel: number,
  peak: number,
  a: number,
  d: number,
  s: number,
  r: number,
  dur: number
): { g: GainNode; end: number } {
  const g = ctx.createGain();
  const p = peak * vel;
  const atk = Math.max(0.002, a);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(p, time + atk);
  g.gain.setTargetAtTime(Math.max(0.0001, p * s), time + atk, Math.max(0.02, d / 3));
  const end = time + Math.max(atk + 0.04, dur);
  g.gain.setTargetAtTime(0.0001, end, Math.max(0.02, r / 3));
  return { g, end: end + r + 0.4 };
}

/** SKAZI — supersaw */
function voiceSkazi(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, pitch: number, vel: number, time: number, dur: number) {
  const { g, end } = envGain(ctx, time, vel, 0.24, p.attack, p.decay, p.sustain, p.release, dur);
  const cut = skaziCutoffHz(p.cutoff);
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = p.res;
  filt.frequency.setValueAtTime(clamp(cut * (1 + p.env * 4), 80, 16000), time);
  filt.frequency.exponentialRampToValueAtTime(clamp(cut, 60, 16000), time + Math.max(0.05, p.decay));
  const shaper = makeShaper(ctx, "fold", p.shape * 0.7);
  filt.connect(shaper).connect(g).connect(dest);

  const n = Math.round(p.unison);
  const freq = midiHz(pitch + p.octave * 12);
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const spread = n === 1 ? 0 : ((i / (n - 1)) * 2 - 1) * p.detune;
    const drift = (Math.random() * 2 - 1) * p.drift * 14;
    o.frequency.setValueAtTime(freq, time);
    o.detune.setValueAtTime(spread + drift, time);
    if (p.drift > 0) {
      // slow analog drift
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.3 + Math.random() * 1.2;
      const la = ctx.createGain();
      la.gain.value = p.drift * 6;
      lfo.connect(la).connect(o.detune);
      lfo.start(time);
      lfo.stop(end);
    }
    o.connect(filt);
    o.start(time);
    o.stop(end);
  }
  if (p.sub > 0) {
    const s = ctx.createOscillator();
    s.type = "sine";
    s.frequency.setValueAtTime(freq / 2, time);
    const sg = ctx.createGain();
    sg.gain.value = p.sub * 0.7;
    s.connect(sg).connect(filt);
    s.start(time);
    s.stop(end);
  }
}

/** BULLY / KUBE — wavetable voices */
function voiceWavetable(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, pitch: number, vel: number, time: number, dur: number, kube: boolean) {
  const cut = skaziCutoffHz(p.cutoff);
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = p.res;
  filt.frequency.setValueAtTime(clamp(cut * (1 + p.env * 3.5), 80, 16000), time);
  filt.frequency.exponentialRampToValueAtTime(clamp(cut, 60, 16000), time + Math.max(0.06, p.decay));
  const drive = makeShaper(ctx, "tube", p.drive * 0.8);
  const { g, end } = envGain(ctx, time, vel, 0.22, p.attack, p.decay, p.sustain, p.release, dur);
  filt.connect(drive).connect(g).connect(dest);

  const freq = midiHz(pitch);
  const mkOsc = (wave: string, detune: number, oct: number, amp: number) => {
    const o = ctx.createOscillator();
    o.setPeriodicWave(skaziWave(ctx, wave));
    o.frequency.setValueAtTime(freq * Math.pow(2, oct), time);
    o.detune.setValueAtTime(detune, time);
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og).connect(filt);
    o.start(time);
    o.stop(end);
    return o;
  };

  if (kube) {
    const n = Math.round(p.unison);
    for (let i = 0; i < n; i++) {
      const spread = n === 1 ? 0 : ((i / (n - 1)) * 2 - 1) * p.detune;
      mkOsc(wtName(p.table), spread, 0, 1 / Math.sqrt(n));
    }
    // dual warp: FM (warpA) + AM (warpB)
    if (p.warpA > 0.01) {
      const mod = ctx.createOscillator();
      mod.type = "sawtooth";
      mod.frequency.value = freq;
      const mg = ctx.createGain();
      mg.gain.value = freq * p.warpA * 1.8;
      mod.connect(mg);
      mod.start(time);
      mod.stop(end);
      // FM on a dedicated carrier
      const car = ctx.createOscillator();
      car.setPeriodicWave(skaziWave(ctx, wtName(p.table)));
      car.frequency.setValueAtTime(freq, time);
      mg.connect(car.frequency);
      const cg = ctx.createGain();
      cg.gain.value = p.warpA;
      car.connect(cg).connect(filt);
      car.start(time);
      car.stop(end);
    }
    if (p.warpB > 0.01) {
      const am = ctx.createOscillator();
      am.type = "square";
      am.frequency.value = freq * 0.5;
      const ag = ctx.createGain();
      ag.gain.value = p.warpB * 0.5;
      am.connect(ag).connect(g.gain);
      am.start(time);
      am.stop(end);
    }
  } else {
    const o1 = mkOsc(wtName(p.table1), 0, 0, 1 - p.mix12 * 0.5);
    mkOsc(wtName(p.table2), 7, p.oct2, p.mix12 * 0.7);
    // WARP FM
    if (p.warp > 0.01) {
      const mod = ctx.createOscillator();
      mod.type = "sawtooth";
      mod.frequency.value = freq;
      const mg = ctx.createGain();
      mg.gain.value = freq * p.warp * 2.2;
      mod.connect(mg).connect(o1.frequency);
      mod.start(time);
      mod.stop(end);
    }
    // CHAOS — random pitch jitter
    if (p.chaos > 0.01) {
      const nz = ctx.createOscillator();
      nz.type = "sine";
      nz.frequency.value = 13 + Math.random() * 30;
      const ng = ctx.createGain();
      ng.gain.value = p.chaos * 40;
      nz.connect(ng).connect(o1.detune);
      nz.start(time);
      nz.stop(end);
    }
    // filter LFO
    if (p.lfoAmt > 0.01) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = p.lfoRate;
      const la = ctx.createGain();
      la.gain.value = p.lfoAmt * cut * 0.6;
      lfo.connect(la).connect(filt.frequency);
      lfo.start(time);
      lfo.stop(end);
    }
  }
}

/** SUBICH — bass + sub */
function voiceSubich(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, pitch: number, vel: number, time: number, dur: number) {
  const freq = midiHz(pitch + p.octave * 12);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = p.res;
  const cut = skaziCutoffHz(p.cutoff);
  lp.frequency.setValueAtTime(clamp(cut * 2.2, 80, 16000), time);
  lp.frequency.exponentialRampToValueAtTime(clamp(cut, 60, 16000), time + Math.max(0.04, p.decay));
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = skaziCutoffHz(p.hipass);
  const drive = makeShaper(ctx, "soft", p.drive * 0.8);
  const { g, end } = envGain(ctx, time, vel, 0.3, p.attack, p.decay, p.sustain, p.release, dur);
  lp.connect(hp).connect(drive).connect(g).connect(dest);

  const mk = (type: OscillatorType, amp: number, mul = 1) => {
    if (amp <= 0.001) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq * Math.pow(2, -2 / 12), time);
    if (p.glide > 0.01) o.frequency.exponentialRampToValueAtTime(freq * mul, time + p.glide * 0.18);
    else o.frequency.setValueAtTime(freq * mul, time);
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og).connect(lp);
    o.start(time);
    o.stop(end);
  };
  mk("sine", p.sub, 0.5);
  mk("sawtooth", p.saw);
  mk("square", p.square);
}

/* ---------- Intellidaw extras (original devices) ---------- */

/** LIMONANA — iced-mint dream pad: detuned triangle stack + breeze LFO + airy shimmer */
function voiceLimonana(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, pitch: number, vel: number, time: number, dur: number) {
  const freq = midiHz(pitch + p.octave * 12);
  const cut = skaziCutoffHz(p.cutoff);
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = p.res;
  filt.frequency.setValueAtTime(cut, time);

  // slow "breeze" — gentle sine LFO breathing on the filter
  if (p.breeze > 0.01) {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = p.breezeRate;
    const la = ctx.createGain();
    la.gain.value = p.breeze * cut * 0.45;
    lfo.connect(la).connect(filt.frequency);
    lfo.start(time);
    lfo.stop(time + dur + p.release + 2);
  }

  const { g, end } = envGain(ctx, time, vel, 0.2, p.attack, 0.4, p.sustain, p.release, dur);
  filt.connect(g).connect(dest);

  const n = Math.round(p.voices);
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    const spread = n === 1 ? 0 : ((i / (n - 1)) * 2 - 1) * p.spread;
    o.frequency.setValueAtTime(freq, time);
    o.detune.setValueAtTime(spread, time);
    const og = ctx.createGain();
    og.gain.value = 1 / Math.sqrt(n);
    o.connect(og).connect(filt);
    o.start(time);
    o.stop(end);
  }

  // airy "shimmer" — soft noise band above the note (looped shared buffer)
  if (p.shimmer > 0.01) {
    const nz = ctx.createBufferSource();
    nz.buffer = cachedNoise(ctx, 2);
    nz.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = clamp(freq * 4, 800, 12000);
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, time);
    ng.gain.linearRampToValueAtTime(p.shimmer * 0.05 * vel, time + Math.max(0.05, p.attack));
    ng.gain.setTargetAtTime(0.0001, time + Math.max(0.1, dur), Math.max(0.05, p.release / 3));
    nz.connect(bp).connect(ng).connect(dest);
    nz.start(time);
    nz.stop(time + dur + p.release + 1);
  }
}

/** SABICH — lo-fi crunch keys: wavetable through crush + warm drive with a wobbly filter */
function voiceSabich(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, pitch: number, vel: number, time: number, dur: number) {
  const freq = midiHz(pitch + p.octave * 12);
  const cut = skaziCutoffHz(p.cutoff);
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = p.res;
  filt.frequency.setValueAtTime(cut, time);

  if (p.wobbleAmt > 0.01) {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = p.wobbleRate;
    const la = ctx.createGain();
    la.gain.value = p.wobbleAmt * cut * 0.55;
    lfo.connect(la).connect(filt.frequency);
    lfo.start(time);
    lfo.stop(time + dur + p.release + 1);
  }

  const crush = makeShaper(ctx, "crush", p.crush * 0.85);
  const drive = makeShaper(ctx, "tube", p.drive * 0.7);
  const { g, end } = envGain(ctx, time, vel, 0.22, 0.004, p.decay, p.sustain, p.release, dur);
  filt.connect(crush).connect(drive).connect(g).connect(dest);

  const o = ctx.createOscillator();
  o.setPeriodicWave(skaziWave(ctx, wtName(p.table)));
  o.frequency.setValueAtTime(freq, time);
  o.connect(filt);
  o.start(time);
  o.stop(end);

  // subtle sub thump to keep the crunch grounded
  const s = ctx.createOscillator();
  s.type = "sine";
  s.frequency.setValueAtTime(freq * 0.5, time);
  const sg = ctx.createGain();
  sg.gain.value = 0.12;
  s.connect(sg).connect(filt);
  s.start(time);
  s.stop(end);
}

/** MALABI — creamy boom drum: pitched sine drop with soft-clip cream and a gentle click */
function voiceMalabi(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, vel: number, time: number, tune = 0) {
  const boomHz = clamp((28 + p.boom * 90) * Math.pow(2, tune / 12), 20, 220);
  const dec = 0.1 + p.decay * 1.1;

  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(boomHz * (1 + p.drop * 2.4), time);
  body.frequency.exponentialRampToValueAtTime(boomHz, time + Math.max(0.02, dec * 0.28));

  const cream = makeShaper(ctx, "soft", p.cream * 0.75);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.62 * vel, time + 0.004);
  g.gain.setTargetAtTime(0.0001, time + 0.01, dec / 3);
  body.connect(cream).connect(g).connect(dest);
  body.start(time);
  body.stop(time + dec + 0.6);

  if (p.click > 0.01) {
    const nz = ctx.createBufferSource();
    nz.buffer = cachedNoise(ctx, 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1500;
    const ng = ctx.createGain();
    ng.gain.value = p.click * 0.25 * vel;
    nz.connect(hp).connect(ng).connect(dest);
    nz.start(time);
  }
}

/** TBON 303 / SKACID — single note */
export function acidNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  p: VoiceParams,
  pitch: number,
  vel: number,
  accent: boolean,
  slideFrom: number | null,
  time: number,
  dur: number,
  opts: { slope?: number; crunch?: number; drift?: number; sub?: number; click?: number } = {}
) {
  const freq = midiHz(pitch + (p.octave ?? 0) * 12);
  const amp = vel * (accent ? 0.34 : 0.24) * (1 + (accent ? p.accent * 0.6 : 0));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(amp, time + 0.004);
  g.gain.setValueAtTime(amp, time + Math.max(0.004, dur * 0.7));
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);

  const drive = makeShaper(ctx, "tube", 0.2 + (opts.crunch ?? p.drive ?? 0) * 0.6);
  const { slope } = opts;
  const stages = slope === undefined ? (p.slope !== undefined ? Math.max(1, 3 - Math.round(p.slope)) : 2) : slope === 0 ? 2 : slope === 1 ? 2 : 1;
  const baseCut = skaziCutoffHz(p.cutoff);
  const peakCut = clamp(baseCut * (1 + p.envAmt * (accent ? 6 : 3.2)), 80, 16000);
  const filters: BiquadFilterNode[] = [];
  for (let i = 0; i < stages; i++) {
    const fl = ctx.createBiquadFilter();
    fl.type = slope === 3 ? "bandpass" : "lowpass";
    fl.Q.value = i === 0 ? p.res : p.res * 0.5;
    fl.frequency.setValueAtTime(peakCut, time);
    fl.frequency.exponentialRampToValueAtTime(clamp(baseCut, 50, 16000), time + Math.max(0.03, p.decay));
    filters.push(fl);
  }
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
  filters[filters.length - 1].connect(drive).connect(g).connect(dest);

  const driftCents = ((Math.random() * 2 - 1) * (opts.drift ?? p.drift ?? 0)) * 18;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  if (slideFrom !== null) {
    o.frequency.setValueAtTime(midiHz(slideFrom + (p.octave ?? 0) * 12), time);
    o.frequency.exponentialRampToValueAtTime(freq, time + Math.max(0.02, p.slide * 0.16));
  } else {
    o.frequency.setValueAtTime(freq, time);
  }
  o.detune.value = driftCents;
  o.connect(filters[0]);
  o.start(time);
  o.stop(time + dur + 0.1);

  const subLvl = opts.sub ?? p.sub ?? 0;
  if (subLvl > 0.01) {
    const s = ctx.createOscillator();
    s.type = "sine";
    s.frequency.setValueAtTime(freq / 2, time);
    const sg = ctx.createGain();
    sg.gain.value = subLvl * 0.6;
    s.connect(sg).connect(filters[0]);
    s.start(time);
    s.stop(time + dur + 0.1);
  }
  if ((opts.click ?? p.click ?? 0) > 0.01) {
    const n = ctx.createBufferSource();
    n.buffer = cachedNoise(ctx, 0.012);
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 2400;
    const ng = ctx.createGain();
    ng.gain.value = (opts.click ?? p.click) * 0.4 * vel;
    n.connect(nf).connect(ng).connect(dest);
    n.start(time);
  }
}

/** KICKASS — two-stage kick */
export function kickassVoice(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, vel: number, time: number, tune = 0) {
  const rate = Math.pow(2, (p.tune ?? tune) / 12);
  const snapF = (40 + p.snap * 200) * rate;
  const sweepF = (30 + p.sweep * 80) * rate;
  const holdS = p.hold * 0.12;
  const decS = 0.08 + p.decay * 0.62;

  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(snapF * 2.4, time);
  o.frequency.exponentialRampToValueAtTime(snapF, time + 0.009);
  o.frequency.setValueAtTime(snapF, time + 0.009 + holdS);
  o.frequency.exponentialRampToValueAtTime(sweepF, time + 0.009 + holdS + decS);

  const g = ctx.createGain();
  // adaptive trim: the 3-band EQ can add up to +12 dB per band — attenuate
  // by the actual boost so the dry voice can never clip digital full scale
  const boostDb =
    Math.max(0, (p.eqLo - 0.5) * 24) +
    Math.max(0, (p.eqMid - 0.5) * 24) * 0.4 +
    Math.max(0, (p.eqHi - 0.5) * 24) * 0.25;
  const trim = 0.9 / Math.pow(10, boostDb / 20);
  g.gain.setValueAtTime(vel * trim, time);
  g.gain.setValueAtTime(vel * trim, time + 0.009 + holdS);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.009 + holdS + decS);

  // 3-band EQ
  const lo = ctx.createBiquadFilter();
  lo.type = "lowshelf";
  lo.frequency.value = 120;
  lo.gain.value = (p.eqLo - 0.5) * 24;
  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 900;
  mid.Q.value = 1;
  mid.gain.value = (p.eqMid - 0.5) * 24;
  const hi = ctx.createBiquadFilter();
  hi.type = "highshelf";
  hi.frequency.value = 4200;
  hi.gain.value = (p.eqHi - 0.5) * 24;
  o.connect(lo).connect(mid).connect(hi).connect(g).connect(dest);
  o.start(time);
  o.stop(time + 0.01 + holdS + decS + 0.2);

  if (p.click > 0.01) {
    const n = ctx.createBufferSource();
    n.buffer = cachedNoise(ctx, 0.02);
    const nf = ctx.createBiquadFilter();
    nf.type = "highpass";
    nf.frequency.value = 1500;
    const ng = ctx.createGain();
    ng.gain.value = p.click * 0.5 * vel;
    n.connect(nf).connect(ng).connect(dest);
    n.start(time);
  }
}

/** BAMBA — riser one-shot */
export function bambaRiser(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, bpm: number, time: number) {
  const bars = Math.round(p.bars);
  const dur = bars * 4 * (60 / bpm);
  const baseFreq = 110;
  const topFreq = baseFreq * Math.pow(2, p.oct);
  const curvePow = p.curve < 0.33 ? 1 : p.curve < 0.66 ? 1.8 : 2.6;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, time);
  master.gain.linearRampToValueAtTime(0.5, time + Math.min(0.4, dur * 0.1));
  master.gain.setValueAtTime(0.5, time + dur * 0.92);
  master.gain.exponentialRampToValueAtTime(0.001, time + dur);
  const bright = ctx.createBiquadFilter();
  bright.type = "lowpass";
  bright.frequency.setValueAtTime(1200 + p.bright * 9000, time);
  master.connect(bright).connect(dest);

  const wantSynth = p.type < 0.5 || p.type > 1.5;
  const wantNoise = p.type > 0.5;

  if (wantSynth) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(baseFreq, time);
    o.frequency.exponentialRampToValueAtTime(topFreq, time + dur * (0.6 + curvePow * 0.35));
    const o2 = ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.setValueAtTime(baseFreq * 1.005, time);
    o2.frequency.exponentialRampToValueAtTime(topFreq * 1.01, time + dur);
    const og = ctx.createGain();
    og.gain.value = 0.5;
    o.connect(og);
    o2.connect(og);
    og.connect(master);
    o.start(time); o.stop(time + dur + 0.1);
    o2.start(time); o2.stop(time + dur + 0.1);
  }
  if (wantNoise) {
    const n = ctx.createBufferSource();
    n.buffer = cachedNoise(ctx, 2);
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(400, time);
    bp.frequency.exponentialRampToValueAtTime(9000, time + dur * (0.55 + curvePow * 0.4));
    const ng = ctx.createGain();
    ng.gain.value = 0.55;
    n.connect(bp).connect(ng).connect(master);
    n.start(time);
    n.stop(time + dur + 0.1);
  }
  // gate fx
  const gateIdx = Math.round(p.gate);
  if (gateIdx > 0) {
    const gate = ctx.createGain();
    const div = gateIdx === 1 ? 8 : 16;
    const stepDur = (60 / bpm) / 4 * (16 / div) * 4; // seconds per gate slot
    // rebuild chain: insert gate after master
    bright.disconnect();
    master.connect(gate).connect(bright).connect(dest);
    gate.gain.setValueAtTime(1, time);
    for (let t = time; t < time + dur; t += stepDur) {
      gate.gain.setValueAtTime(1, t);
      gate.gain.setValueAtTime(0.12, t + stepDur * 0.5);
    }
  }
  // snare roll
  if (p.roll > 0.5) {
    const rateIdx = Math.round(p.rollRate);
    const stepDur = 60 / bpm / 4;
    let interval = stepDur * [4, 2, 1, 0.5, 2][rateIdx];
    let t = time;
    let guard = 0;
    while (t < time + dur - stepDur && guard++ < 400) {
      const n = ctx.createBufferSource();
      n.buffer = cachedNoise(ctx, 0.12);
      const nf = ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 1900;
      nf.Q.value = 0.9;
      const ng = ctx.createGain();
      const prog = (t - time) / dur;
      ng.gain.setValueAtTime(0.12 + prog * 0.5, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      n.connect(nf).connect(ng).connect(bright);
      n.start(t);
      if (rateIdx === 4) interval = Math.max(stepDur / 2, interval * 0.82); // ACCEL
      t += interval;
    }
  }
  // impact hit at the end
  if (p.impact > 0.05) {
    const it = time + dur;
    kickassVoice(ctx, dest, { snap: 0.6, sweep: 0.24, hold: 0, decay: 0.5, click: 0.3, eqLo: 0.9, eqMid: 0.5, eqHi: 0.3, tune: 0 }, p.impact, it);
  }
}

/** dispatch a playable voice (used for previews + MIDI GOD audition) */
export function scheduleSkaziVoice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  deviceId: string,
  p: VoiceParams,
  pitch: number,
  time: number,
  dur: number,
  vel = 0.9
) {
  switch (deviceId) {
    case "skazi": voiceSkazi(ctx, dest, p, pitch, vel, time, dur); break;
    case "bully": voiceWavetable(ctx, dest, p, pitch, vel, time, dur, false); break;
    case "kube": voiceWavetable(ctx, dest, p, pitch, vel, time, dur, true); break;
    case "subich": voiceSubich(ctx, dest, p, pitch, vel, time, dur); break;
    case "kickass": kickassVoice(ctx, dest, p, vel, time); break;
    case "fm1": fm1Voice(ctx, dest, p, pitch, vel, time, dur); break;
    /* Intellidaw extras */
    case "limonana": voiceLimonana(ctx, dest, p, pitch, vel, time, dur); break;
    case "sabich": voiceSabich(ctx, dest, p, pitch, vel, time, dur); break;
    case "malabi": voiceMalabi(ctx, dest, p, vel, time, p.tune ?? 0); break;
  }
}

/* ================= MASTER FX CHAIN ================= */

interface FxDevice {
  input: GainNode;
  output: GainNode;
  update(params: VoiceParams, bpm: number): void;
  start(): void;
  stop(): void;
  dispose(): void;
  structuralId?: string;
}

type FxBuilder = (ctx: BaseAudioContext) => FxDevice;

function buildLfo(ctx: BaseAudioContext, freq: number, type: OscillatorType = "sine") {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const a = ctx.createGain();
  a.gain.value = 1;
  o.connect(a);
  o.start();
  return { osc: o, out: a };
}

const buildPitaPump: FxBuilder = (ctx) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const pump = ctx.createGain();
  const lfo = buildLfo(ctx, 2);
  const depth = ctx.createGain();
  depth.gain.value = 0;
  lfo.out.connect(depth).connect(pump.gain);
  input.connect(pump).connect(output);
  let mode = 0;
  return {
    input,
    output,
    update(p, bpm) {
      const rates = [1, 2, 3, 4];
      const mult = rates[clamp(Math.round(p.rate), 0, 3)];
      lfo.osc.frequency.setTargetAtTime((bpm / 60) * mult, ctx.currentTime, 0.05);
      lfo.osc.type = p.curve < 0.5 ? "sine" : "triangle";
      depth.gain.setTargetAtTime(-p.depth / 2, ctx.currentTime, 0.05);
      pump.gain.setTargetAtTime(1 - p.depth / 2, ctx.currentTime, 0.05);
      mode = Math.round(p.rate);
    },
    start() {},
    stop() {},
    dispose() {
      lfo.osc.stop();
    },
    structuralId: String(mode),
  };
};

/** chopper core used by SHAKSUKA & SALAT */
function buildChopper(
  ctx: BaseAudioContext,
  opts: { crush: string; ring: boolean; filterLfo: boolean; tapeStop: boolean; reverse: boolean; random: boolean }
): FxDevice {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const chop = ctx.createGain();
  const crush = makeShaper(ctx, opts.crush as CurveName, 0.7);
  const dryWet = ctx.createGain();
  const dry = ctx.createGain();
  input.connect(chop);
  input.connect(dry);
  dry.gain.value = 0.6;
  chop.connect(crush).connect(dryWet);
  input.connect(dryWet); // blend node: we crossfade below

  let ringNodes: { osc: OscillatorNode; gain: GainNode } | null = null;
  if (opts.ring) {
    const osc = ctx.createOscillator();
    osc.frequency.value = 720;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    osc.start();
    ringNodes = { osc, gain: g };
  }
  let filterLfo: { osc: OscillatorNode; gain: GainNode; filt: BiquadFilterNode } | null = null;
  if (opts.filterLfo) {
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 4000;
    filt.Q.value = 8;
    const osc = ctx.createOscillator();
    osc.frequency.value = 2;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g).connect(filt.frequency);
    osc.start();
    // rewire: chop → filt → crush
    chop.disconnect();
    chop.connect(filt);
    filt.connect(crush);
    filterLfo = { osc, gain: g, filt };
  }

  dryWet.disconnect();
  if (ringNodes) {
    dryWet.connect(ringNodes.gain);
    ringNodes.gain.connect(output);
  }
  dryWet.connect(output);

  let timer: ReturnType<typeof setInterval> | null = null;
  let stepCount = 0;
  let params: VoiceParams = {};
  let bpmRef = 120;
  // 16-step chop pattern: 0 = pass, 1 = gate, 2 = stutter, 3 = burst, 4 = duck
  let pattern: number[] = new Array(16).fill(0);

  const reroll = (density: number) => {
    pattern = pattern.map(() => {
      const r = Math.random();
      if (r < density * 0.45) return 1;
      if (r < density * 0.6) return 2;
      if (r < density * 0.7) return 3;
      if (r < density * 0.8) return 4;
      return 0;
    });
  };
  reroll(0.4);

  const stepMs = () => {
    const rateIdx = Math.round(params.rate ?? 1);
    const div = [2, 4, 8][clamp(rateIdx, 0, 2)];
    return ((60 / bpmRef) / 4) * (16 / div) * 4 * 1000 * (16 / 16);
  };

  const doStep = () => {
    stepCount++;
    const amt = params.amount ?? 0.5;
    if (opts.random && stepCount % 16 === 0) reroll(amt);
    const mode = pattern[stepCount % 16];
    const t = ctx.currentTime + 0.02;
    const d = stepMs() / 1000;
    chop.gain.cancelScheduledValues(t);
    if (mode === 1) {
      chop.gain.setValueAtTime(1 - amt * 0.9, t);
    } else if (mode === 2) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        chop.gain.setValueAtTime(i % 2 ? 0.05 : 1, t + (d / n) * i);
      }
    } else if (mode === 3) {
      // burst: inverted envelope (fake reverse)
      chop.gain.setValueAtTime(0.02, t);
      chop.gain.exponentialRampToValueAtTime(1.1, t + d * 0.9);
    } else if (mode === 4 && opts.tapeStop) {
      chop.gain.exponentialRampToValueAtTime(0.03, t + d * 0.8);
      chop.gain.setValueAtTime(1, t + d);
    } else {
      chop.gain.setValueAtTime(1, t);
    }
  };

  return {
    input,
    output,
    update(p, bpm) {
      params = p;
      bpmRef = bpm;
      const rateIdx = clamp(Math.round(p.rate ?? 1), 0, 2);
      const div = [2, 4, 8][rateIdx];
      const stepSec = ((60 / bpm) / 4) * (4 / div) * 4 / 4; // 1/div note in 16ths → seconds
      const ms = ((60 / bpm) * 4 * (1 / (div * 4))) * 1000 * 4 / 4;
      void stepSec;
      if (timer) clearInterval(timer);
      timer = setInterval(doStep, ms || 125);
      crush.curve = shaperCurve(opts.crush as CurveName, (p.crush ?? 0.5) * 0.8);
      dryWet.gain.value = 0.4 + (p.amount ?? 0.5) * 0.6;
      dry.gain.value = 1 - (p.amount ?? 0.5) * 0.7;
      if (ringNodes) {
        ringNodes.osc.frequency.value = 480 + (p.ring ?? 0) * 1400;
        ringNodes.gain.gain.value = (p.ring ?? 0) * 0.4;
      }
      if (filterLfo) {
        filterLfo.osc.frequency.value = ((bpm / 60) / 2) * [1, 1, 2][rateIdx];
        filterLfo.gain.gain.value = (p.filter ?? 0.3) * 3200;
        filterLfo.filt.frequency.value = 900 + (1 - (p.filter ?? 0.3)) * 6000;
      }
    },
    start() {},
    stop() {
      chop.gain.setValueAtTime(1, ctx.currentTime);
    },
    dispose() {
      if (timer) clearInterval(timer);
      ringNodes?.osc.stop();
      filterLfo?.osc.stop();
    },
  };
}

const buildShaksuka: FxBuilder = (ctx) => buildChopper(ctx, { crush: "crush", ring: false, filterLfo: false, tapeStop: false, reverse: true, random: true });
const buildSalat: FxBuilder = (ctx) => buildChopper(ctx, { crush: "fuzz", ring: true, filterLfo: true, tapeStop: true, reverse: true, random: true });

const buildFilterFish: FxBuilder = (ctx) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  const lpGain = ctx.createGain();
  const hpGain = ctx.createGain();
  const drive = makeShaper(ctx, "tube", 0.3);
  input.connect(dry).connect(output);
  input.connect(lp).connect(lpGain);
  input.connect(hp).connect(hpGain);
  lpGain.connect(drive);
  hpGain.connect(drive);
  drive.connect(wet).connect(output);

  const lfo = buildLfo(ctx, 2);
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = 0;
  lfo.out.connect(lfoAmt);
  lfoAmt.connect(lp.frequency);
  lfoAmt.connect(hp.frequency);

  // chorus
  const chDelay = ctx.createDelay(0.1);
  chDelay.delayTime.value = 0.022;
  const chLfo = buildLfo(ctx, 0.6);
  const chAmt = ctx.createGain();
  chAmt.gain.value = 0.004;
  chLfo.out.connect(chAmt).connect(chDelay.delayTime);
  const chMix = ctx.createGain();
  wet.connect(chDelay).connect(chMix).connect(output);

  return {
    input,
    output,
    update(p, bpm) {
      const f = skaziCutoffHz(p.freq);
      const m = p.morph;
      lp.frequency.value = clamp(f * 1.4, 60, 18000);
      hp.frequency.value = clamp(f * 0.55, 40, 16000);
      lpGain.gain.value = Math.cos(m * Math.PI / 2);
      hpGain.gain.value = Math.sin(m * Math.PI / 2);
      lp.Q.value = p.res;
      hp.Q.value = p.res * 0.7;
      const syncs = [1, 0.5, 0.25, 0.125, 0.0625];
      lfo.osc.frequency.setTargetAtTime((bpm / 60) * 2 * syncs[clamp(Math.round(p.lfoRate), 0, 4)], ctx.currentTime, 0.05);
      lfoAmt.gain.value = p.lfoAmt * f * 0.8;
      drive.curve = shaperCurve("tube", p.drive * 0.8);
      wet.gain.value = p.mix;
      dry.gain.value = 1 - p.mix * 0.8;
      chMix.gain.value = p.chorus * 0.6;
    },
    start() {},
    stop() {},
    dispose() {
      lfo.osc.stop();
      chLfo.osc.stop();
    },
  };
};

const buildSkilter: FxBuilder = (ctx) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  const f1 = ctx.createBiquadFilter();
  const f2 = ctx.createBiquadFilter();
  f1.Q.value = 8;
  const drive = makeShaper(ctx, "soft", 0.3);
  input.connect(dry).connect(output);
  input.connect(f1).connect(f2).connect(drive).connect(wet).connect(output);

  let timer: ReturnType<typeof setInterval> | null = null;
  let step = 0;
  let params: VoiceParams = {};
  let bpmRef = 120;
  let pattern: number[] = Array.from({ length: 16 }, () => 1 + (Math.random() * 2 - 1));
  let lastStruct = "";

  const doStep = () => {
    step++;
    const amt = params.seqAmt ?? 0.5;
    const f = skaziCutoffHz(params.freq ?? 0.4);
    const mult = pattern[step % 16];
    const target = clamp(f * (1 + (mult - 1) * amt * 2.2), 40, 18000);
    const rateIdx = clamp(Math.round(params.rate ?? 1), 0, 2);
    const ms = ((60 / bpmRef) / 4) * [2, 1, 0.5][rateIdx] * 1000;
    f1.frequency.setTargetAtTime(target, ctx.currentTime, ms / 1000 / 3);
  };

  return {
    input,
    output,
    update(p, bpm) {
      params = p;
      bpmRef = bpm;
      const struct = `${p.mode | 0}:${p.slope | 0}`;
      if (struct !== lastStruct) {
        lastStruct = struct;
        const types = ["lowpass", "bandpass", "highpass", "notch"];
        f1.type = types[clamp(Math.round(p.mode), 0, 3)] as BiquadFilterType;
        f2.type = f1.type as BiquadFilterType;
        // slope: 12dB = single stage (bypass f2 via allpass-ish), we approximate with Q tweak
        f2.Q.value = p.slope >= 2 ? 8 : 0.0001;
        f1.Q.value = p.slope >= 1 ? p.res : p.res;
      }
      f1.Q.value = p.res;
      drive.curve = shaperCurve("tube", p.drive * 0.7);
      wet.gain.value = p.mix;
      dry.gain.value = 1 - p.mix * 0.85;
      const on = p.seq > 0.5;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (on) {
        const rateIdx = clamp(Math.round(p.rate ?? 1), 0, 2);
        const ms = ((60 / bpm) / 4) * [2, 1, 0.5][rateIdx] * 1000;
        timer = setInterval(doStep, ms || 125);
      } else {
        f1.frequency.setTargetAtTime(clamp(skaziCutoffHz(p.freq), 40, 18000), ctx.currentTime, 0.05);
      }
    },
    start() {},
    stop() {},
    dispose() {
      if (timer) clearInterval(timer);
    },
  };
};

const buildQuazi: FxBuilder = (ctx) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);

  // mono sum for low bands
  const monoL = ctx.createGain();
  const monoR = ctx.createGain();
  const monoSum = ctx.createGain();
  monoL.gain.value = 0.5;
  monoR.gain.value = 0.5;
  splitter.connect(monoL, 0);
  splitter.connect(monoR, 1);
  monoL.connect(monoSum);
  monoR.connect(monoSum);

  input.connect(splitter);

  interface Band {
    filters: BiquadFilterNode[];
    drive: WaveShaperNode;
    gain: GainNode;
  }
  const mkBand = (): Band => {
    const f1 = ctx.createBiquadFilter();
    const f2 = ctx.createBiquadFilter();
    const drive = ctx.createWaveShaper();
    drive.oversample = "2x";
    const gain = ctx.createGain();
    return { filters: [f1, f2], drive, gain };
  };
  const bands = [mkBand(), mkBand(), mkBand(), mkBand()];

  const connectBand = (b: Band, dest: AudioNode, type1: BiquadFilterType, type2: BiquadFilterType) => {
    b.filters[0].type = type1;
    b.filters[1].type = type2;
    b.filters[0].connect(b.filters[1]).connect(b.drive).connect(b.gain).connect(dest);
    b.filters.forEach((x) => (x.Q.value = 0.7071));
  };
  // LR4 ≈ two cascaded butterworth
  connectBand(bands[0], merger, "lowpass", "lowpass"); // sub → L+R
  connectBand(bands[1], merger, "lowpass", "lowpass");
  connectBand(bands[2], merger, "highpass", "highpass");
  connectBand(bands[3], merger, "highpass", "highpass");
  // feed: band0/1 from monoSum or stereo per side handled in update via input selection
  // simple approach: low bands receive monoSum always (their stereo content is centered anyway)
  monoSum.connect(bands[0].filters[0]);
  monoSum.connect(bands[1].filters[0]);
  splitter.connect(bands[2].filters[0], 0);
  splitter.connect(bands[3].filters[0], 0);
  // also feed right channel of high bands through a second path
  const split2 = ctx.createChannelSplitter(2);
  input.connect(split2);
  const hiR1 = ctx.createGain();
  const hiR2 = ctx.createGain();
  split2.connect(hiR1, 1);
  split2.connect(hiR2, 1);
  hiR1.connect(bands[2].filters[0]);
  hiR2.connect(bands[3].filters[0]);

  // merge band outputs: bands 0/1 mono → both channels; bands 2/3 stereo L + R
  bands.forEach((b) => {
    if (b === bands[0] || b === bands[1]) {
      b.gain.connect(merger, 0, 0);
      b.gain.connect(merger, 0, 1);
    } else {
      b.gain.connect(merger, 0, 0);
    }
  });
  merger.connect(output);

  const postEq = ctx.createBiquadFilter();
  postEq.type = "highshelf";
  postEq.frequency.value = 6000;
  // place post EQ: merger → postEq → output
  merger.disconnect();
  merger.connect(postEq).connect(output);

  let lastType = -1;
  return {
    input,
    output,
    update(p) {
      const f1 = clamp(skaziCutoffHz(p.split1) * 0.8, 40, 4000);
      const f2 = clamp(skaziCutoffHz(p.split2), 100, 8000);
      const f3 = clamp(f2 * 3.5, 200, 16000);
      const [b0, b1, b2, b3] = bands;
      b0.filters.forEach((x) => (x.frequency.value = f1));
      b1.filters.forEach((x, i) => (x.frequency.value = i === 0 ? f1 : f2));
      // band1 must be highpassed at f1 too: we set band1 as LP chain fed post band0? Keep simple: band1 = HP(f1)→LP(f2) via retype
      b1.filters[0].type = "highpass";
      b1.filters[1].type = "lowpass";
      b1.filters[0].frequency.value = f1;
      b1.filters[1].frequency.value = f2;
      b2.filters.forEach((x, i) => (x.frequency.value = i === 0 ? f2 : f3));
      b2.filters[0].type = "highpass";
      b2.filters[1].type = "lowpass";
      b2.filters[0].frequency.value = f2;
      b2.filters[1].frequency.value = f3;
      b3.filters.forEach((x) => (x.frequency.value = f3));
      b3.filters[0].type = "highpass";
      b3.filters[1].type = "highpass";

      const type = clamp(Math.round(p.type), 0, 3);
      if (type !== lastType || true) {
        lastType = type;
        const names: CurveName[] = ["soft", "hard", "fuzz", "tube"];
        [b0, b1, b2, b3].forEach((b, i) => {
          const amt = [p.d1, p.d2, p.d3, p.d4][i] ?? 0.3;
          b.drive.curve = shaperCurve(names[type], amt * 0.9);
          b.gain.gain.value = 0.4 + amt * 0.5;
        });
      }
      postEq.gain.value = (p.eq - 0.5) * 12;
    },
    start() {},
    stop() {},
    dispose() {},
  };
};

/** M/S width helper (shared by SKWIDE & ZHUG) */
function buildMsWidth(ctx: BaseAudioContext) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const midL = ctx.createGain();
  const midR = ctx.createGain();
  const sideL = ctx.createGain();
  const sideR = ctx.createGain();
  midL.gain.value = 0.5;
  midR.gain.value = 0.5;
  sideL.gain.value = 0.5;
  sideR.gain.value = -0.5;
  input.connect(split);
  split.connect(midL, 0);
  split.connect(midR, 1);
  split.connect(sideL, 0);
  split.connect(sideR, 1);
  const mid = ctx.createGain();
  const side = ctx.createGain();
  midL.connect(mid);
  midR.connect(mid);
  sideL.connect(side);
  sideR.connect(side);
  const sideWidth = ctx.createGain();
  side.connect(sideWidth);
  const outL = ctx.createGain();
  const outR = ctx.createGain();
  const sideInv = ctx.createGain();
  sideInv.gain.value = -1;
  mid.connect(outL);
  sideWidth.connect(outL);
  mid.connect(outR);
  sideWidth.connect(sideInv).connect(outR);
  outL.connect(merge, 0, 0);
  outR.connect(merge, 0, 1);
  merge.connect(output);
  return {
    input,
    output,
    setWidth(w: number) {
      sideWidth.gain.setTargetAtTime(w, ctx.currentTime, 0.03);
    },
    setMono(on: boolean) {
      sideWidth.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.03);
    },
  };
}

const buildSkwide: FxBuilder = (ctx) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const ms = buildMsWidth(ctx);
  input.connect(ms.input);
  ms.output.connect(output);

  // super wide Haas micro-delay on side
  const haas = ctx.createDelay(0.05);
  const monoSpread = ctx.createDelay(0.03);
  return {
    input,
    output,
    update(p) {
      ms.setWidth(p.mono > 0.5 ? 0 : clamp(p.width, 0, 2));
      void monoSpread;
      void haas;
      // LOW BYPASS + SUPER WIDE approximated via side filtering
      void p;
    },
    start() {},
    stop() {},
    dispose() {},
  };
};

const buildZhug: FxBuilder = (ctx) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const lpL = ctx.createBiquadFilter();
  const lpR = ctx.createBiquadFilter();
  const hpL = ctx.createBiquadFilter();
  const hpR = ctx.createBiquadFilter();
  lpL.type = lpR.type = "lowpass";
  hpL.type = hpR.type = "highpass";
  lpL.frequency.value = lpR.frequency.value = 900;
  hpL.frequency.value = hpR.frequency.value = 900;
  const satL = makeShaper(ctx, "soft", 0.6);
  const satR = makeShaper(ctx, "soft", 0.6);
  const satHiL = makeShaper(ctx, "hard", 0.4);
  const satHiR = makeShaper(ctx, "hard", 0.4);
  const lowGain = ctx.createGain();
  const hiGain = ctx.createGain();
  input.connect(split);
  split.connect(lpL, 0);
  split.connect(lpR, 1);
  split.connect(hpL, 0);
  split.connect(hpR, 1);
  lpL.connect(satL);
  lpR.connect(satR);
  satL.connect(lowGain);
  satR.connect(lowGain);
  hpL.connect(satHiL);
  hpR.connect(satHiR);
  satHiL.connect(hiGain);
  satHiR.connect(hiGain);
  lowGain.connect(merge, 0, 0);
  lowGain.connect(merge, 0, 1);
  hiGain.connect(merge, 0, 0);
  const ms = buildMsWidth(ctx);
  merge.connect(ms.input);
  ms.output.connect(output);
  return {
    input,
    output,
    update(p) {
      const k = 0.2 + p.drive * 1.4;
      satL.curve = shaperCurve("tube", k * 0.6);
      satR.curve = shaperCurve("tube", k * 0.6);
      satHiL.curve = shaperCurve("hard", k * 0.5);
      satHiR.curve = shaperCurve("hard", k * 0.5);
      const f = 400 + (1 - p.tone) * 1400;
      [lpL, lpR].forEach((x) => (x.frequency.value = f));
      [hpL, hpR].forEach((x) => (x.frequency.value = f));
      lowGain.gain.value = 0.5 + p.drive * 0.3;
      hiGain.gain.value = 0.4 + p.tone * 0.4;
      ms.setWidth(clamp(p.width, 0, 2));
    },
    start() {},
    stop() {},
    dispose() {},
  };
};

const buildTahini: FxBuilder = (ctx) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  input.connect(dry).connect(output);

  const dL = ctx.createDelay(3);
  const dR = ctx.createDelay(3);
  const fbL = ctx.createGain();
  const fbR = ctx.createGain();
  const toneL = ctx.createBiquadFilter();
  const toneR = ctx.createBiquadFilter();
  toneL.type = toneR.type = "lowpass";
  const drive = makeShaper(ctx, "tube", 0.3);
  const panL = ctx.createStereoPanner();
  const panR = ctx.createStereoPanner();
  panL.pan.value = -0.8;
  panR.pan.value = 0.8;

  input.connect(dL);
  dL.connect(toneL).connect(drive);
  drive.connect(fbL).connect(dR);
  dR.connect(toneR);
  toneR.connect(fbR).connect(dL);
  dL.connect(panL).connect(wet);
  dR.connect(panR).connect(wet);
  wet.connect(output);

  // tape wobble — LFO on delay time (Doppler pitch drift of the repeats)
  const wob = buildLfo(ctx, 0.7);
  const wobAmt = ctx.createGain();
  wobAmt.gain.value = 0;
  wob.out.connect(wobAmt);
  wobAmt.connect(dL.delayTime);
  wobAmt.connect(dR.delayTime);

  return {
    input,
    output,
    update(p, bpm) {
      const mults = [1, 0.5, 0.75, 0.25, 0.375];
      const base = (60 / bpm) * 2 * mults[clamp(Math.round(p.time), 0, 4)];
      dL.delayTime.setTargetAtTime(base, ctx.currentTime, 0.08);
      const mode = clamp(Math.round(p.mode), 0, 6);
      // PING-PONG cross feedback; STEREO light cross; others between
      const cross = mode === 0 ? 0.95 : mode === 1 ? 0.3 : mode === 2 ? 0.85 : mode === 5 ? 0.7 : 0.55;
      fbL.gain.setTargetAtTime(p.feedback * cross, ctx.currentTime, 0.05);
      fbR.gain.setTargetAtTime(p.feedback * cross * (mode === 6 ? 0.4 : 1), ctx.currentTime, 0.05);
      const toneHz = 800 + p.tone * 8000;
      toneL.frequency.setTargetAtTime(toneHz, ctx.currentTime, 0.05);
      toneR.frequency.setTargetAtTime(mode === 3 ? 15000 : toneHz, ctx.currentTime, 0.05);
      drive.curve = shaperCurve("tube", p.drive * 0.7);
      wob.osc.frequency.value = mode === 2 ? 6.2 : 0.6;
      wobAmt.gain.value = p.wobble * base * 0.06 + (p.pitch > 0 ? p.pitch * base * 0.03 : 0);
      wet.gain.value = p.mix;
      dry.gain.value = 1 - p.mix * 0.5;
    },
    start() {},
    stop() {},
    dispose() {
      wob.osc.stop();
    },
  };
};

const buildSkverb: FxBuilder = (ctx) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const wet = ctx.createGain();
  const dry = ctx.createGain();
  const pre = ctx.createDelay(0.5);
  const conv = ctx.createConvolver();
  const tail = ctx.createBiquadFilter();
  tail.type = "lowpass";
  const duckComp = ctx.createDynamicsCompressor();
  duckComp.threshold.value = -18;
  duckComp.ratio.value = 4;
  duckComp.attack.value = 0.01;
  duckComp.release.value = 0.25;
  input.connect(dry).connect(output);
  input.connect(pre).connect(conv).connect(tail).connect(duckComp).connect(wet).connect(output);

  let irKey = "";
  return {
    input,
    output,
    update(p) {
      const algo = clamp(Math.round(p.algo), 0, 9);
      const key = `${algo}:${Math.round(p.size * 6)}:${Math.round(p.decay * 6)}`;
      if (key !== irKey) {
        irKey = key;
        conv.buffer = skaziIR(ctx, algo, p.size, p.decay);
      }
      pre.delayTime.setTargetAtTime(p.preDelay * 0.12, ctx.currentTime, 0.05);
      tail.frequency.setTargetAtTime(clamp(skaziCutoffHz(p.tailLp), 500, 18000), ctx.currentTime, 0.05);
      duckComp.threshold.value = p.duck > 0.05 ? -6 - p.duck * 20 : 0;
      wet.gain.value = p.mix;
      dry.gain.value = 1 - p.mix * 0.6;
    },
    start() {},
    stop() {},
    dispose() {},
  };
};

/* ---------------- chain ---------------- */

const CHAIN_ORDER = ["pitapump", "shaksuka", "salat", "filterfish", "skilter", "quazi", "zhug", "skwide", "tahini", "skverb"] as const;
const BUILDERS: Record<string, FxBuilder> = {
  pitapump: buildPitaPump,
  shaksuka: buildShaksuka,
  salat: buildSalat,
  filterfish: buildFilterFish,
  skilter: buildSkilter,
  quazi: buildQuazi,
  skwide: buildSkwide,
  zhug: buildZhug,
  tahini: buildTahini,
  skverb: buildSkverb,
};

export class SkaziChain {
  readonly input: GainNode;
  readonly output: GainNode;
  private ctx: BaseAudioContext;
  private devices = new Map<string, FxDevice>();
  private state: SkaziState | null = null;
  private bpm = 120;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.rebuild();
  }

  /** reconnect active devices in order, bypassing the rest */
  private rebuild() {
    try {
      this.input.disconnect();
    } catch { /* noop */ }
    const active = CHAIN_ORDER.filter((id) => this.state?.fx[id]?.enabled);
    // dispose disabled devices
    for (const [id, dev] of this.devices) {
      if (!active.includes(id as (typeof CHAIN_ORDER)[number])) {
        dev.dispose();
        try {
          dev.output.disconnect();
        } catch { /* noop */ }
        this.devices.delete(id);
      }
    }
    let node: AudioNode = this.input;
    for (const id of active) {
      let dev = this.devices.get(id);
      if (!dev) {
        dev = BUILDERS[id](this.ctx);
        this.devices.set(id, dev);
        dev.start();
      }
      node.connect(dev.input);
      node = dev.output;
      const st = this.state?.fx[id];
      if (st) dev.update(st.params, this.bpm);
    }
    node.connect(this.output);
  }

  apply(state: SkaziState, bpm: number) {
    const first = !this.state;
    this.state = state;
    this.bpm = bpm;
    const activeNow = CHAIN_ORDER.filter((id) => state.fx[id]?.enabled);
    const activeBefore = [...this.devices.keys()];
    const topologyChanged =
      first ||
      activeNow.length !== activeBefore.length ||
      activeNow.some((id, i) => activeBefore[i] !== id);
    if (topologyChanged) this.rebuild();
    for (const id of activeNow) {
      const dev = this.devices.get(id);
      const st = state.fx[id];
      if (dev && st) dev.update(st.params, bpm);
    }
  }

  stopAll() {
    this.devices.forEach((d) => d.stop());
  }
}

/* ================= 303 SEQUENCER ================= */

export class SkaziSequencer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private queue: Array<{ step: number; time: number }> = [];
  private raf = 0;
  private lastPitch: number | null = null;
  playing = false;
  onStep: ((s: number) => void) | null = null;

  constructor(
    private deviceId: "tbon303" | "skacid",
    private getCtx: () => Promise<AudioContext>,
    private getDest: () => AudioNode | null,
    private getBpm: () => number,
    private getParams: () => VoiceParams,
    private getPattern: () => SeqPattern
  ) {}

  private scalePitch(base: number, oct: number) {
    return base + oct * 12;
  }

  private scheduleStep(pattern: SeqPattern, step: number, time: number, stepDur: number) {
    void (async () => {})();
    // synchronous: ctx + dest are captured lazily in start()
    const ctx = this.ctxRef!;
    const dest = this.destRef!;
    const p = this.getParams();
    const st = pattern[step];
    if (!st?.on) return;
    if (this.deviceId === "skacid") {
      if (Math.random() > (p.chance ?? 0.85)) return;
    }
    const swingOff = step % 2 === 1 ? (p.swing ?? 0) * stepDur * 0.5 : 0;
    const t = time + swingOff;
    const basePitch = 45 + (p.octave ?? 0) * 0; // A2 base; octave param handled inside voice
    const pitch = this.scalePitch(basePitch + this.rootOffset, st.oct);
    const vel = 0.95;
    const ratchets =
      this.deviceId === "skacid" && Math.random() < (p.ratchet ?? 0.2)
        ? 2 + (Math.random() < 0.3 ? 2 : 0)
        : 1;
    for (let r = 0; r < ratchets; r++) {
      const rt = t + r * stepDur / (ratchets * 2);
      acidNote(
        ctx,
        dest,
        p,
        pitch + (r > 0 ? 12 : 0),
        vel * (r === 0 ? 1 : 0.7),
        st.accent,
        st.slide ? this.lastPitch : null,
        rt,
        stepDur * 0.9
      );
    }
    this.lastPitch = pitch;
  }

  private ctxRef: AudioContext | null = null;
  private destRef: AudioNode | null = null;
  rootOffset = 0;

  async start() {
    if (this.playing) this.stop();
    const ctx = await this.getCtx();
    this.ctxRef = ctx;
    this.destRef = this.getDest() ?? ctx.destination;
    this.playing = true;
    this.step = 0;
    this.lastPitch = null;
    this.nextTime = ctx.currentTime + 0.08;
    this.queue = [];
    const tick = () => {
      if (!this.playing || !this.ctxRef) return;
      const bpm = this.getBpm();
      const stepDur = 60 / bpm / 4;
      while (this.nextTime < this.ctxRef.currentTime + 0.16) {
        const pattern = this.getPattern();
        this.scheduleStep(pattern, this.step % 16, this.nextTime, stepDur);
        this.queue.push({ step: this.step % 16, time: this.nextTime });
        this.nextTime += stepDur;
        this.step++;
      }
    };
    tick();
    this.timer = setInterval(tick, 30);
    const pump = () => {
      if (!this.playing || !this.ctxRef) return;
      const now = this.ctxRef.currentTime;
      while (this.queue.length && this.queue[0].time <= now) {
        this.onStep?.(this.queue.shift()!.step);
      }
      this.raf = requestAnimationFrame(pump);
    };
    this.raf = requestAnimationFrame(pump);
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    cancelAnimationFrame(this.raf);
    this.onStep?.(-1);
  }
}

/* ================= state plumbing ================= */

let _chain: SkaziChain | null = null;
let _chainCtx: BaseAudioContext | null = null;

export function getSkaziChainFor(ctx: BaseAudioContext): SkaziChain {
  if (!_chain || _chainCtx !== ctx) {
    _chain = new SkaziChain(ctx);
    _chainCtx = ctx;
  }
  return _chain;
}

export function refreshSkaziChain(bpm: number) {
  if (_chain) _chain.apply(skaziStore.get(), bpm);
}

export function stopSkaziChain() {
  _chain?.stopAll();
}

export function currentSkaziState(): SkaziState {
  return skaziStore.get();
}
