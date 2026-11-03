"use client";

/* ------------------------------------------------------------------ */
/*  Studio v2 — a fixed-viewport, fully-connected workspace.           */
/*                                                                     */
/*  HEADER    project · tempo · key · groove · history · save/export   */
/*  TRANSPORT play · position · master FX · master meter               */
/*  LEFT      tracks (always in sync) + song sections                  */
/*  CENTER    one focused view at a time, chosen from the switcher:    */
/*            Timeline · Notes · Pads · Mixer · Live · SKAZI · Aide    */
/*  RIGHT     device rack of the selected track — always visible       */
/*  STATUS    engine state + contextual hint for the open view         */
/*                                                                     */
/*  Every part reacts to the selected track. Nothing is clipped:       */
/*  the shell fits the viewport exactly, panels scroll internally.     */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KEY_OPTIONS,
  SONG_BARS,
  TEMPLATES,
  createEmptyProject,
  humanizeProjectVelocities,
  makeDrumTrack,
  makeSynthTrack,
  snapPitchToKey,
  trackIcon,
  uid,
  withAutoSections,
  type DrumSound,
  type Project,
  type SynthTrack,
} from "@/lib/daw/types";
import { getEngine } from "@/lib/daw/engine";
import { loadCurrent, sanitizeProject, saveCurrent, saveProject } from "@/lib/daw/storage";
import { peekDeviceSelect, requestDeviceSelect } from "@/lib/daw/skazi";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { EditorPanel } from "./EditorPanel";
import { DeviceRack } from "./DeviceRack";
import { Timeline } from "./Timeline";
import { MixerTab } from "./MixerTab";
import { AssistantTabMemo } from "./AssistantTab";
import { SkaziTab } from "./SkaziTab";
import { PadsTab } from "./PadsTab";
import { SessionTab as SessionTabMemo } from "./SessionTab";
import { IdeasTab } from "./IdeasTab";
import { HistoryTab } from "./HistoryTab";
import { SoundsTab } from "./SoundsTab";
import { LearnTab } from "./LearnTab";
import { Visualizer } from "./Visualizer";
import { PerfKeyboard } from "./PerfKeyboard";
import { ExportDialog } from "./ExportDialog";
import { ProjectsDrawer } from "./ProjectsDrawer";
import { ProjectsHome } from "./ProjectsHome";
import {
  DRUM_LANES,
  InstrumentDrawer,
  SYNTH_PATCHES,
  type DrawerAction,
  type SynthPatchId,
} from "./InstrumentDrawer";
import { Meter } from "./ui";

type View =
  | "arrange"
  | "editor"
  | "pads"
  | "mixer"
  | "live"
  | "ideas"
  | "sounds"
  | "history"
  | "learn"
  | "skazi"
  | "assistant";

const VIEWS: Array<{ id: View; label: string; icon: string; hint: string }> = [
  {
    id: "arrange",
    label: "Timeline",
    icon: "▤",
    hint: "Click a lane to pick that track · click the ruler to jump · sections mute below",
  },
  {
    id: "editor",
    label: "Notes",
    icon: "✎",
    hint: "Click an on step to focus it → STEP FX (chance · ratchet · decay · throw) — click a note to select → NOTE FX",
  },
  {
    id: "pads",
    label: "Pads",
    icon: "▩",
    hint: "Tap pads or use the keyboard rows 1234…qwer · load your own samples",
  },
  {
    id: "mixer",
    label: "Mixer",
    icon: "⇵",
    hint: "Balance levels · route to D/B/M buses · sidechain-duck from the kick · watch LUFS",
  },
  {
    id: "live",
    label: "Live",
    icon: "◉",
    hint: "Launch sections while playing · sweep filter, drive, crush, echo and stutter",
  },
  {
    id: "ideas",
    label: "Ideas",
    icon: "✦",
    hint: "Pick a role + style → Generate writes a new track in your key · Mutate keeps the vibe",
  },
  {
    id: "sounds",
    label: "Sounds",
    icon: "♫",
    hint: "Audition every drum · apply kit presets · load any of the 16 genre templates",
  },
  {
    id: "history",
    label: "History",
    icon: "⏱",
    hint: "Click any state to jump back · save versions you want to keep",
  },
  {
    id: "learn",
    label: "Learn",
    icon: "▣",
    hint: "Four short lessons that show you where everything lives",
  },
  {
    id: "skazi",
    label: "SKAZI",
    icon: "✧",
    hint: "19 free SKAZI tools + 4 originals — pick one, tweak it, browse its presets, drop patterns onto tracks",
  },
  {
    id: "assistant",
    label: "Assistant",
    icon: "◎",
    hint: "Scan the whole song, then apply one-tap fixes with undo support",
  },
];

const TRACK_COLORS = ["#f2a43a", "#e5c15a", "#d97b5a", "#8fbf6b", "#c084fc", "#b8a98f", "#6bc5b8", "#e5533d"];

/* SKAZI device id → the track name it lands as (fallback "SKAZI") */
const SKAZI_DEVICE_NAMES: Record<string, string> = {
  bully: "BULLY",
  kube: "KUBE",
  tbon303: "TBON 303",
  skacid: "SKACID",
};

const patchFor = (id: SynthPatchId) => SYNTH_PATCHES.find((p) => p.id === id);

const PAD_KEY_INDEX: Record<string, number> = {};
"1234567890qwerty".split("").forEach((k, i) => (PAD_KEY_INDEX[k] = i));

export function Studio({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  /* the initial project is computed once — it seeds the live state AND
     decides whether the studio opens on the empty entrance */
  const [initialProject] = useState<Project | null>(() =>
    typeof window !== "undefined" ? loadCurrent() ?? createEmptyProject() : null
  );
  const [project, setProject] = useState<Project | null>(initialProject);
  const [view, setView] = useState<View>(() => (peekDeviceSelect() ? "skazi" : "arrange"));
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1); // absolute step, -1 stopped
  const [selTrack, setSelTrack] = useState<string | null>(null);
  const [drawLen, setDrawLen] = useState(2);
  const [flashSlot, setFlashSlot] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  /* the studio opens on the "Your Projects" home — exactly like the
     original entrance with the New Project box + project grid.
     Landing "try this device" flows skip straight to the SKAZI rack. */
  const [entrance, setEntrance] = useState(() => !peekDeviceSelect());
  /* intellidaw entrance: a project born empty (no saved session, or a fresh
     "New project") starts with the instrument drawer open */
  const [drawerOpen, setDrawerOpen] = useState(() => (initialProject?.tracks.length ?? 1) === 0);
  const [deviceJump, setDeviceJump] = useState(0);
  const [started, setStarted] = useState(false);
  const [metro, setMetro] = useState(false);
  const [fxOpen, setFxOpen] = useState(false);
  const [grooveOpen, setGrooveOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deviceSheet, setDeviceSheet] = useState(false);
  const [fxFilter, setFxFilter] = useState(1);
  const [fxDrive, setFxDrive] = useState(0);
  const [visOpen, setVisOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [kbOctave, setKbOctave] = useState(0);
  const [recording, setRecording] = useState(false);
  const [midiState, setMidiState] = useState<"off" | "on" | "none">("off");
  const [cpu, setCpu] = useState(0);
  const stepRef = useRef<(s: number) => void>(() => {});
  const projectRef = useRef<Project | null>(project);

  /* CPU badge polls the engine estimate twice a second */
  useEffect(() => {
    const id = setInterval(() => setCpu(getEngine().cpuEstimate()), 500);
    return () => clearInterval(id);
  }, []);

  /* ---------------- undo / redo ---------------- */
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const prevRef = useRef<Project | null>(null);
  const skipHist = useRef(false);
  const [histLen, setHistLen] = useState({ past: 0, future: 0 });
  const [histSnap, setHistSnap] = useState<{ past: Project[]; future: Project[] }>({ past: [], future: [] });
  const syncHistLen = useCallback(() => {
    setHistLen({ past: past.current.length, future: future.current.length });
    setHistSnap({ past: [...past.current], future: [...future.current] });
  }, []);

  useEffect(() => {
    projectRef.current = project;
    if (!project) return;
    if (skipHist.current) {
      skipHist.current = false;
      prevRef.current = project;
      return;
    }
    if (prevRef.current && prevRef.current !== project) {
      past.current.push(prevRef.current);
      if (past.current.length > 80) past.current.shift();
      future.current = [];
      syncHistLen();
    }
    prevRef.current = project;
  }, [project, syncHistLen]);

  const undo = useCallback(() => {
    if (!past.current.length) return;
    const prev = past.current.pop()!;
    if (projectRef.current) future.current.push(projectRef.current);
    skipHist.current = true;
    setProject(prev);
    syncHistLen();
  }, [syncHistLen]);

  const redo = useCallback(() => {
    if (!future.current.length) return;
    const next = future.current.pop()!;
    if (projectRef.current) past.current.push(projectRef.current);
    skipHist.current = true;
    setProject(next);
    syncHistLen();
  }, [syncHistLen]);

  /* keep the engine in sync with every edit */
  useEffect(() => {
    if (!started || !project) return;
    void getEngine().sync(project);
  }, [project, started]);

  /* autosave (debounced) */
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => saveCurrent(project), 600);
    return () => clearTimeout(t);
  }, [project]);

  /* leaving the studio always halts playback and flushes the autosave */
  useEffect(() => {
    return () => {
      getEngine().stop();
      if (projectRef.current) saveCurrent(projectRef.current);
    };
  }, []);

  /* mouse users should never leave focus stranded on a button */
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === "BUTTON") t.blur();
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, []);

  /* playhead callback */
  useEffect(() => {
    const e = getEngine();
    e.onStep = (s) => stepRef.current(s);
    stepRef.current = (s) => setCurrentStep(s);
    return () => {
      e.onStep = null;
    };
  }, []);

  /* scripted-access hook: lets QA tools / power users drive the engine
     from the console (window.__intellidaw.renderWav(), .getProject()) */
  useEffect(() => {
    (window as unknown as { __intellidaw?: unknown }).__intellidaw = {
      getEngine,
      getProject: () => projectRef.current,
    };
  }, []);

  /* the selection is the glue — derived so it can never point at a
     deleted/missing track (no effect needed) */
  const effSel = useMemo(() => {
    if (!project) return null;
    if (selTrack && project.tracks.some((t) => t.id === selTrack)) return selTrack;
    return project.tracks[0]?.id ?? null;
  }, [project, selTrack]);

  const selTrackObj = useMemo(
    () => project?.tracks.find((t) => t.id === effSel) ?? null,
    [project, effSel]
  );

  const updateProject = useCallback((fn: (p: Project) => Project) => {
    setProject((p) => (p ? { ...fn(p), updatedAt: Date.now() } : p));
  }, []);

  const togglePlay = useCallback(async () => {
    const e = getEngine();
    if (playing) {
      e.stop();
      setPlaying(false);
      setCurrentStep(-1);
      return;
    }
    if (!project) return;
    try {
      setStarted(true);
      await e.sync(project);
      await e.play(project);
      setPlaying(true);
    } catch (err) {
      console.error("playback failed", err);
      toast({
        title: err instanceof Error && err.message === "audio-suspended" ? "Audio blocked" : "Playback failed",
        description:
          "Your browser needs one more tap — press Play again. If it keeps failing, check your output device.",
      });
    }
  }, [playing, project, toast]);

  const seek = useCallback((absStep: number) => {
    getEngine().jumpTo(absStep);
    setCurrentStep(absStep);
  }, []);

  const toStart = useCallback(() => seek(0), [seek]);

  const toggleMetro = useCallback(() => {
    setMetro((m) => {
      getEngine().metronome = !m;
      return !m;
    });
  }, []);

  const playDrumPreview = useCallback(async (sound: DrumSound, vel = 0.9) => {
    setStarted(true);
    await getEngine().previewDrum(sound, vel);
  }, []);

  const playPad = useCallback(
    async (slot: number) => {
      const pad = project?.pads.find((p) => p.slot === slot);
      if (!pad) return;
      setStarted(true);
      await getEngine().previewDrum(pad.sound, 0.95, pad.tune, pad.custom?.dataUrl ?? null);
      setFlashSlot(slot);
      setTimeout(() => setFlashSlot((s) => (s === slot ? null : s)), 240);
    },
    [project?.pads]
  );

  const playPadSlot = useCallback((slot: number) => void playPad(slot), [playPad]);

  const previewNote = useCallback(
    async (track: SynthTrack, pitch: number) => {
      setStarted(true);
      // audition at the drawn note length (and current tempo) so what you
      // hear matches what will land in the roll
      const bpm = projectRef.current?.bpm ?? 100;
      const dur = Math.max(0.3, (drawLen * (60 / bpm)) / 4);
      await getEngine().previewSynth(track, pitch, dur, 0.9);
    },
    [drawLen]
  );

  /* master FX (live filter / drive) */
  const applyFxFilter = useCallback((v: number) => {
    setFxFilter(v);
    getEngine().setLiveFilter(v);
  }, []);
  const applyFxDrive = useCallback((v: number) => {
    setFxDrive(v);
    getEngine().setLiveDrive(v);
  }, []);

  /* select a track from the timeline: pick it AND land in its notes */
  const selectFromTimeline = useCallback(
    (id: string) => {
      setSelTrack(id);
      if (view === "arrange") {
        const t = projectRef.current?.tracks.find((x) => x.id === id);
        if (t) setView("editor");
      }
    },
    [view]
  );

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = async (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const k = ev.key.toLowerCase();
      /* the projects home only listens for Esc (close the studio) */
      if (entrance) {
        if (k === "escape") onClose();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && k === "z") {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && k === "y") {
        ev.preventDefault();
        redo();
        return;
      }
      if (k === "escape") {
        if (visOpen) setVisOpen(false);
        else if (keysOpen) setKeysOpen(false);
        else if (deviceSheet) setDeviceSheet(false);
        else if (!exportOpen && !projectsOpen) onClose();
        return;
      }
      if (k === " ") {
        const ae = document.activeElement as HTMLElement | null;
        if (ae && (ae.tagName === "BUTTON" || ae.tagName === "A")) return;
        ev.preventDefault();
        void togglePlay();
        return;
      }
      if (k === "m" && !ev.ctrlKey && !ev.metaKey) {
        toggleMetro();
        return;
      }
      /* 1–7 switches views, shift+1–9 selects the Nth track */
      if (/^[1-7]$/.test(k) && ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
        setView(VIEWS[Number(k) - 1].id);
        return;
      }
      if (/^[1-9]$/.test(k) && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey && view !== "pads") {
        const t = projectRef.current?.tracks[Number(k) - 1];
        if (t) setSelTrack(t.id);
        return;
      }
      if (k === "?" || (ev.shiftKey && k === "/")) {
        ev.preventDefault();
        setHelpOpen((h) => !h);
        return;
      }
      if (view === "pads" && k in PAD_KEY_INDEX) {
        ev.preventDefault();
        await playPad(PAD_KEY_INDEX[k]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, togglePlay, toggleMetro, playPad, undo, redo, exportOpen, projectsOpen, deviceSheet, visOpen, keysOpen, entrance, onClose]);

  /* ---------------- assistant fixes ---------------- */
  const applyFix = useCallback(
    (fix: string) => {
      if (!project) return;
      if (fix === "snap-key") {
        updateProject((p) => ({
          ...p,
          tracks: p.tracks.map((t) =>
            t.kind === "synth"
              ? { ...t, notes: t.notes.map((n) => ({ ...n, pitch: snapPitchToKey(n.pitch, p.songKey) })) }
              : t
          ),
        }));
        toast({ title: "Snapped to key", description: `Every note now sits inside ${project.songKey}.` });
      } else if (fix === "humanize") {
        updateProject((p) => humanizeProjectVelocities(p));
        toast({ title: "Humanised velocity", description: "Subtle variation added across hits and notes." });
      } else if (fix === "balance") {
        updateProject((p) => ({
          ...p,
          tracks: p.tracks.map((t) => ({ ...t, volume: Math.round(Math.min(1, Math.max(0.35, t.volume)) * 100) / 100 })),
        }));
        toast({ title: "Balanced levels", description: "Channels pulled toward a healthier spread." });
      } else if (fix === "duck") {
        updateProject((p) => ({
          ...p,
          tracks: p.tracks.map((t) =>
            t.kind === "synth" && /bass/i.test(t.name)
              ? { ...t, volume: Math.max(0.4, t.volume - 0.15), attack: Math.max(0.012, t.attack) }
              : t
          ),
        }));
        toast({ title: "Low end tucked", description: "Bass level trimmed so the kick punches through." });
      }
    },
    [project, updateProject, toast]
  );

  const saveNow = () => {
    if (!project) return;
    const p = { ...project, updatedAt: Date.now() };
    setProject(p);
    saveProject(p);
    toast({ title: "Project saved", description: `“${p.name}” stays on this device — no account, no cloud.` });
  };

  const loadProject = (raw: Project) => {
    const p = sanitizeProject(raw);
    if (!p) {
      toast({ title: "Could not load project", description: "The file looks incomplete or damaged." });
      return;
    }
    getEngine().stop();
    setPlaying(false);
    setCurrentStep(-1);
    past.current = [];
    future.current = [];
    setProject(p);
    setSelTrack(p.tracks[0]?.id ?? null);
    /* a loaded project already has its tracks — no need for the drawer */
    if (p.tracks.length > 0) setDrawerOpen(false);
    toast({ title: "Project loaded", description: p.name });
  };

  /* ---------------- track management ---------------- */
  const addTrack = useCallback(
    (kind: "drum" | "synth") => {
      const p = projectRef.current;
      if (!p) return;
      const n = p.tracks.length;
      const color = TRACK_COLORS[n % TRACK_COLORS.length];
      const t =
        kind === "drum"
          ? makeDrumTrack("perc", `Perc ${n + 1}`, color, [])
          : makeSynthTrack(`Synth ${n + 1}`, color, {});
      updateProject((prev) => ({ ...prev, tracks: [...prev.tracks, t] }));
      setSelTrack(t.id);
      setView("editor");
    },
    [updateProject]
  );

  /* ---------------- instrument drawer actions ----------------
     the drawer auditions sounds itself — creating the track is our only job.
     drum/patch keep the drawer open so more instruments can be added;
     skazi/pads close it because they are destinations of their own. */
  const handleDrawerAction = useCallback(
    (a: DrawerAction) => {
      const p = projectRef.current;
      if (!p) return;
      const color = TRACK_COLORS[p.tracks.length % TRACK_COLORS.length];

      if (a.type === "drum") {
        const lane = DRUM_LANES.find((l) => l.sound === a.sound);
        if (!lane) return;
        const n = p.tracks.filter((t) => t.kind === "drum" && t.name === lane.name).length;
        const t = makeDrumTrack(
          a.sound,
          n > 0 ? `${lane.name} ${n + 1}` : lane.name,
          color,
          lane.beats,
          a.sound === "chat" || a.sound === "shaker" ? { volume: 0.6 } : {}
        );
        updateProject((prev) => ({ ...prev, tracks: [...prev.tracks, t] }));
        setSelTrack(t.id);
        setView("editor");
      } else if (a.type === "patch") {
        const patch = patchFor(a.patch);
        if (!patch) return;
        const n = p.tracks.filter((t) => t.kind === "synth" && t.name === patch.name).length;
        const t = makeSynthTrack(n > 0 ? `${patch.name} ${n + 1}` : patch.name, color, {
          ...patch.opts,
        });
        updateProject((prev) => ({ ...prev, tracks: [...prev.tracks, t] }));
        setSelTrack(t.id);
        setView("editor");
      } else if (a.type === "skazi") {
        const display = SKAZI_DEVICE_NAMES[a.deviceId] ?? "SKAZI";
        const t = makeSynthTrack(display, color, {});
        updateProject((prev) => ({ ...prev, tracks: [...prev.tracks, t] }));
        setSelTrack(t.id);
        requestDeviceSelect(a.deviceId);
        setDeviceJump((c) => c + 1);
        setView("skazi");
        setDrawerOpen(false);
        toast({
          title: `${display} added — tweak it in the SKAZI rack`,
          description: "Pick presets, morph the sound and drop patterns straight onto tracks.",
        });
      } else {
        /* pads */
        setView("pads");
        setDrawerOpen(false);
        toast({ title: "Pads", description: "Tap a slot to load your own WAV / MP3." });
      }
    },
    [updateProject, toast]
  );

  const deleteTrack = useCallback(
    (id: string) => {
      updateProject((p) => ({
        ...p,
        tracks: p.tracks.filter((t) => t.id !== id),
        sections: p.sections.map((s) => ({ ...s, mutes: s.mutes.filter((m) => m !== id) })),
      }));
    },
    [updateProject]
  );

  const getLevel = useCallback((id: string) => getEngine().level(id), []);
  const getMasterLevel = useCallback(() => getEngine().masterLevel(), []);
  const getMasterLufs = useCallback(() => getEngine().masterLufs(), []);
  const getCpu = useCallback(() => getEngine().cpuEstimate(), []);
  const getAnalyser = useCallback(() => getEngine().masterAnalyser(), []);

  /* ---------------- transport extras: loop · count-in · rec · markers · midi ---------------- */

  const toggleLoop = useCallback(() => {
    updateProject((p) => ({
      ...p,
      loopOn: !p.loopOn,
      loopStart: p.loopOn ? 0 : p.loopStart,
      loopEnd: p.loopOn ? SONG_BARS : Math.max(p.loopStart + 1, p.loopEnd),
    }));
  }, [updateProject]);

  const loopSection = useCallback(
    (startBar: number, endBar: number) => {
      updateProject((p) => ({ ...p, loopOn: true, loopStart: startBar, loopEnd: endBar }));
    },
    [updateProject]
  );

  const toggleCountIn = useCallback(() => {
    updateProject((p) => ({ ...p, countIn: !p.countIn }));
  }, [updateProject]);

  const toggleRec = useCallback(async () => {
    const e = getEngine();
    if (!recording) {
      setStarted(true);
      const ok = e.startRecording();
      if (!ok) {
        toast({ title: "Recording unavailable", description: "Start playback once, then try REC again — the browser needs an active audio context." });
        return;
      }
      setRecording(true);
      toast({ title: "Recording the master…", description: "Press REC again to capture a WAV into your first empty pad." });
    } else {
      const dataUrl = await e.stopRecording();
      setRecording(false);
      if (!dataUrl) {
        toast({ title: "Recording failed", description: "Nothing was captured — make sure playback is running while you record." });
        return;
      }
      updateProject((p) => {
        const freeSlot = p.pads.find((pd) => !pd.custom);
        if (!freeSlot) return p;
        return {
          ...p,
          pads: p.pads.map((pd) => (pd.slot === freeSlot.slot ? { ...pd, custom: { name: `REC ${new Date().toLocaleTimeString()}`, dataUrl } } : pd)),
        };
      });
      toast({ title: "Recording captured", description: "Saved as a WAV on the first empty pad — open Pads to play it." });
    }
  }, [recording, updateProject, toast]);

  const addMarker = useCallback(() => {
    const bar = currentStep >= 0 ? Math.floor(currentStep / 16) : 0;
    updateProject((p) => ({
      ...p,
      markers: [...p.markers, { id: uid(), bar, name: `Mark ${p.markers.length + 1}` }].slice(-8),
    }));
  }, [currentStep, updateProject]);

  const enableMidi = useCallback(async () => {
    const r = await getEngine().enableMidi();
    setMidiState(r);
    toast(
      r === "on"
        ? { title: "MIDI connected", description: "Play your controller — notes land on the first synth track." }
        : { title: "No MIDI here", description: "This browser/device has no Web MIDI — the on-screen keyboard works everywhere." }
    );
  }, [toast]);

  /* restore from the History tab — stays undoable (the jump itself lands in the stack) */
  const restoreState = useCallback((p: Project) => {
    setProject(p);
  }, []);

  if (!project || !project.tracks) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0807]">
        <div className="flex items-center gap-3 font-mono text-sm text-[#a89f91]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#f2a43a]" />
          Opening the studio…
        </div>
      </div>
    );
  }

  /* ---------------- projects home (the entrance) ---------------- */
  const openFromHome = (p: Project) => {
    loadProject(p);
    setEntrance(false);
  };
  const newFromHome = () => {
    getEngine().stop();
    setPlaying(false);
    setCurrentStep(-1);
    past.current = [];
    future.current = [];
    setProject(createEmptyProject());
    setSelTrack(null);
    setDrawerOpen(true);
    setEntrance(false);
  };
  const enterAt = (v: "sounds" | "skazi" | "learn") => {
    setView(v);
    setEntrance(false);
  };

  if (entrance) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0d0a08] text-[#f0ece4]">
        <ProjectsHome onOpen={openFromHome} onNew={newFromHome} onEnter={enterAt} />
      </div>
    );
  }

  const bar = currentStep >= 0 ? Math.floor(currentStep / 16) + 1 : 1;
  const beat = currentStep >= 0 ? Math.floor((currentStep % 16) / 4) + 1 : 1;
  const tick = currentStep >= 0 ? ((currentStep % 4) * 250).toString().padStart(3, "0") : "000";
  const timecodeSec = currentStep >= 0 ? (currentStep * (60 / project.bpm)) / 4 : 0;
  const tc = `${Math.floor(timecodeSec / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(timecodeSec % 60)
    .toString()
    .padStart(2, "0")}`;

  const activeView = VIEWS.find((v) => v.id === view)!;
  const sections = project.sections ?? [];

  /* the entrance — suggested first instruments while the song is empty
     (mirrors the original: fix the rhythm section, then the headline gear) */
  const hasDrum = project.tracks.some((t) => t.kind === "drum");
  const hasBass = project.tracks.some(
    (t) => t.kind === "synth" && (t.bus === "bass" || /bass|sub|303|acid|reese/i.test(t.name))
  );
  const suggestions: Array<{ icon: string; title: string; sub: string; isNew?: boolean; action: DrawerAction }> = [];
  if (!hasDrum) suggestions.push({ icon: "⚡", title: "Kick", sub: "No drums yet", action: { type: "drum", sound: "kick" } });
  if (!hasBass) suggestions.push({ icon: "♪", title: "Bass", sub: "No bass yet", action: { type: "patch", patch: "bass" } });
  suggestions.push(
    { icon: "✧", title: "BULLY", sub: "Wavetable bass & leads", isNew: true, action: { type: "skazi", deviceId: "bully" } },
    { icon: "✧", title: "KUBE", sub: "Morphing wavetable synth", isNew: true, action: { type: "skazi", deviceId: "kube" } }
  );
  if (suggestions.length < 4) suggestions.push({ icon: "♪", title: "TBON 303", sub: "303-style bass line", action: { type: "skazi", deviceId: "tbon303" } });
  if (suggestions.length < 4) suggestions.push({ icon: "▩", title: "Pads", sub: "16 pads + grooves", action: { type: "pads" } });

  const viewContent = (
    <>
      {view === "arrange" && (
        <div className="flex flex-col gap-3">
          {project.tracks.length === 0 && (
            <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#100d0b]/80 p-6 text-center shadow-2xl">
              <button
                onClick={() => setDrawerOpen(true)}
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f2a43a] text-2xl font-bold text-black transition-transform hover:scale-110"
                title="Open the instrument drawer"
                aria-label="Add your first track"
              >
                +
              </button>
              <div className="mt-3 text-lg font-bold text-[#f0ece4]">Start with an Instrument</div>
              <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-[#a89f91]">
                Pick a sound for your first track. You can add more, or swap the instrument, at any time.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                {suggestions.map((s) => (
                  <button
                    key={s.title}
                    onClick={() => handleDrawerAction(s.action)}
                    className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition-colors hover:bg-white/[0.08]"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#f2a43a]/15 text-[11px] text-[#f2a43a]"
                    >
                      {s.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#f0ece4]">
                        {s.title}
                        {s.isNew && (
                          <span className="rounded bg-[#f2a43a] px-1 font-mono text-[8px] font-bold uppercase text-[#17120a]">
                            New
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-[#a89f91]">{s.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setDrawerOpen(true)}
                className="mt-3 font-mono text-[11px] uppercase tracking-wider text-[#f2a43a] hover:underline"
              >
                All instruments →
              </button>
            </div>
          )}
          <Timeline
            project={project}
            currentStep={currentStep}
            playing={playing}
            selectedId={effSel}
            onSelect={selectFromTimeline}
            onSeek={seek}
            updateProject={updateProject}
          />
        </div>
      )}
      {view === "editor" && (
        <EditorPanel
          project={project}
          selectedId={effSel}
          updateProject={updateProject}
          currentStep={currentStep >= 0 ? currentStep % 16 : -1}
          drawLen={drawLen}
          onDrawLen={setDrawLen}
          onPreviewDrum={(s, v) => void playDrumPreview(s, v)}
          onPreviewNote={(t, p) => void previewNote(t, p)}
        />
      )}
      {view === "pads" && (
        <PadsTab project={project} updateProject={updateProject} onPlayPad={playPadSlot} flashSlot={flashSlot} />
      )}
      {view === "mixer" && (
        <MixerTab
          project={project}
          updateProject={updateProject}
          getLevel={getLevel}
          getMasterLevel={getMasterLevel}
          getMasterLufs={getMasterLufs}
          getCpu={getCpu}
        />
      )}
      {view === "live" && (
        <SessionTabMemo project={project} currentStep={currentStep} playing={playing} updateProject={updateProject} />
      )}
      {view === "ideas" && <IdeasTab project={project} updateProject={updateProject} onApplyFix={applyFix} />}
      {view === "sounds" && <SoundsTab project={project} updateProject={updateProject} />}
      {view === "history" && (
        <HistoryTab project={project} updateProject={updateProject} past={histSnap.past} future={histSnap.future} onRestore={restoreState} />
      )}
      {view === "learn" && <LearnTab project={project} updateProject={updateProject} onApplyFix={applyFix} />}
      {view === "skazi" && <SkaziTab key={deviceJump} project={project} updateProject={updateProject} />}
      {view === "assistant" && <AssistantTabMemo project={project} onApplyFix={applyFix} />}
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-[#0a0807] text-[#f0ece4]"
      style={{ height: "100dvh" }}
    >
      {/* ================= header ================= */}
      <header className="studio-scroll flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white/8 bg-[#100d0b] px-2 sm:gap-3 sm:px-4 [&>*]:shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/5"
          title="Back to the site"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f2a43a] text-[#17120a]">
            <WaveIcon className="h-4 w-4" />
          </span>
          <span className="hidden text-sm font-bold tracking-tight sm:block">Intellidaw</span>
        </button>

        <input
          value={project.name}
          onChange={(e) => updateProject((p) => ({ ...p, name: e.target.value }))}
          className="w-24 rounded-lg border border-white/8 bg-black/30 px-2.5 py-1.5 text-[13px] font-semibold text-[#f0ece4] outline-none focus:border-[#f2a43a]/50 sm:w-44"
          aria-label="Project name"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="hidden border-white/10 bg-transparent font-mono text-[11px] text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4] md:block"
            >
              TEMPLATES ▾
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="border-white/10 bg-[#171310] text-[#f0ece4]">
            <DropdownMenuItem
              onClick={() => {
                const p = createEmptyProject();
                getEngine().stop();
                setPlaying(false);
                setCurrentStep(-1);
                past.current = [];
                future.current = [];
                setProject(p);
                setSelTrack(null);
                setView("arrange");
                setDrawerOpen(true);
                toast({ title: "New project", description: "Blank canvas — pick an instrument to start." });
              }}
              className="gap-3 focus:bg-white/5"
            >
              <span className="w-20 font-semibold text-[#f2a43a]">＋ New</span>
              <span className="font-mono text-[10px] text-[#a89f91]">empty studio</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-[#a89f91]">
              Start from a groove
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            {TEMPLATES.map((t) => (
              <DropdownMenuItem
                key={t.name}
                onClick={() => {
                  const p = withAutoSections(t.build());
                  getEngine().stop();
                  setPlaying(false);
                  setCurrentStep(-1);
                  past.current = [];
                  future.current = [];
                  setProject(p);
                  setSelTrack(p.tracks[0]?.id ?? null);
                  toast({ title: `${t.name} template loaded`, description: `${t.bpm} BPM — make it yours.` });
                }}
                className="gap-3 focus:bg-white/5"
              >
                <span className="w-20 font-semibold">{t.name}</span>
                <span className="font-mono text-[10px] text-[#a89f91]">{t.tag} BPM</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1 rounded-lg border border-white/8 bg-black/30 px-2 py-1">
          <button
            onClick={() => updateProject((p) => ({ ...p, bpm: Math.max(60, p.bpm - 1) }))}
            className="px-1 font-mono text-sm text-[#a89f91] hover:text-[#f0ece4]"
            aria-label="Decrease BPM"
          >
            −
          </button>
          <div className="w-12 text-center">
            <div className="font-mono text-sm font-bold leading-none text-[#f0ece4]">{project.bpm}</div>
            <div className="font-mono text-[8px] uppercase tracking-widest text-[#a89f91]">BPM</div>
          </div>
          <button
            onClick={() => updateProject((p) => ({ ...p, bpm: Math.min(200, p.bpm + 1) }))}
            className="px-1 font-mono text-sm text-[#a89f91] hover:text-[#f0ece4]"
            aria-label="Increase BPM"
          >
            +
          </button>
        </div>

        <select
          value={project.songKey}
          onChange={(e) => updateProject((p) => ({ ...p, songKey: e.target.value }))}
          className="hidden rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-[#f0ece4] outline-none focus:border-[#f2a43a]/50 sm:block"
          aria-label="Project key"
          title="Project key — used by the assistant and snap-to-key"
        >
          {KEY_OPTIONS.map((k) => (
            <option key={k} value={k} className="bg-[#171310]">
              {k}
            </option>
          ))}
        </select>

        {/* groove (swing) */}
        <DropdownMenu open={grooveOpen} onOpenChange={setGrooveOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="hidden h-8 items-center rounded-lg border border-white/8 bg-black/30 px-2.5 font-mono text-[10px] uppercase tracking-wider text-[#a89f91] hover:text-[#f0ece4] md:flex"
              title="Groove / swing amount"
            >
              groove {Math.round(project.swing * 200)}%
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60 border-white/10 bg-[#171310] p-3 text-[#f0ece4]">
            <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#f2a43a]">Swing</div>
            <Slider
              value={[project.swing]}
              min={0}
              max={0.45}
              step={0.01}
              onValueChange={(v) => updateProject((p) => ({ ...p, swing: v[0] }))}
            />
            <div className="mt-2 font-mono text-[9px] leading-relaxed text-[#a89f91]">
              Delays every off-beat 16th — 0% is straight, higher values lean into a shuffle.
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* MIDI in */}
        <button
          onClick={() => void enableMidi()}
          className={cn(
            "hidden h-8 items-center rounded-lg border px-2.5 font-mono text-[10px] uppercase tracking-wider md:flex",
            midiState === "on"
              ? "border-[#8fbf6b]/50 bg-[#8fbf6b]/15 text-[#8fbf6b]"
              : "border-white/8 bg-black/30 text-[#a89f91] hover:text-[#f0ece4]"
          )}
          title={midiState === "on" ? "MIDI input connected — play your controller" : "Connect a MIDI keyboard (Web MIDI)"}
        >
          midi {midiState === "on" ? "●" : midiState === "none" ? "—" : ""}
        </button>

        {/* CPU estimate */}
        <span
          className={cn(
            "hidden h-8 items-center rounded-lg border border-white/8 bg-black/30 px-2.5 font-mono text-[10px] uppercase tracking-wider lg:flex",
            cpu > 70 ? "text-[#e5533d]" : "text-[#a89f91]"
          )}
          title="Estimated engine load from scheduled voices"
        >
          cpu {cpu}%
        </span>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-white/8">
            <button
              onClick={undo}
              disabled={histLen.past === 0}
              className="px-2 py-1.5 font-mono text-[12px] text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4] disabled:opacity-30"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              ↺
            </button>
            <span className="h-5 w-px bg-white/8" />
            <button
              onClick={redo}
              disabled={histLen.future === 0}
              className="px-2 py-1.5 font-mono text-[12px] text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4] disabled:opacity-30"
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              ↻
            </button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              getEngine().stop();
              setPlaying(false);
              setCurrentStep(-1);
              saveCurrent(project);
              setEntrance(true);
            }}
            className="border-white/10 bg-transparent text-[12px] text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4]"
          >
            Projects
          </Button>
          <Button
            size="sm"
            onClick={saveNow}
            className="bg-white/8 font-semibold text-[#f0ece4] hover:bg-white/15"
          >
            Save
          </Button>
          <Button
            size="sm"
            onClick={() => setExportOpen(true)}
            className="bg-[#f2a43a] font-bold text-[#17120a] hover:bg-[#ffb75c]"
          >
            Export
          </Button>
        </div>
      </header>

      {/* ================= transport ================= */}
      <div
        className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/8 bg-[#0d0a08] px-2 sm:gap-3 sm:px-4"
        role="toolbar"
        aria-label="Transport"
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={toStart}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-[13px] text-[#a89f91] hover:bg-white/12 hover:text-[#f0ece4]"
            title="Back to start"
            aria-label="Back to start"
          >
            ⏮
          </button>
          <button
            onClick={() => void togglePlay()}
            className={cn(
              "flex h-10 items-center gap-2 rounded-xl px-4 font-mono text-[12px] font-bold tracking-wider transition-colors",
              playing
                ? "bg-[#e5533d] text-white hover:bg-[#f0684f]"
                : "bg-[#8fbf6b] text-[#10130a] hover:bg-[#a3d67f]"
            )}
            aria-label={playing ? "Stop" : "Play"}
          >
            {playing ? "■ STOP" : "▶ PLAY"}
          </button>
          <button
            onClick={toggleMetro}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-[13px]",
              metro ? "bg-[#f2a43a] text-[#17120a]" : "bg-white/5 text-[#a89f91] hover:bg-white/12"
            )}
            title="Metronome (M)"
            aria-label="Toggle metronome"
            aria-pressed={metro}
          >
            ♩
          </button>
          <button
            onClick={toggleLoop}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-bold",
              project.loopOn ? "bg-[#8fbf6b] text-[#10130a]" : "bg-white/5 text-[#a89f91] hover:bg-white/12"
            )}
            title={project.loopOn ? `Loop ON · bars ${project.loopStart + 1}–${project.loopEnd} (click to turn off)` : "Loop the whole song"}
            aria-label="Toggle loop"
            aria-pressed={project.loopOn}
          >
            ⟳
          </button>
          <button
            onClick={toggleCountIn}
            className={cn(
              "hidden h-8 items-center rounded-lg px-2 font-mono text-[10px] font-bold uppercase tracking-wider sm:flex",
              project.countIn ? "bg-[#f2a43a] text-[#17120a]" : "bg-white/5 text-[#a89f91] hover:bg-white/12"
            )}
            title="Four-beat count-in before play (with metronome)"
            aria-label="Toggle count-in"
            aria-pressed={project.countIn}
          >
            1-2-3-4
          </button>
          <button
            onClick={() => void toggleRec()}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-[13px]",
              recording ? "animate-pulse bg-[#e5533d] text-white" : "bg-white/5 text-[#a89f91] hover:bg-white/12"
            )}
            title={recording ? "Stop recording → WAV lands on a pad" : "Record the master output"}
            aria-label={recording ? "Stop recording" : "Record"}
            aria-pressed={recording}
          >
            ●
          </button>
          <button
            onClick={() => setVisOpen(true)}
            className="hidden h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-[13px] text-[#a89f91] hover:bg-white/12 sm:flex"
            title="Full-screen audio visualizer"
            aria-label="Open visualizer"
          >
            ◈
          </button>
          <button
            onClick={() => setKeysOpen(true)}
            className="hidden h-8 items-center rounded-lg bg-white/5 px-2 font-mono text-[10px] uppercase tracking-wider text-[#a89f91] hover:bg-white/12 sm:flex"
            title="Performance keyboard — play the selected synth track"
            aria-label="Open performance keyboard"
          >
            ♬ keys
          </button>
          {/* markers: add + jump */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="hidden h-8 items-center rounded-lg bg-white/5 px-2 font-mono text-[10px] uppercase tracking-wider text-[#a89f91] hover:bg-white/12 sm:flex"
                title="Markers — drop a flag, jump back to it"
                aria-label="Markers"
              >
                ⚑ {project.markers.length > 0 ? project.markers.length : ""}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 border-white/10 bg-[#171310] text-[#f0ece4]">
              <DropdownMenuItem onClick={addMarker} className="gap-2 focus:bg-white/5">
                <span className="text-[#f2a43a]">⚑</span> Drop marker at bar {currentStep >= 0 ? Math.floor(currentStep / 16) + 1 : 1}
              </DropdownMenuItem>
              {project.markers.length > 0 && <DropdownMenuSeparator className="bg-white/10" />}
              {project.markers.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => seek(m.bar * 16)}
                  className="gap-2 focus:bg-white/5"
                >
                  <span className="font-mono text-[10px] text-[#a89f91]">bar {m.bar + 1}</span>
                  <span className="ml-auto font-semibold">{m.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* position readout — centred, big, impossible to miss */}
        <div className="flex flex-1 justify-center">
          <div className="flex items-baseline gap-1.5 rounded-xl border border-white/8 bg-black/40 px-3 py-1">
            <span className="font-mono text-[17px] font-bold tabular-nums leading-none text-[#f2a43a]">{bar}</span>
            <span className="font-mono text-[8px] uppercase tracking-widest text-[#a89f91]">bar</span>
            <span className="font-mono text-[17px] font-bold tabular-nums leading-none text-[#f0ece4]">{beat}</span>
            <span className="font-mono text-[8px] uppercase tracking-widest text-[#a89f91]">beat</span>
            <span className="font-mono text-[17px] font-bold tabular-nums leading-none text-[#f0ece4]/60">{tick}</span>
            <span className="ml-2 hidden font-mono text-[11px] tabular-nums text-[#a89f91] sm:block">{tc}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* master FX popover */}
          <DropdownMenu open={fxOpen} onOpenChange={setFxOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex h-8 items-center rounded-lg px-2.5 font-mono text-[10px] uppercase tracking-wider",
                  fxFilter < 1 || fxDrive > 0
                    ? "bg-[#f2a43a] text-[#17120a]"
                    : "bg-white/5 text-[#a89f91] hover:bg-white/12"
                )}
                title="Master filter & drive"
                aria-label="Master FX"
              >
                FX
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 border-white/10 bg-[#171310] p-3 text-[#f0ece4]">
              <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#f2a43a]">
                Master FX
              </div>
              <label className="mb-2 block">
                <span className="mb-1 flex justify-between font-mono text-[9px] uppercase text-[#a89f91]">
                  <span>Filter sweep</span>
                  <span>{fxFilter >= 1 ? "off" : `${Math.round(fxFilter * 100)}%`}</span>
                </span>
                <Slider
                  value={[fxFilter]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={(v) => applyFxFilter(v[0])}
                />
              </label>
              <label className="block">
                <span className="mb-1 flex justify-between font-mono text-[9px] uppercase text-[#a89f91]">
                  <span>Drive</span>
                  <span>{Math.round(fxDrive * 100)}%</span>
                </span>
                <Slider
                  value={[fxDrive]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={(v) => applyFxDrive(v[0])}
                />
              </label>
              <button
                onClick={() => {
                  applyFxFilter(1);
                  applyFxDrive(0);
                }}
                className="mt-2 w-full rounded bg-white/5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#a89f91] hover:bg-white/10"
              >
                reset
              </button>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={() => setHelpOpen((h) => !h)}
            className={cn(
              "hidden h-8 w-8 items-center justify-center rounded-lg text-[13px] sm:flex",
              helpOpen ? "bg-[#f2a43a] text-[#17120a]" : "bg-white/5 text-[#a89f91] hover:bg-white/12"
            )}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            aria-expanded={helpOpen}
          >
            ?
          </button>
          <div className="hidden w-20 sm:block">
            <Meter get={getMasterLevel} />
          </div>
          <input
            type="range"
            min={0}
            max={1.3}
            step={0.01}
            value={project.masterVolume}
            onChange={(e) => updateProject((p) => ({ ...p, masterVolume: Number(e.target.value) }))}
            className="h-1 w-14 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a] sm:w-24"
            title={`Master ${Math.round(project.masterVolume * 100)}%`}
            aria-label="Master volume"
          />
        </div>
        {/* keyboard shortcuts popover */}
        {helpOpen && (
          <div
            className="absolute right-2 top-full z-40 mt-1 hidden w-72 rounded-xl border border-white/10 bg-[#171310] p-3 shadow-2xl sm:block"
            role="dialog"
            aria-label="Keyboard shortcuts"
          >
            <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#f2a43a]">
              Keyboard shortcuts
            </div>
            <ul className="space-y-1.5 text-[11px] text-[#f0ece4]">
              {[
                ["Space", "Play / stop"],
                ["M", "Metronome on / off"],
                ["1–9", "Select track by number"],
                ["Shift+1–7", "Switch view"],
                ["Ctrl+Z", "Undo"],
                ["Ctrl+Shift+Z", "Redo"],
                ["?", "Toggle this help"],
                ["Esc", "Close panel / back to site"],
              ].map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <kbd className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-[#f2a43a]">
                    {key}
                  </kbd>
                  <span className="text-right text-[#a89f91]">{label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 border-t border-white/8 pt-2 font-mono text-[9px] leading-relaxed text-[#a89f91]/70">
              On drum steps, shift+click cycles velocity. Clicking a track lane in
              the Timeline jumps straight into its Notes.
            </div>
          </div>
        )}
      </div>

      {/* ================= workspace ================= */}
      <div className="flex min-h-0 flex-1">
        {/* -------- left rail: tracks + song -------- */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-white/8 bg-[#0d0a08] md:flex">
          <div className="px-2.5 pb-1.5 pt-2.5">
            <div className="flex gap-1.5">
              <button
                onClick={() => setDrawerOpen(true)}
                className="flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-[#f2a43a] font-mono text-[11px] font-bold text-[#17120a] transition-colors hover:bg-[#ffb75c]"
                title="Open the instrument drawer"
              >
                + Add track
              </button>
              <button
                onClick={() => setView("pads")}
                className="flex h-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/5 px-2 font-mono text-[11px] text-[#a89f91] hover:bg-white/12 hover:text-[#f0ece4]"
                title="Import audio — load your own WAV / MP3 onto the pads"
              >
                ↥ Import
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">
              Tracks · {project.tracks.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => addTrack("drum")}
                className="flex h-5 w-5 items-center justify-center rounded bg-white/5 font-mono text-[10px] text-[#a89f91] hover:bg-white/12 hover:text-[#f0ece4]"
                title="Add drum track"
                aria-label="Add drum track"
              >
                ⊞
              </button>
              <button
                onClick={() => addTrack("synth")}
                className="flex h-5 w-5 items-center justify-center rounded bg-white/5 font-mono text-[10px] text-[#a89f91] hover:bg-white/12 hover:text-[#f0ece4]"
                title="Add synth track"
                aria-label="Add synth track"
              >
                ♪
              </button>
            </div>
          </div>
          <div className="studio-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {project.tracks.map((t, i) => (
              <div key={t.id} className="mb-0.5">
                <button
                  onClick={() => setSelTrack(t.id)}
                  onDoubleClick={() => {
                    setSelTrack(t.id);
                    setView("editor");
                  }}
                  className={cn(
                    "block w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                    effSel === t.id ? "bg-white/10 ring-1 ring-white/10" : "hover:bg-white/5"
                  )}
                  aria-pressed={effSel === t.id}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px]"
                      style={{ background: `${t.color}22`, color: t.color }}
                    >
                      {trackIcon(t)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#f0ece4]">
                      {t.name}
                    </span>
                    <span className="font-mono text-[8px] text-[#a89f91]/50">{i + 1}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        updateProject((p) => ({
                          ...p,
                          tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, muted: !x.muted } : x)),
                        }));
                      }}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold",
                        t.muted ? "bg-[#e5533d] text-white" : "bg-white/5 text-[#a89f91] hover:bg-white/12"
                      )}
                      title="Mute"
                      role="button"
                      aria-label={`Mute ${t.name}`}
                    >
                      M
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        updateProject((p) => ({
                          ...p,
                          tracks: p.tracks.map((x) => (x.id === t.id ? { ...x, solo: !x.solo } : x)),
                        }));
                      }}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold",
                        t.solo ? "bg-[#f2a43a] text-[#17120a]" : "bg-white/5 text-[#a89f91] hover:bg-white/12"
                      )}
                      title="Solo"
                      role="button"
                      aria-label={`Solo ${t.name}`}
                    >
                      S
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-black/50">
                      <Meter get={() => getLevel(t.id)} className="h-1" />
                    </span>
                  </span>
                </button>
              </div>
            ))}
          </div>

          {/* song sections — click to jump */}
          <div className="border-t border-white/8 px-2 py-2">
            <div className="mb-1 px-1 font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">
              Song · {SONG_BARS} bars
            </div>
            <div className="space-y-0.5">
              {sections.map((s) => {
                const active = currentStep >= 0 && Math.floor(currentStep / 16) >= s.startBar && Math.floor(currentStep / 16) < s.endBar;
                const isLoop = project.loopOn && project.loopStart === s.startBar && project.loopEnd === s.endBar;
                return (
                  <div key={s.id} className={cn("flex items-center gap-1 rounded-md px-1", active ? "bg-white/10" : "")}>
                    <button
                      onClick={() => seek(s.startBar * 16)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px]",
                        active ? "text-[#f0ece4]" : "text-[#a89f91] hover:bg-white/5"
                      )}
                      title={`Jump to bar ${s.startBar + 1}`}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                      <span className="font-mono text-[9px]">{s.startBar + 1}–{s.endBar}</span>
                      {s.mutes.length > 0 && (
                        <span className="rounded bg-white/8 px-1 font-mono text-[8px]" title={`${s.mutes.length} track(s) muted here`}>
                          −{s.mutes.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => (isLoop ? toggleLoop() : loopSection(s.startBar, s.endBar))}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[9px]",
                        isLoop ? "bg-[#8fbf6b] text-[#10130a]" : "text-[#a89f91]/60 hover:bg-white/10 hover:text-[#f0ece4]"
                      )}
                      title={isLoop ? "Loop off" : `Loop ${s.name} (bars ${s.startBar + 1}–${s.endBar})`}
                      aria-label={`Loop section ${s.name}`}
                      aria-pressed={isLoop}
                    >
                      ⟳
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* -------- centre: switcher + view -------- */}
        <section className="flex min-w-0 flex-1 flex-col bg-[#0b0908]">
          {/* view switcher */}
          <div
            className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/8 bg-[#0d0a08] px-2 studio-scroll"
            role="tablist"
            aria-label="Studio views"
          >
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors",
                  view === v.id
                    ? "bg-[#f2a43a] text-[#17120a]"
                    : "text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4]"
                )}
              >
                <span aria-hidden className="font-mono text-[11px]">
                  {v.icon}
                </span>
                {v.label}
              </button>
            ))}
            {view === "arrange" && effSel && (
              <button
                onClick={() => setView("editor")}
                className="ml-auto hidden h-7 shrink-0 items-center gap-1.5 rounded-lg border border-[#f2a43a]/40 bg-[#f2a43a]/10 px-2.5 font-mono text-[10px] uppercase tracking-wider text-[#f2a43a] hover:bg-[#f2a43a]/20 sm:flex"
              >
                edit {selTrackObj?.name ?? ""} ▸
              </button>
            )}
            <button
              onClick={() => setDeviceSheet(true)}
              className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 font-mono text-[10px] uppercase tracking-wider text-[#a89f91] lg:hidden"
            >
              device ▸
            </button>
          </div>

          {/* mobile track chips */}
          <div className="studio-scroll flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/6 px-2 py-1.5 md:hidden">
            {project.tracks.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelTrack(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                  effSel === t.id
                    ? "border-white/25 bg-white/10 text-[#f0ece4]"
                    : "border-white/8 bg-[#14100d] text-[#a89f91]"
                )}
                aria-pressed={effSel === t.id}
              >
                <span aria-hidden style={{ color: t.color }}>
                  {trackIcon(t)}
                </span>
                {t.name}
                {t.muted && <span className="font-mono text-[8px] text-[#e5533d]">M</span>}
              </button>
            ))}
            <button
              onClick={() => addTrack("drum")}
              className="shrink-0 rounded-full border border-white/8 bg-[#14100d] px-2.5 py-1 font-mono text-[11px] text-[#a89f91]"
              aria-label="Add drum track"
            >
              + drum
            </button>
            <button
              onClick={() => addTrack("synth")}
              className="shrink-0 rounded-full border border-white/8 bg-[#14100d] px-2.5 py-1 font-mono text-[11px] text-[#a89f91]"
              aria-label="Add synth track"
            >
              + synth
            </button>
          </div>

          {/* the view itself */}
          <main
            className="studio-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"
            style={{
              backgroundImage:
                "radial-gradient(1100px 420px at 50% -140px, rgba(242,164,58,0.06), transparent)",
            }}
          >
            <div className="mx-auto w-full max-w-6xl">{viewContent}</div>
          </main>
        </section>

        {/* -------- right: device rack of the selected track -------- */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-white/8 bg-[#0d0a08] lg:flex xl:w-[21rem]">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/8 px-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#a89f91]">Device</span>
            {selTrackObj && (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: selTrackObj.color }} />
                <span className="truncate text-[11px] font-semibold text-[#f0ece4]">{selTrackObj.name}</span>
              </span>
            )}
          </div>
          <div className="studio-scroll min-h-0 flex-1 overflow-y-auto p-3">
            <DeviceRack
              project={project}
              selectedId={effSel}
              updateProject={updateProject}
              onDelete={deleteTrack}
              onPreviewDrum={(s, v) => void playDrumPreview(s, v)}
              onPreviewNote={(t, p) => void previewNote(t, p)}
            />
          </div>
        </aside>
      </div>

      {/* ================= status bar ================= */}
      <footer
        className="flex h-8 shrink-0 items-center gap-3 border-t border-white/8 bg-[#100d0b] px-3 font-mono text-[10px] uppercase tracking-wider text-[#a89f91]"
        style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
      >
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", playing ? "animate-pulse bg-[#8fbf6b]" : "bg-[#a89f91]/50")}
            aria-hidden
          />
          {playing ? `playing · bar ${bar}/${SONG_BARS}` : `ready · ${project.bpm} bpm · ${project.songKey}`}
        </span>
        <span className="hidden min-w-0 flex-1 truncate normal-case tracking-normal text-[#a89f91]/80 md:block">
          {activeView.hint}
        </span>
        <span className="ml-auto hidden shrink-0 sm:block">▲ {selTrackObj?.name ?? "—"}</span>
        <span className="shrink-0 text-[#a89f91]/50">v2</span>
      </footer>

      {/* ================= mobile device sheet ================= */}
      {deviceSheet && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-label="Device">
          <button
            className="flex-1 bg-black/60"
            onClick={() => setDeviceSheet(false)}
            aria-label="Close device panel"
            tabIndex={-1}
          />
          <div
            className="max-h-[72vh] overflow-hidden rounded-t-2xl border-t border-white/10 bg-[#100d0b]"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
                Device — {selTrackObj?.name ?? ""}
              </span>
              <button
                onClick={() => setDeviceSheet(false)}
                className="flex h-7 w-7 items-center justify-center rounded bg-white/5 text-[12px] text-[#a89f91]"
                aria-label="Close device panel"
              >
                ✕
              </button>
            </div>
            <div className="studio-scroll max-h-[62vh] overflow-y-auto p-3">
              <DeviceRack
                project={project}
                selectedId={effSel}
                updateProject={updateProject}
                onDelete={(id) => {
                  deleteTrack(id);
                  setDeviceSheet(false);
                }}
                onPreviewDrum={(s, v) => void playDrumPreview(s, v)}
                onPreviewNote={(t, p) => void previewNote(t, p)}
              />
            </div>
          </div>
        </div>
      )}

      <Visualizer
        open={visOpen}
        onClose={() => setVisOpen(false)}
        getMasterLevel={getMasterLevel}
        getAnalyser={getAnalyser}
      />
      <PerfKeyboard
        open={keysOpen}
        onClose={() => setKeysOpen(false)}
        track={selTrackObj?.kind === "synth" ? selTrackObj : null}
        onPlay={(pitch) => {
          if (selTrackObj?.kind === "synth") {
            setStarted(true);
            void getEngine().playNoteLive(selTrackObj.id, pitch, 0.9, 0.55);
          }
        }}
        octave={kbOctave}
        onOctave={setKbOctave}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        project={project}
        onLoadProject={loadProject}
      />
      <ProjectsDrawer
        open={projectsOpen}
        onOpenChange={setProjectsOpen}
        current={project}
        onLoad={loadProject}
        onSaveAsNew={() => {
          const copy = { ...project, id: uid(), name: `${project.name} copy` };
          saveProject(copy);
          toast({ title: "Copy saved", description: copy.name });
        }}
      />

      {/* instrument drawer — the intellidaw entrance */}
      <InstrumentDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        tracks={project.tracks}
        onAction={handleDrawerAction}
      />
    </div>
  );
}

export function WaveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M2 12h3l2-7 3 14 3-10 2 5 2-2h5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
