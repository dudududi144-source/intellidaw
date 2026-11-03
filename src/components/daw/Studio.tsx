"use client";

/* ------------------------------------------------------------------ */
/*  Studio — one connected workspace.                                  */
/*                                                                     */
/*  LEFT: track list        (pick what you work on)                    */
/*  TOP:  timeline          (see the whole groove + playhead)          */
/*  MID:  editor            (notes of the selected track)              */
/*  RIGHT: device rack      (sound + mix of the selected track)        */
/*  RAIL: mixer/pads/skazi/assistant panels on demand                  */
/*                                                                     */
/*  Everything reacts to the selected track — no disconnected tabs.    */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KEY_OPTIONS,
  SONG_BARS,
  TEMPLATES,
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
} from "@/lib/daw/types";
import { getEngine } from "@/lib/daw/engine";
import { loadCurrent, sanitizeProject, saveCurrent, saveProject } from "@/lib/daw/storage";
import { peekDeviceSelect } from "@/lib/daw/skazi";
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
import { ExportDialog } from "./ExportDialog";
import { ProjectsDrawer } from "./ProjectsDrawer";
import { Meter } from "./ui";

type Panel = "mixer" | "pads" | "skazi" | "assistant" | null;

const PANELS: Array<{ id: Exclude<Panel, null>; label: string; icon: string }> = [
  { id: "mixer", label: "Mixer", icon: "⇵" },
  { id: "pads", label: "Pads", icon: "▩" },
  { id: "skazi", label: "SKAZI", icon: "✦" },
  { id: "assistant", label: "Assistant", icon: "◎" },
];

const TRACK_COLORS = ["#f2a43a", "#e5c15a", "#d97b5a", "#8fbf6b", "#c084fc", "#b8a98f", "#6bc5b8", "#e5533d"];

const PAD_KEY_INDEX: Record<string, number> = {};
"1234567890qwerty".split("").forEach((k, i) => (PAD_KEY_INDEX[k] = i));

export function Studio({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(() =>
    typeof window !== "undefined" ? loadCurrent() ?? createDefaultProject() : null
  );
  const [panel, setPanel] = useState<Panel>(() => (peekDeviceSelect() ? "skazi" : null));
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1); // absolute step, -1 stopped
  const [selTrack, setSelTrack] = useState<string | null>(null);
  const [drawLen, setDrawLen] = useState(2);
  const [flashSlot, setFlashSlot] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [metro, setMetro] = useState(false);
  const [fxOpen, setFxOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fxFilter, setFxFilter] = useState(1);
  const [fxDrive, setFxDrive] = useState(0);
  const [wide, setWide] = useState(true); // lg+ layout for the tools panel
  const stepRef = useRef<(s: number) => void>(() => {});
  const projectRef = useRef<Project | null>(project);

  /* desktop vs mobile sheet for the tools panel */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  /* ---------------- undo / redo ---------------- */
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const prevRef = useRef<Project | null>(null);
  const skipHist = useRef(false);
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
        if (panel) setPanel(null);
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
      /* 1–9 selects the Nth track (unless the pads panel owns the digits) */
      if (/^[1-9]$/.test(k) && !ev.ctrlKey && !ev.metaKey && !ev.altKey && panel !== "pads") {
        const t = projectRef.current?.tracks[Number(k) - 1];
        if (t) setSelTrack(t.id);
        return;
      }
      if (k === "?" || (ev.shiftKey && k === "/")) {
        ev.preventDefault();
        setHelpOpen((h) => !h);
        return;
      }
      if (panel === "pads" && k in PAD_KEY_INDEX) {
        ev.preventDefault();
        await playPad(PAD_KEY_INDEX[k]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, togglePlay, toggleMetro, playPad, undo, redo, exportOpen, projectsOpen, onClose]);

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
    setSelTrack(p.tracks[0]?.id ?? null);
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
    },
    [updateProject]
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

  const panelTitle = PANELS.find((p) => p.id === panel)?.label ?? "";

  const panelContent = panel ? (
    <>
      {panel === "mixer" && (
        <MixerTab project={project} updateProject={updateProject} getLevel={getLevel} getMasterLevel={getMasterLevel} />
      )}
      {panel === "pads" && (
        <PadsTab project={project} updateProject={updateProject} onPlayPad={playPadSlot} flashSlot={flashSlot} />
      )}
      {panel === "skazi" && <SkaziTab project={project} updateProject={updateProject} />}
      {panel === "assistant" && <AssistantTabMemo project={project} onApplyFix={applyFix} />}
    </>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0807] text-[#f0ece4]">
      {/* ============ top bar ============ */}
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
            className="px-1.5 font-mono text-sm text-[#a89f91] hover:text-[#f0ece4]"
            aria-label="Decrease BPM"
          >
            −
          </button>
          <div className="w-14 text-center">
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

      {/* ============ transport strip ============ */}
      <div
        className="relative z-30 flex items-center gap-2 border-b border-white/8 bg-[#0d0a08] px-3 py-1.5 sm:gap-3 sm:px-4"
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
              "flex h-9 items-center gap-2 rounded-xl px-4 font-mono text-[12px] font-bold tracking-wider transition-colors",
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

        {/* position readout */}
        <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/30 px-2.5 py-1">
          <span className="font-mono text-[13px] font-bold tabular-nums text-[#f0ece4]">{bar}</span>
          <span className="font-mono text-[8px] uppercase tracking-widest text-[#a89f91]">bar</span>
          <span className="font-mono text-[13px] font-bold tabular-nums text-[#f0ece4]">{beat}</span>
          <span className="hidden font-mono text-[8px] uppercase tracking-widest text-[#a89f91] sm:block">beat</span>
          <span className="hidden font-mono text-[13px] font-bold tabular-nums text-[#f2a43a] sm:block">{tick}</span>
          <span className="hidden font-mono text-[10px] tabular-nums text-[#a89f91] md:block">{tc}</span>
        </div>

        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-[#a89f91] lg:block">
          {playing ? `▶ bar ${bar}/${SONG_BARS}` : "stopped"} · {project.songKey}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* master FX popover */}
          <DropdownMenu open={fxOpen} onOpenChange={setFxOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "hidden h-8 items-center rounded-lg px-2.5 font-mono text-[10px] uppercase tracking-wider sm:flex",
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
            className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#f2a43a] sm:w-24"
            title={`Master ${Math.round(project.masterVolume * 100)}%`}
            aria-label="Master volume"
          />
        </div>
        {/* keyboard shortcuts popover (the trigger is desktop-only) */}
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
              In the editor: click an empty cell to place a note · click a note to
              grow it · shift+click a note to remove it. On drum steps,
              shift+click cycles velocity.
            </div>
          </div>
        )}
      </div>

      {/* ============ workspace ============ */}
      <div className="flex min-h-0 flex-1">
        {/* track rail (desktop) */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-white/8 bg-[#0d0a08] md:flex">
          <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
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
                ✕
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
          <div className="studio-scroll flex-1 overflow-y-auto px-2 pb-2">
            {project.tracks.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelTrack(t.id)}
                className={cn(
                  "mb-0.5 block w-full rounded-lg px-2 py-1.5 text-left transition-colors",
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
            ))}
          </div>
          <div className="border-t border-white/8 px-3 py-2 font-mono text-[8px] leading-relaxed text-[#a89f91]/60">
            select a track → it opens in the timeline, editor and device rack
          </div>
        </aside>

        {/* main column */}
        <main className="studio-scroll min-w-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-4 lg:pb-4">
          {/* mobile track chips */}
          <div className="studio-scroll mb-3 flex gap-1.5 overflow-x-auto pb-1 md:hidden">
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

          <div className="mx-auto max-w-6xl space-y-3">
            <Timeline
              project={project}
              currentStep={currentStep}
              playing={playing}
              selectedId={effSel}
              onSelect={setSelTrack}
              onSeek={seek}
              updateProject={updateProject}
            />
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
            <DeviceRack
              project={project}
              selectedId={effSel}
              updateProject={updateProject}
              onDelete={deleteTrack}
              onPreviewDrum={(s, v) => void playDrumPreview(s, v)}
              onPreviewNote={(t, p) => void previewNote(t, p)}
            />
          </div>
        </main>

        {/* tools panel (desktop column) */}
        {panel && wide && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-white/8 bg-[#0d0a08] xl:w-96">
            <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
                {panelTitle}
              </span>
              <button
                onClick={() => setPanel(null)}
                className="flex h-6 w-6 items-center justify-center rounded bg-white/5 text-[11px] text-[#a89f91] hover:bg-white/12 hover:text-[#f0ece4]"
                aria-label="Close panel"
              >
                ✕
              </button>
            </div>
            <div className="studio-scroll min-h-0 flex-1 overflow-y-auto p-3">{panelContent}</div>
          </aside>
        )}
      </div>

      {/* tools rail (desktop) */}
      <nav
        className="hidden items-center gap-1 border-t border-white/8 bg-[#100d0b] px-4 py-1.5 md:flex"
        aria-label="Studio tools"
      >
        {PANELS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPanel(panel === p.id ? null : p.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              panel === p.id
                ? "bg-[#f2a43a] text-[#17120a]"
                : "text-[#a89f91] hover:bg-white/5 hover:text-[#f0ece4]"
            )}
            aria-pressed={panel === p.id}
          >
            <span aria-hidden className="mr-1 font-mono text-[11px]">
              {p.icon}
            </span>
            {p.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[#a89f91]">
          <span className="truncate">▲ selected: {project.tracks.find((t) => t.id === effSel)?.name ?? "—"}</span>
        </span>
      </nav>

      {/* mobile tools sheet */}
      {panel && !wide && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-label={panelTitle}>
          <button
            className="flex-1 bg-black/60"
            onClick={() => setPanel(null)}
            aria-label="Close panel"
            tabIndex={-1}
          />
          <div
            className="max-h-[72vh] overflow-hidden rounded-t-2xl border-t border-white/10 bg-[#100d0b]"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
                {panelTitle}
              </span>
              <button
                onClick={() => setPanel(null)}
                className="flex h-7 w-7 items-center justify-center rounded bg-white/5 text-[12px] text-[#a89f91]"
                aria-label="Close panel"
              >
                ✕
              </button>
            </div>
            <div className="studio-scroll max-h-[62vh] overflow-y-auto p-3">{panelContent}</div>
          </div>
        </div>
      )}

      {/* mobile tools bar */}
      <nav
        className="flex justify-around border-t border-white/8 bg-[#100d0b] py-1 md:hidden"
        aria-label="Studio tools (mobile)"
        style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom))" }}
      >
        {PANELS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPanel(panel === p.id ? null : p.id)}
            className={cn(
              "flex min-w-[64px] flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[9px] font-medium",
              panel === p.id ? "text-[#f2a43a]" : "text-[#a89f91]"
            )}
            aria-pressed={panel === p.id}
          >
            <span aria-hidden className="text-sm leading-none">
              {p.icon}
            </span>
            {p.label}
          </button>
        ))}
      </nav>

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
