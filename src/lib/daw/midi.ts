/* ------------------------------------------------------------------ */
/*  Standard MIDI File (type 1) export — no dependencies               */
/*  Synth tracks → melodic channels, drums → channel 10                */
/* ------------------------------------------------------------------ */

import type { Project, Track } from "./types";

const PPQ = 480; // ticks per quarter note
const TICKS_PER_STEP = PPQ / 4; // one 16th note

/** drum sound → General MIDI percussion note (channel 10) */
const DRUM_MAP: Record<string, number> = {
  kick: 36,
  kick2: 35,
  snare: 38,
  clap: 39,
  chat: 42,
  ohat: 46,
  perc: 63,
  rim: 37,
  tom: 45,
  conga: 63,
  shaker: 70,
  ride: 51,
  crash: 49,
  chop: 85,
  vox: 85,
  fx: 85,
};

function vlq(value: number): number[] {
  const bytes = [value & 0x7f];
  let v = value >> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function str(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

function u32(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

function chunk(id: string, data: number[]): number[] {
  return [...str(id), ...u32(data.length), ...data];
}

interface MidiEvent {
  tick: number;
  data: number[];
  order: number; // stable ordering for identical ticks (note-offs first)
}

/** serialize events into track data with delta times */
function trackData(events: MidiEvent[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out: number[] = [];
  let last = 0;
  for (const ev of events) {
    out.push(...vlq(ev.tick - last), ...ev.data);
    last = ev.tick;
  }
  out.push(0x00, 0xff, 0x2f, 0x00); // end of track
  return out;
}

function trackName(name: string): MidiEvent[] {
  return [{ tick: 0, order: 0, data: [0xff, 0x03, name.length, ...str(name.slice(0, 32))] }];
}

export function projectToMidi(project: Project): Blob {
  const tracksOut: number[][] = [];

  // conductor track: tempo + time signature + name
  const tempo = Math.round(60000000 / project.bpm);
  const conductor: MidiEvent[] = [
    { tick: 0, order: 0, data: [0xff, 0x03, project.name.length, ...str(project.name.slice(0, 32))] },
    {
      tick: 0,
      order: 1,
      data: [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff],
    },
    { tick: 0, order: 2, data: [0xff, 0x58, 0x04, 4, 2, 24, 8] },
  ];
  tracksOut.push(trackData(conductor));

  let melodicChannel = 0;
  const loopBars = Math.max(1, project.sections.length || 4);

  for (const track of project.tracks) {
    const events: MidiEvent[] = [...trackName(track.name)];
    if (track.kind === "drum") {
      const note = DRUM_MAP[track.sound] ?? 38;
      const ch = 0x90 | 9; // GM percussion
      for (let rep = 0; rep < loopBars; rep++) {
        track.steps.forEach((s, i) => {
          if (!s.on) return;
          const tick = (rep * 16 + i) * TICKS_PER_STEP;
          const vel = Math.max(1, Math.round(s.vel * 110));
          events.push({ tick, order: 1, data: [ch, note, vel] });
          events.push({ tick: tick + Math.round(TICKS_PER_STEP * 0.9), order: 0, data: [0x80 | 9, note, 0] });
        });
      }
    } else {
      const chIdx = melodicChannel;
      melodicChannel = (melodicChannel + 1) % 16;
      const noteOn = 0x90 | chIdx;
      const noteOff = 0x80 | chIdx;
      for (let rep = 0; rep < loopBars; rep++) {
        for (const n of track.notes) {
          const tick = (rep * 16 + n.step) * TICKS_PER_STEP;
          const dur = Math.max(TICKS_PER_STEP, Math.round(n.len * TICKS_PER_STEP * 0.95));
          const vel = Math.max(1, Math.round(n.vel * 110));
          events.push({ tick, order: 1, data: [noteOn, n.pitch, vel] });
          events.push({ tick: tick + dur, order: 0, data: [noteOff, n.pitch, 0] });
        }
      }
    }
    tracksOut.push(trackData(events));
  }

  const header = chunk("MThd", [...u16(1), ...u16(tracksOut.length), ...u16(PPQ)]);
  const bytes = new Uint8Array([...header, ...tracksOut.map((t) => chunk("MTrk", t)).flat()]);
  return new Blob([bytes], { type: "audio/midi" });
}
