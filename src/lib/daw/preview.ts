/* Lightweight one-shot previews for the landing page (no engine needed) */

import type { DrumSound } from "./types";
import { scheduleDrum, scheduleSynth, type SynthParams } from "./engine";

let ctx: AudioContext | null = null;

async function ac(): Promise<AudioContext> {
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

export async function previewDrumLanding(sound: DrumSound) {
  try {
    const c = await ac();
    scheduleDrum(c, c.destination, sound, c.currentTime + 0.01, {
      vel: 0.9,
      tune: 0,
      customBuf: null,
    });
  } catch {
    /* autoplay blocked */
  }
}

const INSTRUMENT_PARAMS: Record<string, SynthParams> = {
  "SA-2": {
    waveform: "sawtooth",
    cutoff: 0.6,
    resonance: 5,
    attack: 0.01,
    decay: 0.25,
    sustain: 0.4,
    release: 0.3,
    detune: 10,
    octave: 0,
    glide: false,
  },
  "AX-3": {
    waveform: "sawtooth",
    cutoff: 0.32,
    resonance: 17,
    attack: 0.005,
    decay: 0.16,
    sustain: 0.18,
    release: 0.1,
    detune: 0,
    octave: -1,
    glide: true,
  },
  "WX-4": {
    waveform: "square",
    cutoff: 0.66,
    resonance: 7,
    attack: 0.3,
    decay: 0.6,
    sustain: 0.6,
    release: 0.8,
    detune: 16,
    octave: 0,
    glide: false,
  },
  "MX-1": {
    waveform: "triangle",
    cutoff: 0.55,
    resonance: 3,
    attack: 0.004,
    decay: 0.22,
    sustain: 0.25,
    release: 0.18,
    detune: 4,
    octave: 0,
    glide: false,
  },
  Creator: {
    waveform: "sine",
    cutoff: 0.7,
    resonance: 2,
    attack: 0.5,
    decay: 0.8,
    sustain: 0.65,
    release: 1.1,
    detune: 8,
    octave: 0,
    glide: false,
  },
};

const INSTRUMENT_RIFF: Record<string, number[]> = {
  "SA-2": [57, 60, 64, 67],
  "AX-3": [45, 45, 48, 51],
  "WX-4": [64, 69, 72, 76],
  "MX-1": [64, 67, 71, 74],
  Creator: [57, 64, 69, 72],
};

export async function previewInstrument(id: string) {
  try {
    const c = await ac();
    const p = INSTRUMENT_PARAMS[id];
    const riff = INSTRUMENT_RIFF[id] ?? [60, 64, 67, 72];
    if (!p) return;
    riff.forEach((pitch, i) => {
      scheduleSynth(
        c,
        c.destination,
        p,
        pitch,
        0.8,
        c.currentTime + 0.02 + i * 0.14,
        0.22
      );
    });
  } catch {
    /* ignore */
  }
}
