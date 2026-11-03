/* ------------------------------------------------------------------ */
/*  FM-1 — 2-operator FM synth. Native Web Audio build standing in     */
/*  for the uploaded FM-1.vst3 (Windows VST3 by the user).             */
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

/** FM-1 — 2-operator FM voice: sine modulator → index env → N detuned sine carriers.
 *  Modulator has its own envelope (classic FM "brightness decay"); optional
 *  feedback loop thickens the tone; shared lowpass + drive + amp env on top. */
export function fm1Voice(ctx: BaseAudioContext, dest: AudioNode, p: VoiceParams, pitch: number, vel: number, time: number, dur: number) {
  const v = clamp(vel, 0, 1);
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

  /* amp envelope (same shape as skaziAudio's envGain, FM-1 peak) */
  const g = ctx.createGain();
  const peak = 0.32 * v * (0.55 + 0.45 * level);
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

  /* modulator: sine at carrier × ratio, its gain IS the FM index */
  const mod = ctx.createOscillator();
  mod.type = "sine";
  const modF = f * ratio;
  mod.frequency.setValueAtTime(glideFrom !== null ? glideFrom * ratio : modF, time);
  if (glideFrom !== null) mod.frequency.exponentialRampToValueAtTime(modF, time + glideSec);

  const mg = ctx.createGain();
  const idx = f * ratio * (0.25 + modLevel * 3.5) * (1 - 0.4 * (ratio / 16)) * (0.35 + 0.65 * v);
  mg.gain.setValueAtTime(0.0001, time);
  mg.gain.linearRampToValueAtTime(Math.max(0.0001, idx), time + attack);
  mg.gain.setTargetAtTime(Math.max(0.0001, idx * sustain), time + attack, Math.max(0.02, decay / 3));
  mg.gain.setTargetAtTime(0.0001, end, Math.max(0.02, release / 3));
  mod.connect(mg);

  /* feedback loop: mod → index → delay → fb → modulator frequency */
  if (fbAmt >= 0.01) {
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 128 / ctx.sampleRate;
    const fbGain = ctx.createGain();
    fbGain.gain.value = clamp(fbAmt * 2.2, 0, 2.2);
    mg.connect(delay).connect(fbGain).connect(mod.frequency);
  }

  mod.start(time);
  mod.stop(endAll);

  /* carriers: up to 4 detuned sines, all driven by the one index gain */
  const bus = ctx.createGain();
  bus.gain.value = 1 / Math.sqrt(unison);
  bus.connect(filt);
  const carriers: OscillatorNode[] = [];
  for (let i = 0; i < unison; i++) {
    const c = ctx.createOscillator();
    c.type = "sine";
    const spread = unison === 1 ? 0 : ((i / (unison - 1)) * 2 - 1) * detune * 35;
    c.detune.setValueAtTime(spread, time);
    c.frequency.setValueAtTime(glideFrom !== null ? glideFrom : f, time);
    if (glideFrom !== null) c.frequency.exponentialRampToValueAtTime(f, time + glideSec);
    mg.connect(c.frequency);
    c.connect(bus);
    c.start(time);
    c.stop(endAll);
    carriers.push(c);
  }

  /* one LFO, switchable target */
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
      la.gain.value = 60 * lfoDepth; // ±60 cents at full depth
      for (const c of carriers) la.connect(c.detune);
    }
    lfo.start(time);
    lfo.stop(endAll);
  }
}
