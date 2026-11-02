/* ------------------------------------------------------------------ */
/*  Intellidaw — core data model                                       */
/* ------------------------------------------------------------------ */

export type DrumSound =
  | "kick"
  | "kick2"
  | "snare"
  | "clap"
  | "chat"
  | "ohat"
  | "perc"
  | "rim"
  | "tom"
  | "conga"
  | "shaker"
  | "ride"
  | "chop"
  | "vox"
  | "fx"
  | "crash";

export type Waveform = "sawtooth" | "square" | "triangle" | "sine";

export interface DrumStep {
  on: boolean;
  vel: number; // 0..1
}

export interface Note {
  id: string;
  step: number; // 0..15
  len: number; // in steps
  pitch: number; // MIDI number
  vel: number; // 0..1
}

export interface ChannelStrip {
  volume: number; // 0..1.3
  pan: number; // -1..1
  muted: boolean;
  solo: boolean;
  delaySend: number; // 0..1
  reverbSend: number; // 0..1
}

export interface DrumTrack extends ChannelStrip {
  kind: "drum";
  id: string;
  name: string;
  sound: DrumSound;
  color: string;
  tune: number; // -12..12 semitones
  steps: DrumStep[]; // 16
}

export interface SynthTrack extends ChannelStrip {
  kind: "synth";
  id: string;
  name: string;
  color: string;
  waveform: Waveform;
  cutoff: number; // 0..1 → 120..12000 Hz (exp)
  resonance: number; // 0..18
  attack: number; // s
  decay: number; // s
  sustain: number; // 0..1
  release: number; // s
  detune: number; // cents for 2nd osc
  octave: number; // -2..2 transpose
  glide: boolean;
  notes: Note[];
}

export type Track = DrumTrack | SynthTrack;

export interface KitPad {
  slot: number; // 0..15
  sound: DrumSound;
  label: string;
  key: string; // keyboard binding
  tune: number;
  custom?: { name: string; dataUrl: string } | null;
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  swing: number; // 0..0.6
  masterVolume: number;
  tracks: Track[];
  pads: KitPad[];
  updatedAt: number;
}

export const STEP_COUNT = 16;
export const NOTE_LOW = 36; // C2
export const NOTE_HIGH = 84; // C6 (piano roll shows 36..83)

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/* ------------------------------------------------------------------ */
/*  Channel factory helpers                                            */
/* ------------------------------------------------------------------ */

const emptySteps = (): DrumStep[] =>
  Array.from({ length: STEP_COUNT }, () => ({ on: false, vel: 0.9 }));

const ch = (o: Partial<ChannelStrip> = {}): ChannelStrip => ({
  volume: 0.85,
  pan: 0,
  muted: false,
  solo: false,
  delaySend: 0,
  reverbSend: 0,
  ...o,
});

export function makeDrumTrack(
  sound: DrumSound,
  name: string,
  color: string,
  beats: number[] = [],
  opts: Partial<DrumTrack> = {}
): DrumTrack {
  const steps = emptySteps();
  beats.forEach((s) => (steps[s] = { on: true, vel: 0.9 }));
  return {
    kind: "drum",
    id: uid(),
    name,
    sound,
    color,
    tune: 0,
    steps,
    ...ch(),
    ...opts,
  };
}

export function makeSynthTrack(
  name: string,
  color: string,
  opts: Partial<SynthTrack> = {},
  notes: Note[] = []
): SynthTrack {
  return {
    kind: "synth",
    id: uid(),
    name,
    color,
    waveform: "sawtooth",
    cutoff: 0.62,
    resonance: 4,
    attack: 0.01,
    decay: 0.18,
    sustain: 0.55,
    release: 0.22,
    detune: 8,
    octave: 0,
    glide: false,
    notes,
    ...ch(),
    ...opts,
  };
}

let _nid = 0;
export const note = (step: number, len: number, pitch: number, vel = 0.95): Note => ({
  id: `n${_nid++}_${uid()}`,
  step,
  len,
  pitch,
  vel,
});

/* ------------------------------------------------------------------ */
/*  Default project — "Midnight Drive" (A minor · 100 BPM)             */
/* ------------------------------------------------------------------ */

export const DEFAULT_PAD_LABELS: Array<[DrumSound, string, string]> = [
  ["kick", "Kick", "1"],
  ["kick2", "Kick 2", "2"],
  ["snare", "Snare", "3"],
  ["clap", "Clap", "4"],
  ["chat", "C Hat", "5"],
  ["ohat", "O Hat", "6"],
  ["perc", "Perc", "7"],
  ["rim", "Rim", "8"],
  ["tom", "Tom", "9"],
  ["conga", "Conga", "0"],
  ["shaker", "Shaker", "q"],
  ["ride", "Ride", "w"],
  ["chop", "Chop", "e"],
  ["vox", "Vox", "r"],
  ["fx", "FX", "t"],
  ["crash", "Crash", "y"],
];

export function defaultPads(): KitPad[] {
  return DEFAULT_PAD_LABELS.map(([sound, label, key], i) => ({
    slot: i,
    sound,
    label,
    key,
    tune: 0,
    custom: null,
  }));
}

export function createDefaultProject(): Project {
  return {
    id: uid(),
    name: "Midnight Drive",
    bpm: 100,
    swing: 0.08,
    masterVolume: 0.9,
    updatedAt: Date.now(),
    pads: defaultPads(),
    tracks: [
      makeDrumTrack("kick", "Kick", "#f2a43a", [0, 4, 8, 12]),
      makeDrumTrack("snare", "Snare", "#e5c15a", [4, 12]),
      makeDrumTrack("chat", "C Hat", "#d97b5a", [2, 6, 10, 14], {
        volume: 0.6,
      }),
      makeDrumTrack("ohat", "O Hat", "#b8a98f", [], { volume: 0.55 }),
      makeDrumTrack("clap", "Clap", "#8fbf6b", [12], { volume: 0.7 }),
      makeDrumTrack("perc", "Perc", "#c9b458", [7, 15], { volume: 0.5 }),
      makeSynthTrack(
        "Bass",
        "#f2a43a",
        {
          waveform: "sawtooth",
          cutoff: 0.34,
          resonance: 6,
          sustain: 0.4,
          release: 0.12,
          decay: 0.22,
          volume: 0.95,
          octave: -1,
        },
        [
          note(0, 3, 45), // A2
          note(3, 1, 45),
          note(6, 2, 48), // C3
          note(8, 3, 45),
          note(12, 1, 43), // G2
          note(13, 1, 45),
          note(14, 2, 40), // E2
        ]
      ),
      makeSynthTrack(
        "Keys",
        "#e5c15a",
        {
          waveform: "triangle",
          cutoff: 0.55,
          attack: 0.02,
          release: 0.5,
          sustain: 0.45,
          reverbSend: 0.35,
          volume: 0.62,
        },
        [
          note(0, 4, 57, 0.7),
          note(0, 4, 60, 0.7),
          note(0, 4, 64, 0.7), // Am
          note(8, 4, 57, 0.6),
          note(8, 4, 60, 0.6),
          note(8, 4, 65, 0.6), // F/Am7 color
        ]
      ),
      makeSynthTrack(
        "Lead",
        "#8fbf6b",
        {
          waveform: "square",
          cutoff: 0.68,
          resonance: 8,
          decay: 0.3,
          sustain: 0.35,
          release: 0.3,
          detune: 12,
          delaySend: 0.3,
          reverbSend: 0.2,
          volume: 0.5,
        },
        [
          note(0, 2, 76, 0.75), // E5
          note(2, 1, 74, 0.65), // D5
          note(3, 2, 72, 0.8), // C5
          note(6, 2, 69, 0.7), // A4
          note(10, 2, 72, 0.7),
          note(12, 2, 76, 0.75),
          note(14, 2, 79, 0.6), // G5
        ]
      ),
      makeSynthTrack(
        "Pad",
        "#b8a98f",
        {
          waveform: "sawtooth",
          cutoff: 0.4,
          attack: 0.6,
          decay: 0.8,
          sustain: 0.7,
          release: 1.2,
          detune: 14,
          reverbSend: 0.5,
          volume: 0.3,
        },
        [
          note(0, 16, 45, 0.5),
          note(0, 16, 52, 0.5),
          note(0, 16, 57, 0.5),
        ]
      ),
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Genre templates                                                    */
/* ------------------------------------------------------------------ */

export interface Template {
  name: string;
  bpm: number;
  tag: string;
  build: () => Project;
}

export const TEMPLATES: Template[] = [
  {
    name: "House",
    bpm: 124,
    tag: "124",
    build: () => ({
      ...createDefaultProject(),
      id: uid(),
      name: "House Kit",
      bpm: 124,
      swing: 0.04,
      tracks: [
        makeDrumTrack("kick", "Kick", "#f2a43a", [0, 4, 8, 12]),
        makeDrumTrack("clap", "Clap", "#e5c15a", [4, 12]),
        makeDrumTrack("ohat", "O Hat", "#d97b5a", [2, 6, 10, 14], { volume: 0.6 }),
        makeDrumTrack("shaker", "Shaker", "#b8a98f", [1, 3, 5, 7, 9, 11, 13, 15], { volume: 0.4 }),
        makeSynthTrack(
          "Bass",
          "#f2a43a",
          { waveform: "sawtooth", cutoff: 0.3, sustain: 0.3, release: 0.1, octave: -1, volume: 0.9 },
          [note(0, 1, 45), note(2, 1, 45), note(4, 1, 52), note(6, 1, 45), note(8, 1, 45), note(10, 1, 48), note(12, 1, 52), note(14, 1, 55)]
        ),
        makeSynthTrack(
          "Stab",
          "#8fbf6b",
          { waveform: "sawtooth", cutoff: 0.6, decay: 0.15, sustain: 0.1, release: 0.15, delaySend: 0.35, volume: 0.55 },
          [note(4, 1, 64), note(4, 1, 67), note(4, 1, 72), note(12, 1, 65), note(12, 1, 69), note(12, 1, 74)]
        ),
      ],
    }),
  },
  {
    name: "Techno",
    bpm: 132,
    tag: "132",
    build: () => ({
      ...createDefaultProject(),
      id: uid(),
      name: "Techno Vault",
      bpm: 132,
      swing: 0,
      tracks: [
        makeDrumTrack("kick", "Kick", "#f2a43a", [0, 4, 8, 12]),
        makeDrumTrack("rim", "Rim", "#e5c15a", [6, 14], { volume: 0.5 }),
        makeDrumTrack("chat", "C Hat", "#d97b5a", [2, 6, 10, 14], { volume: 0.55 }),
        makeDrumTrack("fx", "FX", "#b8a98f", [0], { volume: 0.35 }),
        makeSynthTrack(
          "Bass",
          "#f2a43a",
          { waveform: "square", cutoff: 0.26, resonance: 10, sustain: 0.25, release: 0.08, octave: -1, volume: 0.95 },
          [note(0, 1, 33), note(2, 1, 33), note(4, 1, 33), note(6, 1, 36), note(8, 1, 33), note(10, 1, 33), note(12, 1, 31), note(14, 1, 38)]
        ),
        makeSynthTrack(
          "Acid",
          "#8fbf6b",
          { waveform: "sawtooth", cutoff: 0.35, resonance: 16, sustain: 0.2, decay: 0.12, release: 0.1, delaySend: 0.4, volume: 0.45, octave: 0 },
          [note(0, 1, 57), note(3, 1, 60), note(6, 1, 57), note(8, 1, 63), note(11, 1, 57), note(14, 1, 64)]
        ),
      ],
    }),
  },
  {
    name: "Lo-fi",
    bpm: 82,
    tag: "82",
    build: () => ({
      ...createDefaultProject(),
      id: uid(),
      name: "Lo-fi Study",
      bpm: 82,
      swing: 0.28,
      tracks: [
        makeDrumTrack("kick", "Kick", "#f2a43a", [0, 7, 10]),
        makeDrumTrack("snare", "Snare", "#e5c15a", [4, 12]),
        makeDrumTrack("shaker", "Shaker", "#d97b5a", [2, 6, 10, 14], { volume: 0.4 }),
        makeDrumTrack("vox", "Vox", "#b8a98f", [0], { volume: 0.3 }),
        makeSynthTrack(
          "Bass",
          "#f2a43a",
          { waveform: "triangle", cutoff: 0.3, sustain: 0.5, release: 0.2, octave: -1, volume: 0.85 },
          [note(0, 4, 40), note(4, 2, 43), note(6, 2, 45), note(8, 4, 38), note(12, 4, 43)]
        ),
        makeSynthTrack(
          "Keys",
          "#e5c15a",
          { waveform: "triangle", cutoff: 0.42, attack: 0.01, release: 0.6, sustain: 0.35, reverbSend: 0.4, volume: 0.6 },
          [
            note(0, 3, 60, 0.6), note(0, 3, 64, 0.6), note(0, 3, 67, 0.6),
            note(6, 2, 62, 0.55), note(6, 2, 65, 0.55),
            note(8, 3, 59, 0.6), note(8, 3, 62, 0.6), note(8, 3, 67, 0.6),
            note(14, 2, 57, 0.5), note(14, 2, 64, 0.5),
          ]
        ),
      ],
    }),
  },
  {
    name: "Hip-Hop",
    bpm: 90,
    tag: "90",
    build: () => ({
      ...createDefaultProject(),
      id: uid(),
      name: "Boom Bap",
      bpm: 90,
      swing: 0.18,
      tracks: [
        makeDrumTrack("kick", "Kick", "#f2a43a", [0, 7, 10]),
        makeDrumTrack("snare", "Snare", "#e5c15a", [4, 12]),
        makeDrumTrack("chat", "C Hat", "#d97b5a", [0, 2, 4, 6, 8, 10, 12, 14], { volume: 0.45 }),
        makeDrumTrack("conga", "Conga", "#b8a98f", [13], { volume: 0.4 }),
        makeSynthTrack(
          "Bass",
          "#f2a43a",
          { waveform: "sawtooth", cutoff: 0.28, sustain: 0.45, release: 0.15, octave: -1, volume: 0.9 },
          [note(0, 3, 36), note(6, 2, 39), note(8, 4, 41), note(12, 2, 36), note(14, 2, 43)]
        ),
        makeSynthTrack(
          "Bell",
          "#8fbf6b",
          { waveform: "sine", cutoff: 0.75, decay: 0.4, sustain: 0.15, release: 0.5, delaySend: 0.3, reverbSend: 0.3, volume: 0.5 },
          [note(0, 2, 72), note(4, 2, 75), note(8, 2, 77), note(12, 2, 72)]
        ),
      ],
    }),
  },
  {
    name: "Acid",
    bpm: 128,
    tag: "128",
    build: () => ({
      ...createDefaultProject(),
      id: uid(),
      name: "Acid Line",
      bpm: 128,
      swing: 0,
      tracks: [
        makeDrumTrack("kick", "Kick", "#f2a43a", [0, 4, 8, 12]),
        makeDrumTrack("ohat", "O Hat", "#d97b5a", [2, 6, 10, 14], { volume: 0.5 }),
        makeDrumTrack("clap", "Clap", "#e5c15a", [4, 12], { volume: 0.6 }),
        makeSynthTrack(
          "303",
          "#8fbf6b",
          { waveform: "sawtooth", cutoff: 0.3, resonance: 18, sustain: 0.15, decay: 0.14, release: 0.08, glide: true, delaySend: 0.35, volume: 0.5, octave: 0 },
          [note(0, 1, 45), note(2, 1, 45), note(3, 1, 48), note(6, 1, 45), note(8, 1, 52), note(10, 1, 45), note(12, 1, 43), note(14, 1, 51)]
        ),
        makeSynthTrack(
          "Bass",
          "#f2a43a",
          { waveform: "square", cutoff: 0.24, sustain: 0.3, release: 0.1, octave: -1, volume: 0.85 },
          [note(0, 2, 33), note(4, 2, 33), note(8, 2, 31), note(12, 2, 33)]
        ),
      ],
    }),
  },
  {
    name: "SKAZI Psy",
    bpm: 138,
    tag: "138",
    build: () => ({
      ...createDefaultProject(),
      id: uid(),
      name: "Skazi Psy Floor",
      bpm: 138,
      swing: 0,
      tracks: [
        makeDrumTrack("kick", "Kick", "#f2a43a", [0, 4, 8, 12]),
        makeDrumTrack("chat", "C Hat", "#d97b5a", [2, 6, 10, 14], { volume: 0.55 }),
        makeDrumTrack("ohat", "O Hat", "#b8a98f", [2, 6, 10, 14], { volume: 0.4 }),
        makeDrumTrack("perc", "Perc", "#e5c15a", [7, 15], { volume: 0.45 }),
        makeSynthTrack(
          "Bass",
          "#a3e635",
          { waveform: "sawtooth", cutoff: 0.34, resonance: 8, sustain: 0.2, decay: 0.16, release: 0.08, octave: -1, volume: 0.95 },
          [
            note(2, 1, 45), note(6, 1, 45), note(10, 1, 45), note(14, 1, 43),
            note(18, 1, 45), note(22, 1, 45), note(26, 1, 45), note(30, 1, 40),
          ]
        ),
        makeSynthTrack(
          "Acid",
          "#c084fc",
          { waveform: "sawtooth", cutoff: 0.32, resonance: 18, sustain: 0.15, decay: 0.12, release: 0.08, glide: true, delaySend: 0.4, volume: 0.42 },
          [note(0, 1, 57), note(3, 1, 60), note(6, 1, 64), note(9, 1, 62), note(12, 1, 57), note(15, 1, 55)]
        ),
        makeSynthTrack(
          "Lead",
          "#f2a43a",
          { waveform: "sawtooth", cutoff: 0.68, resonance: 6, decay: 0.3, sustain: 0.35, release: 0.3, detune: 22, delaySend: 0.3, reverbSend: 0.25, volume: 0.42 },
          [note(8, 4, 76, 0.7), note(12, 2, 74, 0.6), note(14, 2, 72, 0.7)]
        ),
      ],
    }),
  },
  {
    name: "Blank",
    bpm: 110,
    tag: "110",
    build: () => ({
      ...createDefaultProject(),
      id: uid(),
      name: "Untitled",
      bpm: 110,
      swing: 0.08,
      tracks: [
        makeDrumTrack("kick", "Kick", "#f2a43a", [0, 8]),
        makeDrumTrack("snare", "Snare", "#e5c15a", [4, 12]),
        makeDrumTrack("chat", "C Hat", "#d97b5a", [], { volume: 0.55 }),
        makeSynthTrack("Bass", "#f2a43a", { octave: -1, cutoff: 0.3 }, []),
        makeSynthTrack("Keys", "#e5c15a", {}, []),
        makeSynthTrack("Lead", "#8fbf6b", {}, []),
      ],
    }),
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export const pitchName = (p: number) =>
  `${NOTE_NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;

export const isBlackKey = (p: number) =>
  [1, 3, 6, 8, 10].includes(((p % 12) + 12) % 12);

/** A natural-minor pitch classes used for "snap to key" */
export const KEY_PITCH_CLASSES = [9, 11, 0, 2, 4, 5, 7]; // A B C D E F G

export function snapPitchToKey(pitch: number): number {
  const pc = ((pitch % 12) + 12) % 12;
  if (KEY_PITCH_CLASSES.includes(pc)) return pitch;
  // snap to nearest scale tone
  for (let d = 1; d <= 2; d++) {
    if (KEY_PITCH_CLASSES.includes((((pitch - d) % 12) + 12) % 12)) return pitch - d;
    if (KEY_PITCH_CLASSES.includes((((pitch + d) % 12) + 12) % 12)) return pitch + d;
  }
  return pitch;
}

export function humanizeProjectVelocities(project: Project): Project {
  return {
    ...project,
    tracks: project.tracks.map((t) => {
      if (t.kind === "drum") {
        return {
          ...t,
          steps: t.steps.map((s) =>
            s.on
              ? {
                  ...s,
                  vel: Math.min(1, Math.max(0.4, s.vel + (Math.random() * 0.24 - 0.12))),
                }
              : s
          ),
        };
      }
      return {
        ...t,
        notes: t.notes.map((n) => ({
          ...n,
          vel: Math.min(1, Math.max(0.35, n.vel + (Math.random() * 0.2 - 0.1))),
        })),
      };
    }),
  };
}
