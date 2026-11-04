"use client";

/* ------------------------------------------------------------------ */
/*  Mixer — THE CONSOLE                                                */
/*                                                                     */
/*  A real strip console, not a card grid:                             */
/*   · channel strips with long-throw faders (dB taper tick scale),    */
/*     rotary EQ L/M/H + PAN + DLY/REV sends + DUCK knobs, M/S and     */
/*     D/B/M bus routing                                               */
/*   · float RMS + true-peak meters beside every fader                 */
/*     (engine.levelInfo), peak-hold line and latching clip LED        */
/*   · D/B/M group bridge strips + a MASTER strip with stereo L/R      */
/*     meters (engine.masterLevels), master fader, live LUFS + CPU     */
/*   · everything live runs through rAF getters — zero React           */
/*     re-renders while the transport rolls                            */
/*   · drag faders/knobs · Shift = fine · double-click = reset         */
/* ------------------------------------------------------------------ */

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { BusName, Project, Track } from "@/lib/daw/types";
import { cn } from "@/lib/utils";
import { ProMeter } from "./ui";
import { Knob, VFader } from "./console";

const BUS_OPTS: Array<{ id: BusName; label: string }> = [
  { id: "drums", label: "D" },
  { id: "bass", label: "B" },
  { id: "music", label: "M" },
];

const BUS_STRIPS: Array<{ id: BusName; label: string }> = [
  { id: "drums", label: "Drums" },
  { id: "bass", label: "Bass" },
  { id: "music", label: "Music" },
];

const BUS_COLORS: Record<BusName, string> = {
  drums: "#e5533d",
  bass: "#d0e05a",
  music: "#8fbf6b",
};

type LevelInfo = { rms: number; peak: number; db: number };
type MasterLevels = { lRms: number; lPeak: number; rRms: number; rPeak: number; dbL: number; dbR: number };

const SILENT: LevelInfo = { rms: 0, peak: 0, db: -60 };
const SILENT_LR: MasterLevels = { lRms: 0, lPeak: 0, rRms: 0, rPeak: 0, dbL: -60, dbR: -60 };

const fmtLufs = (n: number) => n.toFixed(1);
const fmtCpu = (n: number) => `${Math.round(n)}%`;
const fmtDb = (db: number) => (db <= -59.5 ? "−∞" : `${db > -9.95 ? "+" : ""}${db.toFixed(1)}`);
/** volume 0..1.3 → dB (0 dB at unity) */
const volDb = (v: number) => (v <= 0.001 ? "−∞ dB" : `${v >= 1 ? "+" : ""}${(20 * Math.log10(v)).toFixed(1)} dB`);

const fmtPan = (p: number) => (p === 0 ? "C" : p < 0 ? `L${Math.round(-p * 100)}` : `R${Math.round(p * 100)}`);
const fmtPct = (v: number) => `${Math.round(v * 100)}`;
const fmtEq = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}`;

/** fader tick scale — volume 0..1.3 mapped linearly, ticks at real dB points */
const FADER_TICKS: Array<[number, string]> = [
  [1.3, "+2.3"],
  [1.0, "0"],
  [0.501, "−6"],
  [0.251, "−12"],
  [0.063, "−24"],
  [0.0005, "−∞"],
];

const FADER_H = 218;

/** DOM-level readout polled at ~4 Hz via rAF — keeps the memoised mixer from re-rendering.
 *  `holdMs` applies a peak-hold to the polled value (used for dB readouts so they
 *  don't flicker to −∞ between transients). */
function LiveReadout({
  get,
  format,
  fallback,
  holdMs = 0,
}: {
  get?: () => number;
  format: (n: number) => string;
  fallback: string;
  holdMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!get) return;
    let raf = 0;
    let last = 0;
    let held = -Infinity;
    let heldUntil = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 250) return; // ~4 refreshes per second
      last = now;
      let v = get();
      if (holdMs > 0) {
        if (v >= held || now >= heldUntil) {
          held = v;
          heldUntil = now + holdMs;
        }
        v = held;
      }
      if (ref.current) ref.current.textContent = format(v);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [get, format, holdMs]);
  return <span ref={ref}>{fallback}</span>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full text-center font-mono text-[6.5px] uppercase tracking-[0.18em] text-[#6f675c]">
      {children}
    </div>
  );
}

function Screw({ className }: { className?: string }) {
  return <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full bg-black/70 ring-1 ring-white/10", className)} />;
}

/* ------------------------------------------------------------------ */
/*  Channel strip                                                      */
/* ------------------------------------------------------------------ */

function ChannelStrip({
  t,
  index,
  anySolo,
  setTrack,
  info,
}: {
  t: Track;
  index: number;
  anySolo: boolean;
  setTrack: (id: string, patch: Partial<Track>) => void;
  /** per-channel level getter (engine.levelInfo or mono fallback) */
  info: (id: string) => LevelInfo;
}) {
  const audible = !t.muted && (!anySolo || t.solo);
  const busColor = BUS_COLORS[t.bus] ?? "#8fbf6b";
  const getMeter = useCallback(() => info(t.id), [info, t.id]);
  const set = useCallback((patch: Partial<Track>) => setTrack(t.id, patch), [setTrack, t.id]);

  return (
    <div
      className={cn(
        "relative flex w-[76px] shrink-0 flex-col items-center gap-1 px-1 pb-2 pt-1.5",
        audible ? "bg-gradient-to-b from-[#17120c] to-[#100c08]" : "bg-gradient-to-b from-[#12100c] to-[#0e0c08]"
      )}
    >
      {/* bus accent */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: busColor, opacity: audible ? 0.95 : 0.3 }}
      />

      {/* channel number + live dB */}
      <div className="flex w-full items-center justify-between px-0.5">
        <span className="font-mono text-[6.5px] text-[#6f675c]">{String(index + 1).padStart(2, "0")}</span>
        <span className="font-mono text-[6.5px] text-[#a89f91]">
          <LiveReadout
            get={() => info(t.id).db}
            format={fmtDb}
            fallback="−∞"
            holdMs={400}
          />
        </span>
      </div>

      {/* EQ */}
      <div className="grid w-full grid-cols-3 justify-items-center">
        <Knob label="L" size={23} min={-12} max={12} step={0.5} value={t.eqLow} onChange={(v) => set({ eqLow: v })} resetTo={0} bipolar accent="#e5c15a" format={fmtEq} title="Low shelf 90 Hz" />
        <Knob label="M" size={23} min={-12} max={12} step={0.5} value={t.eqMid} onChange={(v) => set({ eqMid: v })} resetTo={0} bipolar accent="#d97b5a" format={fmtEq} title="Peak 1 kHz" />
        <Knob label="H" size={23} min={-12} max={12} step={0.5} value={t.eqHigh} onChange={(v) => set({ eqHigh: v })} resetTo={0} bipolar accent="#8fbf6b" format={fmtEq} title="High shelf 7.5 kHz" />
      </div>
      <SectionLabel>EQ</SectionLabel>

      {/* PAN */}
      <Knob label="PAN" size={30} min={-1} max={1} step={0.02} value={t.pan} onChange={(v) => set({ pan: v })} resetTo={0} bipolar format={fmtPan} title="Stereo position" />

      {/* SENDS */}
      <div className="grid w-full grid-cols-2 justify-items-center">
        <Knob label="DLY" size={23} value={t.delaySend} onChange={(v) => set({ delaySend: v })} resetTo={0} accent="#8fbf6b" format={fmtPct} title="Delay send (dotted 8th)" />
        <Knob label="REV" size={23} value={t.reverbSend} onChange={(v) => set({ reverbSend: v })} resetTo={0} accent="#8fbf6b" format={fmtPct} title="Reverb send" />
      </div>
      <SectionLabel>Send</SectionLabel>

      {/* SIDECHAIN DUCK */}
      <Knob label="DUCK" size={23} value={t.duck} onChange={(v) => set({ duck: v })} resetTo={0} accent="#e5533d" format={fmtPct} title="Kick sidechain depth — ducks on every kick" />

      {/* M / S */}
      <div className="flex w-full gap-1 px-0.5">
        <button
          onClick={() => set({ muted: !t.muted })}
          aria-pressed={t.muted}
          title={t.muted ? "Unmute" : "Mute"}
          className={cn(
            "h-5 flex-1 rounded font-mono text-[9px] font-bold transition-colors",
            t.muted ? "bg-[#e5533d] text-white" : "bg-white/5 text-[#a89f91] hover:bg-white/10"
          )}
        >
          M
        </button>
        <button
          onClick={() => set({ solo: !t.solo })}
          aria-pressed={t.solo}
          title={t.solo ? "Un-solo" : "Solo"}
          className={cn(
            "h-5 flex-1 rounded font-mono text-[9px] font-bold transition-colors",
            t.solo ? "bg-[#f2a43a] text-[#17120a]" : "bg-white/5 text-[#a89f91] hover:bg-white/10"
          )}
        >
          S
        </button>
      </div>

      {/* meter + fader */}
      <div className="mt-1 flex w-full items-stretch justify-center gap-1" style={{ height: FADER_H }}>
        <ProMeter getInfo={getMeter} className="h-full w-[13px]" />
        <VFader
          value={t.volume}
          min={0}
          max={1.3}
          step={0.01}
          onChange={(v) => set({ volume: v })}
          resetTo={1}
          height={FADER_H}
          ticks={FADER_TICKS}
          accent={t.color}
          label={`Fader ${t.name}`}
          format={volDb}
          className="w-[26px]"
        />
      </div>
      <span className="font-mono text-[7px] text-[#a89f91]" aria-hidden>
        {volDb(t.volume)}
      </span>

      {/* bus routing */}
      <div className="flex w-full overflow-hidden rounded-md ring-1 ring-inset ring-white/10" role="group" aria-label={`Bus routing ${t.name}`}>
        {BUS_OPTS.map((b) => (
          <button
            key={b.id}
            onClick={() => set({ bus: b.id })}
            title={`Route to ${b.id} bus`}
            aria-pressed={t.bus === b.id}
            className={cn(
              "h-4.5 flex-1 font-mono text-[8px] font-bold transition-colors",
              t.bus === b.id ? "text-[#17120a]" : "bg-white/5 text-[#a89f91] hover:bg-white/10"
            )}
            style={t.bus === b.id ? { background: BUS_COLORS[b.id] } : undefined}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* name plate */}
      <div
        className="w-full rounded-sm bg-black/45 px-1 py-1 text-center"
        style={{ borderTop: `2px solid ${t.color}` }}
        title={`${t.name} — ${t.kind === "drum" ? "drum" : "synth"} channel`}
      >
        <div className="truncate text-[9px] font-semibold leading-tight text-[#f0ece4]">{t.name}</div>
        <div className="font-mono text-[6px] uppercase tracking-[0.15em] text-[#6f675c]">
          {t.kind === "drum" ? "DRUM" : "SYNTH"}
          {t.duck > 0 ? " · SC" : ""}
        </div>
      </div>

      {!audible && (
        <div className="w-full rounded bg-black/40 py-0.5 text-center font-mono text-[6.5px] uppercase tracking-widest text-[#e5533d]">
          {t.muted ? "muted" : "not soloed"}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Group bus bridge strip                                             */
/* ------------------------------------------------------------------ */

function BusStrip({
  id,
  members,
  getMeter,
}: {
  id: BusName;
  members: number;
  getMeter: () => { rms: number; peak: number };
}) {
  return (
    <div className="flex w-[58px] shrink-0 flex-col items-center gap-1 bg-gradient-to-b from-[#151009] to-[#100c08] px-1 pb-2 pt-1.5">
      <span className="font-mono text-[7.5px] font-bold uppercase tracking-[0.15em]" style={{ color: BUS_COLORS[id] }}>
        {id}
      </span>
      <div className="flex w-full items-stretch justify-center" style={{ height: FADER_H }}>
        <ProMeter getInfo={getMeter} showTicks={false} className="h-full w-[16px]" />
      </div>
      <span className="font-mono text-[7px] text-[#a89f91]">{members} ch</span>
      <SectionLabel>bridge</SectionLabel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Master strip                                                       */
/* ------------------------------------------------------------------ */

function MasterStrip({
  project,
  updateProject,
  masterLevels,
  getMasterLufs,
  getCpu,
  hasStereo,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  masterLevels: () => MasterLevels;
  getMasterLufs?: () => number;
  getCpu?: () => number;
  hasStereo: boolean;
}) {
  const getL = useCallback(() => {
    const m = masterLevels();
    return { rms: m.lRms, peak: m.lPeak };
  }, [masterLevels]);
  const getR = useCallback(() => {
    const m = masterLevels();
    return { rms: m.rRms, peak: m.rPeak };
  }, [masterLevels]);

  return (
    <div className="relative flex w-[116px] shrink-0 flex-col items-center gap-1.5 bg-gradient-to-b from-[#1e160b] to-[#120d07] px-2 pb-2 pt-1.5">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-[#f2a43a]" />
      <div className="flex w-full items-center justify-between px-0.5">
        <span className="font-mono text-[7px] font-bold tracking-[0.2em] text-[#f2a43a]">MASTER</span>
        <span className="font-mono text-[6px] tracking-[0.15em] text-[#6f675c]">MAIN OUT</span>
      </div>

      {/* fader + stereo meters */}
      <div className="flex w-full items-stretch justify-center gap-1.5" style={{ height: FADER_H }}>
        <VFader
          value={project.masterVolume}
          min={0}
          max={1.3}
          step={0.01}
          onChange={(v) => updateProject((p) => ({ ...p, masterVolume: v }))}
          resetTo={1}
          height={FADER_H}
          ticks={FADER_TICKS}
          accent="#f2a43a"
          label="Master fader"
          format={volDb}
          className="w-[26px]"
        />
        {hasStereo ? (
          <>
            <ProMeter getInfo={getL} className="h-full w-[13px]" />
            <ProMeter getInfo={getR} className="h-full w-[13px]" />
          </>
        ) : (
          <div className="flex w-[30px] items-stretch justify-center">
            <ProMeter getInfo={() => ({ rms: masterLevels().lRms, peak: masterLevels().lPeak })} className="h-full w-[13px]" />
          </div>
        )}
      </div>

      {/* L/R + fader readouts */}
      <div className="flex w-full justify-between px-0.5 font-mono text-[6.5px] text-[#a89f91]">
        <span>
          L <LiveReadout get={hasStereo ? () => masterLevels().dbL : undefined} format={fmtDb} fallback="−∞" holdMs={400} />
        </span>
        <span>{volDb(project.masterVolume)}</span>
        <span>
          R <LiveReadout get={hasStereo ? () => masterLevels().dbR : undefined} format={fmtDb} fallback="−∞" holdMs={400} />
        </span>
      </div>

      {/* live master metering */}
      <div className="grid w-full grid-cols-2 gap-1">
        <div className="rounded bg-black/45 px-1 py-1 text-center" title="Integrated loudness (approx LUFS) of the live master">
          <div className="font-mono text-[6px] uppercase tracking-wider text-[#6f675c]">LUFS</div>
          <div className="font-mono text-[9px] text-[#f2a43a]">
            <LiveReadout get={getMasterLufs} format={fmtLufs} fallback="—" />
          </div>
        </div>
        <div className="rounded bg-black/45 px-1 py-1 text-center" title="Estimated engine load">
          <div className="font-mono text-[6px] uppercase tracking-wider text-[#6f675c]">CPU</div>
          <div className="font-mono text-[9px] text-[#8fbf6b]">
            <LiveReadout get={getCpu} format={fmtCpu} fallback="—" />
          </div>
        </div>
      </div>

      <div className="w-full rounded bg-black/45 px-1 py-1 text-center" title="Master bus chain">
        <div className="font-mono text-[6px] uppercase tracking-wider text-[#6f675c]">limiter · glue</div>
        <div className="font-mono text-[8px] text-[#f2a43a]">ON · −4 dB</div>
      </div>
      <div className="w-full rounded bg-black/45 px-1 py-1 text-center">
        <div className="font-mono text-[6px] uppercase tracking-wider text-[#6f675c]">song key</div>
        <div className="font-mono text-[8px] text-[#f0ece4]">{project.songKey}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab                                                                */
/* ------------------------------------------------------------------ */

function MixerTabInner({
  project,
  updateProject,
  getLevel,
  getLevelInfo,
  getMasterLevel,
  getMasterLevels,
  getMasterLufs,
  getCpu,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  getLevel: (trackId: string) => number;
  /** float RMS/peak/dBFS per channel — falls back to getLevel when absent */
  getLevelInfo?: (trackId: string) => LevelInfo;
  getMasterLevel: () => number;
  /** stereo L/R master metering — falls back to getMasterLevel mirrored */
  getMasterLevels?: () => MasterLevels;
  /** live integrated loudness (approx LUFS) — renders "—" when absent */
  getMasterLufs?: () => number;
  /** rough engine load 0..100 — renders "—" when absent */
  getCpu?: () => number;
}) {
  const setTrack = useCallback(
    (id: string, patch: Partial<Track>) => {
      updateProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? ({ ...t, ...patch } as typeof t) : t)),
      }));
    },
    [updateProject]
  );

  const anySolo = project.tracks.some((t) => t.solo);

  const info = useCallback(
    (id: string): LevelInfo => {
      if (getLevelInfo) return getLevelInfo(id);
      const v = getLevel(id);
      return { rms: v, peak: v, db: -60 };
    },
    [getLevelInfo, getLevel]
  );

  const masterLevels = useCallback(
    (): MasterLevels =>
      getMasterLevels
        ? getMasterLevels()
        : (() => {
            const v = getMasterLevel();
            return { ...SILENT_LR, lRms: v, lPeak: v, rRms: v, rPeak: v };
          })(),
    [getMasterLevels, getMasterLevel]
  );

  // bus group meters — visual bridge (the engine routes buses internally)
  const busMembers = useMemo(() => {
    const byBus: Record<BusName, string[]> = { drums: [], bass: [], music: [] };
    for (const t of project.tracks) byBus[t.bus].push(t.id);
    return byBus;
  }, [project.tracks]);

  const busGetters = useMemo(() => {
    const make = (bus: BusName) => () => {
      let peak = 0;
      for (const id of busMembers[bus]) {
        const i = info(id);
        if (i.peak > peak) peak = i.peak;
      }
      return { rms: peak * 0.82, peak };
    };
    return { drums: make("drums"), bass: make("bass"), music: make("music") };
  }, [busMembers, info]);

  return (
    <div className="space-y-3">
      {/* legend */}
      <div className="flex flex-wrap items-center gap-3 font-mono text-[9px] uppercase tracking-wider text-[#a89f91]">
        <span className="tracking-[0.2em] text-[#f2a43a]">Console</span>
        {(Object.keys(BUS_COLORS) as BusName[]).map((b) => (
          <span key={b} className="flex items-center gap-1.5">
            <span className="h-1.5 w-3 rounded-full" style={{ background: BUS_COLORS[b] }} />
            {b}
          </span>
        ))}
        <span className="ml-auto hidden sm:inline">
          drag faders &amp; knobs · shift = fine · double-click = reset · click a clip LED to clear
        </span>
      </div>

      {/* THE CONSOLE */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0f0b08] shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
        {/* top rail */}
        <div className="flex items-center gap-2.5 border-b border-black/60 bg-gradient-to-b from-[#241c11] to-[#171209] px-3 py-1.5">
          <Screw />
          <span className="font-mono text-[9px] font-bold tracking-[0.3em] text-[#f2a43a]">INTELLIDAW</span>
          <span className="font-mono text-[7.5px] tracking-[0.2em] text-[#6f675c]">
            MAIN CONSOLE · {project.tracks.length} CH · 3 BUS · STEREO OUT
          </span>
          <span className="ml-auto hidden font-mono text-[7.5px] text-[#6f675c] md:inline">
            {project.bpm} BPM · {project.songKey} · swing {Math.round(project.swing * 100)}%
          </span>
          <Screw />
        </div>

        {/* strips — horizontal scroll on narrow screens (console behaviour) */}
        <div className="overflow-x-auto console-scroll">
          <div className="flex min-w-max items-stretch divide-x divide-black/50">
            {project.tracks.map((t, i) => (
              <ChannelStrip key={t.id} t={t} index={i} anySolo={anySolo} setTrack={setTrack} info={info} />
            ))}
            {BUS_STRIPS.map((b) => (
              <BusStrip key={b.id} id={b.id} members={busMembers[b.id].length} getMeter={busGetters[b.id]} />
            ))}
            <MasterStrip
              project={project}
              updateProject={updateProject}
              masterLevels={masterLevels}
              getMasterLufs={getMasterLufs}
              getCpu={getCpu}
              hasStereo={Boolean(getMasterLevels)}
            />
          </div>
        </div>
      </div>

      <div className="text-center font-mono text-[10px] tracking-wide text-[#a89f91]/70">
        3-BAND EQ PER CHANNEL (LOW 90HZ · MID 1K · HIGH 7.5K) · BUSES: DOTTED-8TH DELAY + REVERB · SENDS PER CHANNEL ·
        KICK SIDECHAIN VIA DUCK KNOB
      </div>
    </div>
  );
}

/** memoised — the studio re-renders on every playback step */
export const MixerTab = memo(MixerTabInner);
