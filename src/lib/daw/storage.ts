/* ------------------------------------------------------------------ */
/*  Local project storage — no login, everything stays on the device   */
/* ------------------------------------------------------------------ */

import { autoSections, defaultPads, type DrumStep, type DrumTrack, type Note, type Project, type Section, type SynthTrack, type Track, type Waveform } from "./types";

const KEY = "intellidaw.projects.v1";
const CURRENT = "intellidaw.current.v1";

interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  project: Project;
}

function readAll(): StoredProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredProject[];
  } catch {
    return [];
  }
}

function writeAll(list: StoredProject[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full — ignore */
  }
}

export function listProjects(): StoredProject[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProject(project: Project): StoredProject[] {
  const list = readAll().filter((p) => p.id !== project.id);
  const entry: StoredProject = {
    id: project.id,
    name: project.name,
    updatedAt: Date.now(),
    project,
  };
  list.push(entry);
  writeAll(list);
  return listProjects();
}

export function deleteProject(id: string): StoredProject[] {
  const list = readAll().filter((p) => p.id !== id);
  writeAll(list);
  return listProjects();
}

export function isValidProject(p: unknown): p is Project {
  if (!p || typeof p !== "object") return false;
  const o = p as Project;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.bpm === "number" &&
    Array.isArray(o.tracks) &&
    o.tracks.length > 0 &&
    Array.isArray(o.pads)
  );
}

/* ---- defensive sanitising for imported / stored projects ---- */

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};

const WAVEFORMS: Waveform[] = ["sawtooth", "square", "triangle", "sine"];

function sanitizeTrack(t: unknown): Track | null {
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  const strip = {
    volume: clamp(o.volume, 0, 1.3, 0.85),
    pan: clamp(o.pan, -1, 1, 0),
    muted: !!o.muted,
    solo: !!o.solo,
    delaySend: clamp(o.delaySend, 0, 1, 0),
    reverbSend: clamp(o.reverbSend, 0, 1, 0),
    eqLow: clamp(o.eqLow, -12, 12, 0),
    eqMid: clamp(o.eqMid, -12, 12, 0),
    eqHigh: clamp(o.eqHigh, -12, 12, 0),
  };
  if (o.kind === "drum") {
    const raw = Array.isArray(o.steps) ? (o.steps as DrumStep[]) : [];
    const steps: DrumStep[] = Array.from({ length: 16 }, (_, i) => ({
      on: !!raw[i]?.on,
      vel: clamp(raw[i]?.vel, 0, 1, 0.9),
    }));
    return {
      ...(o as unknown as Omit<DrumTrack, keyof typeof strip | "tune" | "steps">),
      ...strip,
      kind: "drum",
      tune: clamp(o.tune, -12, 12, 0),
      steps,
    } as DrumTrack;
  }
  if (o.kind === "synth") {
    const notes: Note[] = Array.isArray(o.notes)
      ? (o.notes as Note[])
          .filter((n) => n && typeof n.pitch === "number" && typeof n.step === "number")
          .map((n) => ({
            id: typeof n.id === "string" ? n.id : `n${Math.random().toString(36).slice(2, 8)}`,
            step: clamp(n.step, 0, 15, 0),
            len: clamp(n.len, 1, 16, 1),
            pitch: clamp(n.pitch, 12, 108, 60),
            vel: clamp(n.vel, 0, 1, 0.9),
          }))
      : [];
    return {
      ...(o as unknown as Omit<SynthTrack, keyof typeof strip | "notes">),
      ...strip,
      kind: "synth",
      waveform: WAVEFORMS.includes(o.waveform as Waveform) ? (o.waveform as Waveform) : "sawtooth",
      cutoff: clamp(o.cutoff, 0, 1, 0.62),
      resonance: clamp(o.resonance, 0, 18, 4),
      attack: clamp(o.attack, 0.004, 1.5, 0.01),
      decay: clamp(o.decay, 0.02, 1.5, 0.18),
      sustain: clamp(o.sustain, 0, 1, 0.55),
      release: clamp(o.release, 0.02, 2, 0.22),
      detune: clamp(o.detune, 0, 30, 8),
      octave: clamp(o.octave, -2, 2, 0),
      glide: !!o.glide,
      notes,
    } as SynthTrack;
  }
  return null;
}

function sanitizeSections(raw: unknown, tracks: Track[]): Section[] {
  if (!Array.isArray(raw) || raw.length === 0) return autoSections(tracks, true);
  const ids = new Set(tracks.map((t) => t.id));
  const cleaned: Section[] = raw
    .filter((s) => s && typeof s === "object" && typeof (s as Section).name === "string")
    .map((s, i) => {
      const sec = s as Section;
      return {
        id: typeof sec.id === "string" ? sec.id : `sec${i}`,
        name: sec.name.slice(0, 18),
        color: typeof sec.color === "string" ? sec.color : "#f2a43a",
        startBar: clamp(sec.startBar, 0, 3, i),
        endBar: clamp(sec.endBar, 1, 4, i + 1),
        mutes: Array.isArray(sec.mutes) ? sec.mutes.filter((m) => ids.has(m)) : [],
      };
    });
  if (!cleaned.length) return autoSections(tracks, true);
  return cleaned;
}

/** Normalise any parsed JSON into a safe Project, or null if hopeless. */
export function sanitizeProject(raw: unknown): Project | null {
  if (!isValidProject(raw)) return null;
  const p = raw as Project;
  const tracks = p.tracks.map(sanitizeTrack).filter((t): t is Track => t !== null);
  if (!tracks.length) return null;
  return {
    id: p.id,
    name: p.name.slice(0, 60) || "Untitled",
    bpm: Math.round(clamp(p.bpm, 60, 200, 110)),
    swing: clamp(p.swing, 0, 0.6, 0.08),
    masterVolume: clamp(p.masterVolume, 0, 1.3, 0.9),
    songKey: typeof p.songKey === "string" && p.songKey.length <= 12 ? p.songKey : "A minor",
    sections: sanitizeSections(p.sections, tracks),
    tracks,
    pads: Array.isArray(p.pads) && p.pads.length === 16 ? p.pads : defaultPads(),
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
  };
}

export function saveCurrent(project: Project) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CURRENT, JSON.stringify(project));
  } catch {
    /* ignore */
  }
}

export function loadCurrent(): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CURRENT);
    if (!raw) return null;
    return sanitizeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function downloadJson(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${project.name.replace(/[^\w\- ]+/g, "")}.intellidaw.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
