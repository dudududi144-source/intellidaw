"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TEMPLATES,
  createDefaultProject,
  humanizeProjectVelocities,
  snapPitchToKey,
  uid,
  type DrumSound,
  type Project,
  type SynthTrack,
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
import { KeysTab, PianoKeyboard } from "./KeysTab";
import { PadsTab } from "./PadsTab";
import { MixerTab } from "./MixerTab";
import { AssistantTabMemo } from "./AssistantTab";
import { SkaziTab } from "./SkaziTab";
import { ExportDialog } from "./ExportDialog";
import { ProjectsDrawer } from "./ProjectsDrawer";
import { Meter, TabButton } from "./ui";

type Tab = "beats" | "keys" | "pads" | "mixer" | "skazi" | "assistant";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "beats", label: "Beats", icon: "▤" },
  { id: "keys", label: "Keys", icon: "♪" },
  { id: "pads", label: "Pads", icon: "▩" },
  { id: "mixer", label: "Mixer", icon: "⇵" },
  { id: "skazi", label: "SKAZI", icon: "✦" },
  { id: "assistant", label: "Assistant", icon: "◎" },
];

const PAD_KEY_INDEX: Record<string, number> = {};
"1234567890qwerty".split("").forEach((k, i) => (PAD_KEY_INDEX[k] = i));
const PIANO_KEYS = "awsedftgyhujkolp;";

export function Studio({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(() =>
    typeof window !== "undefined" ? loadCurrent() ?? createDefaultProject() : null
  );
  const [tab, setTab] = useState<Tab>(() => (peekDeviceSelect() ? "skazi" : "beats"));
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [selSynth, setSelSynth] = useState<string | null>(null);
  const [drawLen, setDrawLen] = useState(2);
  const [flashSlot, setFlashSlot] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const stepRef = useRef<(s: number) => void>(() => {});
  const projectRef = useRef<Project | null>(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

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

  // playhead callback
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
        title: "Audio blocked",
        description: "Your browser needs one more tap — press Play again.",
      });
    }
  }, [playing, project, toast]);

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

  const previewNote = useCallback(
    async (track: SynthTrack, pitch: number) => {
      setStarted(true);
      await getEngine().previewSynth(track, pitch, 0.4, 0.9);
    },
    []
  );

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = async (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const k = ev.key.toLowerCase();
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
  }, [tab, project, selSynth, togglePlay, playPad, previewNote, exportOpen, projectsOpen, onClose]);

  /* ---------------- assistant fixes ---------------- */
  const applyFix = useCallback(
    (fix: string) => {
      if (fix === "snap-key") {
        updateProject((p) => ({
          ...p,
          tracks: p.tracks.map((t) =>
            t.kind === "synth"
              ? { ...t, notes: t.notes.map((n) => ({ ...n, pitch: snapPitchToKey(n.pitch) })) }
              : t
          ),
        }));
        toast({ title: "Snapped to key", description: "Every note now sits inside A minor." });
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
              ? { ...t, volume: Math.max(0.4, t.volume - 0.15), attack: Math.max(0.012, t.attack), delaySend: t.delaySend }
              : t
          ),
        }));
        toast({ title: "Low end tucked", description: "Bass level trimmed so the kick punches through." });
      }
    },
    [updateProject, toast]
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
    setProject(p);
    setSelSynth(null);
    toast({ title: "Project loaded", description: p.name });
  };

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
                  const p = t.build();
                  getEngine().stop();
                  setPlaying(false);
                  setProject(p);
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

        <button
          onClick={() => void togglePlay()}
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg px-4 font-mono text-[12px] font-bold tracking-wider transition-colors",
            playing
              ? "bg-[#e5533d] text-white hover:bg-[#f0684f]"
              : "bg-[#f2a43a] text-[#17120a] hover:bg-[#ffb75c]"
          )}
          aria-label={playing ? "Stop" : "Play"}
        >
          {playing ? "■ STOP" : "▶ PLAY"}
        </button>

        <div className="hidden w-24 xl:block">
          <Meter get={() => getEngine().masterLevel()} />
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
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

      {/* desktop tabs */}
      <nav className="hidden gap-1 border-b border-white/8 bg-[#100d0b] px-4 py-1.5 md:flex" aria-label="Studio sections">
        {TABS.map((t) => (
          <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            <span aria-hidden className="mr-1 font-mono text-[11px]">{t.icon}</span>
            {t.label}
          </TabButton>
        ))}
        <div className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[#a89f91]">
          <span className={cn("h-1.5 w-1.5 rounded-full", playing ? "bg-[#8fbf6b] pulse-dot" : "bg-white/20")} />
          {playing ? `Playing · step ${currentStep + 1}` : "Stopped"}
          <span className="mx-1 text-white/15">|</span>
          {project.name}
        </div>
      </nav>

      {/* content */}
      <main className="studio-scroll flex-1 overflow-y-auto p-3 pb-24 sm:p-5 md:pb-5">
        <div className="mx-auto max-w-6xl">
          {tab === "beats" && (
            <BeatsTab
              project={project}
              updateProject={updateProject}
              currentStep={currentStep}
              onPreview={(s, v) => void playDrumPreview(s, v)}
            />
          )}
          {tab === "keys" && (
            <KeysTab
              project={project}
              updateProject={updateProject}
              currentStep={currentStep}
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
          {tab === "skazi" && (
            <SkaziTab project={project} updateProject={updateProject} />
          )}
          {tab === "assistant" && <AssistantTabMemo project={project} onApplyFix={applyFix} />}
        </div>
      </main>

      {/* mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-white/8 bg-[#100d0b]/95 py-1.5 backdrop-blur md:hidden"
        style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}
        aria-label="Studio sections (mobile)"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex min-w-[56px] flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium",
              tab === t.id ? "text-[#f2a43a]" : "text-[#a89f91]"
            )}
          >
            <span aria-hidden className="text-base leading-none">{t.icon}</span>
            {t.label}
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

export { PianoKeyboard };
