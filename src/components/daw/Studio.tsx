"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KEY_OPTIONS,
  KIT_PRESETS,
  SONG_BARS,
  TEMPLATES,
  applyKitPreset,
  createDefaultProject,
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
  type Track,
} from "@/lib/daw/types";
import { getEngine } from "@/lib/daw/engine";
import { loadCurrent, sanitizeProject, saveCurrent, saveProject } from "@/lib/daw/storage";
import { peekDeviceSelect } from "@/lib/daw/skazi";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { BeatsTab } from "./BeatsTab";
import { KeysTab } from "./KeysTab";
import { PadsTab } from "./PadsTab";
import { MixerTab } from "./MixerTab";
import { AssistantTabMemo } from "./AssistantTab";
import { SkaziTab } from "./SkaziTab";
import { ArrangeTab } from "./ArrangeTab";
import { SessionTab } from "./SessionTab";
import { ExportDialog } from "./ExportDialog";
import { ProjectsDrawer } from "./ProjectsDrawer";
import { Meter, TabButton } from "./ui";

type Tab = "arrange" | "beats" | "keys" | "pads" | "mixer" | "session" | "skazi" | "assistant";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "arrange", label: "Arrange", icon: "▤" },
  { id: "beats", label: "Beats", icon: "✕" },
  { id: "keys", label: "Keys", icon: "♪" },
  { id: "pads", label: "Pads", icon: "▩" },
  { id: "mixer", label: "Mixer", icon: "⇵" },
  { id: "session", label: "Session", icon: "▣" },
  { id: "skazi", label: "SKAZI", icon: "✦" },
  { id: "assistant", label: "Assistant", icon: "◎" },
];

const TRACK_COLORS = ["#f2a43a", "#e5c15a", "#d97b5a", "#8fbf6b", "#c084fc", "#b8a98f", "#6bc5b8", "#e5533d"];

const PAD_KEY_INDEX: Record<string, number> = {};
"1234567890qwerty".split("").forEach((k, i) => (PAD_KEY_INDEX[k] = i));
const PIANO_KEYS = "awsedftgyhujkolp;";

export function Studio({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(() =>
    typeof window !== "undefined" ? loadCurrent() ?? createDefaultProject() : null
  );
  const [tab, setTab] = useState<Tab>(() => (peekDeviceSelect() ? "skazi" : "arrange"));
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1); // absolute step, -1 stopped
  const [selSynth, setSelSynth] = useState<string | null>(null);
  const [selTrack, setSelTrack] = useState<string | null>(null);
  const [drawLen, setDrawLen] = useState(2);
  const [flashSlot, setFlashSlot] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [metro, setMetro] = useState(false);
  const stepRef = useRef<(s: number) => void>(() => {});
  const projectRef = useRef<Project | null>(project);

  /* ---------------- undo / redo ---------------- */
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const prevRef = useRef<Project | null>(null);
  const skipHist = useRef(false);
  // mirror lengths into state so render never touches refs
  const [histLen, setHistLen] = useState({ past: 0, future: 0 });
  const syncHistLen = useCallback(
    () => setHistLen({ past: past.current.length, future: future.current.length }),
    []
  );

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

  // keep engine in sync while playing
  useEffect(() => {
    if (!started || !project) return;
    void getEngine().sync(project);
  }, [project, started]);

  // autosave current project (debounced)
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => saveCurrent(project), 600);
    return () => clearTimeout(t);
  }, [project]);

  // leaving the studio always halts playback and flushes the autosave
  useEffect(() => {
    return () => {
      getEngine().stop();
      if (projectRef.current) saveCurrent(projectRef.current);
    };
  }, []);

  // mouse users should never leave focus stranded on a button — keeps the
  // spacebar transport shortcut predictable (see keydown handler below)
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === "BUTTON") t.blur();
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, []);

  // playhead callback — the engine emits the absolute step (or -1 when stopped)
  useEffect(() => {
    const e = getEngine();
    e.onStep = (s) => stepRef.current(s);
    stepRef.current = (s) => setCurrentStep(s);
    return () => {
      e.onStep = null;
    };
  }, []);

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

  const toStart = useCallback(() => {
    getEngine().jumpTo(0);
    setCurrentStep(0);
  }, []);

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
      const pad = project.pads.find((p) => p.slot === slot);
      if (!pad) return;
      setStarted(true);
      await getEngine().previewDrum(pad.sound, 0.95, pad.tune, pad.custom?.dataUrl ?? null);
      setFlashSlot(slot);
      setTimeout(() => setFlashSlot((s) => (s === slot ? null : s)), 240);
    },
    [project.pads]
  );

  const playPadSlot = useCallback((slot: number) => void playPad(slot), [playPad]);

  const previewNote = useCallback(async (track: SynthTrack, pitch: number) => {
    setStarted(true);
    await getEngine().previewSynth(track, pitch, 0.4, 0.9);
  }, []);

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = async (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const k = ev.key.toLowerCase();
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
        // Radix dialogs handle their own Escape; only leave the studio when none is open
        if (!exportOpen && !projectsOpen) onClose();
        return;
      }
      if (k === " ") {
        // a focused control (menu trigger, tab…) handles Space natively —
        // don't fight it; only toggle the transport from a neutral focus
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
      if (tab === "pads" && k in PAD_KEY_INDEX) {
        ev.preventDefault();
        await playPad(PAD_KEY_INDEX[k]);
        return;
      }
      if (tab === "keys") {
        const synths = project.tracks.filter((t): t is SynthTrack => t.kind === "synth");
        const sel = synths.find((t) => t.id === selSynth) ?? synths[0];
        if (!sel) return;
        const idx = PIANO_KEYS.indexOf(k);
        if (idx >= 0) {
          ev.preventDefault();
          await previewNote(sel, 60 + idx);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, project, selSynth, togglePlay, toggleMetro, playPad, previewNote, undo, redo, exportOpen, projectsOpen, onClose]);

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
    setSelSynth(null);
    setSelTrack(null);
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
      toast({ title: kind === "drum" ? "Drum track added" : "Synth track added", description: "Find it in the track list." });
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
      setSelTrack(null);
    },
    [updateProject]
  );

  const selTrackObj = useMemo(
    () => project?.tracks.find((t) => t.id === selTrack) ?? null,
    [project, selTrack]
  );

  const synthTracks = useMemo(
    () => (project ? project.tracks.filter((t): t is SynthTrack => t.kind === "synth") : []),
    [project]
  );

  const getLevel = useCallback((id: string) => getEngine().level(id), []);
  const getMasterLevel = useCallback(() => getEngine().masterLevel(), []);

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

  const bar = currentStep >= 0 ? Math.floor(currentStep / 16) + 1 : 1;
  const beat = currentStep >= 0 ? Math.floor((currentStep % 16) / 4) + 1 : 1;
  const tick = currentStep >= 0 ? ((currentStep % 4) * 250).toString().padStart(3, "0") : "000";
  const timecodeSec = currentStep >= 0 ? (currentStep * (60 / project.bpm)) / 4 : 0;
  const tc = `${Math.floor(timecodeSec / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(timecodeSec % 60)
    .toString()
    .padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0807] text-[#f0ece4]">
      {/* top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-white/8 bg-[#100d0b] px-3 py-2 sm:gap-3 sm:px-4">
        <button
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5"
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
          className="w-28 rounded-lg border border-white/8 bg-black/30 px-2.5 py-1.5 text-[13px] font-semibold text-[#f0ece4] outline-none focus:border-[#f2a43a]/50 sm:w-44"
          aria-label="Project name"
        />

        {/* templates */}
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
                  setSelTrack(null);
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
            className="px-1.5 font-mono text-sm text-[#a89f91] hover:text-[#f0ece4]"
            aria-label="Decrease BPM"
          >
            −
          </button>
          <div className="w-16 text-center">
            <div className="font-mono text-sm font-bold leading-none text-[#f0ece4]">{project.bpm}</div>
            <div className="font-mono text-[8px] uppercase tracking-widest text-[#a89f91]">BPM</div>
          </div>
          <button
            onClick={() => updateProject((p) => ({ ...p, bpm: Math.min(200, p.bpm + 1) }))}
            className="px-1.5 font-mono text-sm text-[#a89f91] hover:text-[#f0ece4]"
            aria-label="Increase BPM"
          >
            +
          </button>
        </div>

        <select
          value={project.songKey}
          onChange={(e) => updateProject((p) => ({ ...p, songKey: e.target.value }))}
          className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 font-mono text-[11px] text-[#f0ece4] outline-none focus:border-[#f2a43a]/50"
          aria-label="Project key"
          title="Project key — used by the assistant and snap-to-key"
        >
          {KEY_OPTIONS.map((k) => (
            <option key={k} value={k} className="bg-[#171310]">
              {k}
            </option>
          ))}
        </select>

        <div className="hidden items-center gap-2 lg:flex" title="Swing">
          <span className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">SWING</span>
          <input
            type="range"
            min={0}
            max={0.6}
            step={0.01}
            value={project.swing}
            onChange={(e) => updateProject((p) => ({ ...p, swing: Number(e.target.value) }))}
            className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a]"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* undo / redo */}
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
            onClick={() => setProjectsOpen(true)}
            className="hidden border-white/10 bg-transparent text-[12px] text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4] sm:block"
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

      {/* body: sidebar + content */}
      <div className="flex min-h-0 flex-1">
        {/* sidebar (desktop) */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-white/8 bg-[#0d0a08] md:flex">
          <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">
              Tracks · {project.tracks.length}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-5 w-5 items-center justify-center rounded bg-white/5 font-mono text-[11px] text-[#f0ece4] hover:bg-white/12"
                  title="Add track"
                  aria-label="Add track"
                >
                  +
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-white/10 bg-[#171310] text-[#f0ece4]">
                <DropdownMenuItem onClick={() => addTrack("drum")} className="gap-2 text-[12px] focus:bg-white/5">
                  <span aria-hidden>✕</span> Drum track
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addTrack("synth")} className="gap-2 text-[12px] focus:bg-white/5">
                  <span aria-hidden>♪</span> Synth track
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="studio-scroll flex-1 overflow-y-auto px-2 pb-2">
            {project.tracks.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelTrack(t.id === selTrack ? null : t.id)}
                className={cn(
                  "mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                  selTrack === t.id ? "bg-white/10" : "hover:bg-white/5"
                )}
              >
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px]"
                  style={{ background: `${t.color}22`, color: t.color }}
                >
                  {trackIcon(t)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-[#f0ece4]">{t.name}</span>
                  <span className="block font-mono text-[8px] uppercase tracking-wider text-[#a89f91]">
                    {t.kind === "drum" ? "drum" : "synth"}
                  </span>
                </span>
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
              </button>
            ))}
          </div>

          {/* inspector */}
          <div className="border-t border-white/8 p-2.5">
            {selTrackObj ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="flex h-6 w-6 items-center justify-center rounded text-[11px]"
                    style={{ background: `${selTrackObj.color}22`, color: selTrackObj.color }}
                  >
                    {trackIcon(selTrackObj)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-[#f0ece4]">{selTrackObj.name}</div>
                    <div className="font-mono text-[8px] uppercase tracking-wider text-[#a89f91]">
                      {selTrackObj.kind === "drum" ? `drum · ${selTrackObj.sound}` : "synth"}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between font-mono text-[9px] uppercase text-[#a89f91]">
                    <span>Vol</span>
                    <span className="text-[#f0ece4]">{Math.round(selTrackObj.volume * 100)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.3}
                    step={0.01}
                    value={selTrackObj.volume}
                    onChange={(e) =>
                      updateProject((p) => ({
                        ...p,
                        tracks: p.tracks.map((x) =>
                          x.id === selTrackObj.id ? { ...x, volume: Number(e.target.value) } : x
                        ),
                      }))
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a]"
                    aria-label="Track volume"
                  />
                </div>
                {selTrackObj.kind === "drum" && (
                  <div>
                    <div className="mb-0.5 flex justify-between font-mono text-[9px] uppercase text-[#a89f91]">
                      <span>Tune</span>
                      <span className="text-[#f0ece4]">{selTrackObj.tune > 0 ? `+${selTrackObj.tune}` : selTrackObj.tune}</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={selTrackObj.tune}
                      onChange={(e) =>
                        updateProject((p) => ({
                          ...p,
                          tracks: p.tracks.map((x) =>
                            x.id === selTrackObj.id ? { ...x, tune: Number(e.target.value) } : x
                          ),
                        }))
                      }
                      className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a]"
                      aria-label="Track tuning"
                    />
                  </div>
                )}
                {selTrackObj.kind === "synth" && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() =>
                        updateProject((p) => ({
                          ...p,
                          tracks: p.tracks.map((x) =>
                            x.id === selTrackObj.id && x.kind === "synth"
                              ? { ...x, waveform: x.waveform === "sine" ? "sawtooth" : x.waveform === "sawtooth" ? "square" : x.waveform === "square" ? "triangle" : "sine" }
                              : x
                          ),
                        }))
                      }
                      className="rounded-md bg-white/5 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#a89f91] hover:bg-white/10"
                      title="Cycle waveform"
                    >
                      wave · {selTrackObj.waveform.slice(0, 3)}
                    </button>
                    <button
                      onClick={() =>
                        updateProject((p) => ({
                          ...p,
                          tracks: p.tracks.map((x) =>
                            x.id === selTrackObj.id && x.kind === "synth"
                              ? { ...x, octave: Math.max(-2, Math.min(2, x.octave + 1)) }
                              : x
                          ),
                        }))
                      }
                      className="rounded-md bg-white/5 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#a89f91] hover:bg-white/10"
                      title="Cycle octave"
                    >
                      oct {selTrackObj.octave > 0 ? `+${selTrackObj.octave}` : selTrackObj.octave}
                    </button>
                  </div>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setTab(selTrackObj.kind === "drum" ? "beats" : "keys")}
                    className="flex-1 rounded-md bg-[#f2a43a] px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#17120a] hover:bg-[#ffb75c]"
                  >
                    edit {selTrackObj.kind === "drum" ? "beats" : "keys"}
                  </button>
                  <button
                    onClick={() => deleteTrack(selTrackObj.id)}
                    className="rounded-md bg-white/5 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-[#e5533d] hover:bg-[#e5533d]/15"
                    title="Delete track"
                    aria-label={`Delete ${selTrackObj.name}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 p-2 text-center font-mono text-[9px] uppercase tracking-wider text-[#a89f91]/70">
                select a track to inspect
              </div>
            )}
          </div>
        </aside>

        {/* content */}
        <main className="studio-scroll min-w-0 flex-1 overflow-y-auto p-3 pb-40 sm:p-5 md:pb-28">
          {/* mobile track chips */}
          <div className="studio-scroll mb-3 flex gap-1.5 overflow-x-auto pb-1 md:hidden">
            {project.tracks.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelTrack(t.id === selTrack ? null : t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                  selTrack === t.id ? "border-white/25 bg-white/10 text-[#f0ece4]" : "border-white/8 bg-[#14100d] text-[#a89f91]"
                )}
              >
                <span aria-hidden style={{ color: t.color }}>{trackIcon(t)}</span>
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

          <div className="mx-auto max-w-6xl">
            {tab === "arrange" && (
              <ArrangeTab
                project={project}
                updateProject={updateProject}
                currentStep={currentStep}
                playing={playing}
                onSelectTrack={setSelTrack}
                onOpenEditor={(t) => setTab(t.kind === "drum" ? "beats" : "keys")}
              />
            )}
            {tab === "beats" && (
              <BeatsTab
                project={project}
                updateProject={updateProject}
                currentStep={currentStep >= 0 ? currentStep % 16 : -1}
                onPreview={(s, v) => void playDrumPreview(s, v)}
                onApplyKit={(kit) => updateProject((p) => applyKitPreset(p, kit))}
              />
            )}
            {tab === "keys" && (
              <KeysTab
                project={project}
                updateProject={updateProject}
                currentStep={currentStep >= 0 ? currentStep % 16 : -1}
                onPreviewNote={(t, p) => void previewNote(t, p)}
                selectedId={selSynth}
                setSelectedId={setSelSynth}
                drawLen={drawLen}
                setDrawLen={setDrawLen}
              />
            )}
            {tab === "pads" && (
              <PadsTab
                project={project}
                updateProject={updateProject}
                onPlayPad={playPadSlot}
                flashSlot={flashSlot}
              />
            )}
            {tab === "mixer" && (
              <MixerTab
                project={project}
                updateProject={updateProject}
                getLevel={getLevel}
                getMasterLevel={getMasterLevel}
              />
            )}
            {tab === "session" && <SessionTab project={project} currentStep={currentStep} playing={playing} />}
            {tab === "skazi" && <SkaziTab project={project} updateProject={updateProject} />}
            {tab === "assistant" && <AssistantTabMemo project={project} onApplyFix={applyFix} />}
          </div>
        </main>
      </div>

      {/* desktop tabs above transport */}
      <nav
        className="hidden gap-1 border-t border-white/8 bg-[#100d0b] px-4 py-1.5 md:flex"
        aria-label="Studio sections"
      >
        {TABS.map((t) => (
          <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            <span aria-hidden className="mr-1 font-mono text-[11px]">{t.icon}</span>
            {t.label}
          </TabButton>
        ))}
        <div className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[#a89f91]">
          <span className={cn("h-1.5 w-1.5 rounded-full", playing ? "bg-[#8fbf6b] pulse-dot" : "bg-white/20")} />
          {playing ? `Bar ${bar}/${SONG_BARS}` : "Stopped"}
          <span className="mx-1 text-white/15">|</span>
          {project.songKey}
        </div>
      </nav>

      {/* transport */}
      <div
        className="z-40 border-t border-white/8 bg-[#100d0b]"
        style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
          {/* position readout */}
          <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/30 px-2.5 py-1">
            <span className="font-mono text-[13px] font-bold tabular-nums text-[#f0ece4]">{bar}</span>
            <span className="font-mono text-[8px] uppercase tracking-widest text-[#a89f91]">bar</span>
            <span className="font-mono text-[13px] font-bold tabular-nums text-[#f0ece4]">{beat}</span>
            <span className="font-mono text-[8px] uppercase tracking-widest text-[#a89f91]">beat</span>
            <span className="hidden font-mono text-[13px] font-bold tabular-nums text-[#f2a43a] sm:block">{tick}</span>
            <span className="hidden font-mono text-[8px] uppercase tracking-widest text-[#a89f91] sm:block">tick</span>
          </div>
          <span className="hidden font-mono text-[10px] tabular-nums text-[#a89f91] lg:block" title="Elapsed time">
            {tc}
          </span>

          {/* transport buttons */}
          <div className="mx-auto flex items-center gap-1.5">
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
                "flex h-10 items-center gap-2 rounded-xl px-5 font-mono text-[12px] font-bold tracking-wider transition-colors",
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
          </div>

          {/* master */}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden w-20 sm:block">
              <Meter get={() => getEngine().masterLevel()} />
            </div>
            <input
              type="range"
              min={0}
              max={1.3}
              step={0.01}
              value={project.masterVolume}
              onChange={(e) => updateProject((p) => ({ ...p, masterVolume: Number(e.target.value) }))}
              className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a] sm:w-24"
              title={`Master ${Math.round(project.masterVolume * 100)}%`}
              aria-label="Master volume"
            />
          </div>
        </div>

        {/* mobile tab bar */}
        <nav
          className="flex justify-around border-t border-white/8 bg-[#100d0b]/95 py-1 md:hidden"
          aria-label="Studio sections (mobile)"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex min-w-[44px] flex-col items-center gap-0.5 rounded-lg px-1.5 py-1 text-[9px] font-medium",
                tab === t.id ? "text-[#f2a43a]" : "text-[#a89f91]"
              )}
            >
              <span aria-hidden className="text-sm leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

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
