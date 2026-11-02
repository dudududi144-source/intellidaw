/* ------------------------------------------------------------------ */
/*  Shared cached noise + impulse buffers.                             */
/*  Scheduling voices must NEVER allocate AudioBuffers on the fly —    */
/*  every `new AudioBuffer` + Math.random fill hammers the GC and      */
/*  causes audible dropouts on busy patterns. We keep exactly one      */
/*  buffer per (context, standard size) and reuse it everywhere.       */
/* ------------------------------------------------------------------ */

type NoiseCache = Map<number, AudioBuffer>;

const noiseCaches = new WeakMap<BaseAudioContext, NoiseCache>();

/** standard sizes (seconds) the cache rounds to — bounds total memory */
const NOISE_SECS = [0.012, 0.02, 0.05, 0.12, 0.15, 0.2, 0.3, 0.5, 1.2, 2] as const;

/** a reusable white-noise buffer (rounded to the nearest standard size) */
export function cachedNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  let m = noiseCaches.get(ctx);
  if (!m) {
    m = new Map();
    noiseCaches.set(ctx, m);
  }
  let best = NOISE_SECS[0];
  for (const s of NOISE_SECS) {
    if (Math.abs(s - seconds) < Math.abs(best - seconds)) best = s;
  }
  const hit = m.get(best);
  if (hit) return hit;
  const len = Math.max(64, Math.floor(ctx.sampleRate * best));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  m.set(best, buf);
  return buf;
}

const impulseCaches = new WeakMap<BaseAudioContext, AudioBuffer>();

/** a reusable 2.4s stereo reverb impulse (one per context)
 *  shaped like a small room: short predelay, lowpassed tail (a raw
 *  white-noise decay rings metallic), smooth exponential-ish fade */
export function cachedImpulse(
  ctx: BaseAudioContext,
  seconds = 2.4,
  decay = 2.8
): AudioBuffer {
  const hit = impulseCaches.get(ctx);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.018); // ~18ms predelay keeps the dry hit up front
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    const tilt = 0.34 + c * 0.03; // per-channel tilt decorrelates L/R
    for (let i = 0; i < len; i++) {
      if (i < pre) {
        d[i] = 0;
        continue;
      }
      const t = (i - pre) / (len - pre);
      const n = Math.random() * 2 - 1;
      lp = lp * (1 - tilt) + n * tilt; // 1-pole lowpass on the tail
      d[i] = lp * Math.pow(1 - t, decay) * 1.6;
    }
  }
  impulseCaches.set(ctx, buf);
  return buf;
}

/** cheap per-hit variation for a shared noise source (±4% rate) */
export function jitterRate(src: AudioBufferSourceNode) {
  src.playbackRate.value = 0.96 + Math.random() * 0.08;
}
