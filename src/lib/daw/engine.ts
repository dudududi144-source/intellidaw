/* ------------------------------------------------------------------ */
/*  Intellidaw — Web Audio engine                                      */
/*  Deterministic scheduling shared between live playback and          */
/*  offline WAV rendering.                                             */
/* ------------------------------------------------------------------ */

import type { BusName, DrumSound, LiveFxState, Note, Project, SynthTrack, Waveform } from "./types";
import { SONG_BARS, sectionAtBar } from "./types";
import { getSkaziChainFor, refreshSkaziChain, shaperCurve, type SkaziChain } from "./skaziAudio";
import { scheduleSkaziVoice, acidNote, bambaRiser, type VoiceParams } from "./skaziAudio";
import { skaziStore } from "./skazi";
import { cachedImpulse, cachedNoise, jitterRate } from "./noise";

/* lookahead > tick interval so a busy main thread never starves the
   scheduler; the timer itself runs in a Worker so background-tab
   throttling can't silence playback */
const LOOKAHEAD_S = 0.22;
const TICK_MS = 25;

/** per-sound trim so a full kit never slams the master limiter
    (drums are synthesised hot — without this the mix pumps constantly) */
const DRUM_TRIM: Partial<Record<DrumSound, number>> = {
  kick: 0.78,
  kick2: 0.78,
  snare: 0.68,
  clap: 0.56,
  chat: 0.4,
  ohat: 0.4,
  perc: 0.36,
  rim: 0.42,
  tom: 0.6,
  conga: 0.48,
  shaker: 0.34,
  ride: 0.3,
  crash: 0.36,
  chop: 0.44,
  vox: 0.4,
  fx: 0.28,
};
const CUSTOM_TRIM = 0.85;

/** start a reusable noise buffer with slight per-hit variation */
function startNoise(
  ctx: BaseAudioContext,
  dest: AudioNode,
  seconds: number,
  time: number
): AudioBufferSourceNode {
  const n = ctx.createBufferSource();
  n.buffer = cachedNoise(ctx, seconds);
  jitterRate(n);
  n.connect(dest);
  n.start(time);
  return n;
}

const midiHz = (p: number) => 440 * Math.pow(2, (p - 69) / 12);

export const cutoffHz = (c: number) => 120 * Math.pow(100, Math.min(1, Math.max(0, c))); // 120Hz..12kHz

const volGain = (v: number) => Math.pow(Math.max(0, v), 1.6);

/* ---------------- drum synthesis ---------------- */

export interface DrumVoiceOpts {
  vel: number;
  tune: number;
  customBuf?: AudioBuffer | null;
  /** scales every decay in the voice (0.35 = tight, 1.6 = long) */
  decayMul?: number;
}

/** per-voice tanh saturator — gives synthesized drums body instead of a
    thin “beepy” oscillator sound */
function satNode(ctx: BaseAudioContext, drive: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const n = 512;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  ws.curve = c;
  ws.oversample = "2x";
  return ws;
}

/** TR-808 style metallic partial bank — six detuned oscillators through a
    bandpass/highpass pair. This is what separates a real hat “tsss” from
    a harsh noise burst.
    Triangles (not squares): squares fold aliasing products back into the
    audible band above 9 kHz — that inharmonic grit is exactly the “dirty”
    sound we are killing. A lowpass after the bank catches the rest. */
function metal(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  dur: number,
  level: number,
  rate: number
) {
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = Math.min(14000, 9800 * Math.max(0.5, rate));
  bp.Q.value = 0.7;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6200;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 11500;
  lp.Q.value = 0.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);
  bp.connect(hp).connect(lp).connect(g).connect(dest);
  const base = 263;
  const ratios = [1, 1.52, 1.6, 1.81, 2.23, 3.21];
  for (const r of ratios) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = base * r * rate;
    o.detune.value = (Math.random() - 0.5) * 14;
    const og = ctx.createGain();
    og.gain.value = 0.085;
    o.connect(og).connect(bp);
    o.start(time);
    o.stop(time + dur + 0.06);
  }
}

export function scheduleDrum(
  ctx: BaseAudioContext,
  dest: AudioNode,
  sound: DrumSound,
  time: number,
  opts: DrumVoiceOpts
) {
  const { tune, customBuf } = opts;
  const dm = opts.decayMul ?? 1;
  const trim = DRUM_TRIM[sound] ?? 0.8;
  const vel = opts.vel * trim;
  if (customBuf) {
    const src = ctx.createBufferSource();
    src.buffer = customBuf;
    src.playbackRate.value = Math.pow(2, tune / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * CUSTOM_TRIM, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + customBuf.duration);
    src.connect(g).connect(dest);
    src.start(time);
    return;
  }
  const rate = Math.pow(2, tune / 12);
  switch (sound) {
    case "kick":
    case "kick2": {
      // punchy 808-style kick: fast pitch drop into a saturated body with
      // a two-stage decay (hard transient, long musical sub tail)
      const punchy = sound === "kick";
      const f0 = punchy ? 150 : 118;
      const f1 = punchy ? 43 : 35;
      const dur = (punchy ? 0.52 : 0.72) * dm;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f0 * rate, time);
      o.frequency.exponentialRampToValueAtTime(f1 * rate, time + 0.075);
      o.frequency.exponentialRampToValueAtTime(f1 * 0.94 * rate, time + dur);
      const shaper = satNode(ctx, 1.55);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel, time);
      g.gain.exponentialRampToValueAtTime(vel * 0.42, time + 0.055);
      g.gain.exponentialRampToValueAtTime(vel * 0.2, time + 0.24);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      o.connect(shaper).connect(g).connect(dest);
      o.start(time);
      o.stop(time + dur + 0.1);
      // beater click — softer than before so it never sandpapers the mix
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(vel * 0.22, time);
      cg.gain.exponentialRampToValueAtTime(0.001, time + 0.018);
      const cf = ctx.createBiquadFilter();
      cf.type = "lowpass";
      cf.frequency.value = 3400;
      startNoise(ctx, cf, 0.02, time);
      cf.connect(cg).connect(dest);
      break;
    }
    case "snare": {
      // body: two tuned triangles through a saturator (fat, not beepy)
      const sat = satNode(ctx, 1.5);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(vel * 0.55, time);
      bg.gain.exponentialRampToValueAtTime(0.001, time + 0.19 * dm);
      sat.connect(bg).connect(dest);
      [186, 255].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.setValueAtTime(f * rate, time);
        o.frequency.exponentialRampToValueAtTime(f * 0.86 * rate, time + 0.1 * dm);
        o.connect(sat);
        o.start(time);
        o.stop(time + 0.24 * dm);
      });
      // crack: bright noise riding above the body (kept under the body
      // level so the snare reads fat, not hissy)
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1150 * rate;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vel * 0.48, time);
      ng.gain.exponentialRampToValueAtTime(0.001, time + 0.18 * dm);
      startNoise(ctx, hp, 0.3, time);
      hp.connect(ng).connect(dest);
      break;
    }
    case "clap": {
      // classic clap: one noise burst through an envelope with 3 rapid
      // re-bursts and a longer tail — reads as a room-sized clap
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1080 * rate;
      f.Q.value = 1.35;
      const g = ctx.createGain();
      f.connect(g).connect(dest);
      g.gain.setValueAtTime(0.0001, time);
      for (let i = 0; i < 3; i++) {
        const t0 = time + i * 0.011;
        g.gain.setValueAtTime(vel * 0.68, t0);
        g.gain.exponentialRampToValueAtTime(vel * 0.1, t0 + 0.01);
      }
      g.gain.setValueAtTime(vel * 0.62, time + 0.033);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.033 + 0.19 * dm);
      startNoise(ctx, f, 0.25, time);
      break;
    }
    case "chat":
    case "ohat": {
      const dur = (sound === "chat" ? 0.055 : 0.42) * dm;
      metal(ctx, dest, time, dur, vel * (sound === "chat" ? 0.5 : 0.42), rate);
      break;
    }
    case "perc": {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(820 * rate, time);
      o.frequency.exponentialRampToValueAtTime(300 * rate, time + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.4, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.09 * dm);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 900 * rate;
      o.connect(f).connect(g).connect(dest);
      o.start(time);
      o.stop(time + 0.15 * dm);
      break;
    }
    case "rim": {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = 1750 * rate;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.5, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.045 * dm);
      const nf = ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 3600 * rate;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vel * 0.4, time);
      ng.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      o.connect(g).connect(dest);
      startNoise(ctx, nf, 0.05, time);
      nf.connect(ng).connect(dest);
      o.start(time);
      o.stop(time + 0.1);
      break;
    }
    case "tom":
    case "conga": {
      const f0 = sound === "tom" ? 220 : 330;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f0 * rate, time);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.55 * rate, time + 0.18 * dm);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.85, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + (sound === "tom" ? 0.3 : 0.16) * dm);
      o.connect(g).connect(dest);
      o.start(time);
      o.stop(time + 0.4 * dm);
      break;
    }
    case "shaker": {
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 9000 * rate;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, time);
      g.gain.linearRampToValueAtTime(vel * 0.4, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.1 * dm);
      startNoise(ctx, f, 0.2, time);
      f.connect(g).connect(dest);
      break;
    }
    case "ride":
    case "crash": {
      // shimmer noise bed + the metallic bank = believable cymbal wash
      const dur = (sound === "ride" ? 0.9 : 1.7) * dm;
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = sound === "ride" ? 6800 : 4200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * (sound === "ride" ? 0.22 : 0.3), time);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      startNoise(ctx, f, 2, time);
      f.connect(g).connect(dest);
      metal(ctx, dest, time, dur * 0.85, vel * (sound === "ride" ? 0.3 : 0.34), rate);
      break;
    }
    case "chop": {
      // short filtered saw blip
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(midiHz(64) * rate, time);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(3600 * rate, time);
      f.frequency.exponentialRampToValueAtTime(500, time + 0.12 * dm);
      f.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.5, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.14 * dm);
      o.connect(f).connect(g).connect(dest);
      o.start(time);
      o.stop(time + 0.2 * dm);
      break;
    }
    case "vox": {
      // vowel-ish formant stab
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(midiHz(57) * rate, time);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, time);
      g.gain.linearRampToValueAtTime(vel * 0.5, time + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.28 * dm);
      [[700, 1], [1220, 0.5], [2600, 0.25]].forEach(([fr, amp]) => {
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = fr * rate;
        f.Q.value = 5;
        const fg = ctx.createGain();
        fg.gain.value = amp;
        o.connect(f).connect(fg).connect(g);
      });
      g.connect(dest);
      o.start(time);
      o.stop(time + 0.35);
      break;
    }
    case "fx": {
      // riser sweep
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 2.2;
      f.frequency.setValueAtTime(300, time);
      f.frequency.exponentialRampToValueAtTime(7000, time + 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.28, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 1.05);
      startNoise(ctx, f, 1.2, time);
      f.connect(g).connect(dest);
      break;
    }
  }
}

/* ---------------- synth voice ---------------- */

export interface SynthParams {
  waveform: Waveform;
  cutoff: number;
  resonance: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  detune: number;
  octave: number;
  glide: boolean;
}

export function scheduleSynth(
  ctx: BaseAudioContext,
  dest: AudioNode,
  p: SynthParams,
  pitch: number,
  vel: number,
  time: number,
  durSec: number,
  fx?: { bend?: number }
) {
  const freq = midiHz(pitch + p.octave * 12);
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  // velocity shapes brightness (how hard you hit = how open the filter);
  // Q is capped so high resonance rings musically instead of shrieking
  const cutHz = cutoffHz(p.cutoff) * (0.6 + 0.4 * Math.min(1, vel / 0.95));
  const peakCut = Math.min(15500, cutHz * 1.85);
  f.frequency.setValueAtTime(Math.max(80, peakCut), time);
  f.Q.value = Math.min(14, p.resonance);
  f.frequency.exponentialRampToValueAtTime(Math.max(90, cutHz), time + Math.max(0.03, p.decay));
  g.gain.setValueAtTime(0.0001, time);
  const peak = vel * 0.24;
  const atk = Math.max(0.004, p.attack);
  g.gain.linearRampToValueAtTime(peak, time + atk);
  g.gain.setTargetAtTime(peak * p.sustain, time + atk, Math.max(0.02, p.decay / 3));
  const end = time + Math.max(atk + 0.05, durSec);
  // release: fast time-constant + generous stop margin so the gain is
  // fully decayed (<0.05%) before the oscillators stop — no end-click
  const relTc = Math.max(0.015, p.release / 4);
  g.gain.setTargetAtTime(0.0001, end, relTc);
  const stopAt = end + p.release * 2 + 0.18;
  f.connect(g).connect(dest);

  const mkOsc = (
    detuneCents: number,
    type: OscillatorType,
    level: number,
    pan: number,
    freqMult = 1
  ) => {
    const o = ctx.createOscillator();
    o.type = type;
    const target = freq * freqMult;
    const bend = fx?.bend ?? 0;
    if (bend !== 0) {
      // pitch slide-in from N semitones away (note FX "bend")
      const from = Math.max(20, target * Math.pow(2, -bend / 12));
      o.frequency.setValueAtTime(from, time);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, target), time + Math.min(0.35, Math.max(0.06, durSec * 0.6)));
    } else if (p.glide) {
      o.frequency.setValueAtTime(target * Math.pow(2, -2 / 12), time);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, target), time + 0.06);
    } else {
      o.frequency.setValueAtTime(Math.max(20, target), time);
    }
    o.detune.value = detuneCents;
    const og = ctx.createGain();
    og.gain.value = level;
    o.connect(og);
    let tail: AudioNode = og;
    if (pan !== 0) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      og.connect(pn);
      tail = pn;
    }
    tail.connect(f);
    o.start(time);
    o.stop(stopAt);
  };

  // center osc + a detuned L/R pair = width without phasey chorus
  mkOsc(0, p.waveform, 0.55, 0);
  if (p.detune > 0) {
    mkOsc(p.detune, p.waveform, 0.32, -0.55);
    mkOsc(-p.detune, p.waveform, 0.32, 0.55);
  }
  // sub octave adds weight in the bass register without muddying leads
  if (freq < 330) mkOsc(0, "sine", 0.5, 0, 0.5);
}

/* ---------------- graph ---------------- */

interface Channel {
  input: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  pan: StereoPannerNode;
  gain: GainNode;
  analyser?: AnalyserNode;
  delaySend: GainNode;
  reverbSend: GainNode;
}

interface Graph {
  master: GainNode;
  drive: WaveShaperNode;
  filter: BiquadFilterNode;
  /** group-bus summing (drums / bass / music) */
  buses: Map<BusName, GainNode>;
  /** master live crush (identity curve when off) */
  crush: WaveShaperNode;
  /** master stutter gate (gain automated by the scheduler) */
  stutter: GainNode;
  /** master tempo-synced echo (live FX delay) */
  fxDelaySend: GainNode;
  fxDelay: DelayNode;
  /** bus glue compressor (feeds the ceiling) */
  limiter: DynamicsCompressorNode;
  /** last node of the master chain (what touches the destination) */
  tail: AudioNode;
  channels: Map<string, Channel>;
  delayIn: GainNode;
  reverbIn: GainNode;
  delayNode: DelayNode;
}

function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  // cached: the curve is rebuilt on every live-drive slider move
  const key = Math.round(amount * 200);
  const hit = driveCurves.get(key);
  if (hit) return hit;
  const n = 1024;
  const curve = new Float32Array(n);
  const k = Math.max(0.0001, amount) * 6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  driveCurves.set(key, curve);
  return curve;
}
const driveCurves = new Map<number, Float32Array<ArrayBuffer>>();

/** linear below ±0.86, smooth sine knee to ±1 — a ceiling that never adds
    gain and never distorts at normal levels (cached once) */
let _ceiling: Float32Array<ArrayBuffer> | null = null;
function ceilingCurve(): Float32Array<ArrayBuffer> {
  if (_ceiling) return _ceiling;
  const n = 1024;
  const c = new Float32Array(n);
  const knee = 0.86;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] =
      a <= knee
        ? x
        : Math.sign(x) * (knee + (1 - knee) * Math.sin(((a - knee) / (1 - knee)) * (Math.PI / 2)));
  }
  _ceiling = c;
  return c;
}

function buildGraph(ctx: BaseAudioContext, project: Project, live: boolean): Graph {
  const spb = 60 / project.bpm;
  const master = ctx.createGain();
  master.gain.value = volGain(project.masterVolume);

  // live FX: gentle drive then a master filter
  const drive = ctx.createWaveShaper();
  drive.curve = driveCurve(0);
  drive.oversample = "2x";
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 18000;
  filter.Q.value = 0.4;
  master.connect(drive);
  drive.connect(filter);

  // rumble guard: everything below ~24 Hz is inaudible but eats limiter
  // headroom — filtering it out makes the whole mix read louder and cleaner
  const rumble = ctx.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 24;
  rumble.Q.value = 0.6;

  // live crush sits after the filter, before the stutter gate
  const crush = ctx.createWaveShaper();
  crush.curve = identityCurve();
  crush.oversample = "2x";
  const stutter = ctx.createGain();
  stutter.gain.value = 1;
  filter.connect(crush);
  crush.connect(stutter);
  stutter.connect(rumble);

  // master echo: tempo-synced feedback delay fed from the filtered mix
  const fxDelaySend = ctx.createGain();
  fxDelaySend.gain.value = 0;
  const fxDelay = ctx.createDelay(2);
  fxDelay.delayTime.value = spb * 0.75;
  const fxFb = ctx.createGain();
  fxFb.gain.value = 0.42;
  const fxTone = ctx.createBiquadFilter();
  fxTone.type = "lowpass";
  fxTone.frequency.value = 3200;
  filter.connect(fxDelaySend);
  fxDelaySend.connect(fxDelay);
  fxDelay.connect(fxTone);
  fxTone.connect(fxFb);
  fxFb.connect(fxDelay);
  fxTone.connect(crush);

  // bus glue: 2–3 dB of slow leveling that never pumps. The old chain
  // (−4dB / 12:1 limiter + fixed make-up gain) compressed 24/7, which is
  // exactly the squashed "cheap" sound. Two light stages beat one hard one.
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.knee.value = 16;
  glue.ratio.value = 1.9;
  glue.attack.value = 0.012;
  glue.release.value = 0.3;
  rumble.connect(glue);

  // makeup: restores the 2–3 dB the glue shaved so the mix lands at a
  // confident density (≈ -16 LUFS) while the dynamics stay untouched —
  // the ceiling after this stage still catches stray transients
  const makeup = ctx.createGain();
  makeup.gain.value = 1.26;
  glue.connect(makeup);

  // final transparent ceiling: linear below ±0.86, smooth sine knee to ±1
  // — catches the odd drum transient without audible distortion
  const ceiling = ctx.createWaveShaper();
  ceiling.curve = ceilingCurve();
  ceiling.oversample = "2x";
  makeup.connect(ceiling);

  let tail: AudioNode = ceiling;
  const chain: SkaziChain | null = getSkaziChainOrNull(ctx);
  if (chain) {
    ceiling.connect(chain.input);
    chain.apply(currentSkaziStateSnapshot(), project.bpm);
    tail = chain.output;
  }
  if (live) {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    tail.connect(analyser);
    tail = analyser;
    (graphExtras as { masterAnalyser?: AnalyserNode }).masterAnalyser = analyser;
  }
  tail.connect(ctx.destination);

  // shared FX buses
  const delayIn = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = spb * 0.75; // dotted 8th
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = "lowpass";
  delayTone.frequency.value = 3800;
  delayIn.connect(delay);
  delay.connect(delayTone);
  delayTone.connect(fb);
  fb.connect(delay);
  delayTone.connect(master);

  const reverbIn = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = cachedImpulse(ctx);
  const revTone = ctx.createBiquadFilter();
  revTone.type = "highpass";
  revTone.frequency.value = 300;
  reverbIn.connect(conv);
  conv.connect(revTone);
  revTone.connect(master);

  const channels: Map<string, Channel> = new Map();
  // group buses: channels sum into drums / bass / music before the master
  const buses: Map<BusName, GainNode> = new Map();
  for (const name of ["drums", "bass", "music"] as BusName[]) {
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(master);
    buses.set(name, g);
  }
  const anySolo = project.tracks.some((t) => t.solo);
  for (const t of project.tracks) {
    const input = ctx.createGain();
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = "lowshelf";
    eqLow.frequency.value = 90;
    eqLow.gain.value = t.eqLow ?? 0;
    const eqMid = ctx.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 0.9;
    eqMid.gain.value = t.eqMid ?? 0;
    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = "highshelf";
    eqHigh.frequency.value = 7500;
    eqHigh.gain.value = t.eqHigh ?? 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = t.pan;
    const gain = ctx.createGain();
    const audible = !t.muted && (!anySolo || t.solo);
    gain.gain.value = audible ? volGain(t.volume) : 0;
    input.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(pan);
    pan.connect(gain);
    gain.connect(buses.get(t.bus ?? "music") ?? master);

    const delaySend = ctx.createGain();
    delaySend.gain.value = t.delaySend;
    gain.connect(delaySend);
    delaySend.connect(delayIn);

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = t.reverbSend;
    gain.connect(reverbSend);
    reverbSend.connect(reverbIn);

    channels.set(t.id, { input, eqLow, eqMid, eqHigh, pan, gain, delaySend, reverbSend });
  }
  return { master, drive, filter, buses, crush, stutter, fxDelaySend, fxDelay, limiter: glue, tail, channels, delayIn, reverbIn, delayNode: delay };
}

let _identity: Float32Array<ArrayBuffer> | null = null;
function identityCurve(): Float32Array<ArrayBuffer> {
  if (_identity) return _identity;
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = (i / (n - 1)) * 2 - 1;
  _identity = c;
  return c;
}

const graphExtras: { masterAnalyser?: AnalyserNode } = {};

/* ---------------- SKAZI chain plumbing ---------------- */

function getSkaziChainOrNull(ctx: BaseAudioContext): SkaziChain | null {
  try {
    if (typeof window === "undefined") return null;
    return getSkaziChainFor(ctx);
  } catch {
    return null;
  }
}

function currentSkaziStateSnapshot() {
  try {
    return skaziStore.get();
  } catch {
    return { instruments: {}, fx: {}, seq: {}, godSeed: 1 } as ReturnType<typeof skaziStore.get>;
  }
}

/* ---------------- engine ---------------- */

export class DawEngine {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private worker: Worker | null = null;
  private nextStepTime = 0;
  private absStep = 0;
  private project: Project | null = null;
  private queue: Array<{ step: number; time: number }> = [];
  private raf = 0;
  private noise: AudioBuffer | null = null;
  private customCache = new Map<string, AudioBuffer>();
  private customPending = new Map<string, Promise<AudioBuffer | null>>();
  private previewBus: GainNode | null = null;
  playing = false;
  metronome = false;
  /** timestamp until which the count-in clicks run (0 = none) */
  countInUntil = 0;
  get countingIn() {
    return !!this.ctx && this.countInUntil > this.ctx.currentTime;
  }
  /** fires with the absolute step (0..SONG_BARS*16-1, or -1 when stopped) */
  onStep: ((step: number) => void) | null = null;

  private resumeKickBound = false;

  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.noise = cachedNoise(this.ctx, 2);
      // some browsers drop the context back to suspended (autoplay policy,
      // device lock) — every later user gesture tries to revive it
      if (!this.resumeKickBound) {
        this.resumeKickBound = true;
        const kick = () => {
          if (this.ctx && this.ctx.state === "suspended") {
            this.ctx.resume().catch(() => {});
          }
        };
        window.addEventListener("pointerdown", kick, { passive: true });
        window.addEventListener("keydown", kick, { passive: true });
      }
    }
    if (this.ctx.state === "suspended") {
      // never hang on resume(): blocked autoplay / a stuck audio service
      // must not freeze the transport — race it with a short timeout
      await Promise.race([
        this.ctx.resume().catch(() => {}),
        new Promise<void>((r) => setTimeout(r, 1200)),
      ]);
    }
    return this.ctx;
  }

  async sync(project: Project) {
    this.project = project;
    const ctx = await this.ensure();
    refreshSkaziChain(project.bpm);
    this.applyLiveFx(project.liveFx);
    if (!this.graph) {
      this.graph = buildGraph(ctx, project, true);
    } else {
      // adding/removing tracks mid-play must be heard immediately
      this.rebuildIfTrackSetChanged(project);
      // update live params without rebuilding (cheap)
      const anySolo = project.tracks.some((t) => t.solo);
      this.graph.master.gain.setTargetAtTime(volGain(project.masterVolume), ctx.currentTime, 0.03);
      this.graph.delayNode.delayTime.setTargetAtTime((60 / project.bpm) * 0.75, ctx.currentTime, 0.08);
      for (const t of project.tracks) {
        const ch = this.graph.channels.get(t.id);
        if (!ch) continue;
        ch.pan.pan.setTargetAtTime(t.pan, ctx.currentTime, 0.03);
        ch.eqLow.gain.setTargetAtTime(t.eqLow ?? 0, ctx.currentTime, 0.04);
        ch.eqMid.gain.setTargetAtTime(t.eqMid ?? 0, ctx.currentTime, 0.04);
        ch.eqHigh.gain.setTargetAtTime(t.eqHigh ?? 0, ctx.currentTime, 0.04);
        const audible = !t.muted && (!anySolo || t.solo);
        ch.gain.gain.setTargetAtTime(audible ? volGain(t.volume) : 0, ctx.currentTime, 0.03);
        ch.delaySend.gain.setTargetAtTime(t.delaySend, ctx.currentTime, 0.03);
        ch.reverbSend.gain.setTargetAtTime(t.reverbSend, ctx.currentTime, 0.03);
      }
    }
  }

  private rebuildIfTrackSetChanged(project: Project) {
    if (!this.ctx || !this.graph) return;
    const existing = new Set(this.graph.channels.keys());
    const wanted = new Set(project.tracks.map((t) => t.id));
    const changed =
      existing.size !== wanted.size || project.tracks.some((t) => !existing.has(t.id));
    if (changed) {
      // detach the old master chain so in-flight tails don't double up
      // with the new graph (limiter feeds the shared SKAZI chain too)
      try {
        this.graph.limiter.disconnect();
        this.graph.tail.disconnect();
      } catch {
        /* already gone */
      }
      this.graph = buildGraph(this.ctx, project, true);
    }
  }

  async play(project: Project) {
    await this.sync(project);
    this.rebuildIfTrackSetChanged(project);
    if (!this.ctx || !this.graph) return;
    if (this.ctx.state !== "running") {
      // autoplay blocked / audio service unavailable — surface it instead
      // of silently "playing" into a suspended context
      throw new Error("audio-suspended");
    }
    if (this.playing) this.stop();
    this.playing = true;
    const startStep =
      project.loopOn && project.loopEnd > project.loopStart ? project.loopStart * 16 : 0;
    this.absStep = startStep;
    const spb = 60 / project.bpm;
    if (project.countIn) {
      // four clicks, then the transport rolls
      const base = this.ctx.currentTime + 0.06;
      for (let i = 0; i < 4; i++) this.click(base + i * spb, i === 0);
      this.nextStepTime = base + 4 * spb;
      this.countInUntil = base + 4 * spb;
    } else {
      this.nextStepTime = this.ctx.currentTime + 0.06;
      this.countInUntil = 0;
    }
    this.queue = [];
    this.tick();
    this.startTimer();
    this.pump();
  }

  /** worker timers keep firing when the tab is backgrounded — setInterval
      gets throttled to 1/s and playback would stutter to silence */
  private startTimer() {
    this.stopTimer();
    if (typeof Worker === "undefined") {
      this.timer = setInterval(() => this.tick(), TICK_MS);
      return;
    }
    try {
      const code =
        "let id=null;onmessage=e=>{if(e.data==='start'){if(id===null)id=setInterval(()=>postMessage(0)," +
        TICK_MS +
        ");}else{if(id!==null){clearInterval(id);id=null;}}}";
      this.worker = new Worker(
        URL.createObjectURL(new Blob([code], { type: "text/javascript" }))
      );
      this.worker.onmessage = () => this.tick();
      this.worker.postMessage("start");
    } catch {
      this.worker = null;
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.worker) {
      try {
        this.worker.postMessage("stop");
        this.worker.terminate();
      } catch {
        /* noop */
      }
      this.worker = null;
    }
  }

  stop() {
    this.playing = false;
    this.stopTimer();
    cancelAnimationFrame(this.raf);
    this.queue = [];
    // duck the master so ringing tails cut quickly instead of smearing
    // over the landing page / next playback (play() restores it via sync).
    if (this.ctx && this.graph) {
      this.graph.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.015);
    }
    this.onStep?.(-1);
  }

  private tick() {
    if (!this.ctx || !this.project || !this.playing) return;
    const p = this.project;
    const spb = 60 / p.bpm;
    const stepDur = spb / 4;
    const loopSteps = SONG_BARS * 16;
    const loopA = p.loopOn ? Math.max(0, p.loopStart) * 16 : 0;
    const loopB = p.loopOn ? Math.min(SONG_BARS, Math.max(p.loopStart + 1, p.loopEnd)) * 16 : loopSteps;
    // the context may have been suspended (tab sleep, device lock) —
    // resync ahead instead of dumping a burst of stale steps at once
    if (this.nextStepTime < this.ctx.currentTime - 0.12) {
      this.nextStepTime = this.ctx.currentTime + 0.06;
    }
    while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD_S) {
      let abs = this.absStep;
      if (p.loopOn) {
        if (abs < loopA || abs >= loopB) abs = loopA; // seek landed outside — pull into the loop
      } else {
        abs = abs % loopSteps;
      }
      const step = abs % 16;
      const bar = Math.floor(abs / 16);
      const swingOffset = step % 2 === 1 ? p.swing * stepDur * 0.5 : 0;
      const time = this.nextStepTime + swingOffset;
      this.scheduleStep(p, this.graph!, step, bar, time, stepDur);
      if (this.metronome) this.click(time, step === 0);
      // stutter gate: dip the master on the off-8ths, depth = liveFx.stutter
      const st = p.liveFx?.stutter ?? 0;
      if (st > 0 && this.graph) {
        const g = this.graph.stutter.gain;
        const depth = Math.min(0.96, st);
        if (step % 2 === 1) {
          g.setValueAtTime(1 - depth, time);
          g.setValueAtTime(1, time + stepDur / 2);
        } else {
          g.setValueAtTime(1, time);
        }
      }
      this.queue.push({ step: abs, time });
      this.nextStepTime += stepDur;
      if (p.loopOn) {
        this.absStep = this.absStep + 1 >= loopB ? loopA : this.absStep + 1;
      } else {
        this.absStep++;
      }
    }
  }

  /** short metronome blip routed straight to the output (never rendered) */
  private click(time: number, accent: boolean) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = accent ? 1318 : 880;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(accent ? 0.24 : 0.13, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    o.connect(g).connect(this.ctx.destination);
    o.start(time);
    o.stop(time + 0.07);
  }

  /** jump the transport to an absolute step (quantised scenes / loop seek) */
  jumpTo(absStep: number) {
    if (!this.ctx) return;
    let s = Math.max(0, Math.floor(absStep));
    const p = this.project;
    if (p?.loopOn && p.loopEnd > p.loopStart) {
      const a = p.loopStart * 16;
      const b = p.loopEnd * 16;
      if (s < a || s >= b) s = a;
    }
    this.absStep = s;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.queue = [];
  }

  private scheduleStep(
    p: Project,
    graph: Graph,
    step: number,
    bar: number,
    time: number,
    stepDur: number
  ) {
    const ctx = this.ctx!;
    const anySolo = p.tracks.some((t) => t.solo);
    const section = sectionAtBar(p.sections, bar);
    for (const t of p.tracks) {
      const ch = graph.channels.get(t.id);
      if (!ch) continue;
      const audible = !t.muted && (!anySolo || t.solo);
      if (!audible) continue;
      // arrangement: tracks muted for this section stay silent
      if (section?.mutes.includes(t.id)) continue;
      if (t.kind === "drum") {
        const s = t.steps[step];
        if (s?.on) {
          const chance = s.chance ?? 1;
          if (chance >= 1 || Math.random() < chance) {
            const rat = Math.max(1, Math.min(4, Math.round(s.rat ?? 1)));
            for (let i = 0; i < rat; i++) {
              const sub = stepDur / rat;
              this.noteVoice();
              scheduleDrum(ctx, ch.input, t.sound, time + i * sub, {
                vel: s.vel * Math.pow(0.82, i),
                tune: t.tune - (s.thr ?? 0) * 4 * i,
                customBuf: this.customFor(t.sound),
                decayMul: Math.max(0.3, Math.min(1.6, s.dec ?? 1)),
              });
            }
            if (t.sound === "kick" || t.sound === "kick2") {
              this.duckOthers(p, graph, t.id, time);
            }
          }
        }
      } else {
        for (const n of t.notes) {
          if (n.step === step) {
            const chance = n.chance ?? 1;
            if (chance < 1 && Math.random() >= chance) continue;
            const rat = Math.max(1, Math.min(4, Math.round(n.rat ?? 1)));
            const nudge = (n.nudge ?? 0) * stepDur;
            for (let i = 0; i < rat; i++) {
              const subDur = Math.min(n.len * stepDur - i * stepDur, stepDur * 0.96);
              if (subDur <= 0.02) break;
              this.noteVoice();
              scheduleSynth(
                ctx,
                ch.input,
                t as SynthTrack,
                n.pitch,
                n.vel * Math.pow(0.85, i),
                time + nudge + i * stepDur,
                subDur,
                { bend: n.bend ?? 0 }
              );
            }
          }
        }
      }
    }
  }

  /** PITAPUMP-style sidechain: every channel with duck>0 dips while the
      kick speaks, then eases back — scheduled ahead like everything else */
  private duckOthers(p: Project, graph: Graph, kickTrackId: string, time: number) {
    const anySolo = p.tracks.some((t) => t.solo);
    for (const tr of p.tracks) {
      const depth = tr.duck ?? 0;
      if (depth <= 0 || tr.id === kickTrackId) continue;
      const ch = graph.channels.get(tr.id);
      if (!ch) continue;
      const base = !tr.muted && (!anySolo || tr.solo) ? volGain(tr.volume) : 0;
      const g = ch.gain.gain;
      g.setTargetAtTime(base * (1 - 0.78 * Math.min(1, depth)), time, 0.006);
      g.setTargetAtTime(base, time + 0.1, 0.08);
    }
  }

  /** fire onStep callbacks in near-realtime (drop stale items after tab sleep) */
  private pump = () => {
    if (!this.playing || !this.ctx) return;
    const now = this.ctx.currentTime;
    while (this.queue.length && this.queue[0].time <= now) {
      const item = this.queue.shift()!;
      if (now - item.time < 0.3) this.onStep?.(item.step);
    }
    this.raf = requestAnimationFrame(this.pump);
  };

  /* ---- live FX on the master bus ---- */

  setLiveFilter(norm: number) {
    if (!this.ctx || !this.graph) return;
    const hz = 60 * Math.pow(300, Math.min(1, Math.max(0, norm))); // 60Hz..18kHz
    this.graph.filter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.03);
  }

  setLiveDrive(amount: number) {
    if (!this.ctx || !this.graph) return;
    this.graph.drive.curve = driveCurve(Math.min(1, Math.max(0, amount)) * 0.5);
  }

  setLiveCrush(amount: number) {
    if (!this.ctx || !this.graph) return;
    const a = Math.min(1, Math.max(0, amount));
    this.graph.crush.curve = a <= 0.001 ? identityCurve() : shaperCurve("crush", 0.18 + 0.82 * a);
  }

  setLiveDelay(amount: number) {
    if (!this.ctx || !this.graph) return;
    const a = Math.min(1, Math.max(0, amount));
    this.graph.fxDelaySend.gain.setTargetAtTime(a * 0.55, this.ctx.currentTime, 0.05);
    if (this.project) {
      this.graph.fxDelay.delayTime.setTargetAtTime((60 / this.project.bpm) * 0.75, this.ctx.currentTime, 0.08);
    }
  }

  /** apply a whole LiveFxState at once (project load / sync) */
  applyLiveFx(fx: Partial<LiveFxState> | undefined) {
    if (!fx) return;
    this.setLiveFilter(fx.filter ?? 1);
    this.setLiveDrive(fx.drive ?? 0);
    this.setLiveCrush(fx.crush ?? 0);
    this.setLiveDelay(fx.delay ?? 0);
  }

  /* ---- metering: live LUFS + CPU estimate ---- */

  private lufsBuf = new Float32Array(1024);
  private rmsWindow: Array<{ t: number; ms: number }> = [];

  /** rolling integrated loudness (approx LUFS) of the live master */
  masterLufs(): number {
    const a = graphExtras.masterAnalyser;
    if (!a || !this.ctx) return -70;
    a.getFloatTimeDomainData(this.lufsBuf);
    let sum = 0;
    for (let i = 0; i < this.lufsBuf.length; i++) sum += this.lufsBuf[i] * this.lufsBuf[i];
    const ms = sum / this.lufsBuf.length;
    const now = this.ctx.currentTime;
    this.rmsWindow.push({ t: now, ms });
    while (this.rmsWindow.length && now - this.rmsWindow[0].t > 3) this.rmsWindow.shift();
    let acc = 0;
    for (const w of this.rmsWindow) acc += w.ms;
    const mean = acc / Math.max(1, this.rmsWindow.length);
    if (mean <= 1e-8) return -70;
    return -0.691 + 10 * Math.log10(mean);
  }

  private voiceTimes: number[] = [];
  private noteVoice() {
    if (this.ctx) {
      this.voiceTimes.push(this.ctx.currentTime);
      if (this.voiceTimes.length > 512) this.voiceTimes.splice(0, this.voiceTimes.length - 512);
    }
  }

  /** rough CPU load estimate from scheduled-voice density (0..100) */
  cpuEstimate(): number {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime;
    this.voiceTimes = this.voiceTimes.filter((t) => now - t < 1);
    return Math.min(96, Math.round(this.voiceTimes.length * 1.9));
  }

  /* ---- preview one-shots (pads, piano keys, landing) ---- */

  /** previews share a gentle compressor so one-shots never clip the DAC */
  private async previewDest(): Promise<AudioNode> {
    const ctx = await this.ensure();
    if (!this.previewBus) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.24;
      comp.connect(ctx.destination);
      const bus = ctx.createGain();
      bus.gain.value = 0.9;
      bus.connect(comp);
      this.previewBus = bus;
    }
    return this.previewBus;
  }

  async previewDrum(sound: DrumSound, vel = 0.95, tune = 0, customDataUrl?: string | null) {
    const ctx = await this.ensure();
    const dest = await this.previewDest();
    let buf: AudioBuffer | null = null;
    if (customDataUrl) buf = await this.decodeDataUrl(customDataUrl);
    scheduleDrum(ctx, dest, sound, ctx.currentTime + 0.01, {
      vel,
      tune,
      customBuf: buf,
    });
  }

  async previewSynth(p: SynthParams, pitch: number, durSec = 0.55, vel = 0.9) {
    const ctx = await this.ensure();
    const dest = await this.previewDest();
    scheduleSynth(ctx, dest, p, pitch, vel, ctx.currentTime + 0.01, durSec);
  }

  /** performance keyboard / MIDI: play a note on a track through its own channel */
  async playNoteLive(trackId: string, pitch: number, vel = 0.9, durSec = 0.5) {
    const ctx = await this.ensure();
    const p = this.project;
    const ch = this.graph?.channels.get(trackId);
    const t = p?.tracks.find((x) => x.id === trackId);
    if (!ch || !t || t.kind !== "synth") {
      // fall back to a dry preview so keys always make sound
      if (t && t.kind === "drum") {
        const pad = p?.pads.find((pd) => pd.sound === t.sound);
        await this.previewDrum(t.sound, vel, t.tune, pad?.custom?.dataUrl ?? null);
      }
      return;
    }
    scheduleSynth(ctx, ch.input, t, pitch, vel, ctx.currentTime + 0.01, durSec);
  }

  /* ---- Web MIDI in ---- */

  midiStatus: "off" | "on" | "none" = "off";

  async enableMidi(): Promise<"on" | "none"> {
    const nav = navigator as unknown as {
      requestMIDIAccess?: () => Promise<{
        inputs: Map<string, { onmidimessage: ((e: { data: Uint8Array | null }) => void) | null }>;
      }>;
    };
    if (!nav.requestMIDIAccess) {
      this.midiStatus = "none";
      return "none";
    }
    try {
      const access = await nav.requestMIDIAccess();
      access.inputs.forEach((input) => {
        input.onmidimessage = (e) => {
          const data = e.data;
          if (!data || data.length < 2) return;
          const cmd = data[0] & 0xf0;
          if (cmd === 0x90 && data[2] > 0) {
            const p = this.project;
            const t = p?.tracks.find((x) => x.kind === "synth");
            if (t) void this.playNoteLive(t.id, data[1], Math.min(1, data[2] / 110));
          }
        };
      });
      this.midiStatus = "on";
      return "on";
    } catch {
      this.midiStatus = "none";
      return "none";
    }
  }

  /* ---- audio recording (REC AUDIO → WAV data URL, pads/import) ---- */

  private recorder: MediaRecorder | null = null;
  private recStreamDest: MediaStreamAudioDestinationNode | null = null;
  private recChunks: Blob[] = [];
  recording = false;

  startRecording(): boolean {
    if (!this.ctx || !this.graph || typeof MediaRecorder === "undefined") return false;
    try {
      if (!this.recStreamDest) {
        this.recStreamDest = this.ctx.createMediaStreamDestination();
        this.graph.tail.connect(this.recStreamDest);
      }
      this.recChunks = [];
      const rec = new MediaRecorder(this.recStreamDest.stream);
      rec.ondataavailable = (e) => {
        if (e.data.size) this.recChunks.push(e.data);
      };
      rec.start();
      this.recorder = rec;
      this.recording = true;
      return true;
    } catch {
      return false;
    }
  }

  /** stop and return the capture as a WAV data URL (loadable into a pad) */
  stopRecording(): Promise<string | null> {
    return new Promise((resolve) => {
      const rec = this.recorder;
      if (!rec || !this.ctx) {
        resolve(null);
        return;
      }
      rec.onstop = async () => {
        this.recording = false;
        this.recorder = null;
        try {
          const blob = new Blob(this.recChunks, { type: "audio/webm" });
          const arr = await blob.arrayBuffer();
          const buf = await this.ctx!.decodeAudioData(arr);
          const wavBlob = encodeWav(buf);
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(wavBlob);
        } catch {
          resolve(null);
        }
      };
      rec.stop();
    });
  }

  /* ---- SKAZI bundle previews (routed through the master FX chain) ---- */

  private async skaziDest(): Promise<AudioNode> {
    const ctx = await this.ensure();
    const chain = getSkaziChainOrNull(ctx);
    if (chain) {
      const bpm = this.project?.bpm ?? 120;
      chain.apply(skaziStore.get(), bpm);
      return chain.input;
    }
    return ctx.destination;
  }

  async previewSkazi(deviceId: string, pitch: number, durSec = 0.5, vel = 0.9) {
    const ctx = await this.ensure();
    const dest = await this.skaziDest();
    const params = (skaziStore.get().instruments[deviceId] ?? {}) as VoiceParams;
    scheduleSkaziVoice(ctx, dest, deviceId, params, pitch, ctx.currentTime + 0.01, durSec, vel);
  }

  /** render one skazi voice offline and return objective level measurements
   *  (used by the device audition QA — peak dBFS + RMS on a clean 44.1k render) */
  async measureSkaziVoice(deviceId: string, pitch = 48, durSec = 0.6, vel = 0.9): Promise<{ peak: number; rms: number }> {
    const sr = 44100;
    const off = new OfflineAudioContext(2, Math.ceil(sr * (durSec + 1.5)), sr);
    const params = (skaziStore.get().instruments[deviceId] ?? {}) as VoiceParams;
    scheduleSkaziVoice(off, off.destination, deviceId, params, pitch, 0.05, durSec, vel);
    const buf = await off.startRendering();
    let peak = 0;
    let sum = 0;
    let n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        sum += d[i] * d[i];
        n++;
      }
    }
    return {
      peak: Math.round(20 * Math.log10(Math.max(peak, 1e-9)) * 100) / 100,
      rms: Math.round(20 * Math.log10(Math.max(Math.sqrt(sum / n), 1e-9)) * 100) / 100,
    };
  }

  /** audition a MIDI GOD pattern (synth roles) or drum steps */
  async previewPattern(deviceId: string, notes: Note[], bars: number, drumSteps?: boolean[]): Promise<number> {
    const ctx = await this.ensure();
    const dest = await this.skaziDest();
    const stepDur = 60 / this.bpm() / 4;
    const t0 = ctx.currentTime + 0.06;
    const params = (skaziStore.get().instruments[deviceId] ?? {}) as VoiceParams;
    if (notes.length) {
      for (const n of notes) {
        scheduleSkaziVoice(ctx, dest, deviceId, params, n.pitch, t0 + n.step * stepDur, Math.max(1, n.len) * stepDur, n.vel);
      }
    }
    if (drumSteps?.length) {
      for (let i = 0; i < drumSteps.length; i++) {
        if (!drumSteps[i]) continue;
        scheduleDrum(ctx, dest, i % 16 === 14 ? "snare" : "kick", t0 + (i % 16) * stepDur + Math.floor(i / 16) * 16 * stepDur, { vel: 0.9, tune: 0 });
      }
    }
    return bars * 16 * stepDur;
  }

  async previewSkaziSeqNote(deviceId: "tbon303" | "skacid", pitch: number, accent = false, slideFrom: number | null = null) {
    const ctx = await this.ensure();
    const dest = await this.skaziDest();
    const params = (skaziStore.get().instruments[deviceId] ?? {}) as VoiceParams;
    acidNote(ctx, dest, params, pitch, 0.95, accent, slideFrom, ctx.currentTime + 0.01, 0.22);
  }

  async fireRiser() {
    const ctx = await this.ensure();
    const dest = await this.skaziDest();
    const params = (skaziStore.get().instruments["bamba"] ?? {}) as VoiceParams;
    bambaRiser(ctx, dest, params, this.project?.bpm ?? 120, ctx.currentTime + 0.02);
  }

  async skaziSequencerCtx(): Promise<{ ctx: AudioContext; dest: AudioNode }> {
    const ctx = await this.ensure();
    const dest = await this.skaziDest();
    return { ctx, dest };
  }

  bpm(): number {
    return this.project?.bpm ?? 120;
  }

  /** sync accessor for the SKAZI sequencer routing (null until audio unlocked) */
  skaziChainInputSync(): AudioNode | null {
    if (!this.ctx) return null;
    const chain = getSkaziChainOrNull(this.ctx);
    if (!chain) return null;
    chain.apply(skaziStore.get(), this.bpm());
    return chain.input;
  }

  async decodeDataUrl(dataUrl: string): Promise<AudioBuffer | null> {
    if (!dataUrl) return null;
    const ctx = await this.ensure();
    const cached = this.customCache.get(dataUrl);
    if (cached) return cached;
    // de-duplicate concurrent decodes (one fetch per sample, ever)
    const pending = this.customPending.get(dataUrl);
    if (pending) return pending;
    const job = (async () => {
      try {
        const res = await fetch(dataUrl);
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        this.customCache.set(dataUrl, buf);
        return buf;
      } catch {
        return null;
      } finally {
        this.customPending.delete(dataUrl);
      }
    })();
    this.customPending.set(dataUrl, job);
    return job;
  }

  private customFor(sound: DrumSound): AudioBuffer | null | undefined {
    const pad = this.project?.pads.find((pd) => pd.sound === sound);
    if (pad?.custom?.dataUrl) {
      // async decode may not be ready; kick off and use next time
      void this.decodeDataUrl(pad.custom.dataUrl);
      return this.customCache.get(pad.custom.dataUrl) ?? null;
    }
    return null;
  }

  /* ---- metering ---- */

  private meterBuf = new Uint8Array(256);

  level(trackId: string): number {
    if (!this.graph || !this.ctx) return 0;
    const ch = this.graph.channels.get(trackId);
    if (!ch) return 0;
    if (!ch.analyser) {
      const a = this.ctx.createAnalyser();
      a.fftSize = 256;
      ch.gain.connect(a);
      ch.analyser = a;
    }
    ch.analyser.getByteTimeDomainData(this.meterBuf);
    let peak = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const v = Math.abs(this.meterBuf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return Math.min(1, peak * 1.4);
  }

  masterLevel(): number {
    const a = graphExtras.masterAnalyser;
    if (!a) return 0;
    a.getByteTimeDomainData(this.meterBuf);
    let peak = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const v = Math.abs(this.meterBuf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return Math.min(1, peak * 1.4);
  }

  /** the live master analyser (visualizer) — null until audio started */
  masterAnalyser(): AnalyserNode | null {
    return graphExtras.masterAnalyser ?? null;
  }

  /* ---- offline render → WAV ---- */

  private async renderOffline(project: Project, bars: number, only?: string | null): Promise<AudioBuffer> {
    const spb = 60 / project.bpm;
    const stepDur = spb / 4;
    const totalSteps = bars * 16;
    const dur = totalSteps * stepDur + 1.8;
    const off = new OfflineAudioContext(2, Math.ceil(44100 * dur), 44100);
    const graph = buildGraph(off, project, false);
    // bake the project's live FX into the export
    if (project.liveFx) {
      const fx = project.liveFx;
      graph.filter.frequency.value = 60 * Math.pow(300, Math.min(1, Math.max(0, fx.filter ?? 1)));
      graph.drive.curve = driveCurve((fx.drive ?? 0) * 0.5);
      graph.crush.curve = (fx.crush ?? 0) <= 0.001 ? identityCurve() : shaperCurve("crush", 0.18 + 0.82 * (fx.crush ?? 0));
      graph.fxDelaySend.gain.value = (fx.delay ?? 0) * 0.55;
    }
    // decode user pad samples up-front so they are included in the render
    const padBufs = new Map<DrumSound, AudioBuffer | null>();
    for (const pad of project.pads) {
      if (pad.custom?.dataUrl && !padBufs.has(pad.sound)) {
        padBufs.set(pad.sound, await this.decodeDataUrl(pad.custom.dataUrl));
      }
    }
    const wantSolo = project.tracks.filter((t) => t.solo);
    const soloSet = wantSolo.length ? new Set(wantSolo.map((t) => t.id)) : null;
    let t = 0.05;
    for (let i = 0; i < totalSteps; i++) {
      const step = i % 16;
      const bar = Math.floor(i / 16) % SONG_BARS;
      const section = sectionAtBar(project.sections, bar);
      const swingOffset = step % 2 === 1 ? project.swing * stepDur * 0.5 : 0;
      const time = t + swingOffset;
      // deterministic RNG so an export with chance-steps always bakes the same take
      const rnd = (() => {
        let s = (i * 2654435761) % 4294967296;
        return () => {
          s = (s * 1664525 + 1013904223) % 4294967296;
          return s / 4294967296;
        };
      })();
      for (const track of project.tracks) {
        if (only && track.id !== only) continue;
        const ch = graph.channels.get(track.id);
        if (!ch) continue;
        const audible =
          !track.muted && (!soloSet || soloSet.has(track.id)) && !(only && section?.mutes.includes(track.id));
        if (!audible) continue;
        if (track.kind === "drum") {
          const s = track.steps[step];
          if (s?.on) {
            const chance = s.chance ?? 1;
            if (chance >= 1 || rnd() < chance) {
              const rat = Math.max(1, Math.min(4, Math.round(s.rat ?? 1)));
              for (let k = 0; k < rat; k++) {
                scheduleDrum(off, ch.input, track.sound, time + (k * stepDur) / rat, {
                  vel: s.vel * Math.pow(0.82, k),
                  tune: track.tune - (s.thr ?? 0) * 4 * k,
                  customBuf: padBufs.get(track.sound) ?? null,
                  decayMul: Math.max(0.3, Math.min(1.6, s.dec ?? 1)),
                });
              }
              if (track.sound === "kick" || track.sound === "kick2") {
                const anySoloLocal = project.tracks.some((x) => x.solo);
                for (const tr of project.tracks) {
                  if (only && tr.id !== only) continue;
                  const depth = tr.duck ?? 0;
                  if (depth <= 0 || tr.id === track.id) continue;
                  const dch = graph.channels.get(tr.id);
                  if (!dch) continue;
                  const base =
                    !tr.muted && (!anySoloLocal || tr.solo) && !(only && section?.mutes.includes(tr.id))
                      ? volGain(tr.volume)
                      : 0;
                  dch.gain.gain.setTargetAtTime(base * (1 - 0.78 * Math.min(1, depth)), time, 0.006);
                  dch.gain.gain.setTargetAtTime(base, time + 0.1, 0.08);
                }
              }
            }
          }
        } else {
          for (const n of track.notes) {
            if (n.step === step) {
              const chance = n.chance ?? 1;
              if (chance < 1 && rnd() >= chance) continue;
              const rat = Math.max(1, Math.min(4, Math.round(n.rat ?? 1)));
              const nudge = (n.nudge ?? 0) * stepDur;
              for (let k = 0; k < rat; k++) {
                const subDur = Math.min(n.len * stepDur - k * stepDur, stepDur * 0.96);
                if (subDur <= 0.02) break;
                scheduleSynth(off, ch.input, track, n.pitch, n.vel * Math.pow(0.85, k), time + nudge + k * stepDur, subDur, {
                  bend: n.bend ?? 0,
                });
              }
            }
          }
        }
      }
      t += stepDur;
    }
    return off.startRendering();
  }

  async renderWav(project: Project, bars: number): Promise<Blob> {
    const rendered = await this.renderOffline(project, bars, null);
    return encodeWav(rendered);
  }

  /** raw rendered AudioBuffer (used for loudness analysis / visualisation) */
  async renderBuffer(project: Project, bars: number): Promise<AudioBuffer> {
    return this.renderOffline(project, bars, null);
  }

  /** stem export — renders a single track exactly as it sits in the mix */
  async renderStemWav(project: Project, bars: number, trackId: string): Promise<Blob> {
    const rendered = await this.renderOffline(project, bars, trackId);
    return encodeWav(rendered);
  }

  /** ITU-R BS.1770 style integrated loudness (simplified K-weighting), in LUFS */
  async measureLufs(buffer: AudioBuffer): Promise<number> {
    const kOff = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const src = kOff.createBufferSource();
    src.buffer = buffer;
    // K-weighting approximation: head high-shelf +4 dB, then 38 Hz high-pass
    const shelf = kOff.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 1500;
    shelf.gain.value = 4;
    const hp = kOff.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 38;
    hp.Q.value = 0.5;
    src.connect(shelf).connect(hp).connect(kOff.destination);
    src.start();
    const weighted = await kOff.startRendering();

    const blockLen = Math.floor(weighted.sampleRate * 0.4);
    const hop = Math.floor(weighted.sampleRate * 0.1);
    const powers: number[] = [];
    for (let start = 0; start + blockLen <= weighted.length; start += hop) {
      let sum = 0;
      for (let c = 0; c < weighted.numberOfChannels; c++) {
        const d = weighted.getChannelData(c);
        let s = 0;
        for (let i = start; i < start + blockLen; i++) s += d[i] * d[i];
        sum += s / blockLen;
      }
      powers.push(sum / weighted.numberOfChannels);
    }
    const loud = (meanSq: number) => -0.691 + 10 * Math.log10(Math.max(meanSq, 1e-12));
    const above = powers.filter((p) => loud(p) > -70);
    if (!above.length) return -70;
    const mean = above.reduce((a, b) => a + b, 0) / above.length;
    const rel = loud(mean) - 10;
    const gated = above.filter((p) => loud(p) > rel);
    if (!gated.length) return Math.round(loud(mean) * 10) / 10;
    const gmean = gated.reduce((a, b) => a + b, 0) / gated.length;
    return Math.round(loud(gmean) * 10) / 10;
  }
}

/* ---------------- WAV encoding ---------------- */

export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const bytes = len * numCh * 2;
  const ab = new ArrayBuffer(44 + bytes);
  const view = new DataView(ab);
  const wstr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  wstr(36, "data");
  view.setUint32(40, bytes, true);

  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(off, s, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/* singleton */
let _engine: DawEngine | null = null;
export function getEngine(): DawEngine {
  if (!_engine) _engine = new DawEngine();
  return _engine;
}
