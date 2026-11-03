"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  SKAZI_DEVICES,
  SKAZI_FOLDERS,
  consumeDeviceSelect,
  deviceById,
  devicesInFolder,
  isExtraDevice,
  defaultSeq,
  emptySeq,
  generatePattern,
  MIDI_GENRES,
  MIDI_ROLES,
  ROOT_NAMES,
  SCALE_NAMES,
  skaziStore,
  type SkaziDevice,
  type SkaziState,
  type SkaziParam,
} from "@/lib/daw/skazi";
import { SkaziSequencer } from "@/lib/daw/skaziAudio";
import { getEngine } from "@/lib/daw/engine";
import { bankCount, fmtIndex, randomBankIndex } from "@/lib/daw/presetBank";
import { makeDrumTrack, makeSynthTrack, type Project, type SynthTrack } from "@/lib/daw/types";
import { cn } from "@/lib/utils";
import { Search, Star } from "lucide-react";
import { ParamRow, PanelTitle } from "./ui";
import { PianoKeyboard } from "./KeysTab";
import { PresetBrowser, auditionBankPreset, loadPresetFavs, togglePresetFav } from "./PresetBrowser";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const BUNDLE_URL = "https://github.com/slazoasher/skazi-bundle/releases/latest";
const KEY_MAP: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71,
  k: 72, o: 73, l: 74, p: 75, ";": 76,
};

function useSkaziState(): SkaziState {
  return useSyncExternalStore(skaziStore.subscribe, skaziStore.get, skaziStore.get);
}

const fmtNum = (p: SkaziParam, v: number) =>
  p.fmt ? p.fmt(v) : p.step && p.step >= 1 ? String(v) : v.toFixed(2);

/* ---------------- param controls ---------------- */

function ParamControl({
  p,
  value,
  onChange,
}: {
  p: SkaziParam;
  value: number;
  onChange: (v: number) => void;
}) {
  if (p.options) {
    const idx = Math.round(value);
    const next = () => onChange((idx + 1) % p.options!.length);
    return (
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider text-[#a89f91]">
          {p.label}
        </span>
        <button
          onClick={next}
          className="flex flex-1 items-center justify-between rounded-lg border border-white/8 bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-[#f0ece4] hover:border-[#f2a43a]/40 hover:bg-white/5"
          aria-label={`${p.label}: ${p.options[idx]}`}
        >
          <span>{p.options[idx]}</span>
          <span aria-hidden className="text-[#a89f91]">▾</span>
        </button>
      </div>
    );
  }
  return (
    <ParamRow
      label={p.label}
      value={value}
      min={p.min}
      max={p.max}
      step={p.step ?? 0.01}
      onChange={onChange}
      format={(v) => fmtNum(p, v)}
    />
  );
}

function ParamsGrid({
  device,
  params,
  onSet,
  accent,
}: {
  device: SkaziDevice;
  params: Record<string, number>;
  onSet: (id: string, v: number) => void;
  accent: string;
}) {
  const col1 = device.params.filter((p) => p.col !== 2);
  const col2 = device.params.filter((p) => p.col === 2);
  const render = (list: SkaziParam[]) =>
    list.map((p) => (
      <ParamControl
        key={p.id}
        p={p}
        value={params[p.id] ?? p.def}
        onChange={(v) => onSet(p.id, v)}
      />
    ));
  return (
    <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
      <div className="space-y-2.5">{render(col1)}</div>
      <div className="space-y-2.5">
        {render(col2)}
        {col2.length === 0 && (
          <div
            className="rounded-lg border border-white/5 p-3 font-mono text-[10px] leading-relaxed text-[#a89f91]"
            style={{ boxShadow: `inset 2px 0 0 ${accent}55` }}
          >
            {device.desc}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- preset bar + factory chips ---------------- */

const PRESET_BTN =
  "flex h-7 min-w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] px-2 font-mono text-[10px] uppercase tracking-wider text-[#a89f91] transition-colors hover:border-[#f2a43a]/40 hover:text-[#f0ece4] disabled:opacity-40";

/** the original hand-written factory patches (kept as a small row under the bar) */
function FactoryChips({ device }: { device: SkaziDevice }) {
  if (!device.presets) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]/60">Factory</span>
      {Object.keys(device.presets).map((name) => (
        <button
          key={name}
          onClick={() => skaziStore.applyPreset(device.id, name)}
          className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[#a89f91] transition-colors hover:border-[#f2a43a]/50 hover:text-[#f0ece4]"
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/** one-line bank control: ‹ preset › + BROWSE / 🎲 / A/B / UNDO / ★ */
function PresetBar({ device }: { device: SkaziDevice }) {
  const state = useSkaziState();
  const [browse, setBrowse] = useState(false);
  const [, setTick] = useState(0); // re-render after runtime-only A/B / favorite writes
  const n = bankCount(device);
  const cur = state.lastPreset?.[device.id] ?? null;
  const abOn = skaziStore.abActive(device.id);
  const curFav = cur ? (loadPresetFavs()[device.id] ?? []).includes(cur.index) : false;

  // no procedural bank (e.g. Intellidaw extras) → factory chips only
  if (n <= 0) return <FactoryChips device={device} />;

  const applyIdx = (i: number) => {
    skaziStore.applyBankPreset(device.id, i);
    auditionBankPreset(device, i);
  };
  const idx = cur?.index ?? -1;
  const step = (dir: 1 | -1) => applyIdx(idx < 0 ? (dir === 1 ? 0 : n - 1) : (idx + dir + n) % n);
  const onRandom = () => applyIdx(randomBankIndex(device, idx >= 0 ? idx : undefined));
  const onAB = () => {
    if (!skaziStore.abActive(device.id)) {
      skaziStore.abStore(device.id);
      setTick((t) => t + 1); // abStore is runtime-only → no store emit
    } else {
      skaziStore.abToggle(device.id);
    }
  };
  const onStar = () => {
    if (!cur) return;
    togglePresetFav(device.id, cur.index);
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
        <button onClick={() => step(-1)} className={PRESET_BTN} aria-label={`Previous ${device.name} bank preset`}>
          ‹
        </button>
        <button onClick={() => step(1)} className={PRESET_BTN} aria-label={`Next ${device.name} bank preset`}>
          ›
        </button>
        <div
          className="min-w-0 flex-1 truncate px-1 font-mono text-[11px] uppercase tracking-wider"
          aria-live="polite"
          aria-label={`Current preset: ${cur ? `${cur.name}, ${cur.category}` : "INIT"}`}
        >
          {cur ? (
            <>
              <span className="font-bold" style={{ color: device.accent }}>
                {cur.name}
              </span>
              <span className="text-[#a89f91]"> · {cur.category}</span>
              <span className="ml-2 text-[9px] text-[#a89f91]/50">{fmtIndex(cur.index)}</span>
            </>
          ) : (
            <span className="text-[#a89f91]">INIT</span>
          )}
        </div>
        <button
          onClick={() => setBrowse(true)}
          className={cn(PRESET_BTN, "text-[#f2a43a] hover:text-[#ffcb7a]")}
          aria-label={`Browse all ${n.toLocaleString()} ${device.name} presets`}
        >
          BROWSE
          <span className="hidden text-[9px] text-[#a89f91] sm:inline">·{n.toLocaleString()}</span>
        </button>
        <button onClick={onRandom} className={PRESET_BTN} aria-label={`Random ${device.name} bank preset`}>
          🎲
        </button>
        <button
          onClick={onAB}
          className={cn(PRESET_BTN, abOn && "border-[#f2a43a]/50 bg-[#f2a43a]/10 text-[#f2a43a]")}
          aria-pressed={abOn}
          aria-label={abOn ? "A/B active — press to swap A and B" : "Store current sound as B, then toggle A/B"}
        >
          A/B
        </button>
        <button onClick={() => skaziStore.presetUndo(device.id)} className={PRESET_BTN} aria-label="Undo last bank preset">
          UNDO
        </button>
        <button
          onClick={onStar}
          disabled={!cur}
          className={cn(PRESET_BTN, curFav && "border-[#f2a43a]/50 bg-[#f2a43a]/10 text-[#f2a43a]")}
          aria-pressed={curFav}
          aria-label={cur ? (curFav ? `Remove ${cur.name} from favorites` : `Add ${cur.name} to favorites`) : "No bank preset selected"}
        >
          <Star className={cn("h-3 w-3", curFav && "fill-current")} aria-hidden />
        </button>
      </div>
      <FactoryChips device={device} />
      <PresetBrowser device={device} open={browse} onClose={() => setBrowse(false)} />
    </div>
  );
}

function FireButton({
  onClick,
  accent,
  children,
  big,
}: {
  onClick: () => void;
  accent: string;
  children: React.ReactNode;
  big?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg font-mono font-bold tracking-wider text-[#17120a] transition-transform active:scale-95",
        big ? "px-6 py-3 text-sm" : "px-4 py-2 text-[12px]"
      )}
      style={{ background: accent, boxShadow: `0 0 18px ${accent}55` }}
    >
      {children}
    </button>
  );
}

/* ---------------- device panels ---------------- */

function SynthPanel({
  device,
  params,
  onSet,
}: {
  device: SkaziDevice;
  params: Record<string, number>;
  onSet: (id: string, v: number) => void;
}) {
  const [held, setHeld] = useState<number[]>([]);
  const play = useCallback(
    async (pitch: number) => {
      await getEngine().previewSkazi(device.id, pitch, device.id === "subich" ? 0.4 : 0.55);
      setHeld((h) => [...h.slice(-4), pitch]);
      setTimeout(() => setHeld((h) => h.filter((p) => p !== pitch)), 350);
    },
    [device.id]
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const pitch = KEY_MAP[ev.key.toLowerCase()];
      if (pitch) {
        ev.preventDefault();
        void play(pitch);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play]);

  return (
    <div className="space-y-4">
      <PresetBar key={device.id} device={device} />
      <PianoKeyboard onPlay={play} low={60} high={76} keyMap={KEY_MAP} />
      <div
        className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2"
        aria-live="polite"
      >
        <span
          className={cn("h-1.5 w-1.5 rounded-full", held.length ? "animate-pulse" : "opacity-30")}
          style={{ background: device.accent }}
        />
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#a89f91]">
          Play with A–; keys or click
        </span>
      </div>
      <ParamsGrid device={device} params={params} onSet={onSet} accent={device.accent} />
    </div>
  );
}

function SeqPanel({
  device,
  params,
  seq,
  onSet,
}: {
  device: SkaziDevice;
  params: Record<string, number>;
  seq: ReturnType<typeof defaultSeq>;
  onSet: (id: string, v: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [curStep, setCurStep] = useState(-1);
  const seqRef = useRef<SkaziSequencer | null>(null);

  const getSeq = useCallback(() => {
    const s = skaziStore.get().seq[device.id];
    return s ?? defaultSeq(device.id);
  }, [device.id]);

  const ensureSeq = useCallback(() => {
    if (!seqRef.current) {
      seqRef.current = new SkaziSequencer(
        device.id as "tbon303" | "skacid",
        () => getEngine().ensure(),
        () => getEngine().skaziChainInputSync(),
        () => getEngine().bpm(),
        () => (skaziStore.get().instruments[device.id] ?? {}) as Record<string, number>,
        getSeq
      );
      seqRef.current.onStep = (s) => setCurStep(s);
    }
    return seqRef.current;
  }, [device.id, getSeq]);

  useEffect(() => {
    return () => {
      seqRef.current?.stop();
    };
  }, []);

  const toggle = async () => {
    const s = ensureSeq();
    if (playing) {
      s.stop();
      setPlaying(false);
    } else {
      await s.start();
      setPlaying(true);
    }
  };

  const gen = () => {
    const next = emptySeq();
    let s = 0;
    while (s < 16) {
      if (Math.random() < 0.6)
        next[s] = {
          on: true,
          oct: Math.random() < 0.18 ? 1 : Math.random() < 0.08 ? -1 : 0,
          accent: s % 4 === 0 || Math.random() < 0.15,
          slide: Math.random() < 0.28,
        };
      s += Math.random() < 0.72 ? 2 : 3;
    }
    next[0] = { on: true, oct: 0, accent: true, slide: false };
    skaziStore.setSeq(device.id, next);
  };

  return (
    <div className="space-y-4">
      <PresetBar key={device.id} device={device} />

      <div className="flex flex-wrap items-center gap-2">
        <FireButton onClick={toggle} accent={playing ? "#e5533d" : device.accent}>
          {playing ? "■ STOP SEQ" : "▶ RUN SEQ"}
        </FireButton>
        <button
          onClick={gen}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] tracking-wider text-[#a89f91] hover:border-[#f2a43a]/40 hover:text-[#f0ece4]"
        >
          ⟳ PATTERN GEN
        </button>
        <button
          onClick={() => skaziStore.mutateSeq(device.id)}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] tracking-wider text-[#a89f91] hover:border-[#f2a43a]/40 hover:text-[#f0ece4]"
        >
          ⚡ MUTATE
        </button>
        <button
          onClick={() => skaziStore.clearSeq(device.id)}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] tracking-wider text-[#a89f91] hover:border-[#e5533d]/40 hover:text-[#f0ece4]"
        >
          ✕ CLEAR
        </button>
        <span className="font-mono text-[9px] uppercase tracking-widest text-[#a89f91]/60">
          synced to project BPM
        </span>
      </div>

      {/* step grid */}
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-[560px] gap-1">
          {seq.map((st, i) => (
            <div key={i} className="flex-1">
              <button
                onClick={() => skaziStore.toggleSeqStep(device.id, i)}
                className={cn(
                  "h-10 w-full rounded-md border font-mono text-[10px] transition-all",
                  st.on ? "text-[#17120a]" : "border-white/8 bg-black/30 text-[#a89f91]/50 hover:bg-white/5",
                  curStep === i && "ring-2 ring-white/60",
                  i % 4 === 0 && "ml-0"
                )}
                style={st.on ? { background: device.accent, borderColor: device.accent } : undefined}
                aria-label={`Step ${i + 1} ${st.on ? "on" : "off"}`}
                aria-pressed={st.on}
              >
                {i + 1}
              </button>
              {st.on && (
                <div className="mt-1 flex gap-[2px]">
                  <button
                    onClick={() => skaziStore.cycleSeqStep(device.id, i, "oct")}
                    className="h-5 flex-1 rounded bg-black/40 font-mono text-[9px] text-[#a89f91] hover:bg-white/10"
                    title="Octave"
                  >
                    {st.oct === 1 ? "▲" : st.oct === -1 ? "▼" : "•"}
                  </button>
                  <button
                    onClick={() => skaziStore.cycleSeqStep(device.id, i, "accent")}
                    className={cn(
                      "h-5 flex-1 rounded font-mono text-[9px]",
                      st.accent ? "bg-[#f2a43a] text-[#17120a]" : "bg-black/40 text-[#a89f91] hover:bg-white/10"
                    )}
                    title="Accent"
                  >
                    A
                  </button>
                  <button
                    onClick={() => skaziStore.cycleSeqStep(device.id, i, "slide")}
                    className={cn(
                      "h-5 flex-1 rounded font-mono text-[9px]",
                      st.slide ? "bg-[#8fbf6b] text-[#17120a]" : "bg-black/40 text-[#a89f91] hover:bg-white/10"
                    )}
                    title="Slide"
                  >
                    S
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ParamsGrid device={device} params={params} onSet={onSet} accent={device.accent} />
    </div>
  );
}

function KickPanel({
  device,
  params,
  onSet,
}: {
  device: SkaziDevice;
  params: Record<string, number>;
  onSet: (id: string, v: number) => void;
}) {
  const fire = () => void getEngine().previewSkazi(device.id, 36, 0.01);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (ev.code === "Space" && document.activeElement?.tagName !== "BUTTON") {
        ev.preventDefault();
        fire();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="space-y-4">
      <PresetBar key={device.id} device={device} />
      <div className="flex items-center gap-3">
        <FireButton onClick={fire} accent={device.accent} big>
          🥁 FIRE KICK
        </FireButton>
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#a89f91]">
          space to hammer
        </span>
      </div>
      <ParamsGrid device={device} params={params} onSet={onSet} accent={device.accent} />
    </div>
  );
}

function RiserPanel({
  device,
  params,
  onSet,
}: {
  device: SkaziDevice;
  params: Record<string, number>;
  onSet: (id: string, v: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const fire = async () => {
    if (busy) return;
    setBusy(true);
    await getEngine().fireRiser();
    const dur = Math.round(params.bars ?? 2) * 4 * (60 / getEngine().bpm()) * 1000;
    setTimeout(() => setBusy(false), dur);
  };
  return (
    <div className="space-y-4">
      <PresetBar key={device.id} device={device} />
      <div className="flex items-center gap-3">
        <FireButton onClick={fire} accent={device.accent} big>
          {busy ? "▲ RISING…" : "⤒ FIRE RISER"}
        </FireButton>
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#a89f91]">
          {Math.round(params.bars ?? 2)} bars @ project tempo
        </span>
      </div>
      <ParamsGrid device={device} params={params} onSet={onSet} accent={device.accent} />
    </div>
  );
}

const GOD_ROLE_DEFAULTS: Record<string, Partial<SynthTrack>> = {
  BASS: { octave: -1, cutoff: 0.32, sustain: 0.5, release: 0.12, waveform: "sawtooth", volume: 0.95 },
  ACID: { cutoff: 0.3, resonance: 16, sustain: 0.2, decay: 0.14, release: 0.1, glide: true, delaySend: 0.35, volume: 0.5 },
  LEAD: { waveform: "square", detune: 12, cutoff: 0.68, decay: 0.3, sustain: 0.35, delaySend: 0.3, reverbSend: 0.2, volume: 0.5 },
  PLUCK: { decay: 0.15, sustain: 0.1, release: 0.2, delaySend: 0.3, volume: 0.55 },
  ARP: { decay: 0.12, sustain: 0.15, release: 0.15, delaySend: 0.35, volume: 0.5 },
  CHORDS: { attack: 0.02, release: 0.6, sustain: 0.45, reverbSend: 0.35, volume: 0.6 },
  PAD: { attack: 0.6, sustain: 0.7, release: 1.2, reverbSend: 0.5, volume: 0.3 },
  COUNTER: { attack: 0.05, sustain: 0.4, release: 0.5, reverbSend: 0.3, volume: 0.45 },
};

function GodPanel({
  device,
  params,
  onSet,
  updateProject,
}: {
  device: SkaziDevice;
  params: Record<string, number>;
  onSet: (id: string, v: number) => void;
  updateProject: (fn: (p: Project) => Project) => void;
}) {
  const { toast } = useToast();
  const [pattern, setPattern] = useState<{ notes: ReturnType<typeof generatePattern>["notes"]; steps?: boolean[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const role = MIDI_ROLES[Math.round(params.role ?? 0)];
  const genre = MIDI_GENRES[Math.round(params.genre ?? 0)];

  const doGenerate = () => {
    const pat = generatePattern(
      Math.round(params.genre ?? 0),
      Math.round(params.role ?? 0),
      Math.round(params.root ?? 9),
      Math.round(params.scale ?? 0),
      Math.round(params.octave ?? 0),
      params.density ?? 0.55,
      params.groove ?? 0.5,
      (params.rollBass ?? 0) > 0.5,
      Math.round(params.bars ?? 1)
    );
    setPattern({ notes: pat.notes, steps: pat.steps });
    skaziStore.setGodSeed(Date.now() % 1e6);
    void getEngine().previewPattern(
      role === "BASS" || role === "ACID" ? "subich" : "skazi",
      pat.notes,
      Math.round(params.bars ?? 1),
      pat.steps
    );
  };

  const write = () => {
    if (!pattern) return;
    if (role === "DRUMS" && pattern.steps) {
      const steps = Array.from({ length: 16 }, (_, i) => ({ on: pattern.steps![i % 16], vel: 0.9 }));
      const t = makeDrumTrack("kick", `MG ${role}`, device.accent, []);
      t.steps = steps;
      updateProject((p) => ({ ...p, tracks: [...p.tracks, t] }));
    } else {
      const t = makeSynthTrack(`MG ${role}`, device.accent, { ...(GOD_ROLE_DEFAULTS[role] ?? {}) }, pattern.notes);
      updateProject((p) => ({ ...p, tracks: [...p.tracks, t] }));
    }
    toast({ title: `Pattern written`, description: `New “MG ${role}” track added to the project.` });
  };

  const audition = async () => {
    if (!pattern || busy) return;
    setBusy(true);
    const dur = await getEngine().previewPattern(
      role === "BASS" || role === "ACID" ? "subich" : "skazi",
      pattern.notes,
      Math.round(params.bars ?? 1),
      pattern.steps
    );
    setTimeout(() => setBusy(false), dur * 1000);
  };

  return (
    <div className="space-y-4">
      <PresetBar key={device.id} device={device} />
      <ParamsGrid device={device} params={params} onSet={onSet} accent={device.accent} />
      <div className="flex flex-wrap items-center gap-2">
        <FireButton onClick={doGenerate} accent={device.accent}>
          🎲 GENERATE
        </FireButton>
        <button
          onClick={audition}
          disabled={!pattern || busy}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] tracking-wider text-[#a89f91] hover:border-[#f2a43a]/40 hover:text-[#f0ece4] disabled:opacity-40"
        >
          {busy ? "▶ PLAYING…" : "▷ AUDITION"}
        </button>
        <button
          onClick={write}
          disabled={!pattern}
          className="rounded-lg border border-[#8fbf6b]/40 bg-[#8fbf6b]/10 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-[#b9e39a] hover:bg-[#8fbf6b]/20 disabled:opacity-40"
        >
          ⇥ WRITE TO PROJECT
        </button>
      </div>
      {pattern && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-3">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">
            {genre} · {role} · {pattern.notes.length || (pattern.steps?.filter(Boolean).length ?? 0)} events
          </div>
          <div className="flex flex-wrap gap-1">
            {(pattern.notes.length
              ? pattern.notes.slice(0, 64).map((n) => `${n.step}:${n.pitch}`)
              : (pattern.steps ?? []).map((on, i) => (on ? `${i % 16}` : "")).filter(Boolean)
            ).map((s, i) => (
              <span key={i} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-[#c9c0b2]">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="font-mono text-[10px] leading-relaxed text-[#a89f91]">
        Generates scale-locked patterns for {MIDI_ROLES.length} roles × {MIDI_GENRES.length} genres.
        Synth roles land as editable piano-roll notes; DRUMS lands as an editable step row.
      </p>
    </div>
  );
}

function FxPanel({
  device,
  fx,
  onSet,
}: {
  device: SkaziDevice;
  fx: { enabled: boolean; params: Record<string, number> };
  onSet: (id: string, v: number) => void;
}) {
  const index = SKAZI_DEVICES.filter((d) => d.kind === "fx").findIndex((d) => d.id === device.id) + 1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2.5">
        <Switch
          checked={fx.enabled}
          onCheckedChange={(v) => skaziStore.toggleFx(device.id, v)}
          aria-label={`Toggle ${device.name}`}
        />
        <span className="font-mono text-[11px] font-bold tracking-wider" style={{ color: fx.enabled ? device.accent : "#a89f91" }}>
          {fx.enabled ? "ACTIVE ON MASTER" : "BYPASSED"}
        </span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-[#a89f91]/60">
          slot {index}/10 · affects playback & export
        </span>
      </div>
      <PresetBar key={device.id} device={device} />
      <div className="flex items-center gap-2">
        <button
          onClick={() => skaziStore.randomizeFx(device.id)}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] tracking-wider text-[#a89f91] hover:border-[#f2a43a]/40 hover:text-[#f0ece4]"
        >
          🎲 RANDOM
        </button>
      </div>
      <ParamsGrid device={device} params={fx.params} onSet={onSet} accent={device.accent} />
    </div>
  );
}

/* ---------------- imported plugin files (real intake) ---------------- */

interface PluginImportEntry {
  sha256: string;
  fileName: string;
  size: number;
  format: string;
  machine: string | null;
  isPe: boolean;
  exportName: string | null;
  wrapper: string | null;
  vendor: string | null;
  markers: string[];
  engine: string | null;
  engineNote: string;
  dspEmbedded: string;
  importedAt: string;
}

function PluginImports({ onSet }: { onSet: (id: string) => void }) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<PluginImportEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/plugins/import")
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d) => {
        if (live) setEntries(d.entries ?? []);
      })
      .catch(() => {
        if (live) setEntries([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/plugins/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "import failed");
      const e = data.entry as PluginImportEntry;
      setEntries((prev) => [e, ...(prev ?? []).filter((x) => x.sha256 !== e.sha256)]);
      toast({
        title: `${e.fileName} analyzed`,
        description: e.engine
          ? `${e.wrapper ?? e.format} detected — ${e.engineNote}`
          : `${e.wrapper ?? e.format} detected — ${e.engineNote}`,
      });
      if (e.engine) onSet(e.engine);
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "unknown error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2 rounded-lg border border-[#7ec8a9]/25 bg-[#7ec8a9]/5 p-2">
      <input
        ref={fileRef}
        type="file"
        accept=".vst3,.clap,.dll,.so,.component,.vst"
        className="hidden"
        aria-label="Import a plugin file"
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (f) void upload(f);
          ev.target.value = "";
        }}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#7ec8a9] hover:text-[#a8e3cd] disabled:opacity-40"
          aria-label="Import a .vst3 or .clap plugin file"
        >
          {busy ? "… analyzing" : "⤒ Import .vst3/.clap"}
        </button>
        <span className="font-mono text-[9px] text-[#a89f91]/60">parsed · hashed · mapped</span>
      </div>
      {entries && entries.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {entries.slice(0, 4).map((e) => (
            <li key={e.sha256} className="rounded-md border border-white/5 bg-black/25 p-2">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-mono text-[10.5px] font-bold text-[#f0ece4]" title={e.fileName}>
                  {e.fileName}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[9px] text-[#a89f91]/60">
                  {(e.size / 1024).toFixed(0)} KB
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[9px] leading-relaxed text-[#a89f91]">
                {e.machine ?? "not a PE binary"} · {e.exportName ?? "no export"}
                {e.wrapper ? ` · ${e.wrapper}` : ""}
                {e.vendor ? ` · ${e.vendor}` : ""}
              </div>
              <div className="mt-0.5 font-mono text-[9px] leading-relaxed text-[#d9a05b]">{e.dspEmbedded}</div>
              <div className="mt-1 flex items-center gap-2">
                {e.engine && (
                  <button
                    onClick={() => onSet(e.engine!)}
                    className="rounded border border-[#7ec8a9]/40 bg-[#7ec8a9]/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#7ec8a9] hover:bg-[#7ec8a9]/20"
                  >
                    ▸ Load {e.engine === "fm1" ? "FM-1" : e.engine}
                  </button>
                )}
                <a
                  href={`/api/plugins/import?sha=${e.sha256}&download=1`}
                  className="font-mono text-[9px] text-[#a89f91] underline-offset-2 hover:text-[#f0ece4] hover:underline"
                >
                  ⤓ original file
                </a>
                <span className="ml-auto font-mono text-[8.5px] text-[#a89f91]/50">
                  sha {e.sha256.slice(0, 10)}…
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- main tab ---------------- */

export function SkaziTab({
  project,
  updateProject,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
}) {
  const state = useSkaziState();
  // deep link from the landing page → open the requested device directly
  const [sel, setSel] = useState<string>(() => {
    const id = consumeDeviceSelect();
    return id && deviceById(id) ? id : "skazi";
  });
  const [query, setQuery] = useState("");
  const device = deviceById(sel) ?? SKAZI_DEVICES[0];
  void project;
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    Synths: true,
    Basslines: true,
    "Drums & FX": false,
    "FX Rack": false,
    "Intellidaw Extras": true,
  });

  const onSet = useCallback(
    (id: string, v: number) => skaziStore.setParam(sel, id, v),
    [sel]
  );

  const instParams = state.instruments[sel] ?? {};
  const fxState = state.fx[sel] ?? { enabled: false, params: {} };
  const seq = state.seq[sel] ?? defaultSeq(sel);

  const q = query.trim().toLowerCase();
  const matches = (d: SkaziDevice) =>
    !q || d.name.toLowerCase().includes(q) || d.tagline.toLowerCase().includes(q) || d.folder.toLowerCase().includes(q);
  const favIds = (state.favorites ?? []).filter((id) => deviceById(id) && matches(deviceById(id)!));
  const isFav = (state.favorites ?? []).includes(device.id);
  /* honest split: official bundle tools have an upstream repoPath (19);
     the rest are Intellidaw originals (FM-1, Limonana, Sabich, Malabi) */
  const bundleCount = SKAZI_DEVICES.filter((d) => d.repoPath).length;
  const originalsCount = SKAZI_DEVICES.length - bundleCount;

  const DeviceRow = ({ d }: { d: SkaziDevice }) => (
    <li>
      <button
        onClick={() => setSel(d.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
          sel === d.id ? "bg-white/8 font-semibold text-[#f0ece4]" : "text-[#a89f91] hover:bg-white/5"
        )}
        aria-current={sel === d.id ? "true" : undefined}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: d.accent, opacity: sel === d.id ? 1 : 0.55 }}
        />
        <span className="truncate">{d.name}</span>
        {d.kind === "fx" && state.fx[d.id]?.enabled && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#8fbf6b] pulse-dot" aria-label="active" />
        )}
        {(state.favorites ?? []).includes(d.id) && (
          <Star className={cn("ml-auto h-3 w-3 shrink-0 text-[#f2a43a]", d.kind === "fx" && state.fx[d.id]?.enabled && "ml-1")} aria-label="favorite" />
        )}
      </button>
    </li>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      {/* browser */}
      <aside className="rounded-xl border border-white/5 bg-[#14100d] p-3" aria-label="SKAZI bundle browser">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f2a43a]">
              SKAZI Bundle
            </div>
            <div className="text-[11px] text-[#a89f91]">
              {bundleCount} free tools + {originalsCount} originals
            </div>
          </div>
        </div>

        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a89f91]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search devices…"
            aria-label="Search SKAZI devices"
            className="w-full rounded-lg border border-white/8 bg-black/30 py-1.5 pl-7 pr-2 font-mono text-[11px] text-[#f0ece4] placeholder:text-[#a89f91]/50 focus:border-[#f2a43a]/40 focus:outline-none"
          />
        </div>

        <div className="mb-2 rounded-lg border border-[#f2a43a]/20 bg-[#f2a43a]/5 p-2">
          <a
            href={BUNDLE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#f2a43a] hover:text-[#ffcb7a]"
          >
            ⤓ Real VST3/AU plugins
            <span className="text-[#a89f91]">· free</span>
          </a>
        </div>

        <PluginImports onSet={(id) => setSel(id)} />

        <nav className="max-h-[46vh] space-y-0.5 overflow-y-auto pr-1" aria-label="Device folders">
          {q === "" && favIds.length > 0 && (
            <div className="mb-1">
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#f2a43a]">
                <Star className="h-3 w-3 fill-current" aria-hidden /> Favorites
                <span className="ml-auto font-mono text-[9px] text-[#a89f91]/60">{favIds.length}</span>
              </div>
              <ul className="ml-3 border-l border-[#f2a43a]/20 pl-1">
                {favIds.map((id) => (
                  <DeviceRow key={`fav-${id}`} d={deviceById(id)!} />
                ))}
              </ul>
            </div>
          )}

          {q !== "" ? (
            <ul className="ml-1 border-l border-white/5 pl-1">
              {SKAZI_DEVICES.filter(matches).map((d) => (
                <DeviceRow key={d.id} d={d} />
              ))}
              {SKAZI_DEVICES.filter(matches).length === 0 && (
                <li className="px-2 py-2 font-mono text-[10px] text-[#a89f91]/60">no devices match “{query}”</li>
              )}
            </ul>
          ) : (
            SKAZI_FOLDERS.map((folder) => {
              const open = openFolders[folder] ?? false;
              const items = devicesInFolder(folder);
              return (
                <div key={folder}>
                  <button
                    onClick={() => setOpenFolders((o) => ({ ...o, [folder]: !open }))}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-mono text-[11px] uppercase tracking-wider text-[#c9c0b2] hover:bg-white/5"
                    aria-expanded={open}
                  >
                    <span aria-hidden className="text-[#a89f91]">{open ? "▾" : "▸"}</span>
                    <span aria-hidden>📁</span> {folder}
                    <span className="ml-auto font-mono text-[9px] text-[#a89f91]/60">{items.length}</span>
                  </button>
                  {open && (
                    <ul className={cn("ml-3 border-l border-white/5 pl-1", folder === "Intellidaw Extras" && "border-[#7fd4c1]/25")}>
                      {items.map((d) => (
                        <DeviceRow key={d.id} d={d} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </nav>

        <p className="mt-3 border-t border-white/5 pt-2 font-mono text-[9px] leading-relaxed text-[#a89f91]/70">
          All {bundleCount} free tools by Asher Swissa (SKAZI), rebuilt as browser-native devices —
          plus {Math.max(0, originalsCount - 1)} Intellidaw originals (Limonana, Sabich, Malabi) and
          FM-1, a browser build of the M-VAVE FM-1 (import your .vst3 above). Original code,
          no downloads needed.
        </p>
      </aside>

      {/* device panel */}
      <section className="rounded-xl border border-white/5 bg-[#14100d] p-4 sm:p-5" aria-label={`${device.name} panel`}>
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-lg font-bold tracking-tight" style={{ color: device.accent }}>
            {device.name}
          </h3>
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#a89f91]">
            {device.tagline}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">
            {project.bpm} BPM
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">
            {device.folder}
          </span>
          {isExtraDevice(device) && (
            <span
              className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest"
              style={{ borderColor: `${device.accent}55`, color: device.accent }}
            >
              Intellidaw original
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            {device.kind !== "fx" && device.kind !== "generator" && (
              <button
                onClick={() => skaziStore.randomizeInstrument(device.id)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#a89f91] transition-colors hover:border-[#f2a43a]/40 hover:text-[#f0ece4]"
                title="Randomize this patch"
                aria-label={`Randomize ${device.name} patch`}
              >
                🎲 Random
              </button>
            )}
            <button
              onClick={() => skaziStore.toggleFavorite(device.id)}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                isFav
                  ? "border-[#f2a43a]/50 bg-[#f2a43a]/10 text-[#f2a43a]"
                  : "border-white/10 bg-white/[0.03] text-[#a89f91] hover:border-[#f2a43a]/40 hover:text-[#f0ece4]"
              )}
              aria-pressed={isFav}
              aria-label={isFav ? `Remove ${device.name} from favorites` : `Add ${device.name} to favorites`}
              title="Favorite"
            >
              <Star className={cn("h-3 w-3", isFav && "fill-current")} />
              {isFav ? "Faved" : "Fav"}
            </button>
          </span>
        </div>

        {/* upstream feature inventory — mirrored from the SKAZI bundle repo */}
        {device.features && device.features.length > 0 && (
          <details className="mb-4 rounded-lg border border-white/5 bg-black/20 px-3 py-2" open>
            <summary className="cursor-pointer select-none font-mono text-[9px] uppercase tracking-widest text-[#a89f91]">
              Full feature set · upstream folder: {device.repoPath ?? "—"}
            </summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
              {device.features.map((feat) => (
                <li key={feat} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-[#c9c0b2]">
                  <span aria-hidden className="mt-[3px] h-1 w-1 shrink-0 rounded-full" style={{ background: device.accent }} />
                  {feat}
                </li>
              ))}
            </ul>
          </details>
        )}

        {device.kind === "synth" && <SynthPanel device={device} params={instParams} onSet={onSet} />}
        {device.kind === "sequencer" && (
          <SeqPanel device={device} params={instParams} seq={seq} onSet={onSet} />
        )}
        {device.kind === "kick" && <KickPanel device={device} params={instParams} onSet={onSet} />}
        {device.kind === "riser" && <RiserPanel device={device} params={instParams} onSet={onSet} />}
        {device.kind === "generator" && (
          <GodPanel device={device} params={instParams} onSet={onSet} updateProject={updateProject} />
        )}
        {device.kind === "fx" && <FxPanel device={device} fx={fxState} onSet={onSet} />}

        {device.kind === "fx" && sel === "pitapump" && (
          <p className="mt-4 font-mono text-[10px] leading-relaxed text-[#a89f91]">
            Pump is locked to the project BPM — press Play in the transport to hear it move.
          </p>
        )}
        {device.kind === "fx" && sel !== "pitapump" && (
          <p className="mt-4 font-mono text-[10px] leading-relaxed text-[#a89f91]">
            Rack devices process the whole mix. Toggle ON and press Play — every device also colors
            SKAZI instrument previews and the WAV export.
          </p>
        )}
      </section>
    </div>
  );
}
