/* ------------------------------------------------------------------ */
/*  Intellidaw — Web Audio engine                                      */
/*  Deterministic scheduling shared between live playback and          */
/*  offline WAV rendering.                                             */
/* ------------------------------------------------------------------ */

import type { DrumSound, Project, SynthTrack, Waveform } from "./types";

const LOOKAHEAD_S = 0.14;
const TICK_MS = 30;

/* ---------------- noise + impulse caches ---------------- */

function noiseBuffer(ctx: BaseAudioContext, seconds = 1): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function reverbImpulse(ctx: BaseAudioContext, seconds = 2.4, decay = 2.6): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

const midiHz = (p: number) => 440 * Math.pow(2, (p - 69) / 12);

export const cutoffHz = (c: number) => 120 * Math.pow(100, Math.min(1, Math.max(0, c))); // 120Hz..12kHz

const volGain = (v: number) => Math.pow(Math.max(0, v), 1.6);

/* ---------------- drum synthesis ---------------- */

export interface DrumVoiceOpts {
  vel: number;
  tune: number;
  customBuf?: AudioBuffer | null;
}

export function scheduleDrum(
  ctx: BaseAudioContext,
  dest: AudioNode,
  sound: DrumSound,
  time: number,
  opts: DrumVoiceOpts
) {
  const { vel, tune, customBuf } = opts;
  if (customBuf) {
    const src = ctx.createBufferSource();
    src.buffer = customBuf;
    src.playbackRate.value = Math.pow(2, tune / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + customBuf.duration);
    src.connect(g).connect(dest);
    src.start(time);
    return;
  }
  const rate = Math.pow(2, tune / 12);
  switch (sound) {
    case "kick":
    case "kick2": {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      const f0 = sound === "kick" ? 160 : 130;
      const f1 = sound === "kick" ? 44 : 36;
      const dur = sound === "kick" ? 0.42 : 0.62;
      o.frequency.setValueAtTime(f0 * rate, time);
      o.frequency.exponentialRampToValueAtTime(f1 * rate, time + 0.11);
      g.gain.setValueAtTime(vel, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      o.connect(g).connect(dest);
      o.start(time);
      o.stop(time + dur + 0.05);
      // click
      const c = ctx.createBufferSource();
      c.buffer = noiseBuffer(ctx, 0.02);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(vel * 0.35, time);
      cg.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
      const cf = ctx.createBiquadFilter();
      cf.type = "lowpass";
      cf.frequency.value = 4000;
      c.connect(cf).connect(cg).connect(dest);
      c.start(time);
      break;
    }
    case "snare": {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 0.3);
      const nf = ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 1900 * rate;
      nf.Q.value = 0.9;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vel * 0.9, time);
      ng.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      n.connect(nf).connect(ng).connect(dest);
      n.start(time);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(195 * rate, time);
      o.frequency.exponentialRampToValueAtTime(120 * rate, time + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(vel * 0.7, time);
      og.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      o.connect(og).connect(dest);
      o.start(time);
      o.stop(time + 0.2);
      break;
    }
    case "clap": {
      for (let i = 0; i < 3; i++) {
        const n = ctx.createBufferSource();
        n.buffer = noiseBuffer(ctx, 0.15);
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1150 * rate;
        f.Q.value = 1.6;
        const g = ctx.createGain();
        const t0 = time + i * 0.011;
        g.gain.setValueAtTime(vel * 0.8, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + (i === 2 ? 0.16 : 0.03));
        n.connect(f).connect(g).connect(dest);
        n.start(t0);
      }
      break;
    }
    case "chat":
    case "ohat": {
      const dur = sound === "chat" ? 0.05 : 0.33;
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 0.5);
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 7200 * rate;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * (sound === "chat" ? 0.55 : 0.5), time);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      n.connect(f).connect(g).connect(dest);
      n.start(time);
      break;
    }
    case "perc": {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(820 * rate, time);
      o.frequency.exponentialRampToValueAtTime(300 * rate, time + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.4, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 900 * rate;
      o.connect(f).connect(g).connect(dest);
      o.start(time);
      o.stop(time + 0.15);
      break;
    }
    case "rim": {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = 1750 * rate;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.5, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 0.05);
      const nf = ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 3600 * rate;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vel * 0.4, time);
      ng.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      o.connect(g).connect(dest);
      n.connect(nf).connect(ng).connect(dest);
      o.start(time);
      o.stop(time + 0.1);
      n.start(time);
      break;
    }
    case "tom":
    case "conga": {
      const f0 = sound === "tom" ? 220 : 330;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f0 * rate, time);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.55 * rate, time + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.85, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + (sound === "tom" ? 0.3 : 0.16));
      o.connect(g).connect(dest);
      o.start(time);
      o.stop(time + 0.4);
      break;
    }
    case "shaker": {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 0.2);
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 9000 * rate;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, time);
      g.gain.linearRampToValueAtTime(vel * 0.4, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      n.connect(f).connect(g).connect(dest);
      n.start(time);
      break;
    }
    case "ride":
    case "crash": {
      const dur = sound === "ride" ? 0.7 : 1.4;
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 2);
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = sound === "ride" ? 6800 : 4500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * (sound === "ride" ? 0.35 : 0.5), time);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      n.connect(f).connect(g).connect(dest);
      n.start(time);
      [3600, 5210, 7830].forEach((fr) => {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = fr * rate;
        const og = ctx.createGain();
        og.gain.setValueAtTime(vel * 0.06, time);
        og.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.7);
        o.connect(og).connect(dest);
        o.start(time);
        o.stop(time + dur);
      });
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
      f.frequency.exponentialRampToValueAtTime(500, time + 0.12);
      f.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.5, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
      o.connect(f).connect(g).connect(dest);
      o.start(time);
      o.stop(time + 0.2);
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
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
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
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 1.2);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 2.2;
      f.frequency.setValueAtTime(300, time);
      f.frequency.exponentialRampToValueAtTime(7000, time + 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * 0.28, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 1.05);
      n.connect(f).connect(g).connect(dest);
      n.start(time);
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
  durSec: number
) {
  const freq = midiHz(pitch + p.octave * 12);
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = p.resonance;
  const cutHz = cutoffHz(p.cutoff);
  const peakCut = Math.min(16000, cutHz * 3.2);
  f.frequency.setValueAtTime(Math.max(80, peakCut), time);
  f.frequency.exponentialRampToValueAtTime(Math.max(90, cutHz), time + Math.max(0.03, p.decay));
  g.gain.setValueAtTime(0.0001, time);
  const peak = vel * 0.32;
  const atk = Math.max(0.004, p.attack);
  g.gain.linearRampToValueAtTime(peak, time + atk);
  g.gain.setTargetAtTime(peak * p.sustain, time + atk, Math.max(0.02, p.decay / 3));
  const end = time + Math.max(atk + 0.05, durSec);
  g.gain.setTargetAtTime(0.0001, end, Math.max(0.02, p.release / 3));
  f.connect(g).connect(dest);

  const mkOsc = (detuneCents: number, type: OscillatorType) => {
    const o = ctx.createOscillator();
    o.type = type;
    if (p.glide) {
      o.frequency.setValueAtTime(freq * Math.pow(2, -2 / 12), time);
      o.frequency.exponentialRampToValueAtTime(freq, time + 0.06);
    } else {
      o.frequency.setValueAtTime(freq, time);
    }
    o.detune.value = detuneCents;
    o.connect(f);
    o.start(time);
    const stop = end + p.release + 0.3;
    o.stop(stop);
  };
  mkOsc(0, p.waveform);
  if (p.detune > 0) mkOsc(p.detune, p.waveform);
  if (p.waveform !== "sine" && p.detune > 0) mkOsc(-p.detune, p.waveform); // unison widen
}

/* ---------------- graph ---------------- */

interface Channel {
  input: GainNode;
  pan: StereoPannerNode;
  gain: GainNode;
  analyser?: AnalyserNode;
  delaySend: GainNode;
  reverbSend: GainNode;
}

interface Graph {
  master: GainNode;
  limiter: DynamicsCompressorNode;
  channels: Map<string, Channel>;
  delayIn: GainNode;
  reverbIn: GainNode;
  delayNode: DelayNode;
}

function buildGraph(ctx: BaseAudioContext, project: Project, live: boolean): Graph {
  const master = ctx.createGain();
  master.gain.value = volGain(project.masterVolume);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  master.connect(limiter);

  let tail: AudioNode = limiter;
  if (live) {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    limiter.connect(analyser);
    tail = limiter;
    (graphExtras as { masterAnalyser?: AnalyserNode }).masterAnalyser = analyser;
  }
  tail.connect(ctx.destination);

  // shared FX buses
  const spb = 60 / project.bpm;
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
  conv.buffer = reverbImpulse(ctx);
  const revTone = ctx.createBiquadFilter();
  revTone.type = "highpass";
  revTone.frequency.value = 300;
  reverbIn.connect(conv);
  conv.connect(revTone);
  revTone.connect(master);

  const channels: Map<string, Channel> = new Map();
  const anySolo = project.tracks.some((t) => t.solo);
  for (const t of project.tracks) {
    const input = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = t.pan;
    const gain = ctx.createGain();
    const audible = !t.muted && (!anySolo || t.solo);
    gain.gain.value = audible ? volGain(t.volume) : 0;
    input.connect(pan);
    pan.connect(gain);
    gain.connect(master);

    const delaySend = ctx.createGain();
    delaySend.gain.value = t.delaySend;
    gain.connect(delaySend);
    delaySend.connect(delayIn);

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = t.reverbSend;
    gain.connect(reverbSend);
    reverbSend.connect(reverbIn);

    channels.set(t.id, { input, pan, gain, delaySend, reverbSend });
  }
  return { master, limiter, channels, delayIn, reverbIn, delayNode: delay };
}

const graphExtras: { masterAnalyser?: AnalyserNode } = {};

/* ---------------- engine ---------------- */

export class DawEngine {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private absStep = 0;
  private project: Project | null = null;
  private queue: Array<{ step: number; time: number }> = [];
  private raf = 0;
  private noise: AudioBuffer | null = null;
  private customCache = new Map<string, AudioBuffer>();
  playing = false;
  onStep: ((step: number) => void) | null = null;

  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.noise = noiseBuffer(this.ctx, 2);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  async sync(project: Project) {
    this.project = project;
    const ctx = await this.ensure();
    if (!this.graph) {
      this.graph = buildGraph(ctx, project, true);
    } else {
      // update live params without rebuilding (cheap)
      const anySolo = project.tracks.some((t) => t.solo);
      this.graph.master.gain.setTargetAtTime(volGain(project.masterVolume), ctx.currentTime, 0.03);
      this.graph.delayNode.delayTime.setTargetAtTime((60 / project.bpm) * 0.75, ctx.currentTime, 0.08);
      for (const t of project.tracks) {
        const ch = this.graph.channels.get(t.id);
        if (!ch) continue;
        ch.pan.pan.setTargetAtTime(t.pan, ctx.currentTime, 0.03);
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
      this.graph = buildGraph(this.ctx, project, true);
    }
  }

  async play(project: Project) {
    await this.sync(project);
    this.rebuildIfTrackSetChanged(project);
    if (!this.ctx || !this.graph) return;
    if (this.playing) this.stop();
    this.playing = true;
    this.absStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.queue = [];
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.pump();
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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
    while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD_S) {
      const step = this.absStep % 16;
      const swingOffset = step % 2 === 1 ? p.swing * stepDur * 0.5 : 0;
      const time = this.nextStepTime + swingOffset;
      this.scheduleStep(p, this.graph!, step, time, stepDur);
      this.queue.push({ step, time });
      this.nextStepTime += stepDur;
      this.absStep++;
    }
  }

  private scheduleStep(
    p: Project,
    graph: Graph,
    step: number,
    time: number,
    stepDur: number
  ) {
    const ctx = this.ctx!;
    const anySolo = p.tracks.some((t) => t.solo);
    for (const t of p.tracks) {
      const ch = graph.channels.get(t.id);
      if (!ch) continue;
      const audible = !t.muted && (!anySolo || t.solo);
      if (!audible) continue;
      if (t.kind === "drum") {
        const s = t.steps[step];
        if (s?.on) {
          scheduleDrum(ctx, ch.input, t.sound, time, {
            vel: s.vel,
            tune: t.tune,
            customBuf: this.customFor(t.sound),
          });
        }
      } else {
        for (const n of t.notes) {
          if (n.step === step) {
            scheduleSynth(
              ctx,
              ch.input,
              t as SynthTrack,
              n.pitch,
              n.vel,
              time,
              n.len * stepDur
            );
          }
        }
      }
    }
  }

  /** fire onStep callbacks in near-realtime */
  private pump = () => {
    if (!this.playing || !this.ctx) return;
    const now = this.ctx.currentTime;
    while (this.queue.length && this.queue[0].time <= now) {
      const item = this.queue.shift()!;
      this.onStep?.(item.step);
    }
    this.raf = requestAnimationFrame(this.pump);
  };

  /* ---- preview one-shots (pads, piano keys, landing) ---- */

  async previewDrum(sound: DrumSound, vel = 0.95, tune = 0, customDataUrl?: string | null) {
    const ctx = await this.ensure();
    let buf: AudioBuffer | null = null;
    if (customDataUrl) buf = await this.decodeDataUrl(customDataUrl);
    scheduleDrum(ctx, ctx.destination, sound, ctx.currentTime + 0.01, {
      vel,
      tune,
      customBuf: buf,
    });
  }

  async previewSynth(p: SynthParams, pitch: number, durSec = 0.35, vel = 0.9) {
    const ctx = await this.ensure();
    scheduleSynth(ctx, ctx.destination, p, pitch, vel, ctx.currentTime + 0.01, durSec);
  }

  async decodeDataUrl(dataUrl: string): Promise<AudioBuffer | null> {
    if (!dataUrl) return null;
    const ctx = await this.ensure();
    const cached = this.customCache.get(dataUrl);
    if (cached) return cached;
    try {
      const res = await fetch(dataUrl);
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      this.customCache.set(dataUrl, buf);
      return buf;
    } catch {
      return null;
    }
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

  /* ---- offline render → WAV ---- */

  async renderWav(project: Project, bars: number): Promise<Blob> {
    const spb = 60 / project.bpm;
    const stepDur = spb / 4;
    const totalSteps = bars * 16;
    const dur = totalSteps * stepDur + 1.8;
    const off = new OfflineAudioContext(2, Math.ceil(44100 * dur), 44100);
    const graph = buildGraph(off, project, false);
    // decode user pad samples up-front so they are included in the render
    const padBufs = new Map<DrumSound, AudioBuffer | null>();
    for (const pad of project.pads) {
      if (pad.custom?.dataUrl && !padBufs.has(pad.sound)) {
        padBufs.set(pad.sound, await this.decodeDataUrl(pad.custom.dataUrl));
      }
    }
    const anySolo = project.tracks.some((t) => t.solo);
    let t = 0.05;
    for (let i = 0; i < totalSteps; i++) {
      const step = i % 16;
      const swingOffset = step % 2 === 1 ? project.swing * stepDur * 0.5 : 0;
      const time = t + swingOffset;
      for (const track of project.tracks) {
        const ch = graph.channels.get(track.id);
        if (!ch) continue;
        const audible = !track.muted && (!anySolo || track.solo);
        if (!audible) continue;
        if (track.kind === "drum") {
          const s = track.steps[step];
          if (s?.on) {
            scheduleDrum(off, ch.input, track.sound, time, {
              vel: s.vel,
              tune: track.tune,
              customBuf: padBufs.get(track.sound) ?? null,
            });
          }
        } else {
          for (const n of track.notes) {
            if (n.step === step) {
              scheduleSynth(off, ch.input, track, n.pitch, n.vel, time, n.len * stepDur);
            }
          }
        }
      }
      t += stepDur;
    }
    const rendered = await off.startRendering();
    return encodeWav(rendered);
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
